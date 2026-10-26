/**
 * The inline toolbar's Font panel: typography presets (host facet), the text level
 * (Normal / H1–H4), sizes S / M / L / XL, and the font family — the same `FontPicker` slot
 * (search, category dropdown, virtualised preview list) the Theme panel and `FontInput` use,
 * opened under its chip. Hovering a family previews it on the selection without committing;
 * leaving puts it back unless the family was clicked. Sizes and family share one inline span.
 */
import { useRef, useState } from "react";
import { fontCatalogueFacet } from "@pagehub/engine/host";
import { FAMILY_CLASS, SIZE_CLASS, familyClass, familyOf, inlineClasses, setInlineClasses } from "./inlineClass";
import { typographyPresetsFacet } from "./hooks";
import type { RichTextSession } from "./session";
import { Slot } from "../../components";
import { PopoverChip } from "../../primitives/Chip";
import { Z_FLOATING_EDITOR } from "../../primitives/zIndex";
import { Icon } from "../../primitives/icons";
import { TOOL_BUTTON, keepFocus } from "./toolbarParts";

const TAB = "rounded-md px-2 py-1 text-xs font-medium";
const SIZES = [
  { label: "S", cls: "text-xs" },
  { label: "M", cls: "text-base" },
  { label: "L", cls: "text-xl" },
  { label: "XL", cls: "text-2xl" },
] as const;
const LEVELS = [
  { label: "Normal", tag: "p" },
  { label: "H1", tag: "h1" },
  { label: "H2", tag: "h2" },
  { label: "H3", tag: "h3" },
  { label: "H4", tag: "h4" },
] as const;

/** The family chip: opens the shared `FontPicker` slot (search / categories / list) under it. */
function FamilyControl({ active, onPreview, onPick, onClear }: { active: string | null; onPreview(family: string | null): void; onPick(family: string): void; onClear(): void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0" data-rt-family="">
      <PopoverChip
        ref={trigger}
        open={open}
        onTriggerClick={() => setOpen((o) => !o)}
        onClear={() => (setOpen(false), onClear())}
        triggerAriaLabel={active ? "Change font" : "Pick font"}
        clearAriaLabel="Clear font"
        leading={<span className="text-xs font-semibold" style={active ? { fontFamily: `"${active}"` } : undefined}>Aa</span>}
        summary={active || "Pick font"}
      />
      {open && <Slot name="FontPicker" value={active ?? ""} onChange={(f) => (f ? onPick(f) : onClear())} onPreview={onPreview} onClose={() => setOpen(false)} anchor={trigger.current} zIndex={Z_FLOATING_EDITOR} />}
    </div>
  );
}

export function FontPanel({ session, onClose }: { session: RichTextSession; onClose(): void }) {
  const ed = session.editor;
  const state = session.store.state;
  const catalogue = state.facet(fontCatalogueFacet);
  const presets = state.facet(typographyPresetsFacet);
  const original = useRef<string[] | null>(null);

  const classes = inlineClasses(ed);
  const level = session.handle.tag;
  const size = classes.find((c) => SIZE_CLASS.test(c));
  const active = familyOf(classes);

  const withFamily = (base: string[], family: string) => [...base.filter((c) => !FAMILY_CLASS.test(c)), familyClass(family)];
  const restore = () => {
    if (original.current) setInlineClasses(ed, original.current, true);
    original.current = null;
  };
  const preview = (family: string) => {
    catalogue.load?.(family, ["400"]);
    original.current ??= inlineClasses(ed);
    setInlineClasses(ed, withFamily(original.current, family), true);
  };
  const pick = (family: string) => {
    catalogue.load?.(family, ["400", "700"]);
    const base = original.current ?? inlineClasses(ed);
    restore();
    setInlineClasses(ed, withFamily(base, family));
  };
  const clearFamily = () => {
    restore();
    setInlineClasses(ed, classes.filter((c) => !FAMILY_CLASS.test(c)));
  };
  const setSize = (cls: string) => {
    const rest = classes.filter((c) => !SIZE_CLASS.test(c));
    setInlineClasses(ed, size === cls ? rest : [cls, ...rest]);
  };
  const setLevel = (tag: string) => {
    session.flush(true);
    session.store.run("text.setTag", { target: session.handle, tag });
  };
  const applyPreset = (p: (typeof presets)[number]) => {
    if (p.fontFamily) catalogue.load?.(p.fontFamily, ["400", "700"]);
    setInlineClasses(ed, p.className.split(/\s+/).filter(Boolean));
  };

  return (
    <div data-rt-panel="font" className="flex w-[440px] max-w-full flex-col gap-2 p-2.5">
      {presets.length > 0 && (
        <div data-rt-presets="" className="border-base-300 flex flex-wrap gap-1 border-b pb-2">
          {presets.map((p) => (
            <button key={p.name} type="button" className="border-base-300 hover:bg-base-200 flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors" style={{ fontFamily: p.fontFamily }} onMouseDown={keepFocus} onClick={() => applyPreset(p)}>
              <span className="text-base-content text-xs font-medium">{p.name}</span>
              {p.fontFamily && <span className="text-base-content/60 text-[10px]">{p.fontFamily}</span>}
            </button>
          ))}
        </div>
      )}
      <FamilyControl active={active} onPreview={(f) => (f ? preview(f) : restore())} onPick={pick} onClear={clearFamily} />
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1" role="group" aria-label="Text level">
          {LEVELS.map((l) => (
            <button key={l.tag} type="button" aria-pressed={level === l.tag} className={`${TAB} ${level === l.tag ? "bg-base-200" : "text-base-content/60"}`} onMouseDown={keepFocus} onClick={() => setLevel(l.tag)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="border-base-300 flex shrink-0 items-center rounded-md border" role="group" aria-label="Size">
          {SIZES.map((s) => (
            <button key={s.cls} type="button" aria-pressed={size === s.cls} className={`px-1.5 py-1.5 text-xs transition-colors ${size === s.cls ? "bg-base-200" : "text-base-content/60 hover:bg-base-200"}`} onMouseDown={keepFocus} onClick={() => setSize(s.cls)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" aria-label="Close" className={`${TOOL_BUTTON} !size-7 shrink-0 !p-0`} onMouseDown={keepFocus} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
