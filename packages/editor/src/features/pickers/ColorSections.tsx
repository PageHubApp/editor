// Presentational color sections; works from colour refs rather than palette objects.
/**
 * The swatch sections of the colour panel: design palette (searchable, light / dark), special,
 * recent, and the Tailwind shades. Every section reports a colour ref (`colorValue.ts`).
 */
import { SketchPicker } from "@hello-pangea/color-picker";
import { useState } from "react";
import type { ThemeColor } from "@pagehub/engine/host";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { CHECKER_BG, SPECIAL_COLORS, hexOf, refToCss } from "./colorValue";
import { TAILWIND_COLOR_GROUPS, TAILWIND_SHADES } from "./tailwindColors.data";

interface Pick {
  /** The picked ref; double-click also closes the panel. */
  onSelect(ref: string): void;
  onDoubleClick(ref: string): void;
  selected: string;
}

/** Create / rename / recolour / delete for palette tokens — the Theme panel's `theme.css` seam. */
export interface PaletteCrud {
  create(name: string, color: string): string;
  update(originalName: string, name: string, color: string): string;
  remove(name: string): void;
}

type PaletteStage = { kind: "list" } | { kind: "new" } | { kind: "edit"; token: ThemeColor };

const SWATCH = "group relative aspect-square w-full rounded-lg border-2 transition-all hover:scale-110";
const ring = (on: boolean) => ({ borderColor: on ? "var(--primary)" : "var(--base-300)" });

/** `fill`, never `css`: a host compiling this source with Emotion's JSX runtime strips a `css` prop. */
function Swatch({ ref_, fill, p, name, checker, size = "size-5" }: { ref_: string; fill: string; p: Pick; name?: string; checker?: boolean; size?: string }) {
  const on = p.selected === ref_;
  return (
    <button type="button" onClick={() => p.onSelect(ref_)} onDoubleClick={() => p.onDoubleClick(ref_)} className={SWATCH} style={{ backgroundColor: fill, ...ring(on) }} aria-label={name ?? ref_} {...tooltip(name)}>
      {checker && <div className="absolute inset-0 rounded-lg" style={CHECKER_BG} />}
      {on && <Icon name="check" className={`text-base-content absolute inset-0 m-auto drop-shadow-lg ${size}`} />}
    </button>
  );
}

const SunMoon = {
  light: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M3 12h1 M12 3v1 M20 12h1 M12 20v1 M5.6 5.6l.7 .7 M18.4 5.6l-.7 .7 M17.7 17.7l.7 .7 M6.3 17.7l-.7 .7",
  dark: "M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z",
} as const;

function ModeButton({ mode, active, onClick }: { mode: "light" | "dark"; active: boolean; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={`${mode === "light" ? "Light" : "Dark"} palette`} className={`flex size-5 items-center justify-center rounded transition-colors ${active ? "bg-base-100 text-base-content" : "text-neutral-content hover:text-base-content"}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
        {SunMoon[mode].split(" M").map((d, i) => (
          <path key={i} d={i ? `M${d}` : d} />
        ))}
      </svg>
    </button>
  );
}

/** Display name for a palette token slug: "base-100" → "Base 100", "primary-content" → "Primary Content". */
const humanizeToken = (slug: string): string =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ") || slug;

export function PaletteSection({ light, dark, startDark, p, crud }: { light: readonly ThemeColor[]; dark?: readonly ThemeColor[]; /** Open on the dark palette (the canvas is in dark mode). */ startDark?: boolean; p: Pick; crud?: PaletteCrud }) {
  const [mode, setMode] = useState<"light" | "dark">(startDark && dark ? "dark" : "light");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<PaletteStage>({ kind: "list" });
  const palette = mode === "dark" && dark ? dark : light;
  const q = search.trim().toLowerCase();
  const rows = q ? palette.filter((c) => c.name.toLowerCase().includes(q)) : palette;

  // CRUD edits the light palette only — the picker exposes no dark-palette variant.
  if (crud && stage.kind !== "list") {
    const token = stage.kind === "edit" ? stage.token : null;
    return (
      <TokenForm
        token={token}
        onCancel={() => setStage({ kind: "list" })}
        onSave={(name, color) => {
          const slug = token ? crud.update(token.name, name, color) : crud.create(name, color);
          setStage({ kind: "list" });
          p.onSelect(`palette:${slug}`);
        }}
        onDelete={
          token
            ? () => {
                crud.remove(token.name);
                setStage({ kind: "list" });
              }
            : undefined
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-base-content text-xs font-medium">Design System</span>
        {dark && (
          <div className="border-base-300 bg-base-200 flex items-center rounded-md border p-0.5">
            <ModeButton mode="light" active={mode === "light"} onClick={() => setMode("light")} />
            <ModeButton mode="dark" active={mode === "dark"} onClick={() => setMode("dark")} />
          </div>
        )}
      </div>
      {palette.length > 4 && (
        <div className="border-base-300 bg-base-200 mb-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1.5">
          <Icon name="search" className="text-neutral-content size-3.5 shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." aria-label="Search colours" className="text-base-content placeholder:text-neutral-content min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </div>
      )}
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <div className="text-neutral-content px-2 py-3 text-center text-xs italic">{palette.length === 0 ? "No tokens yet" : `No matches for "${search}"`}</div>
        ) : (
          rows.map((c) => {
            const ref = `palette:${c.name}`;
            const on = p.selected === ref;
            return (
              <div key={c.name} className={`group flex items-center gap-1 rounded-md transition-colors ${on ? "bg-base-200" : "hover:bg-base-200/60"}`}>
                <button type="button" onClick={() => p.onSelect(ref)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-left">
                  <span className="border-base-300 size-4 shrink-0 rounded-full border" style={{ backgroundColor: refToCss(ref, palette) }} aria-hidden />
                  <span className={`text-base-content min-w-0 flex-1 truncate text-xs ${on ? "font-medium" : ""}`}>{humanizeToken(c.name)}</span>
                  {on && <Icon name="check" className="text-base-content size-3.5 shrink-0" />}
                </button>
                {crud && mode === "light" && (
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setStage({ kind: "edit", token: c })} className="bg-base-300 text-base-content hover:bg-base-content hover:text-base-100 mr-1 hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors group-hover:flex">
                    <Icon name="adjustments" className="size-3" />
                    Edit
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      {crud && mode === "light" && (
        <button type="button" onClick={() => setStage({ kind: "new" })} className="border-base-300 text-neutral-content hover:border-base-content hover:text-base-content mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs transition-colors">
          <Icon name="plus" className="size-3.5" />
          New Token
        </button>
      )}
    </div>
  );
}

/** The create / edit token form shown in place of the Design System list. */
function TokenForm({ token, onCancel, onSave, onDelete }: { token: ThemeColor | null; onCancel(): void; onSave(name: string, color: string): void; onDelete?(): void }) {
  const [name, setName] = useState(token ? humanizeToken(token.name) : "New Color");
  const [color, setColor] = useState(() => (token ? hexOf(token.color) || token.color : "#3b82f6"));
  const valid = name.trim() !== "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-base-content text-xs font-medium">{token ? "Edit Token" : "New Token"}</span>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-neutral-content hover:text-base-content">
          <Icon name="x" className="size-3.5" />
        </button>
      </div>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name..." aria-label="Token name" autoFocus className="border-base-300 bg-base-200 text-base-content placeholder:text-neutral-content focus:border-ring focus:ring-ring rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-1" onKeyDown={(e) => e.key === "Enter" && valid && onSave(name.trim(), color)} />
      <div className="flex items-center gap-2">
        <span className="border-base-300 size-8 shrink-0 rounded-md border-2" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-neutral-content text-[10px]">{color}</span>
      </div>
      <div className="overflow-hidden rounded-md">
        <SketchPicker width="100%" presetColors={[]} styles={{ picker: {}, saturation: { width: "100%", height: "80px", paddingBottom: "", position: "relative" as const, overflow: "hidden" } }} color={color} onChangeComplete={(c) => setColor(c.hex)} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => valid && onSave(name.trim(), color)} disabled={!valid} className="bg-primary text-primary-content hover:bg-primary/90 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
          <Icon name="check" className="size-3" />
          {token ? "Save" : "Save Token"}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} aria-label="Delete token" className="border-base-300 text-neutral-content hover:border-error hover:text-error flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors">
            <Icon name="trash" className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SpecialSection({ p }: { p: Pick }) {
  return (
    <div>
      <span className="text-base-content mb-1.5 block text-xs font-medium">Special</span>
      <div className="grid grid-cols-12 gap-1">
        {SPECIAL_COLORS.map((c) => (
          <Swatch key={c.value} ref_={c.value} fill={c.hex} p={p} name={c.name} checker={c.value === "transparent"} />
        ))}
      </div>
    </div>
  );
}

export function RecentSection({ recent, onClear, p }: { recent: readonly string[]; onClear(): void; p: Pick }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-base-content text-xs font-medium">Recent</span>
        <button type="button" onClick={onClear} aria-label="Clear recent colours" {...tooltip("Clear recent")} className="text-neutral-content hover:text-base-content text-xs">
          <Icon name="trash" className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {recent.map((r) => (
          <Swatch key={r} ref_={r} fill={refToCss(r)} p={p} size="size-4" checker={r === "transparent"} />
        ))}
      </div>
    </div>
  );
}

export function TailwindSection({ p }: { p: Pick }) {
  return (
    <div>
      <span className="text-base-content mb-1.5 block text-xs font-medium">Tailwind Colors</span>
      <div className="space-y-3">
        {TAILWIND_COLOR_GROUPS.map((g) => (
          <div key={g}>
            <div className="text-neutral-content mb-1 text-xs capitalize">{g}</div>
            <div className="grid grid-cols-12 gap-1">
              {TAILWIND_SHADES.map((s) => (
                <Swatch key={s} ref_={`${g}-${s}`} fill={refToCss(`${g}-${s}`)} p={p} name={`${g[0]!.toUpperCase()}${g.slice(1)} ${s}`} size="size-4" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
