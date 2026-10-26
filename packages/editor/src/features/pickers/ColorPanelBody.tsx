/**
 * The colour panel's body: hex field (Enter / blur, 6 digits), eyedropper where supported, Clear,
 * then the site palette, special and recent swatches (first, so the site tokens are visible without
 * scrolling), the Sketch picker (commits on drag end; alpha < 1 stores rgba) and the Tailwind shades.
 * Recent colours persist as `recent-colors` (max 12).
 */
import { SketchPicker } from "@hello-pangea/color-picker";
import { useEffect, useState } from "react";
import type { ThemeColors } from "@pagehub/engine/host";
import { Icon } from "../../primitives/icons";
import { readJSON, writeJSON } from "../../primitives/storage";
import { tooltip } from "../../primitives/tooltip";
import { PaletteSection, RecentSection, SpecialSection, TailwindSection, type PaletteCrud } from "./ColorSections";
import { canvasIsDark } from "../theme/themePalette";
import { hexOf, refToCss } from "./colorValue";

const RECENT_KEY = "recent-colors";
const RECENT_MAX = 12;

interface EyeDropperCtor {
  new (): { open(): Promise<{ sRGBHex: string }> };
}
const eyeDropper = (): EyeDropperCtor | undefined => (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;

const ICON_BTN = "border-base-300 text-neutral-content hover:border-base-content hover:text-base-content flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-40";

interface ColorPanelBodyProps {
  /** The stored colour ref (see `colorValue.ts`). */
  value: string;
  onChange(ref: string): void;
  onClear?(): void;
  /** Double-clicking a swatch picks and closes. */
  onPickAndClose?(ref: string): void;
  theme: ThemeColors;
  /** When supplied, the Design System list gains "+ New Token" + per-token edit (rename/recolour/delete). */
  crud?: PaletteCrud;
}

export function ColorPanelBody({ value, onChange, onClear, onPickAndClose, theme, crud }: ColorPanelBodyProps) {
  const [recent, setRecent] = useState<string[]>(() => readJSON<string[]>(RECENT_KEY, []));
  const [hex, setHex] = useState(() => hexOf(value));
  useEffect(() => {
    const next = hexOf(value);
    if (next) setHex(next);
  }, [value]);

  const commit = (ref: string) => {
    onChange(ref);
    if (/^#|^[a-z]+-\d|^white$|^black$|^transparent$|^rgba/i.test(ref)) {
      const next = [ref, ...recent.filter((r) => r !== ref)].slice(0, RECENT_MAX);
      setRecent(next);
      writeJSON(RECENT_KEY, next);
    }
  };
  const submitHex = () => /^#[0-9a-f]{6}$/i.test(hex) && commit(hex);
  const dropper = eyeDropper();
  const pick = async () => {
    try {
      const c = await new dropper!().open();
      setHex(c.sRGBHex);
      commit(c.sRGBHex);
    } catch {
      // the user cancelled
    }
  };
  const p = { selected: value, onSelect: commit, onDoubleClick: (r: string) => (commit(r), onPickAndClose?.(r)) };
  const palette = theme.light();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitHex()}
          onBlur={submitHex}
          placeholder="#000000"
          aria-label="Hex colour"
          className="border-base-300 bg-base-200 text-base-content placeholder:text-neutral-content focus:border-ring focus:ring-ring h-8 flex-1 rounded-md border px-2 text-xs outline-none focus:ring-1"
        />
        {dropper && (
          <button type="button" onClick={pick} aria-label="Pick color from screen" {...tooltip("Eyedropper", "top")} className={ICON_BTN}>
            <Icon name="color-picker" className="size-3.5" />
          </button>
        )}
        {onClear && (
          <button type="button" disabled={!value} onClick={onClear} aria-label="Clear color" {...tooltip("Clear color", "top")} className={ICON_BTN}>
            <Icon name="trash" className="size-3.5" />
          </button>
        )}
      </div>
      <PaletteSection light={palette} dark={theme.dark?.()} startDark={canvasIsDark()} p={p} crud={crud} />
      <SpecialSection p={p} />
      {recent.length > 0 && (
        <RecentSection
          recent={recent}
          onClear={() => {
            setRecent([]);
            writeJSON(RECENT_KEY, []);
          }}
          p={p}
        />
      )}
      <div className="overflow-hidden rounded-md">
        <SketchPicker
          width="100%"
          presetColors={[]}
          disableAlpha={false}
          styles={{ picker: {}, saturation: { width: "100%", height: "120px", paddingBottom: "", position: "relative" as const, overflow: "hidden" } }}
          color={hex || refToCss(value, palette) || "#3b82f6"}
          onChange={(c) => setHex(c.hex)}
          onChangeComplete={(c) => {
            const a = c.rgb?.a ?? 1;
            commit(a < 1 - 1e-6 ? `rgba(${c.rgb.r},${c.rgb.g},${c.rgb.b},${Number(a.toFixed(2))})` : c.hex);
          }}
        />
      </div>
      <TailwindSection p={p} />
    </div>
  );
}
