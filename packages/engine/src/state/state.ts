/**
 * Immutable editor state: files (the document of record), storage versions, the session
 * selection, state fields and the resolved configuration. `tree(path)` parses on demand
 * and is memoized per text — unchanged files share their tree with the previous state.
 */
import { Configuration, type Extension } from "../extensions/extension";
import { parserTagsFacet } from "../extensions/facets";
import type { Facet } from "../extensions/extension";
import { parseSource, type DocumentNode } from "../parse/parse";
import { buildTree, flattenTree, childrenOf, type TreeNode } from "../parse/tree";
import type { Path, Files } from "./changes";
import type { Transaction } from "./transaction";
import type { NodeHandle } from "./handles";

export type { Path };

/** A parsed file: the AST, the editor tree, and lookups by range and parent. */
export class SourceTree {
  readonly nodes: TreeNode[];
  readonly flat: TreeNode[];
  private readonly byRange = new Map<string, TreeNode>();
  private readonly parents = new Map<TreeNode, TreeNode | null>();

  constructor(
    readonly path: Path,
    readonly text: string,
    readonly ast: DocumentNode,
  ) {
    this.nodes = buildTree(ast);
    this.flat = flattenTree(this.nodes);
    const link = (list: TreeNode[], parent: TreeNode | null) => {
      for (const n of list) {
        this.parents.set(n, parent);
        link(childrenOf(n), n);
      }
    };
    link(this.nodes, null);
    for (const n of this.flat) this.byRange.set(`${n.range.start}:${n.range.end}:${n.kind}`, n);
  }

  /** The node with exactly this range and tree kind. */
  at(from: number, to: number, kind: TreeNode["kind"]): TreeNode | undefined {
    return this.byRange.get(`${from}:${to}:${kind}`);
  }

  parent(n: TreeNode): TreeNode | null {
    return this.parents.get(n) ?? null;
  }
}

// ── effects and fields ──────────────────────────────────────────────────────────

/** An effect type; `tr.effect(type, value)` attaches a value of it to a transaction. */
export class StateEffect<T> {
  private constructor(readonly name: string) {}
  static define<T>(name = "effect"): StateEffect<T> {
    return new StateEffect<T>(name);
  }
}

export interface EffectValue<T> {
  readonly type: StateEffect<T>;
  readonly value: T;
}

export function effectsOf<T>(tr: { effects: readonly EffectValue<unknown>[] }, type: StateEffect<T>): T[] {
  return tr.effects.filter((e) => e.type === type).map((e) => e.value as T);
}

/** A value kept in state and updated by every transaction. Fields are extensions. */
export class StateField<T> {
  readonly isStateField = true;
  private constructor(
    readonly name: string,
    readonly create: (state: EditorState) => T,
    readonly update: (value: T, tr: Transaction, state: EditorState) => T,
  ) {}
  static define<T>(def: { name?: string; create(state: EditorState): T; update(value: T, tr: Transaction, state: EditorState): T }): StateField<T> {
    return new StateField(def.name ?? "field", def.create, def.update);
  }
}

// ── selection ───────────────────────────────────────────────────────────────────

export interface Selection {
  readonly handles: readonly NodeHandle[];
  readonly primary: NodeHandle | null;
  readonly hover: NodeHandle | null;
}

export const EMPTY_SELECTION: Selection = Object.freeze({ handles: [], primary: null, hover: null });

/** Replace the selection (`primary` defaults to the last handle). */
export const setSelection = StateEffect.define<{ handles: readonly NodeHandle[]; primary?: NodeHandle | null }>("setSelection");
export const setHover = StateEffect.define<NodeHandle | null>("setHover");

export const selectionField = StateField.define<Selection>({
  name: "selection",
  create: () => EMPTY_SELECTION,
  update(sel, tr) {
    let next = sel;
    for (const e of tr.effects) {
      if (e.type === setSelection) {
        const v = e.value as { handles: readonly NodeHandle[]; primary?: NodeHandle | null };
        next = { handles: v.handles, primary: v.primary ?? v.handles.at(-1) ?? null, hover: next.hover };
      } else if (e.type === setHover) next = { ...next, hover: e.value as NodeHandle | null };
    }
    if (tr.changes.empty && next === sel) return sel;
    const handles = next.handles.filter((h) => h.alive);
    const primary = next.primary?.alive ? next.primary : (handles.at(-1) ?? null);
    const hover = next.hover?.alive ? next.hover : null;
    return handles.length === next.handles.length && primary === next.primary && hover === next.hover ? next : { handles, primary, hover };
  },
});

// ── state ───────────────────────────────────────────────────────────────────────

export interface CreateStateOptions {
  files: Files | Record<Path, string>;
  versions?: ReadonlyMap<Path, string>;
  extensions?: Extension;
  /** Reuse an already-resolved configuration. */
  config?: Configuration;
}

export class EditorState {
  private readonly trees: Map<Path, SourceTree>;

  private constructor(
    readonly config: Configuration,
    readonly files: Files,
    readonly versions: ReadonlyMap<Path, string>,
    private readonly values: Map<object, unknown>,
    trees: Map<Path, SourceTree>,
  ) {
    this.trees = trees;
  }

  static create(opts: CreateStateOptions): EditorState {
    const config = opts.config ?? Configuration.resolve([selectionField, opts.extensions ?? []]);
    const files = opts.files instanceof Map ? new Map(opts.files) : new Map(Object.entries(opts.files));
    const state = new EditorState(config, files, opts.versions ?? new Map(), new Map(), new Map());
    for (const f of config.fields) state.values.set(f, f.create(state));
    return state;
  }

  get selection(): Selection {
    return this.field(selectionField);
  }

  facet<O>(facet: Facet<any, O>): O {
    return this.config.facet(facet);
  }

  field<T>(field: StateField<T>): T {
    if (!this.values.has(field)) throw new Error(`state field "${field.name}" is not configured`);
    return this.values.get(field) as T;
  }

  hasField<T>(field: StateField<T>): boolean {
    return this.values.has(field);
  }

  /** Parse + buildTree for a file, memoized per text. Stored source must parse strict. */
  tree(path: Path): SourceTree {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`no file ${path}`);
    let t = this.trees.get(path);
    if (!t || t.text !== text) {
      t = new SourceTree(path, text, parseSource(text, "strict", { env: this.facet(parserTagsFacet) }));
      this.trees.set(path, t);
    }
    return t;
  }

  /** The state after `tr`. `beforeFields` sees the new files first; fields update against the new files; trees for unchanged files carry over. */
  apply(tr: Transaction, beforeFields?: (next: EditorState) => void): EditorState {
    if (tr.startState !== this) throw new Error("transaction was built for a different state");
    const files = tr.changes.empty ? this.files : tr.changes.apply(this.files);
    const trees = new Map<Path, SourceTree>();
    for (const [path, t] of this.trees) if (files.get(path) === t.text) trees.set(path, t);
    for (const t of tr.trees) if (files.get(t.path) === t.text) trees.set(t.path, t);
    const versions = tr.versions ? new Map([...this.versions, ...tr.versions]) : this.versions;
    const next = new EditorState(this.config, files, versions, new Map(), trees);
    beforeFields?.(next); // the handle registry remaps here, so fields see live/dead handles
    for (const f of this.config.fields) next.values.set(f, f.update(this.values.get(f), tr, next));
    return next;
  }
}
