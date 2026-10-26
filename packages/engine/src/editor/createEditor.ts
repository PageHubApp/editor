/**
 * `createEditor`: a `Store` plus storage — load, the diff preview (`pendingDiff`),
 * save (prepare → optimistic write → conflict), remote edits from `watch` (rebased over
 * local edits, or a conflict — never silent loss), roles (client → content mode, viewer →
 * read-only) and persisted identity (normalize on open and on save, `findById`).
 */
import { Store } from "../state/store";
import { ChangeSet, type Path } from "../state/changes";
import { Transaction } from "../state/transaction";
import { history } from "../history/history";
import { beforeTransaction } from "../normalize/hooks";
import { probeCommand } from "../content/commandGate";
import { contentMode } from "../content/contentMode";
import { checkContentOnly } from "../content/checkContentOnly";
import { normalize, persistedIdentity } from "../identity/persisted";
import { EditIdConflictError, editIdsIn } from "../identity/editIds";
import { isStorage, prepareWriteFacet, type StorageDef } from "../storage/defineStorage";
import { memoryStorage } from "../storage/memory";
import { diffSplices, fileDiff, type FileDiff } from "../storage/diff";
import { commandsFacet, elementsFacet, keybindingsFacet, parserTagsFacet } from "../extensions/facets";
import { parseSource } from "../parse/parse";
import { repairNesting, type NestingFix } from "../parse/repairNesting";
import { EDIT_ATTRIBUTES } from "../attributes/editAttributes";
import type { Extension } from "../extensions/extension";
import type { CommandHost, UiContext } from "../commands/defineCommand";
import type { NodeHandle } from "../state/handles";
import type { JsonValue } from "../runtime/tags/schema";
import { defineCommand } from "../commands/defineCommand";
import { htmlKit } from "../kits/html/htmlKit";
import { liquidKit } from "../kits/liquid/liquidKit";
import { idElementsFacet } from "../kits/html/idElements";
import { blockProvenanceFacet } from "../kits/html/commands";
import { DiagnosticsTracker, isMarkup } from "./diagnostics";
import { SaveQueue } from "./saveQueue";
import type { Diagnostic } from "../rules/run";

export type Role = "owner" | "editor" | "client" | "viewer";

export interface CreateEditorOptions {
  /** A storage adapter, or a plain object of files (memory storage). */
  storage: StorageDef | Record<Path, string>;
  /** Kits and plugins. Default `[htmlKit(), liquidKit()]`; passing a list replaces the default. `history()` is always on. */
  extensions?: Extension;
  /** Canvas sample data. */
  data?: Record<string, JsonValue>;
  identity?: "session" | "persisted";
  /** `client` → content mode; `viewer` → read-only. */
  role?: Role;
  /** Write `data-edit-block` on block insert (used by the html kit). */
  blockProvenance?: boolean;
  /** Id minting for persisted identity (tests). */
  mint?: () => string;
  dev?: boolean;
  ui?: UiContext;
}

export interface SaveResult {
  ok: boolean;
  written: Path[];
  conflicts: Array<{ path: Path; theirs: string; version: string }>;
  blocked: Array<{ path: Path; errors: string[] }>;
}

export interface Manifest {
  identity: "session" | "persisted";
  role: Role;
  storage: string;
  elements: Array<{ name: string; describe: string }>;
  commands: Array<{ id: string; title: string }>;
  keybindings: Array<{ command: string; key: string; when?: string }>;
}

/**
 * Host-facing events: the text changed (`change`, debounced; per-change updates are `subscribe`), a save started (`saving`), wrote files (`saved`), was blocked by rule
 * errors or threw (`saveFailed`), or a file collided with a newer version (`conflict`).
 */
export type EditorEvents = {
  /** The text changed and then went quiet for `CHANGE_DEBOUNCE_MS`; `dirty` is what a save would write. */
  change: { dirty: Path[] };
  saving: { paths: Path[] };
  saved: { written: Path[] };
  saveFailed: { blocked: SaveResult["blocked"]; error: unknown };
  conflict: { path: Path; theirs: string; version: string };
  /** A file opened with invalid HTML nesting and was repaired in the editor (non-blocking; the next save writes it). */
  repaired: { path: Path; fixes: NestingFix[] };
};

export type ConflictResolution = "reload" | "override";

export const READ_ONLY_HOOK = "read-only";

/** Quiet time after the last text change before `change` fires. */
export const CHANGE_DEBOUNCE_MS = 500;

export class Editor extends Store {
  readonly storage: StorageDef;
  readonly role: Role;
  probe?: CommandHost["probe"];
  readonly identityMode: "session" | "persisted";
  readonly data: Record<string, JsonValue>;
  readonly blockProvenance: boolean;
  /** Files whose remote change collided with local edits; resolve by saving or reloading. */
  readonly conflicts = new Map<Path, { theirs: string; version: string }>();
  /** Files that opened with invalid HTML nesting, repaired in place (`repairNesting`); the stored text is untouched until a save. */
  readonly repairs: Array<{ path: Path; fixes: NestingFix[] }> = [];
  /** Text each file had when last read or written (what `pendingDiff` compares against). */
  /** Per event name, a `Set<(e: EditorEvents[K]) => void>`; typed per key at `on` / `emit`. */
  private readonly handlers = new Map<keyof EditorEvents, Set<unknown>>();
  private readonly baseline: Map<Path, string>;
  private readonly mint?: () => string;
  private unwatch?: () => void;
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> = Promise.resolve();
  private readonly saves = new SaveQueue<SaveResult>((paths) => this.write(paths));

  constructor(init: { files: ReadonlyMap<Path, string>; versions: ReadonlyMap<Path, string>; storage: StorageDef }, opts: Omit<CreateEditorOptions, "storage"> = {}) {
    const role = opts.role ?? "owner";
    const identity = opts.identity ?? "session";
    const diagnostics = new DiagnosticsTracker();
    const self: { editor?: Editor } = {};
    // ⌘S saves (fix-table row); runs whenever saving is allowed, a clean editor saves nothing.
    const save = defineCommand({
      id: "file.save",
      title: "Save",
      run: ({ dispatch }) => {
        if (role === "viewer") return false;
        if (dispatch) void self.editor!.save().catch(() => {});
        return true;
      },
    });
    super({
      files: init.files,
      versions: init.versions,
      identity: identity === "persisted" ? persistedIdentity : undefined,
      dev: opts.dev,
      ui: { ...opts.ui, role, readOnly: role === "viewer" },
      extensions: [
        history(),
        init.storage,
        role === "client" ? contentMode() : [],
        role === "viewer" ? beforeTransaction(READ_ONLY_HOOK, (tr) => (tr.changes.empty || tr.annotations.origin === "remote" || tr.annotations.system ? undefined : { veto: "read-only" })) : [],
        opts.extensions ?? [htmlKit(), liquidKit()],
        diagnostics.extension,
        save,
        opts.blockProvenance ? blockProvenanceFacet.of(true) : [],
      ],
    });
    self.editor = this;
    this.diagnosticsTracker = diagnostics;
    this.storage = init.storage;
    this.role = role;
    if (role === "client" || role === "viewer") this.probe = (cmd, args) => probeCommand(this, cmd, args);
    this.identityMode = identity;
    this.data = opts.data ?? {};
    this.blockProvenance = opts.blockProvenance ?? false;
    this.mint = opts.mint;
    this.baseline = new Map(init.files);
    this.repairOnOpen();
    if (identity === "persisted") this.normalizeOnOpen();
    this.subscribe((st) => st.files, () => this.scheduleChange());
    this.unwatch = init.storage.watch?.((path) => {
      this.pending = this.pending.then(() => this.pull(path)).catch(() => {});
    });
  }

  private readonly diagnosticsTracker: DiagnosticsTracker;

  /** Rule diagnostics for the current text (updated after every dispatch that changed text). */
  get diagnostics(): readonly Diagnostic[] {
    return this.diagnosticsTracker.update(this.state);
  }

  private get idElements() {
    return this.state.facet(idElementsFacet);
  }

  private get env() {
    return this.state.facet(parserTagsFacet);
  }

  /** Replace a file's text with minimal line splices. */
  private replaceText(path: Path, text: string, annotations: Partial<Transaction["annotations"]>, versions?: ReadonlyMap<Path, string>): void {
    const before = this.state.files.get(path)!;
    const changes = ChangeSet.ofFile(path, diffSplices(before, text));
    this.dispatch(Transaction.create(this.state, { changes, versions, annotations: { history: false, ...annotations } }));
  }

  /** A stored file with invalid nesting opens repaired (a browser would read it the same way); `repairs` and `repaired` say so. */
  private repairOnOpen(): void {
    for (const path of [...this.state.files.keys()].filter(isMarkup).sort()) {
      const text = this.state.files.get(path)!;
      const r = repairNesting(text, this.env);
      if (!r.fixes.length) continue;
      this.replaceText(path, r.source, { origin: "plugin", system: true });
      this.repairs.push({ path, fixes: r.fixes });
    }
    // Listeners attach after the constructor: tell them on the next tick.
    if (this.repairs.length) queueMicrotask(() => this.repairs.forEach((r) => this.emit("repaired", r)));
  }

  private normalizeOnOpen(): void {
    for (const path of [...this.state.files.keys()].filter(isMarkup).sort()) {
      const text = this.state.files.get(path)!;
      const taken = new Set([...this.state.files].filter(([p]) => p !== path).flatMap(([, t]) => editIdsIn(t)));
      let r;
      try {
        r = normalize(text, null, { taken, mint: this.mint, env: this.env, idElements: this.idElements });
      } catch {
        continue; // unparseable: lint reports it
      }
      if (r.source !== text) this.replaceText(path, r.source, { origin: "plugin", system: true });
    }
  }

  private scheduleChange(): void {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => this.emit("change", { dirty: this.dirty() }), CHANGE_DEBOUNCE_MS);
  }

  /** Paths whose text differs from what storage holds. */
  dirty(): Path[] {
    return [...this.state.files].filter(([p, t]) => this.baseline.get(p) !== t).map(([p]) => p);
  }

  /** Unified diffs of unsaved changes — shown before every write. */
  pendingDiff(): FileDiff[] {
    return this.dirty().map((p) => fileDiff(p, this.baseline.get(p) ?? "", this.state.files.get(p)!));
  }

  /** Wait until queued remote changes are applied. */
  settled(): Promise<void> {
    return this.pending;
  }

  /** The element carrying `data-edit-id="<id>"` in any file (persisted identity). */
  findById(id: string): NodeHandle | null {
    for (const [path, text] of this.state.files) {
      if (!isMarkup(path) || !text.includes(id)) continue;
      const tree = this.state.tree(path);
      const n = tree.flat.find((x) => x.kind === "element" && this.registry.of(path, x).attr(EDIT_ATTRIBUTES.id) === id);
      if (n) return this.registry.of(path, n);
    }
    return null;
  }

  private async prepare(path: Path, text: string, base: string | null, alsoTaken?: ReadonlySet<string>): Promise<{ text: string; errors: string[] }> {
    const errors: string[] = [];
    if (this.role === "client") {
      const r = base === null ? { ok: false as const, reason: "files may not be added" } : checkContentOnly(base, text, { bundle: this.state.files, env: this.env });
      if (!r.ok) errors.push(r.reason);
    }
    if (this.identityMode === "persisted" && isMarkup(path)) {
      const taken = this.storage.editIds ? await this.storage.editIds(path) : new Set([...this.state.files].filter(([p]) => p !== path).flatMap(([, t]) => editIdsIn(t)));
      if (alsoTaken) for (const id of alsoTaken) taken.add(id);
      text = normalize(text, base, { taken, mint: this.mint, env: this.env, idElements: this.idElements }).source;
    }
    for (const h of this.state.facet(prepareWriteFacet)) {
      const r = await h.run({ path, text, base, state: this.state, storage: this.storage });
      if (r?.text !== undefined) text = r.text;
      if (r?.errors?.length) errors.push(...r.errors.map((e) => `${h.name}: ${e}`));
    }
    return { text, errors };
  }

  /** Subscribe to a host-facing event; returns the unsubscribe function. */
  on<K extends keyof EditorEvents>(event: K, fn: (e: EditorEvents[K]) => void): () => void {
    let set = this.handlers.get(event) as Set<(e: EditorEvents[K]) => void> | undefined;
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => void set.delete(fn);
  }

  private emit<K extends keyof EditorEvents>(event: K, e: EditorEvents[K]): void {
    for (const fn of [...((this.handlers.get(event) as Set<(e: EditorEvents[K]) => void> | undefined) ?? [])]) fn(e);
  }

  /**
   * Write dirty files (or `paths`). A stale version is a conflict: nothing is overwritten. One
   * save runs at a time; calls made meanwhile share one queued follow-up. Nothing dirty → no
   * write and no events.
   */
  save(opts: { paths?: Path[] } = {}): Promise<SaveResult> {
    return this.saves.request(opts.paths);
  }

  /** True while a save is running. */
  get saving(): boolean {
    return this.saves.busy;
  }

  /**
   * Settle a conflict on `path`: `reload` takes the stored text (local edits to that file are
   * dropped) and saves the other dirty files; `override` writes the local text over the newer
   * version. Both re-read storage first, so the newest version wins the race.
   */
  async resolveConflict(path: Path, how: ConflictResolution): Promise<SaveResult> {
    const r = await this.storage.read(path);
    this.conflicts.delete(path);
    if (r && how === "reload") {
      this.baseline.set(path, r.text);
      if (this.state.files.get(path) !== r.text) this.replaceText(path, r.text, { origin: "remote" }, new Map([[path, r.version]]));
      else this.dispatch(Transaction.create(this.state, { versions: new Map([[path, r.version]]), annotations: { origin: "remote", history: false, system: true } }));
      return this.save();
    }
    if (r) this.dispatch(Transaction.create(this.state, { versions: new Map([[path, r.version]]), annotations: { origin: "plugin", history: false, system: true } }));
    return this.save({ paths: [path] });
  }

  private async write(paths: Path[] | undefined): Promise<SaveResult> {
    const result: SaveResult = { ok: true, written: [], conflicts: [], blocked: [] };
    const dirty = new Set(this.dirty());
    const versions = new Map<Path, string>();
    const todo = (paths ?? [...dirty]).filter((p) => dirty.has(p));
    if (todo.length) this.emit("saving", { paths: todo });
    try {
      if (this.storage.writeBatch) await this.writeBatched(todo, result, versions);
      else await this.writeEach(todo, result, versions);
    } catch (error) {
      if (versions.size) this.dispatch(Transaction.create(this.state, { versions, annotations: { origin: "plugin", history: false, system: true } }));
      this.emit("saveFailed", { blocked: result.blocked, error });
      throw error;
    }
    if (versions.size) this.dispatch(Transaction.create(this.state, { versions, annotations: { origin: "plugin", history: false, system: true } }));
    result.ok = !result.conflicts.length && !result.blocked.length;
    if (result.written.length) this.emit("saved", { written: result.written });
    if (result.blocked.length) this.emit("saveFailed", { blocked: result.blocked, error: null });
    for (const c of result.conflicts) this.emit("conflict", c);
    return result;
  }

  private async writeEach(todo: Path[], result: SaveResult, versions: Map<Path, string>): Promise<void> {
    for (const path of todo) {
      const start = this.state.files.get(path)!;
      const base = this.baseline.get(path) ?? null;
      for (let attempt = 0; ; attempt++) {
        const { text, errors } = await this.prepare(path, start, base);
        if (errors.length) {
          result.blocked.push({ path, errors });
          break;
        }
        if (this.state.files.get(path) !== start) break; // edited while saving: stays dirty
        if (text !== start) this.replaceText(path, text, { origin: "plugin", system: true });
        let w;
        try {
          w = await this.storage.write(path, text, { baseVersion: this.state.versions.get(path) ?? null });
        } catch (e) {
          if (e instanceof EditIdConflictError && attempt < 3) {
            if (text !== start) this.replaceText(path, start, { origin: "plugin", system: true });
            continue; // another writer minted the same id: re-run the save path
          }
          throw e;
        }
        if (w.ok) {
          this.baseline.set(path, text);
          versions.set(path, w.version);
          this.conflicts.delete(path);
          result.written.push(path);
        } else {
          result.conflicts.push({ path, ...w.conflict });
          this.conflicts.set(path, w.conflict);
        }
        break;
      }
    }
  }

  /**
   * `writeEach`'s counterpart for a storage with `writeBatch`: prepare every file, then ONE atomic write.
   * A conflict on any file writes none of them (they all stay dirty) and reports each conflicting path.
   */
  private async writeBatched(todo: Path[], result: SaveResult, versions: Map<Path, string>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const items: Array<{ path: Path; start: string; text: string }> = [];
      const minted = new Set<string>(); // ids already minted for earlier files of this batch: the storage can't see them yet
      result.blocked.length = 0;
      for (const path of todo) {
        const start = this.state.files.get(path)!;
        const { text, errors } = await this.prepare(path, start, this.baseline.get(path) ?? null, minted);
        if (errors.length) {
          result.blocked.push({ path, errors });
          continue;
        }
        if (this.state.files.get(path) !== start) continue; // edited while saving: stays dirty
        if (text !== start) this.replaceText(path, text, { origin: "plugin", system: true });
        for (const id of editIdsIn(text)) minted.add(id);
        items.push({ path, start, text });
      }
      if (!items.length) return;
      const undo = () => {
        for (const i of items) if (i.text !== i.start) this.replaceText(i.path, i.start, { origin: "plugin", system: true });
      };
      let w;
      try {
        w = await this.storage.writeBatch!(
          items.map((i) => ({ path: i.path, text: i.text })),
          { baseVersions: Object.fromEntries(items.map((i) => [i.path, this.state.versions.get(i.path) ?? null])) },
        );
      } catch (e) {
        if (e instanceof EditIdConflictError && attempt < 3) {
          undo();
          continue; // another writer minted the same id: re-run the save path
        }
        throw e;
      }
      if (w.ok) {
        for (const i of items) {
          this.baseline.set(i.path, i.text);
          const v = w.versions[i.path];
          if (v !== undefined) versions.set(i.path, v);
          this.conflicts.delete(i.path);
          result.written.push(i.path);
        }
      } else {
        for (const c of w.conflicts) {
          result.conflicts.push(c);
          this.conflicts.set(c.path, { theirs: c.theirs, version: c.version });
        }
      }
      return;
    }
  }

  /** Apply a storage change as an `origin: "remote"` transaction, rebased over local edits. */
  private async pull(path: Path): Promise<void> {
    const r = await this.storage.read(path);
    const current = this.state.files.get(path);
    const base = this.baseline.get(path);
    if (!r || current === undefined || base === undefined) return; // added / deleted files: reload
    if (r.text === base) return; // our own write echoing back
    const versions = new Map([[path, r.version]]);
    let changes: ChangeSet;
    if (current === base) changes = ChangeSet.ofFile(path, diffSplices(current, r.text));
    else {
      const local = diffSplices(base, current);
      const remote = diffSplices(base, r.text);
      const overlap = remote.some((a) => local.some((b) => (a.from < b.to && b.from < a.to) || a.from === b.from));
      changes = ChangeSet.ofFile(path, remote).rebase(ChangeSet.ofFile(path, local));
      let ok = !overlap;
      if (ok) {
        try {
          parseSource(changes.apply(this.state.files).get(path)!, "strict", { env: this.env });
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        this.conflicts.set(path, { theirs: r.text, version: r.version });
        this.emit("conflict", { path, theirs: r.text, version: r.version });
        return;
      }
    }
    this.baseline.set(path, r.text);
    this.dispatch(Transaction.create(this.state, { changes, versions, annotations: { origin: "remote" } }));
  }

  describe(): Manifest {
    return {
      identity: this.identityMode,
      role: this.role,
      storage: this.storage.id,
      elements: this.state.facet(elementsFacet).map((e) => ({ name: e.name, describe: e.describe })),
      commands: [...this.state.facet(commandsFacet).values()].map((c) => ({ id: c.id, title: c.title })),
      keybindings: this.state.facet(keybindingsFacet).map((k) => ({ command: k.command, key: k.key, when: k.when })),
    };
  }

  destroy(): void {
    clearTimeout(this.changeTimer);
    this.unwatch?.();
    this.unwatch = undefined;
  }
}

/** Open an editor over a storage adapter (or a plain object of files). */
export async function createEditor(opts: CreateEditorOptions): Promise<Editor> {
  const storage = isStorage(opts.storage) ? opts.storage : memoryStorage(opts.storage as Record<Path, string>);
  const files = new Map<Path, string>();
  const versions = new Map<Path, string>();
  // Read every file at once (a network storage would otherwise pay one round trip per file, in series); insert in list order.
  const paths = await storage.list();
  const reads = await Promise.all(paths.map((path) => storage.read(path)));
  paths.forEach((path, i) => {
    const r = reads[i];
    if (!r) return;
    files.set(path, r.text);
    versions.set(path, r.version);
  });
  return new Editor({ files, versions, storage }, opts);
}
