/**
 * The default `ThemePanel` slot: the site's design settings, rendered as the body of the right
 * slide-out drawer (opened by `panel.theme`, ⌘⇧D; the drawer owns the frame, title and close).
 * Edits, all stored in `theme.css` and reflected live on the canvas by
 * `CanvasStyleBridge`:
 *   - Presets        curated palette + token + font bundles (host catalogue)
 *   - Palette        the site colours, with a Light / Dark variant toggle
 *   - Corners        the corner radii (boxes / fields / selectors)
 *   - Spacing        the density multiplier every `space-*` token scales by
 *   - Tokens         depth / noise / shadow / border + input & link styling
 *   - Fonts          heading / body typefaces, pairings and a type scale
 *   - Breakpoints    the responsive widths (advanced)
 *   - Editor prefs   indicator density (an editor preference, not a site token)
 *
 * Every design surface lives in this one panel rather than being split across separate popovers.
 *
 *   <Slot name="ThemePanel" open onClose={close} />   // mounted inside <Drawer> by RightDrawer
 */
import { useThemeValues } from "./useThemeValues";
import { DENSITY_DEFAULT, DENSITY_VAR, RADIUS_KEYS } from "./themeModel";
import { Section, CollapsibleSection, SliderRow } from "./parts";
import { PresetsSection } from "./PresetsSection";
import { PaletteSection } from "./PaletteSection";
import { TokensSection } from "./TokensSection";
import { TypographySection } from "./TypographySection";
import { BreakpointsSection } from "./BreakpointsSection";
import { IndicatorDensityRow } from "../toolbar/breakpoint-chip/IndicatorDensityRow";

export interface ThemePanelProps {
  open: boolean;
  onClose(): void;
}

export function ThemePanel({ open, onClose }: ThemePanelProps) {
  const { values, breakpoints, getVar, setVar, setVars, setBreakpoint } = useThemeValues();
  if (!open) return null;
  return (
      <div data-slot="ThemePanel" className="flex flex-col gap-5">
        <PresetsSection values={values} setVars={setVars} />

        <PaletteSection values={values} setVar={setVar} setVars={setVars} />

        <Section title="Corners" hint="Border radius for boxes, fields and selectors.">
          {RADIUS_KEYS.map((r) => {
            const rem = values.radius[r.key] ?? r.fallback;
            return <SliderRow key={r.key} label={r.label} value={rem} min={0} max={2} step={0.05} suffix={`${rem.toFixed(2)}rem`} onChange={(v) => setVar(`--radius-${r.key}`, `${v}rem`)} />;
          })}
        </Section>

        <Section title="Spacing" hint="Scales the spacing tokens (py-space-lg, gap-space-sm); fixed paddings like p-4 stay put.">
          {(() => {
            const density = values.density ?? DENSITY_DEFAULT;
            return <SliderRow label="Density" value={density} min={0.5} max={2} step={0.1} suffix={`×${density.toFixed(2)}`} onChange={(v) => setVar(DENSITY_VAR, String(Math.round(v * 100) / 100))} />;
          })()}
        </Section>

        <TokensSection values={values} setVar={setVar} />

        <TypographySection fonts={values.fonts} getVar={getVar} setVar={setVar} setVars={setVars} />

        <BreakpointsSection breakpoints={breakpoints} setBreakpoint={setBreakpoint} />

        <CollapsibleSection title="Editor preferences" hint="How the editor itself behaves — not saved with the site.">
          <IndicatorDensityRow />
        </CollapsibleSection>
      </div>
  );
}
