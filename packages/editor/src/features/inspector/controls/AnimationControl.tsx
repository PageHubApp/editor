/**
 * AnimationControl — the entrance-animation preset picker. It is the control the `animation`
 * property's popover renders instead of a bare `data-animate` text field.
 *
 * Reads / writes the `data-animate` attribute (the standalone runtime's reveal-on-scroll preset;
 * keyframes ship in `packages/site-runtime/src/animate.css`) and the `data-animate-trigger`
 * attribute (`On scroll` default / `On load`). A preview tile replays the chosen preset — the
 * control injects the same entrance keyframes into the editor document (scoped to
 * `.ph-anim-preview`) so the tile plays inside the inspector.
 *
 * The preset list is INLINE (not a portalled dropdown) — like `PatternControl` — so a click never
 * reads as "outside" the row's `AnchoredPopover` and dismisses it before the write commits.
 *
 * Below the preset + trigger sit the entrance-param overrides (Duration / Delay / Easing / Repeat).
 * Each is a segmented control bound straight to an `anim-*` class
 * group (`groups.ts`) through the shared `readClass` / `classes.set` seam, writing an `[animation-*]`
 * longhand that retimes the keyframe `animation` the runtime applies via `animate-css-<preset>`.
 *
 * Catalogue + preview CSS + param rows live in `./animationPresets`. Continuous / hover presets are a
 * separate standalone mechanism (`twAnimate` / `animationLoop`), not this `data-animate` row.
 */
import { useEffect, useState } from "react";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useInspectedHandle, useRunCommand } from "../../../react/bindings";
import { uiScopeEq, useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { Icon } from "../../../primitives/icons";
import { TOOLTIP_ID } from "../../../primitives/tooltip";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { ToolbarSegmentedControl } from "../../toolbar/primitives/ToolbarSegmentedControl";
import { ANIMATION_EXITS, ANIMATION_GROUPS, ANIMATION_PARAM_ROWS, ANIMATION_STAGGERS, ANIMATION_PREVIEW_CSS, ANIMATION_PREVIEW_STYLE_ID, ANIMATION_TRIGGERS, type AnimationParamRow, animationLabel } from "./animationPresets";

/**
 * One entrance-param row (Duration / Delay / Easing / Repeat): a labelled segmented control bound
 * straight to a class GROUP, reading / writing through the same `readClass` / `classes.set` seam as
 * the gradient direction + stop-position rows. Each option's `value` is the full class token.
 */
function AnimationParamField({ group, label, options }: AnimationParamRow) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const value = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const set = (token: string) => void run("classes.set", { group, token: token || null, scopes: writeScopes(ui), at: handle });
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-base-content/60 px-1 text-[11px]">{label}</span>
      <ToolbarSegmentedControl
        dense
        tooltipId={TOOLTIP_ID}
        aria-label={label}
        value={value}
        onChange={set}
        options={options.map((o) => ({ value: o.value, label: o.label, ariaLabel: o.aria ?? o.label, tooltip: o.aria }))}
      />
    </div>
  );
}

/** A labelled segmented control bound to one attribute on the inspected element ("" removes it). */
function AttrSegmented({ attr, label, options, hint }: { attr: string; label: string; options: readonly { value: string; label: string; aria?: string }[]; hint?: string }) {
  const handle = useInspectedHandle();
  const run = useRunCommand();
  const value = useEditorState(() => (handle?.alive && handle.kind === "element" ? (handle.attr(attr) ?? "") : ""));
  if (!handle) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-animation-attr={attr}>
      <span className="text-base-content/60 px-1 text-[11px]">{label}</span>
      <ToolbarSegmentedControl
        dense
        tooltipId={TOOLTIP_ID}
        aria-label={label}
        value={value}
        onChange={(v) => void run("attr.set", { name: attr, value: v || null, at: handle })}
        options={options.map((o) => ({ value: o.value, label: o.label, ariaLabel: o.aria ?? o.label, tooltip: o.aria }))}
      />
      {hint && <span className="text-base-content/50 px-1 text-[10px] leading-snug">{hint}</span>}
    </div>
  );
}

/** A labelled select bound to one attribute on the inspected element ("" removes it). */
function AttrSelect({ attr, label, options, hint }: { attr: string; label: string; options: readonly { value: string; label: string }[]; hint?: string }) {
  const handle = useInspectedHandle();
  const run = useRunCommand();
  const value = useEditorState(() => (handle?.alive && handle.kind === "element" ? (handle.attr(attr) ?? "") : ""));
  if (!handle) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-animation-attr={attr}>
      <ToolbarItemView
        label={label}
        inputId={attr}
        placeholder="None"
        type="select"
        value={value}
        valueLabels={options.map((o) => o.value)}
        formatLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
        onChange={(v) => void run("attr.set", { name: attr, value: v || null, at: handle })}
      />
      {hint && <span className="text-base-content/50 px-1 text-[10px] leading-snug">{hint}</span>}
    </div>
  );
}

const ANIMATE_ATTR = "data-animate";
const TRIGGER_ATTR = "data-animate-trigger";

/** Inject the entrance keyframes into the editor document once, so the preview tile plays. */
function useAnimationPreviewCss() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(ANIMATION_PREVIEW_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = ANIMATION_PREVIEW_STYLE_ID;
    style.textContent = ANIMATION_PREVIEW_CSS;
    document.head.appendChild(style);
  }, []);
}

/** The preview stage. Shows the chosen entrance preset on a tile; click to replay. */
function PreviewTile({ preset }: { preset: string }) {
  const [playCount, setPlayCount] = useState(0);
  return (
    <div className="ph-anim-preview border-base-300 bg-base-200/40 flex h-24 items-center justify-center overflow-hidden rounded-xl border">
      {preset ? (
        <button
          type="button"
          key={`${preset}-${playCount}`}
          onClick={() => setPlayCount((n) => n + 1)}
          className={`animate-css-${preset} border-base-300 bg-base-100 text-base-content hover:border-primary group flex size-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border shadow-sm`}
          aria-label="Replay animation"
        >
          <Icon name="refresh" className="text-neutral-content group-hover:text-primary size-4" />
          <span className="text-[10px] font-medium tracking-wide uppercase">Replay</span>
        </button>
      ) : (
        <div className="text-neutral-content flex flex-col items-center gap-1.5 text-xs">
          <div className="border-base-300 bg-base-100 size-14 rounded-lg border border-dashed" />
          <span>Pick an animation to preview</span>
        </div>
      )}
    </div>
  );
}

export function AnimationControl() {
  useAnimationPreviewCss();
  const handle = useInspectedHandle();
  const run = useRunCommand();
  const preset = useEditorState(() => (handle?.alive && handle.kind === "element" ? (handle.attr(ANIMATE_ATTR) ?? "") : ""));
  const trigger = useEditorState(() => (handle?.alive && handle.kind === "element" ? (handle.attr(TRIGGER_ATTR) ?? "") : ""));
  if (!handle || handle.kind !== "element") return null;

  const setPreset = (v: string) => {
    run("attr.set", { name: ANIMATE_ATTR, value: v || null, at: handle });
    if (!v) run("attr.set", { name: TRIGGER_ATTR, value: null, at: handle });
  };
  const setTrigger = (v: string) => run("attr.set", { name: TRIGGER_ATTR, value: v || null, at: handle });

  return (
    <div className="flex min-w-0 flex-col gap-2" data-animation-control="">
      <PreviewTile preset={preset} />

      {/* Entrance preset list — inline, so a click stays inside the row's popover. */}
      <div className="border-base-300 bg-base-100 flex min-w-0 flex-col gap-1 rounded-lg border p-2" role="listbox" aria-label="Entrance animation">
        <button
          type="button"
          role="option"
          aria-selected={preset === ""}
          onClick={() => setPreset("")}
          className={`w-full truncate rounded px-2 py-1 text-left text-xs ${preset === "" ? "bg-primary/10 text-primary" : "text-base-content/60 hover:bg-neutral"}`}
        >
          None
        </button>
        {ANIMATION_GROUPS.map(({ group, presets }) => (
          <div key={group} className="flex min-w-0 flex-col gap-0.5">
            <div className="text-base-content/50 px-2 pt-1 text-[10px] font-semibold tracking-wide uppercase">{group}</div>
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={p.key === preset}
                onClick={() => setPreset(p.key)}
                className={`w-full truncate rounded px-2 py-1 text-left text-xs ${p.key === preset ? "bg-primary/10 text-primary" : "hover:bg-neutral"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Trigger — inline segmented buttons, shown once an entrance is chosen. */}
      {preset && (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-base-content/50 px-1 text-[10px] font-semibold tracking-wide uppercase">Trigger</div>
          <div className="border-base-300 flex gap-1 rounded-lg border p-0.5" role="radiogroup" aria-label="Animation trigger">
            {ANIMATION_TRIGGERS.map((t) => (
              <button
                key={t.value || "scroll"}
                type="button"
                role="radio"
                aria-checked={trigger === t.value}
                onClick={() => setTrigger(t.value)}
                className={`flex-1 truncate rounded px-2 py-1 text-xs ${trigger === t.value ? "bg-primary text-primary-content" : "text-base-content/70 hover:bg-neutral"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timing — duration / delay / easing / repeat, shown once an entrance is chosen. */}
      {preset && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="text-base-content/50 px-1 text-[10px] font-semibold tracking-wide uppercase">Timing</div>
          {ANIMATION_PARAM_ROWS.map((row) => (
            <AnimationParamField key={row.group} {...row} />
          ))}
          <AttrSelect attr="data-animate-exit" label="Exit" options={ANIMATION_EXITS} hint="Plays when it scrolls back out; the entrance replays on return." />
        </div>
      )}

      {/* Stagger — set on the container: each animated child starts one step after the one before. */}
      <AttrSegmented attr="data-animate-stagger" label="Stagger children (ms)" options={ANIMATION_STAGGERS} hint="Delays each animated child of this element by one more step." />
    </div>
  );
}

export { animationLabel };
