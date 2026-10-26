/**
 * The default `ModifiersPanel` slot: reusable style modifiers applied to the selected element,
 * the body of the right slide-out drawer (`panel.modifiers`, ⌘⇧O; the drawer owns the frame,
 * title and close). The real add-flow, ported:
 *   - a `+` menu ("Browse library" / "Save current styles as modifier") in the panel header,
 *   - a searchable library of the built-in `ph-mod-*` presets grouped by category plus any
 *     modifiers the user saved, each toggled on the selection's `class`,
 *   - a "None" affordance that clears every preset token at once,
 *   - a Save view that records the selection's curated classes as a named library modifier.
 * `CanvasStyleBridge` supplies the preset CSS so the look shows live; saved modifiers reuse the
 * classes already on the element. With nothing selected the panel asks for a selection.
 */
import { useEffect, useMemo, useState } from "react";
import { useEditorStore, useInspectedClass } from "../../react/bindings";
import { MODIFIER_CATEGORIES, MODIFIER_PRESETS, type ModifierPreset } from "./modifierPresets";
import { removeSavedModifier, useSavedModifiers, type SavedModifier } from "./savedModifiers";
import { SearchableMenuPopover, type SearchableMenuItem } from "../../primitives/SearchableMenuPopover";
import { Icon, type IconName } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { SaveModifierForm } from "./SaveModifierForm";

export interface ModifiersPanelProps {
  open: boolean;
  onClose(): void;
}

type AddAction = "library" | "save";

const ADD_ITEMS: SearchableMenuItem<AddAction>[] = [
  { id: "library", label: "Browse library", data: "library", keywords: ["add", "browse", "pattern", "variant"] },
  { id: "save", label: "Save current styles as modifier", data: "save", keywords: ["save", "create", "new"] },
];
const ADD_ICON: Record<AddAction, IconName> = { library: "list", save: "floppy" };

const presetMatches = (m: ModifierPreset, q: string) => !q || [m.label, m.token, m.category, m.description].join(" ").toLowerCase().includes(q);
const savedMatches = (m: SavedModifier, q: string) => !q || [m.label, m.name, m.classes].join(" ").toLowerCase().includes(q);

function Card({ active, title, hint, description, onToggle, onRemove }: {
  active: boolean;
  title: string;
  hint?: string;
  description?: string;
  onToggle(): void;
  onRemove?(): void;
}) {
  return (
    <div
      className={`group border-base-300 flex items-stretch overflow-hidden rounded-box border transition-colors ${active ? "border-primary bg-primary/10" : "hover:bg-base-200"}`}
    >
      <button
        type="button"
        data-modifier-active={active || undefined}
        onClick={onToggle}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left"
      >
        <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${active ? "border-primary bg-primary text-primary-content" : "border-base-300"}`} aria-hidden>
          {active && <Icon name="check" className="size-3" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base-content flex items-center gap-1.5 text-xs font-medium">
            {title}
            {hint && <span className="text-base-content/40 text-[10px] font-normal">{hint}</span>}
          </span>
          {description && <span className="text-base-content/55 line-clamp-2 text-[11px] leading-snug">{description}</span>}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          data-modifier-remove=""
          onClick={onRemove}
          className="border-base-300/70 text-base-content/50 hover:text-error flex shrink-0 items-center border-l px-2 opacity-0 transition-opacity group-hover:opacity-100"
          {...tooltip("Delete saved modifier", "left")}
          aria-label="Delete saved modifier"
        >
          <Icon name="trash" className="size-3" />
        </button>
      )}
    </div>
  );
}

export function ModifiersPanel({ open, onClose }: ModifiersPanelProps) {
  const store = useEditorStore();
  const { handle, classes } = useInspectedClass();
  const saved = useSavedModifiers();
  const [view, setView] = useState<"library" | "save">("library");
  const [search, setSearch] = useState("");

  const editable = !!(handle?.alive && handle.kind === "element");
  const active = useMemo(() => new Set(classes), [classes]);

  // A selection that can't hold modifiers (or none at all) has nothing to save — fall back to the library.
  useEffect(() => {
    if (!editable && view === "save") setView("library");
  }, [editable, view]);

  const toggleTokens = (tokens: string[]) => {
    if (!editable || tokens.length === 0) return;
    const cur = handle!.classes();
    const allOn = tokens.every((t) => cur.includes(t));
    const next = allOn ? cur.filter((c) => !tokens.includes(c)) : [...cur, ...tokens.filter((t) => !cur.includes(t))];
    store.dispatch((tr) => tr.setAttr(handle!, "class", next.length ? next.join(" ") : null));
  };

  const presetTokens = useMemo(() => new Set(MODIFIER_PRESETS.map((p) => p.token)), []);
  const anyPresetActive = MODIFIER_PRESETS.some((p) => active.has(p.token));
  const clearPresets = () => {
    if (!editable) return;
    const cur = handle!.classes();
    const next = cur.filter((c) => !presetTokens.has(c));
    if (next.length !== cur.length) store.dispatch((tr) => tr.setAttr(handle!, "class", next.length ? next.join(" ") : null));
  };

  const onAdd = (item: SearchableMenuItem<AddAction>) => {
    if (item.data === "save") setView(editable ? "save" : "library");
    else {
      setSearch("");
      setView("library");
    }
  };

  const q = search.trim().toLowerCase();
  const groups = useMemo(
    () => MODIFIER_CATEGORIES.map((cat) => ({ cat, mods: MODIFIER_PRESETS.filter((p) => p.category === cat && presetMatches(p, q)) })).filter((g) => g.mods.length > 0),
    [q],
  );
  const savedShown = useMemo(() => saved.filter((m) => savedMatches(m, q)), [saved, q]);
  const nothingMatches = groups.length === 0 && savedShown.length === 0;

  if (!open) return null;

  const header = (
    <div className="flex items-center gap-1.5" data-modifier-toolbar="">
      <div className="border-base-300 bg-base-100 rounded-field flex min-w-0 flex-1 items-center gap-1.5 border px-2">
        <Icon name="search" className="text-base-content/50 size-3.5 shrink-0" />
        <input
          type="text"
          data-modifier-search=""
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search modifiers"
          className="text-base-content placeholder:text-base-content/50 h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
      </div>
      {anyPresetActive && (
        <button type="button" data-modifier-none="" onClick={clearPresets} className="text-base-content/60 hover:text-error shrink-0 px-1 text-[10px] font-medium" aria-label="Clear all modifiers">
          None
        </button>
      )}
      <SearchableMenuPopover<AddAction>
        trigger={<Icon name="plus" className="size-3.5" />}
        triggerClassName="text-base-content/70 hover:text-base-content hover:bg-base-200 flex size-7 shrink-0 items-center justify-center rounded-md border border-base-300 transition-colors"
        triggerAriaLabel="Add or save modifier"
        items={ADD_ITEMS}
        onSelect={onAdd}
        searchPlaceholder="Search actions…"
        panelWidthClass="w-72"
        renderItem={(item) => (
          <span className="flex min-w-0 items-center gap-2">
            <Icon name={ADD_ICON[item.data!]} className="text-base-content/60 size-3.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </span>
        )}
      />
    </div>
  );

  if (view === "save" && editable) {
    return (
      <div data-slot="ModifiersPanel" className="flex flex-col gap-4">
        {header}
        <SaveModifierForm onDone={() => setView("library")} />
      </div>
    );
  }

  return (
    <div data-slot="ModifiersPanel" className="flex flex-col gap-4">
      {header}
      {!editable && (
        <p className="text-base-content/60 border-base-300 rounded-box border border-dashed px-3 py-6 text-center text-xs" data-modifiers-empty="">
          Select an element to apply modifiers.
        </p>
      )}
      {editable && nothingMatches && (
        <p className="text-base-content/60 py-4 text-center text-[11px]" data-modifiers-no-match="">
          No modifiers match &ldquo;{search}&rdquo;.
        </p>
      )}
      {editable &&
        groups.map(({ cat, mods }) => (
          <section key={cat} className="flex flex-col gap-2" data-modifier-group={cat.toLowerCase()}>
            <h3 className="text-base-content/70 text-[11px] font-semibold tracking-wide uppercase">{cat}</h3>
            <div className="flex flex-col gap-1.5">
              {mods.map((preset) => (
                <div key={preset.token} data-modifier={preset.token}>
                  <Card
                    active={active.has(preset.token)}
                    title={preset.label}
                    hint={preset.resting ? undefined : "hover"}
                    description={preset.description}
                    onToggle={() => toggleTokens([preset.token])}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      {editable && savedShown.length > 0 && (
        <section className="flex flex-col gap-2" data-modifier-group="saved">
          <h3 className="text-base-content/70 text-[11px] font-semibold tracking-wide uppercase">Saved</h3>
          <div className="flex flex-col gap-1.5">
            {savedShown.map((mod) => {
              const tokens = mod.classes.split(/\s+/).filter(Boolean);
              return (
                <div key={mod.name} data-modifier-saved={mod.name}>
                  <Card
                    active={tokens.length > 0 && tokens.every((t) => active.has(t))}
                    title={mod.label}
                    hint={`×${tokens.length}`}
                    description={mod.classes}
                    onToggle={() => toggleTokens(tokens)}
                    onRemove={() => removeSavedModifier(mod.name)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
