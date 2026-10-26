/**
 * GradientControl — the gradient editor: a direction segmented control (the eight `bg-linear-to-*`
 * arrows), a live preview bar, and the From / Via / To colour stops (the same colour swatch rows
 * as every other colour). Direction writes the `bg-gradient` group; each stop writes its
 * `gradient-from` / `gradient-via` / `gradient-to` group.
 *
 *   <GradientControl />   // rendered inside the backgroundGradient row's popover body
 */
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { uiScopeEq, useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { TOOLTIP_ID, tooltip } from "../../../primitives/tooltip";
import { Icon } from "../../../primitives/icons";
import { ToolbarSegmentedControl } from "../../toolbar/primitives/ToolbarSegmentedControl";
import { refToCss } from "../../pickers/colorValue";
import { GroupColorRow, useGroupColorBinding } from "./groupFields";

const DIRECTIONS: { value: string; arrow: string; css: string; hint: string }[] = [
  { value: "bg-linear-to-tl", arrow: "↖", css: "to top left", hint: "To top left" },
  { value: "bg-linear-to-t", arrow: "↑", css: "to top", hint: "To top" },
  { value: "bg-linear-to-tr", arrow: "↗", css: "to top right", hint: "To top right" },
  { value: "bg-linear-to-r", arrow: "→", css: "to right", hint: "To right" },
  { value: "bg-linear-to-br", arrow: "↘", css: "to bottom right", hint: "To bottom right" },
  { value: "bg-linear-to-b", arrow: "↓", css: "to bottom", hint: "To bottom" },
  { value: "bg-linear-to-bl", arrow: "↙", css: "to bottom left", hint: "To bottom left" },
  { value: "bg-linear-to-l", arrow: "←", css: "to left", hint: "To left" },
];

/** One stop's position (%) slider, writing the `gradient-<stop>-pos` group (`from-50%` …). */
function PositionSlider({ group, prefix, label }: { group: string; prefix: string; label: string }) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const token = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const pos = Number(token.match(/(\d{1,3})%$/)?.[1] ?? "");
  const set = (token: string | null) => void run("classes.set", { group, token, scopes: writeScopes(ui), at: handle });
  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px]">
      <span className="text-base-content/60 w-8 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Number.isNaN(pos) ? "" : pos}
        onChange={(e) => set(`${prefix}-${e.currentTarget.value}%`)}
        className="slider bg-neutral h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg"
        aria-label={`${label} stop position`}
      />
      <span className="text-base-content/50 w-8 shrink-0 text-right tabular-nums">{Number.isNaN(pos) ? "auto" : `${pos}%`}</span>
      {!Number.isNaN(pos) && (
        <button type="button" onClick={() => set(null)} aria-label={`Clear ${label} position`} {...tooltip(`Clear ${label} position`)} className="text-base-content/40 hover:text-error flex size-4 shrink-0 items-center justify-center rounded">
          <Icon name="x" className="size-3" />
        </button>
      )}
    </label>
  );
}

export function GradientControl() {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get("bg-gradient"));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  const from = useGroupColorBinding("gradient-from");
  const via = useGroupColorBinding("gradient-via");
  const to = useGroupColorBinding("gradient-to");
  if (!handle || !def) return null;

  const direction = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const setDirection = (token: string | null) => void run("classes.set", { group: "bg-gradient", token, scopes: writeScopes(ui), at: handle });
  const dirCss = DIRECTIONS.find((d) => d.value === direction)?.css ?? "to bottom";
  const hasGradient = !!direction;
  const stops = [from?.value ? refToCss(from.value, []) || from.css : "transparent", via?.value ? refToCss(via.value, []) || via.css : "", to?.value ? refToCss(to.value, []) || to.css : "transparent"].filter((_, i) => i !== 1 || (via?.value ?? "") !== "");
  const previewBg = `linear-gradient(${dirCss}, ${stops.join(", ")})`;

  return (
    <div className="flex min-w-0 flex-col gap-2" data-gradient-control="">
      <ToolbarSegmentedControl
        compact
        optionClassName="w-7"
        tooltipId={TOOLTIP_ID}
        value={direction}
        onChange={(v) => setDirection(direction === v ? null : v)}
        options={DIRECTIONS.map((d) => ({ value: d.value, label: <span aria-hidden>{d.arrow}</span>, tooltip: d.hint, ariaLabel: d.hint }))}
      />
      {hasGradient && <div className="border-base-300 h-5 w-full rounded border" style={{ background: previewBg }} aria-hidden />}
      <div className="flex min-w-0 flex-col gap-1.5">
        <GroupColorRow group="gradient-from" label="From" />
        <GroupColorRow group="gradient-via" label="Via" />
        <GroupColorRow group="gradient-to" label="To" />
      </div>
      {hasGradient && (
        <div className="border-base-300/60 flex min-w-0 flex-col gap-1.5 border-t pt-2">
          <span className="text-base-content/50 text-[10px] font-medium tracking-wide uppercase">Stop positions</span>
          <PositionSlider group="gradient-from-pos" prefix="from" label="From" />
          {(via?.value ?? "") !== "" && <PositionSlider group="gradient-via-pos" prefix="via" label="Via" />}
          <PositionSlider group="gradient-to-pos" prefix="to" label="To" />
        </div>
      )}
      {hasGradient && (
        <button type="button" onClick={() => setDirection(null)} className="text-neutral-content hover:text-error self-end text-[10px] transition-colors">
          Remove gradient
        </button>
      )}
    </div>
  );
}
