/**
 * Key dispatch (dispatch rules 1–5): bindings for a key are tried highest
 * precedence first; the first whose `when` passes AND whose command can run runs — and
 * only then is the event's default prevented and propagation stopped. Otherwise the key
 * passes through to the browser and other listeners. Text surfaces are a `when` key
 * (`textEditing`), not a global block. Ties are rejected at config time (keybindings facet).
 */
import { commandsFacet, keybindingsFacet, type ResolvedKeyBinding } from "../extensions/facets";
import { canRun, runCommand, type CommandHost, type UiContext } from "./defineCommand";
import { evaluateWhen } from "./when";
import { eventKey, normalizeKey, type KeyEventLike, type Platform } from "./keys";

export interface KeyResult {
  handled: boolean;
  /** The command that ran. */
  command?: string;
}

/** The `when` context: the UI context plus `selection` (an element is selected). */
export function whenContext(host: CommandHost): Record<string, unknown> {
  return { ...host.ui, selection: host.state.selection.handles.length > 0 };
}

/** Bindings that would fire for a key, in the order they're tried. */
export function bindingsFor(host: CommandHost, key: string, platform: Platform): ResolvedKeyBinding[] {
  const k = normalizeKey(key, platform);
  return host.state
    .facet(keybindingsFacet)
    .filter((b) => normalizeKey(platform === "mac" ? (b.mac ?? b.key) : b.key, platform) === k);
}

/** Handle a key (event or key string). Calls preventDefault / stopPropagation only when a command ran. */
export function runKey(host: CommandHost, input: KeyEventLike | string, opts: { platform?: Platform; ui?: Partial<UiContext> } = {}): KeyResult {
  const platform = opts.platform ?? "other";
  const key = typeof input === "string" ? input : eventKey(input, platform);
  const h: CommandHost = opts.ui ? { state: host.state, ui: { ...host.ui, ...opts.ui }, registry: host.registry, dispatch: (tr) => host.dispatch(tr), probe: host.probe } : host;
  const ctx = whenContext(h);
  const commands = h.state.facet(commandsFacet);
  for (const b of bindingsFor(h, key, platform)) {
    if (!evaluateWhen(b.when, ctx)) continue;
    const cmd = commands.get(b.command);
    if (!cmd || !canRun(h, cmd, b.args)) continue;
    if (!runCommand(h, cmd, b.args)) continue;
    if (typeof input !== "string") {
      input.preventDefault?.();
      input.stopPropagation?.();
    }
    return { handled: true, command: cmd.id };
  }
  return { handled: false };
}

/** The key label shown in tooltips and menus for a command (generated from bindings). */
export function keyLabel(host: CommandHost, command: string, platform: Platform = "other"): string | null {
  const b = host.state.facet(keybindingsFacet).find((x) => x.command === command);
  return b ? (platform === "mac" ? (b.mac ?? b.key) : b.key) : null;
}
