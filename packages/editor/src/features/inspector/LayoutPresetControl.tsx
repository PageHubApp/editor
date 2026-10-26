/**
 * LayoutPresetControl — the visual layout-preset picker for the `layoutPreset` row
 * (Container / Data), on the HTML-first engine:
 * picking a preset writes the layout class groups (`display` / `flex-direction` / `grid-cols`
 * / `gap`) and, when the preset has a column count, adds or removes child containers so the
 * markup matches the picture — all in ONE undo step.
 *
 *   <LayoutPresetControl handle={containerHandle} />
 *
 * Child mutation goes through the engine's own insert/remove edit ops (the same ones the
 * `element.insert` / `element.remove` commands wrap): new columns are empty flex-column
 * `<div>`s whose width class follows the layout (`flex-1 min-w-0` in a row, `w-full` stacked);
 * shrinking a layout removes only trailing EMPTY columns, never a child that holds content.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type ClassGroup, type NodeHandle } from "@pagehub/engine";
import { classGroupsFacet, setClasses } from "@pagehub/engine/kits";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { AnchoredPopover } from "../../primitives/AnchoredPopover";
import { PopoverChip } from "../../primitives/Chip";
import { tooltip } from "../../primitives/tooltip";

type Mode = "block" | "flex-row" | "flex-col" | "grid";
/** The plain `display` values `classFor` also writes (it clears flex / grid classes for them). */
type DisplayOnlyMode = "inline-block" | "inline" | "inline-grid" | "inline-flex" | "hidden";

interface LayoutPreset {
  name: string;
  mode: Exclude<Mode, "block">;
  /** Target child count (columns). Omit for a single-region layout that doesn't touch children. */
  columns?: number;
  /** Explicit grid-cols token (fr templates); default `grid-cols-<columns>`. */
  gridCols?: string;
  /** Per-child width classes (asymmetric flex). */
  widths?: readonly string[];
  /** The first child spans both columns (Header + 2 Columns). */
  headerSpan?: boolean;
  icon: ReactNode;
}

const GAP = "gap-4";

// ── icons (decorative; base tokens only) ──────────────────────────────────────
const bar = "bg-primary/30 rounded-sm";
const frame = "border-base-300 h-6 w-full overflow-hidden rounded-sm border p-px";
const cell = "flex-1 bg-primary/30 rounded-sm";

function rowIcon(n: number, widths?: readonly string[]) {
  return (
    <div className={frame}>
      <div className="flex h-full gap-px">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className={`${bar} ${widths?.[i] ?? "flex-1"}`} />
        ))}
      </div>
    </div>
  );
}
function colIcon(n: number) {
  return (
    <div className={frame}>
      <div className="flex h-full flex-col gap-px">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className={cell} />
        ))}
      </div>
    </div>
  );
}
function gridIcon(cols: number, rows = 1, template?: string) {
  return (
    <div className={frame}>
      <div className="grid h-full gap-px" style={{ gridTemplateColumns: template ?? `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} className={bar} />
        ))}
      </div>
    </div>
  );
}

// ── preset catalogue ──────────────────────────────────────────────────────────
const SIDE_BY_SIDE: LayoutPreset[] = [
  { name: "Single Column", mode: "flex-row", columns: 1, icon: rowIcon(1) },
  { name: "Two Columns", mode: "flex-row", columns: 2, icon: rowIcon(2) },
  { name: "Three Columns", mode: "flex-row", columns: 3, icon: rowIcon(3) },
  { name: "Four Columns", mode: "flex-row", columns: 4, icon: rowIcon(4) },
  { name: "Wide Left", mode: "flex-row", columns: 2, widths: ["w-3/4", "w-1/4"], icon: rowIcon(2, ["w-3/4", "w-1/4"]) },
  { name: "Wide Right", mode: "flex-row", columns: 2, widths: ["w-1/4", "w-3/4"], icon: rowIcon(2, ["w-1/4", "w-3/4"]) },
  { name: "Wide Middle", mode: "flex-row", columns: 3, widths: ["w-1/4", "w-1/2", "w-1/4"], icon: rowIcon(3, ["w-1/4", "w-1/2", "w-1/4"]) },
];
const STACKED: LayoutPreset[] = [
  { name: "Single Row", mode: "flex-col", columns: 1, icon: colIcon(1) },
  { name: "Two Rows", mode: "flex-col", columns: 2, icon: colIcon(2) },
  { name: "Three Rows", mode: "flex-col", columns: 3, icon: colIcon(3) },
  { name: "Four Rows", mode: "flex-col", columns: 4, icon: colIcon(4) },
];
const GRID: LayoutPreset[] = [
  { name: "Two Columns", mode: "grid", columns: 2, gridCols: "grid-cols-2", icon: gridIcon(2) },
  { name: "2x2 Grid", mode: "grid", columns: 4, gridCols: "grid-cols-2", icon: gridIcon(2, 2) },
  { name: "Three Columns", mode: "grid", columns: 3, gridCols: "grid-cols-3", icon: gridIcon(3) },
  { name: "3x2 Grid", mode: "grid", columns: 6, gridCols: "grid-cols-3", icon: gridIcon(3, 2) },
  { name: "Four Columns", mode: "grid", columns: 4, gridCols: "grid-cols-4", icon: gridIcon(4) },
  { name: "Header + 2 Columns", mode: "grid", columns: 3, gridCols: "grid-cols-2", headerSpan: true, icon: gridIcon(2, 2, "1fr 1fr") },
  { name: "Wide Left", mode: "grid", columns: 2, gridCols: "grid-cols-[2fr_1fr]", icon: gridIcon(2, 1, "2fr 1fr") },
  { name: "Wide Right", mode: "grid", columns: 2, gridCols: "grid-cols-[1fr_2fr]", icon: gridIcon(2, 1, "1fr 2fr") },
  { name: "Wide Middle", mode: "grid", columns: 3, gridCols: "grid-cols-[1fr_2fr_1fr]", icon: gridIcon(3, 1, "1fr 2fr 1fr") },
];

const SECTIONS: { label: string; mode: Exclude<Mode, "block">; presets: LayoutPreset[] }[] = [
  { label: "Side by side", mode: "flex-row", presets: SIDE_BY_SIDE },
  { label: "Stacked", mode: "flex-col", presets: STACKED },
  { label: "Grid", mode: "grid", presets: GRID },
];

const DISPLAY_VARIANTS = [
  { value: "block", label: "Block" },
  { value: "inline-block", label: "Inline Block" },
  { value: "inline-flex", label: "Inline Flex" },
  { value: "inline-grid", label: "Inline Grid" },
  { value: "inline", label: "Inline" },
  { value: "hidden", label: "None" },
] as const;

// ── class helpers ─────────────────────────────────────────────────────────────
const WIDTH = /^(?:w-(?:full|screen|auto|px|\d+(?:\.\d+)?(?:\/\d+)?|\[[^\]]+\])|flex-1|flex-auto|flex-none|flex-initial|flex-\[[^\]]+\]|min-w-0|min-w-full|basis-(?:\d+(?:\/\d+)?|\[[^\]]+\]))$/;
const stripWidth = (cls: string) =>
  cls.split(/\s+/).filter((c) => c && !WIDTH.test(c)).join(" ");
const widthFor = (mode: Exclude<Mode, "block">, asymmetric: boolean): string =>
  asymmetric ? "" : mode === "flex-row" ? "flex-1 min-w-0" : mode === "flex-col" ? "w-full" : "";

const elementChildren = (h: NodeHandle): NodeHandle[] =>
  h.alive && h.kind === "element" ? h.children().filter((c) => c.kind === "element") : [];
const isEmpty = (h: NodeHandle): boolean => h.children().every((c) => c.kind === "text" && !c.text().trim());

function detectMode(classes: readonly string[]): Mode {
  const has = (t: string) => classes.includes(t);
  if (classes.some((c) => /(?:^|:)(?:inline-)?grid$/.test(c)) || has("grid")) return "grid";
  if (classes.some((c) => /(?:^|:)(?:inline-)?flex$/.test(c)) || has("flex")) {
    return classes.some((c) => /(?:^|:)flex-col(?:-reverse)?$/.test(c)) ? "flex-col" : "flex-row";
  }
  return "block";
}

function presetActive(p: LayoutPreset, mode: Mode, children: number): boolean {
  return p.mode === mode && (p.columns === undefined || p.columns === children);
}

function summaryFor(mode: Mode, p: LayoutPreset | null): string {
  if (p) return p.name;
  if (mode === "flex-row") return "Side by side";
  if (mode === "flex-col") return "Stacked";
  if (mode === "grid") return "Grid";
  return "Block";
}

// ── the control ───────────────────────────────────────────────────────────────
export function LayoutPresetControl({ handle }: { handle: NodeHandle }) {
  const store = useEditorStore();
  const anchor = useRef<HTMLButtonElement | null>(null);

  const classes = useEditorState(() => (handle.alive && handle.kind === "element" ? handle.attr("class") ?? "" : ""));
  const childCount = useEditorState(() => elementChildren(handle).length);
  const [open, setOpen] = useOpenState(handle);

  const list = classes.split(/\s+/).filter(Boolean);
  const mode = detectMode(list);
  const active =
    SECTIONS.flatMap((s) => s.presets).find((p) => presetActive(p, mode, childCount)) ?? null;
  const currentDisplay = String(list.find((c) => /^(?:block|inline-block|inline-flex|inline-grid|inline|hidden|flex|grid)$/.test(c)) ?? "");

  const groups = (): ReadonlyMap<string, ClassGroup> => store.state.facet(classGroupsFacet);

  /** Compose the parent's new class string for `mode` + optional grid template. */
  const classFor = (m: Mode | DisplayOnlyMode, gridCols?: string): string | null => {
    const g = groups();
    let cls = handle.classes();
    const set = (id: string, token: string | null) => {
      const grp = g.get(id);
      if (grp) cls = setClasses(cls, grp, token, [{}], g);
    };
    if (m === "block" || m === "inline-block" || m === "inline" || m === "inline-grid" || m === "inline-flex" || m === "hidden") {
      set("display", m);
      set("flex-direction", null);
      set("grid-cols", null);
    } else if (m === "grid") {
      set("display", "grid");
      set("flex-direction", null);
      set("grid-cols", gridCols ?? "grid-cols-2");
      set("gap", GAP);
    } else {
      set("display", "flex");
      set("flex-direction", m);
      set("grid-cols", null);
      set("gap", GAP);
    }
    return cls.length ? cls.join(" ") : null;
  };

  /** New empty column `<div>`, its treatment sampled from the last element child. */
  const columnSnippet = (widthCn: string): string => {
    const kids = elementChildren(handle);
    const last = kids.at(-1);
    const sampled = last ? stripWidth(last.attr("class") ?? "") : "";
    const base = sampled || "flex flex-col gap-4";
    const cn = [base, widthCn].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return `\n  <div class="${cn}"></div>`;
  };

  const pick = (p: LayoutPreset) => {
    const newClass = classFor(p.mode, p.gridCols);
    store.dispatch((tr) => {
      tr.setAttr(handle, "class", newClass);
      const widthCn = widthFor(p.mode, !!p.widths);
      const kids = elementChildren(handle);
      // Normalise existing children's width classes so the new layout flows correctly.
      if (p.mode !== "grid" || p.widths) {
        kids.forEach((child, i) => {
          const cn = child.attr("class") ?? "";
          const next = [stripWidth(cn), p.widths?.[i] ?? widthCn].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          if (next !== cn) tr.setAttr(child, "class", next.length ? next : null);
        });
      }
      if (p.columns !== undefined) {
        if (kids.length < p.columns) {
          for (let i = 0; i < p.columns - kids.length; i++) tr.insert({ append: handle }, columnSnippet(p.widths?.[kids.length + i] ?? widthCn));
        } else if (kids.length > p.columns) {
          // Remove only trailing EMPTY columns — never content the author added.
          let budget = kids.length - p.columns;
          for (let i = kids.length - 1; i >= 0 && budget > 0; i--) {
            if (!isEmpty(kids[i]!)) break;
            tr.remove(kids[i]!);
            budget--;
          }
        }
      }
      // Header + 2 Columns: first child spans both grid columns.
      if (p.headerSpan) {
        const first = elementChildren(handle)[0];
        if (first) {
          const cn = first.attr("class") ?? "";
          if (!cn.split(/\s+/).includes("col-span-2")) tr.setAttr(first, "class", `${cn} col-span-2`.trim());
        }
      }
      return tr;
    });
    setOpen(false);
  };

  const setDisplay = (value: string) => {
    store.dispatch((tr) => tr.setAttr(handle, "class", classFor(value as Exclude<Mode, "block">)));
  };

  return (
    <>
      <PopoverChip
        ref={anchor}
        label="Layout"
        open={open}
        onTriggerClick={() => setOpen(!open)}
        onClear={() => {
          setOpen(false);
          setDisplay("block");
        }}
        triggerAriaLabel={active ? "Edit layout" : "Pick layout"}
        clearAriaLabel="Clear layout (Block)"
        leading={<ModeGlyph mode={mode} />}
        summary={summaryFor(mode, active)}
      />
      <AnchoredPopover open={open} onOpenChange={setOpen} anchor={anchor} immediate matchAnchorWidth={{ min: 300, max: 360 }}>
        <div className="bg-base-100 border-base-300 grid w-80 gap-3 rounded-xl border p-3 shadow-xl" data-layout-preset-panel="">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="text-base-content/60 mb-1.5 text-[10px] font-semibold tracking-wider uppercase">{section.label}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {section.presets.map((p) => {
                  const isActive = presetActive(p, mode, childCount);
                  return (
                    <button
                      key={p.name}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={p.name}
                      {...tooltip(p.name)}
                      onClick={() => pick(p)}
                      data-layout-preset={p.name}
                      className={`border-base-300 hover:border-primary flex items-center justify-center rounded-md border border-dashed p-1.5 transition-colors ${isActive ? "border-primary bg-primary/10" : ""}`}
                    >
                      <div className="w-full">{p.icon}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            <div className="text-base-content/60 mb-1.5 text-[10px] font-semibold tracking-wider uppercase">Display</div>
            <div className="grid grid-cols-3 gap-1.5">
              {DISPLAY_VARIANTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={currentDisplay === v.value}
                  onClick={() => setDisplay(v.value)}
                  data-layout-display={v.value}
                  className={`border-base-300 hover:border-primary rounded-md border border-dashed p-1.5 text-[11px] transition-colors ${currentDisplay === v.value ? "border-primary bg-primary/10" : ""}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AnchoredPopover>
    </>
  );
}

function ModeGlyph({ mode }: { mode: Mode }) {
  const d =
    mode === "flex-row" ? "M4 5h6v10H4zM14 5h6v10h-6z" : mode === "flex-col" ? "M4 5h16v4H4zM4 11h16v4H4z" : mode === "grid" ? "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" : "M4 4h16v16H4z";
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Popover open state keyed to the inspected element (closes when the selection changes). */
function useOpenState(handle: NodeHandle): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => void setOpen(false), [handle]);
  return [open, setOpen];
}
