/**
 * Commands are pure: `run(ctx, args)` returns whether it applies and, only when
 * `ctx.dispatch` is present, dispatches its transaction. The same function is the dry run
 * (`can`): `ctx.dispatch` is undefined, so nothing changes. Ids are frozen once released.
 */
import { EXTENSION, type Extension } from "../extensions/extension";
import { commandsFacet } from "../extensions/facets";
import { TransactionBuilder } from "../state/builder";
import type { Schema } from "../schema/t";
import type { EditorState, Selection } from "../state/state";
import type { HandleRegistry, NodeHandle } from "../state/handles";
import type { Transaction } from "../state/transaction";

/** UI context: what `when` expressions and commands see of the shell. */
export interface UiContext {
  textEditing?: boolean;
  focus?: "canvas" | "panel" | "input" | null;
  paletteOpen?: boolean;
  mediaManagerOpen?: boolean;
  role?: "owner" | "editor" | "client" | "viewer";
  readOnly?: boolean;
  [key: string]: unknown;
}

export interface CommandContext {
  state: EditorState;
  selection: Selection;
  tr: TransactionBuilder;
  /** Undefined on a dry run. */
  dispatch?: (tr: TransactionBuilder) => void;
  ui: UiContext;
  /** The host's handles (top-level siblings, selecting nodes a transaction creates). */
  registry?: HandleRegistry;
}

export interface Command<A = void> {
  readonly id: string;
  readonly title: string;
  readonly args?: Schema<A>;
  run(ctx: CommandContext, args: A): boolean;
  [EXTENSION](): Extension;
}

export function defineCommand<A = void>(def: { id: string; title: string; args?: Schema<A>; run(ctx: CommandContext, args: A): boolean }): Command<A> {
  const cmd: Command<A> = { ...def, [EXTENSION]: () => commandsFacet.of(cmd) };
  return cmd;
}

/** What running a command needs from an editor. */
export interface CommandHost {
  readonly state: EditorState;
  readonly ui: UiContext;
  readonly registry?: HandleRegistry;
  dispatch(tr: Transaction): void;
  /** Role gate: false when running the command would be vetoed (content mode, read-only). Absent: no gate. */
  probe?(cmd: Command<any>, args: unknown): boolean;
}

/**
 * A `setSelection` value whose handles are resolved after the transaction applies — for
 * selecting nodes the transaction itself creates (a duplicate, a paste). The selection field
 * reads `handles` while the state updates, after the registry has moved to the new state,
 * so `resolve` sees the new tree. Resolved once.
 */
export function selectAfter(resolve: () => readonly NodeHandle[]): { readonly handles: readonly NodeHandle[] } {
  let cached: readonly NodeHandle[] | undefined;
  return {
    get handles() {
      return (cached ??= resolve());
    },
  };
}

function context(host: CommandHost, dry: boolean, id: string, dispatched: { n: number }): CommandContext {
  const state = host.state;
  return {
    state,
    selection: state.selection,
    tr: new TransactionBuilder(state),
    ui: host.ui,
    registry: host.registry,
    dispatch: dry
      ? undefined
      : (tr) => {
          dispatched.n++;
          host.dispatch(tr.annotate({ command: id }).done());
        },
  };
}

function checkedArgs<A>(cmd: Command<A>, args: A | undefined): { ok: boolean; args: A } {
  if (!cmd.args) return { ok: true, args: args as A };
  const r = cmd.args.check(args);
  return r.ok ? { ok: true, args: r.value } : { ok: false, args: args as A };
}

/** Dry run: would the command apply? Never dispatches. */
export function canRun<A>(host: CommandHost, cmd: Command<A>, args?: A): boolean {
  const a = checkedArgs(cmd, args);
  return a.ok && (host.probe?.(cmd, args) ?? true) && cmd.run(context(host, true, cmd.id, { n: 0 }), a.args);
}

/** Run the command; true when it applied. */
export function runCommand<A>(host: CommandHost, cmd: Command<A>, args?: A): boolean {
  const a = checkedArgs(cmd, args);
  return a.ok && (host.probe?.(cmd, args) ?? true) && cmd.run(context(host, false, cmd.id, { n: 0 }), a.args);
}
