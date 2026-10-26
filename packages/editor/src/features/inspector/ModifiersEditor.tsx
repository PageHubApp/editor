/**
 * ModifiersEditor — the Modifiers section body. A browseable, searchable library of the style
 * modifiers (`MODIFIER_PRESETS`: reusable `ph-mod-*` class bundles stacked on top of an element's
 * own classes): grouped by category, each a full-width card with label + description + class count,
 * the active ones highlighted, a search box that filters across categories, and a "None" affordance
 * that clears them.
 *
 * Writes through the one sanctioned class path, `classes.set({ group: "modifier-presets", token })`
 * — the engine models `ph-mod-*` as a single group, so picking one modifier replaces any other and
 * `token: null` clears it (single-select). Stacking several at once would need an engine-level
 * multi-token group / `classes.add`, which is outside the editor layer.
 *
 *   <ModifiersEditor handle={handle} />
 */
import { useMemo, useState } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { MODIFIER_CATEGORIES, MODIFIER_PRESETS, type ModifierPreset } from "../modifiers/modifierPresets";
import { Icon } from "../../primitives/icons";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";

const matches = (m: ModifierPreset, q: string) =>
  [m.label, m.token, m.category, m.description].join(" ").toLowerCase().includes(q);

function ModifierChip({ mod, active, onToggle }: { mod: ModifierPreset; active: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-modifier={mod.token}
      className={`group flex items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-content/40 hover:bg-base-200"
      }`}
    >
      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border ${active ? "border-primary bg-primary text-primary-content" : "border-base-300"}`}>
        {active && <Icon name="check" className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-1.5">
          <span className={`truncate text-xs font-medium ${active ? "text-primary" : "text-base-content"}`}>{mod.label}</span>
          <span className="text-base-content/40 shrink-0 text-[9px]">{mod.token.replace("ph-mod-", "")}</span>
        </span>
        <span className="text-base-content/60 mt-0.5 line-clamp-2 block text-[10px] leading-snug">{mod.description}</span>
      </span>
    </button>
  );
}

export function ModifiersEditor({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const [search, setSearch] = useState("");
  const active = useEditorState(
    () => new Set((handle.alive && handle.kind === "element" ? handle.classes() : []).filter((c) => c.startsWith("ph-mod-"))),
    (a, b) => a.size === b.size && [...a].every((t) => b.has(t)),
  );

  const toggle = (token: string) =>
    run("classes.set", { group: "modifier-presets", token: active.has(token) ? null : token, at: handle });
  const clearAll = () => run("classes.set", { group: "modifier-presets", token: null, at: handle });

  const q = search.trim().toLowerCase();
  const byCategory = useMemo(
    () =>
      MODIFIER_CATEGORIES.map((cat) => ({
        cat,
        mods: MODIFIER_PRESETS.filter((m) => m.category === cat && (!q || matches(m, q))),
      })).filter((c) => c.mods.length > 0),
    [q],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <ToolbarItemView label="" labelHide type="text" value={search} placeholder="Search modifiers…" inputId="modifier-search" onChange={setSearch} />
        </div>
        {active.size > 0 && (
          <button type="button" onClick={clearAll} className="text-base-content/60 hover:text-error shrink-0 px-1.5 text-[10px] font-medium" aria-label="Clear all modifiers">
            None
          </button>
        )}
      </div>
      {byCategory.length === 0 ? (
        <div className="text-base-content/60 py-4 text-center text-[11px]">No modifiers match “{search}”.</div>
      ) : (
        byCategory.map(({ cat, mods }) => (
          <div key={cat} className="flex flex-col gap-1">
            <div className="text-base-content/50 px-0.5 text-[10px] font-semibold tracking-wide uppercase">{cat}</div>
            {mods.map((mod) => (
              <ModifierChip key={mod.token} mod={mod} active={active.has(mod.token)} onToggle={() => toggle(mod.token)} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
