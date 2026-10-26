/**
 * The headless core every editor wraps: holds the current state, the handle registry and
 * listeners. `dispatch` is the only mutator; listeners run after the state is replaced and
 * may not dispatch (throws in dev, queued in prod). `createEditor` adds storage,
 * save and the diff preview on top.
 */
import { Configuration, type Extension } from "../extensions/extension";
import { commandsFacet } from "../extensions/facets";
import { compileSelector } from "../elements/selector";
import { canRun, runCommand, type Command, type CommandHost, type UiContext } from "../commands/defineCommand";
import { runKey, type KeyResult } from "../commands/keymap";
import type { KeyEventLike, Platform } from "../commands/keys";
import { sessionIdentity, type Identity } from "../identity/session";
import { EditorState, selectionField, setSelection, type Path } from "./state";
import { TransactionBuilder } from "./builder";
import { Transaction } from "./transaction";
import { HandleRegistry, type NodeHandle } from "./handles";
import { AFTER_LOOP_LIMIT, appendedAnnotations, hooksOf, runBefore, type Veto } from "../normalize/hooks";

export interface StoreOptions {
  files: ReadonlyMap<Path, string> | Record<Path, string>;
  extensions?: Extension;
  versions?: ReadonlyMap<Path, string>;
  identity?: Identity;
  /** Dev mode: dispatching from a listener throws (default: NODE_ENV !== "production"). */
  dev?: boolean;
  ui?: UiContext;
}

type DispatchArg = Transaction | ((tr: TransactionBuilder) => TransactionBuilder);

const isDev = (): boolean => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV !== "production";

export class Store implements CommandHost {
  state: EditorState;
  readonly registry: HandleRegistry;
  ui: UiContext;
  private readonly dev: boolean;
  private listeners = new Set<() => void>();
  private notifying = false;
  private readonly queue: DispatchArg[] = [];

  constructor(opts: StoreOptions) {
    const config = Configuration.resolve([selectionField, opts.extensions ?? []]);
    this.state = EditorState.create({ files: opts.files, versions: opts.versions, config });
    this.registry = new HandleRegistry(this.state, opts.identity ?? sessionIdentity);
    this.dev = opts.dev ?? isDev();
    this.ui = opts.ui ?? {};
  }

  /** A builder on the current state. */
  builder(): TransactionBuilder {
    return new TransactionBuilder(this.state);
  }

  /**
   * Apply a transaction: `before` hooks (rewrite / veto), apply, `after` hooks (append, same
   * history step, loop-guarded), `onBatchComplete` hooks, then listeners — once per dispatch.
   * Returns false when a `before` hook vetoed it (`lastVeto` says which and why).
   */
  dispatch(arg: DispatchArg): boolean {
    if (this.notifying) {
      if (this.dev) throw new Error("dispatch() called from a state listener or normalization hook; dispatch from an event handler or command instead");
      this.queue.push(arg);
      return true;
    }
    this.notifying = true;
    let applied = false;
    try {
      const built = typeof arg === "function" ? arg(this.builder()).done() : arg;
      const r = runBefore(this.state, built);
      if ("veto" in r) {
        this.lastVeto = r.veto;
      } else {
        this.lastVeto = null;
        this.apply(r.tr);
        this.runAfter(r.tr);
        for (const h of hooksOf(this.state).batchComplete) h.run(this.state);
        for (const l of [...this.listeners]) l();
        applied = true;
      }
    } finally {
      this.notifying = false;
    }
    const next = this.queue.shift();
    if (next) this.dispatch(next);
    return applied;
  }

  /** The last veto from a `before` hook (null after an applied dispatch). */
  lastVeto: Veto | null = null;

  private apply(tr: Transaction): void {
    this.state = this.state.apply(tr, (next) => this.registry.remap(tr, next));
    this.registry.state = this.state;
  }

  private runAfter(base: Transaction): void {
    const hooks = hooksOf(this.state).after;
    if (!hooks.length) return;
    const counts = new Map<string, number>();
    const work = [base];
    while (work.length) {
      const tr = work.shift()!;
      for (const h of hooks) {
        const b = h.run(this.state, tr);
        if (!b || (!b.docChanged && !b.hasEffects)) continue;
        const n = (counts.get(h.name) ?? 0) + 1;
        counts.set(h.name, n);
        if (n > AFTER_LOOP_LIMIT) throw new Error(`after hook "${h.name}" re-triggered more than ${AFTER_LOOP_LIMIT} times in one dispatch (normalization loop)`);
        if (b.startState !== this.state) throw new Error(`after hook "${h.name}" built its transaction on a stale state`);
        const appended = b.annotate(appendedAnnotations(base)).done();
        this.apply(appended);
        work.push(appended);
      }
    }
  }

  /** Call `fn` whenever `select(state)` changes (by `equals`, default `Object.is`). */
  subscribe<T>(select: (s: EditorState) => T, fn: (value: T) => void, equals: (a: T, b: T) => boolean = Object.is): () => void {
    let last = select(this.state);
    const l = () => {
      const v = select(this.state);
      if (!equals(last, v)) fn((last = v));
    };
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  /** The innermost node at an offset. */
  handle(path: Path, offset: number): NodeHandle | null {
    return this.registry.at(path, offset);
  }

  /** Nodes matching a CSS-like selector (see selector.ts), in document order. */
  find(path: Path, selector: string): NodeHandle[] {
    const tree = this.state.tree(path);
    const m = compileSelector(selector);
    return tree.flat.filter((n) => m(n, tree)).map((n) => this.registry.of(path, n));
  }

  select(handles: NodeHandle | readonly NodeHandle[]): void {
    this.dispatch((tr) => tr.effect(setSelection, { handles: Array.isArray(handles) ? handles : [handles as NodeHandle] }));
  }

  command(id: string): Command<any> | undefined {
    return this.state.facet(commandsFacet).get(id);
  }

  run<A>(cmd: Command<A> | string, args?: A): boolean {
    const c = typeof cmd === "string" ? this.command(cmd) : cmd;
    return !!c && runCommand(this, c, args);
  }

  can<A>(cmd: Command<A> | string, args?: A): boolean {
    const c = typeof cmd === "string" ? this.command(cmd) : cmd;
    return !!c && canRun(this, c, args);
  }

  undo(): boolean {
    return this.run("history.undo");
  }

  redo(): boolean {
    return this.run("history.redo");
  }

  /** Run the keymap for a key or keyboard event. */
  press(key: KeyEventLike | string, opts: { platform?: Platform; ui?: Partial<UiContext> } = {}): KeyResult {
    return runKey(this, key, opts);
  }
}

export function createStore(opts: StoreOptions): Store {
  return new Store(opts);
}
