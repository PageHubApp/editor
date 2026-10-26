/**
 * Editor-only element settings (stripped on publish):
 *
 *   PermissionsControl  `data-edit-lock="drag delete drop-in move-out"` or `"sealed"` — one switch per lock
 *   AiNoteControl       `data-edit-note` — notes for the AI, multi-line
 */
import type { NodeHandle } from "@pagehub/engine";
import { ExpressionField, PanelNote } from "../../liquid/LiquidFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useAttrs } from "../useAttrs";

const LOCKS: readonly { token: string; label: string; help: string }[] = [
  { token: "drag", label: "Can't be dragged", help: "It stays where it is" },
  { token: "delete", label: "Can't be deleted", help: "Delete and cut do nothing" },
  { token: "drop-in", label: "Nothing can be dropped in", help: "Its children are fixed" },
  { token: "move-out", label: "Children can't move out", help: "What is inside stays inside" },
];

export function PermissionsControl({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const tokens = new Set((read("data-edit-lock") ?? "").split(/\s+/).filter(Boolean));
  const sealed = tokens.has("sealed");
  const save = (next: Set<string>) => write("data-edit-lock", next.size ? [...next].join(" ") : null);
  const toggle = (t: string, on: boolean) => {
    const next = new Set(tokens);
    if (on) next.add(t);
    else next.delete(t);
    save(next);
  };
  return (
    <div data-permissions-control="" className="flex flex-col gap-1">
      <ToolbarItemView type="toggle" inputId="lock-sealed" label="Sealed" on="on" value={sealed ? "on" : ""} onChange={(v) => save(v ? new Set(["sealed"]) : new Set())} />
      {!sealed && LOCKS.map((l) => <ToolbarItemView key={l.token} type="toggle" inputId={`lock-${l.token}`} label={l.label} on="on" value={tokens.has(l.token) ? "on" : ""} onChange={(v) => toggle(l.token, !!v)} />)}
      <PanelNote>{sealed ? "Sealed: it can't be selected into, dragged or deleted. Only its own settings change." : "Locks apply in the editor only; visitors never see them."}</PanelNote>
    </div>
  );
}

export function AiNoteControl({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  return (
    <div data-ai-note-control="" className="flex flex-col gap-1">
      <ExpressionField id="ai-note" label="Notes" multiline mono={false} placeholder="What this element is for, what to keep, what to avoid…" value={read("data-edit-note") ?? ""} onCommit={(v) => write("data-edit-note", v.trim() || null)} />
      <PanelNote>The AI reads these before changing this element. Removed when the site is published.</PanelNote>
    </div>
  );
}
