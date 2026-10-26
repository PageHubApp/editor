/**
 * The shadow size preset tiles: a square per `shadow-*` size drawn WITH that shadow (inline
 * box-shadow, the values Tailwind compiles), so the choice is seen, not read. Clicking the active
 * tile clears it. Reads / writes the `shadow` class group through the shared class seam.
 *
 *   <ShadowTiles group="shadow" options={SHADOW_OPTS} />
 */
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { uiScopeEq, useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { tooltip } from "../../../primitives/tooltip";

const BLACK = (a: number) => `rgb(0 0 0 / ${a})`;

/** Tailwind's default shadow scale, as plain CSS (the tile must not depend on the editor sheet compiling it). */
export const SHADOW_PREVIEW: Record<string, string> = {
  "shadow-none": "none",
  "shadow-xs": `0 1px 2px 0 ${BLACK(0.05)}`,
  "shadow-sm": `0 1px 3px 0 ${BLACK(0.1)}, 0 1px 2px -1px ${BLACK(0.1)}`,
  "shadow-md": `0 4px 6px -1px ${BLACK(0.1)}, 0 2px 4px -2px ${BLACK(0.1)}`,
  "shadow-lg": `0 10px 15px -3px ${BLACK(0.1)}, 0 4px 6px -4px ${BLACK(0.1)}`,
  "shadow-xl": `0 20px 25px -5px ${BLACK(0.1)}, 0 8px 10px -6px ${BLACK(0.1)}`,
  "shadow-2xl": `0 25px 50px -12px ${BLACK(0.25)}`,
  "shadow-inner": `inset 0 2px 4px 0 ${BLACK(0.05)}`,
};

export function ShadowTiles({ group, label, options }: { group: string; label: string; options: readonly string[] }) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const value = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const pick = (token: string) => void run("classes.set", { group, token: token === value ? null : token, scopes: writeScopes(ui), at: handle });
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-base-content/60 px-1 text-[11px]">{label}</span>
      <div data-shadow-tiles="" role="radiogroup" aria-label={label} className="grid min-w-0 grid-cols-4 gap-1.5 pb-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            aria-label={o.replace(/^shadow-?/, "") || "default"}
            data-shadow-tile={o}
            {...tooltip(o, "top")}
            onClick={() => pick(o)}
            className={`bg-base-200 flex flex-col items-center gap-1.5 rounded-md border px-1.5 pt-3 pb-1.5 ${o === value ? "border-primary ring-primary/30 ring-1" : "border-base-300 hover:border-base-content/30"}`}
          >
            <span className="bg-base-100 block h-7 w-full rounded" style={{ boxShadow: SHADOW_PREVIEW[o] ?? "none" }} />
            <span className="text-base-content/70 text-[10px] leading-none">{o.replace(/^shadow-?/, "") || "base"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
