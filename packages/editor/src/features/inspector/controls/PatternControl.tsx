/**
 * PatternControl — the background-pattern editor: a searchable picker over the library's pattern
 * slugs (writes the `bg-pattern` group as `ph-pattern-<slug>`), then — once a pattern is chosen —
 * the colour layers and the geometry sliders (scale / stroke / angle / X & Y gap / X & Y offset).
 *
 * The geometry + colour values are stored as arbitrary-property classes (`[--pattern-angle:45deg]`),
 * one class group each (`pattern-angle`, `pattern-color-1`, …), so each field reads / writes that
 * group's single token directly — the universal value field can't phrase a `--var:value` token.
 *
 *   <PatternControl />   // rendered inside the bgPattern row's popover body
 */
import { useMemo, useState } from "react";
import { classGroupsFacet, PATTERN_SLUGS, readClass } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { uiScopeEq, useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { Chip } from "../../../primitives/Chip";
import { Icon } from "../../../primitives/icons";

const PATTERN_CLASS_PREFIX = "ph-pattern-";

const humanize = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** One geometry slider — reads / writes the group's `[--pattern-<name>:<value>]` token directly. */
interface VarSpec {
  group: string;
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  fallback: number;
}

const GEOMETRY: VarSpec[] = [
  { group: "pattern-zoom", name: "zoom", label: "Scale", min: 1, max: 5, step: 0.1, unit: "", fallback: 1 },
  { group: "pattern-stroke", name: "stroke", label: "Stroke", min: 0.5, max: 5, step: 0.5, unit: "px", fallback: 1 },
  { group: "pattern-angle", name: "angle", label: "Angle", min: 0, max: 180, step: 1, unit: "deg", fallback: 0 },
  { group: "pattern-spacing-x", name: "spacing-x", label: "X gap", min: 0, max: 60, step: 1, unit: "px", fallback: 0 },
  { group: "pattern-spacing-y", name: "spacing-y", label: "Y gap", min: 0, max: 60, step: 1, unit: "px", fallback: 0 },
  { group: "pattern-x", name: "x", label: "X offset", min: -120, max: 120, step: 1, unit: "px", fallback: 0 },
  { group: "pattern-y", name: "y", label: "Y offset", min: -120, max: 120, step: 1, unit: "px", fallback: 0 },
];

function PatternVarSlider({ spec }: { spec: VarSpec }) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(spec.group));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const token = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const stored = new RegExp(`^\\[--pattern-${spec.name}:(-?[0-9.]+)`).exec(token)?.[1];
  const value = stored != null ? parseFloat(stored) : spec.fallback;
  const write = (n: number) => void run("classes.set", { group: spec.group, token: `[--pattern-${spec.name}:${n}${spec.unit}]`, scopes: writeScopes(ui), at: handle });
  const clear = () => void run("classes.set", { group: spec.group, token: null, scopes: writeScopes(ui), at: handle });
  return (
    <Chip label={spec.label} frame="bare">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={(e) => write(parseFloat(e.target.value))} aria-label={spec.label} className="slider bg-neutral h-1.5 flex-1 cursor-pointer appearance-none rounded-lg" />
        <span className="text-neutral-content w-10 text-right text-[10px] tabular-nums">{value}{spec.unit}</span>
        {stored != null && (
          <button type="button" onClick={clear} aria-label={`Reset ${spec.label}`} className="text-base-content/50 hover:text-base-content flex size-5 shrink-0 items-center justify-center rounded">
            <Icon name="x" className="size-3" />
          </button>
        )}
      </div>
    </Chip>
  );
}

function PatternColorField({ group, name, label }: { group: string; name: string; label: string }) {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get(group));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  if (!handle || !def) return null;
  const token = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const css = new RegExp(`^\\[--pattern-${name}:([^\\]]+)\\]$`).exec(token)?.[1] ?? "";
  const hex = /^#[0-9a-f]{6}$/i.test(css) ? css : "#000000";
  const write = (value: string) => void run("classes.set", { group, token: `[--pattern-${name}:${value}]`, scopes: writeScopes(ui), at: handle });
  const clear = () => void run("classes.set", { group, token: null, scopes: writeScopes(ui), at: handle });
  return (
    <Chip label={label} frame="bare">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <input type="color" value={hex} onChange={(e) => write(e.target.value)} aria-label={label} className="border-base-300 size-5 shrink-0 cursor-pointer rounded border bg-transparent" />
        <span className="text-neutral-content min-w-0 flex-1 truncate text-[10px]">{css || "Default"}</span>
        {css && (
          <button type="button" onClick={clear} aria-label={`Clear ${label}`} className="text-base-content/50 hover:text-base-content flex size-5 shrink-0 items-center justify-center rounded">
            <Icon name="x" className="size-3" />
          </button>
        )}
      </div>
    </Chip>
  );
}

export function PatternControl() {
  const { handle, classes } = useInspectedClass();
  const def = useEditorState((s) => s.facet(classGroupsFacet).get("bg-pattern"));
  const ui = useUi((u) => u, uiScopeEq);
  const run = useRunCommand();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = q ? PATTERN_SLUGS.filter((s) => s.includes(q)) : PATTERN_SLUGS;
    return all.slice(0, 120);
  }, [query]);
  if (!handle || !def) return null;

  const token = readClass(classes, def, { view: ui.view, dark: ui.dark }).value ?? "";
  const slug = token.startsWith(PATTERN_CLASS_PREFIX) ? token.slice(PATTERN_CLASS_PREFIX.length) : "";
  const setSlug = (next: string | null) => void run("classes.set", { group: "bg-pattern", token: next ? `${PATTERN_CLASS_PREFIX}${next}` : null, scopes: writeScopes(ui), at: handle });

  return (
    <div className="flex min-w-0 flex-col gap-2" data-pattern-control="">
      <Chip label="Pattern" frame="bordered" open={picking} onLabelClick={() => setPicking((o) => !o)}>
        <button type="button" onClick={() => setPicking((o) => !o)} aria-expanded={picking} aria-haspopup="listbox" className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left">
          <span className="text-base-content min-w-0 flex-1 truncate">{slug ? humanize(slug) : <span className="text-base-content/50">Choose a pattern…</span>}</span>
        </button>
        {slug && (
          <button type="button" onClick={() => setSlug(null)} aria-label="Clear pattern" className="text-base-content/50 hover:text-base-content flex size-5 shrink-0 items-center justify-center rounded">
            <Icon name="x" className="size-3" />
          </button>
        )}
      </Chip>

      {picking && (
        <div className="border-base-300 bg-base-100 flex min-w-0 flex-col gap-1 rounded-lg border p-2" data-pattern-picker="">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${PATTERN_SLUGS.length} patterns…`} aria-label="Search patterns" className="input-plain border-base-300 w-full rounded border px-2 py-1 text-xs" />
          <ul role="listbox" className="max-h-48 min-w-0 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s} role="option" aria-selected={s === slug}>
                <button type="button" onClick={() => { setSlug(s); setPicking(false); }} className={`w-full truncate rounded px-2 py-1 text-left text-xs ${s === slug ? "bg-primary/10 text-primary" : "hover:bg-neutral"}`}>
                  {humanize(s)}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-neutral-content px-2 py-1 text-xs">No match</li>}
          </ul>
        </div>
      )}

      {slug && (
        <>
          <div className="flex min-w-0 flex-col gap-1.5">
            <PatternColorField group="pattern-color-1" name="color-1" label="Color 1" />
            <PatternColorField group="pattern-color-2" name="color-2" label="Color 2" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            {GEOMETRY.map((spec) => (
              <PatternVarSlider key={spec.group} spec={spec} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
