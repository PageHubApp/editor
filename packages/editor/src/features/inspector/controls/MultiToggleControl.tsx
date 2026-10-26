/**
 * MultiToggleControl — a row of independent icon toggles, each owning its own class group + token
 * (bold → `font-weight`/`font-bold`, italic → `font-style`/`italic`, underline & strikethrough →
 * `text-decoration`). A leading "None" clears every toggle's group at the active view.
 *
 *   <MultiToggleControl label="Style" toggles={emphasisToggles} />
 */
import { type ClassGroup } from "@pagehub/engine";
import { classGroupsFacet, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import type { ToggleSpec } from "../controlSpecs";
import { Chip } from "../../../primitives/Chip";
import { Icon } from "../../../primitives/icons";
import { tooltip } from "../../../primitives/tooltip";
import { TOOLBAR_SEGMENTED_ACTIVE, TOOLBAR_SEGMENTED_INACTIVE } from "../../toolbar/primitives/ToolbarSegmentedControl";

interface MultiToggleControlProps {
  label: string;
  toggles: ToggleSpec[];
}

const CELL = "flex h-6 min-w-0 flex-1 items-center justify-center rounded text-[11px] leading-tight font-medium transition-colors";

export function MultiToggleControl({ label, toggles }: MultiToggleControlProps) {
  const { handle, classes } = useInspectedClass();
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  const ui = useUi((u) => u, (a, b) => a.view === b.view && a.dark === b.dark && a.multiScope === b.multiScope);
  const run = useRunCommand();
  if (!handle) return null;

  const tokenOf = (group: string): string => {
    const def = groups.get(group);
    return def ? (readClass(classes, def as ClassGroup, { view: ui.view, dark: ui.dark }).value ?? "") : "";
  };
  const active = toggles.map((t) => tokenOf(t.group) === t.className);
  const write = (group: string, token: string | null) => run("classes.set", { group, token, scopes: writeScopes(ui), at: handle });
  const anyActive = active.some(Boolean);

  return (
    <Chip label={label} frame="bare">
      <div role="group" className="bg-neutral flex w-full min-w-0 gap-1 rounded-md p-1">
        <button type="button" onClick={() => toggles.forEach((t) => write(t.group, null))} disabled={!anyActive} aria-label="Clear all" aria-pressed={!anyActive} {...tooltip("None")} className={`${CELL} ${anyActive ? TOOLBAR_SEGMENTED_INACTIVE : TOOLBAR_SEGMENTED_ACTIVE}`}>
          <Icon name="x" className="size-3.5" />
        </button>
        {toggles.map((t, i) => (
          <button
            key={t.group + t.className}
            type="button"
            onClick={() => write(t.group, active[i] ? null : t.className)}
            aria-label={t.tooltip}
            aria-pressed={active[i]}
            {...tooltip(t.tooltip)}
            className={`${CELL} ${active[i] ? TOOLBAR_SEGMENTED_ACTIVE : TOOLBAR_SEGMENTED_INACTIVE}`}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </Chip>
  );
}
