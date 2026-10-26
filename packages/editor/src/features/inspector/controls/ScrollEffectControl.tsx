/**
 * The Scroll effect row: the effect (`data-scroll-effect="horizontal|timeline"`) and its settings —
 * pan direction and speed for a horizontal scroll, runway (pinned length) and smoothing for both —
 * the attributes the site runtime's `scroll-effect` chunk reads. Turning it off removes them all.
 *
 *   <ScrollEffectControl handle={h} />
 */
import type { NodeHandle } from "@pagehub/engine";
import { ExpressionField, PanelNote } from "../../liquid/LiquidFields";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { useAttrs } from "../useAttrs";

const ATTRS = ["data-scroll-effect", "data-scroll-direction", "data-scroll-speed", "data-scroll-runway", "data-scroll-smoothing"];

export function ScrollEffectControl({ handle }: { handle: NodeHandle }) {
  const { read, write } = useAttrs(handle);
  const effect = read("data-scroll-effect") ?? "";
  const num = (attr: string, label: string, placeholder: string) => (
    <ExpressionField id={`scroll-${attr}`} label={label} mono={false} placeholder={placeholder} value={read(attr) ?? ""} onCommit={(v) => (v.trim() === "" || !isNaN(+v) ? write(attr, v.trim() || null) : false)} />
  );
  const setEffect = (v: string) => {
    if (!v) ATTRS.forEach((a) => read(a) !== null && write(a, null));
    else write("data-scroll-effect", v);
  };
  return (
    <div data-scroll-effect-control="" className="flex flex-col gap-2">
      <ToolbarItemView
        type="radio"
        inputId="scroll-effect"
        label="Effect"
        value={effect}
        onChange={setEffect}
        options={[
          { value: "", label: "None" },
          { value: "horizontal", label: "Sideways", hint: "Vertical scrolling pans the row sideways" },
          { value: "timeline", label: "Pinned", hint: "The section stays put while its content plays through" },
        ]}
      />
      {effect === "horizontal" && (
        <>
          <ToolbarItemView type="radio" inputId="scroll-direction" label="Direction" value={/reverse|rtl|left/.test(read("data-scroll-direction") ?? "") ? "reverse" : "forward"} onChange={(v) => write("data-scroll-direction", v === "reverse" ? "reverse" : null)} options={[{ value: "forward", label: "Forward" }, { value: "reverse", label: "Reverse" }]} />
          {num("data-scroll-speed", "Speed", "1")}
        </>
      )}
      {effect && (
        <>
          {num("data-scroll-runway", "Screens", "3")}
          {num("data-scroll-smoothing", "Smoothing", "0 to 0.98")}
          <PanelNote>Screens is how long the section stays pinned, in screen heights. Smoothing eases the motion toward the scroll position.</PanelNote>
        </>
      )}
    </div>
  );
}
