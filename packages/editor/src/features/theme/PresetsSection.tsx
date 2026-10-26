/**
 * Presets section — curated theme bundles (palette + style-guide tokens + fonts) applied in one
 * click / one undo step.
 *
 * The catalogue is backed by host data through `themePresetsFacet` (the demo seeds
 * DEMO_THEME_PRESETS; a real host passes its own). Applying maps the preset's palette →
 * `--color-*`, dark palette → `--color-dark-*`, radii → `--radius-*`, tokens → their style-guide
 * vars and fonts → `--font-heading` / `--font-body`, all in a single `setVars` transaction.
 */
import { FONT_VARS, STYLE_TOKENS, type ThemeValues } from "./themeModel";
import { themePresetsFacet, type ThemePreset } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { CollapsibleSection } from "./parts";

interface Props {
  values: ThemeValues;
  setVars(entries: ReadonlyArray<readonly [string, string | null]>): void;
}

const TOKEN_VAR = new Map(STYLE_TOKENS.map((t) => [t.key, t.cssVar]));
const SWATCH_TOKENS = ["primary", "secondary", "accent", "base-100", "base-content"];

function presetEntries(preset: ThemePreset): Array<readonly [string, string | null]> {
  const out: Array<readonly [string, string | null]> = [];
  for (const c of preset.palette) out.push([`--color-${c.token}`, c.color]);
  for (const c of preset.darkPalette ?? []) out.push([`--color-dark-${c.token}`, c.color]);
  for (const [key, rem] of Object.entries(preset.radius ?? {})) out.push([`--radius-${key}`, `${rem}rem`]);
  for (const [key, value] of Object.entries(preset.tokens ?? {})) {
    const cssVar = TOKEN_VAR.get(key);
    if (cssVar) out.push([cssVar, value]);
  }
  if (preset.fonts?.heading) out.push([FONT_VARS.heading, `"${preset.fonts.heading}", system-ui, sans-serif`]);
  if (preset.fonts?.body) out.push([FONT_VARS.body, `"${preset.fonts.body}", system-ui, sans-serif`]);
  return out;
}

/** Is `preset` the palette currently on the site? (match on the core swatch tokens). */
function isActive(preset: ThemePreset, values: ThemeValues): boolean {
  const by = new Map(preset.palette.map((c) => [c.token, c.color]));
  return SWATCH_TOKENS.every((t) => {
    const want = by.get(t);
    return !want || values.colors[t] === want;
  });
}

export function PresetsSection({ values, setVars }: Props) {
  const presets = useEditorState((s) => s.facet(themePresetsFacet));
  if (presets.length === 0) return null;
  return (
    <CollapsibleSection title="Presets" hint="Start from a curated palette, tokens and font pairing.">
      <div className="grid grid-cols-2 gap-1.5">
        {presets.map((p) => {
          const swatches = new Map(p.palette.map((c) => [c.token, c.color]));
          const active = isActive(p, values);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setVars(presetEntries(p))}
              aria-pressed={active}
              title={p.description}
              className={`flex flex-col gap-1.5 rounded-md border p-2 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-content/40 hover:bg-base-200/50"}`}
            >
              <span className="flex h-6 overflow-hidden rounded">
                {SWATCH_TOKENS.map((t) => (
                  <span key={t} className="flex-1" style={{ backgroundColor: swatches.get(t) ?? "transparent" }} aria-hidden />
                ))}
              </span>
              <span className="text-base-content truncate text-[11px] font-medium">{p.name}</span>
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
