/**
 * Typography section — the Heading / Body typefaces, font-pairing suggestions and a per-token
 * type scale.
 *
 * The two font pickers reuse the FontPicker slot; the pairing chips apply a Heading + Body pair in
 * one undo step; the collapsible "Type scale" edits each token's weight / size / line height /
 * letter spacing, writing the `--heading-*` / `--body-*` vars the canvas reads.
 */
import { ThemeFontRow } from "./ThemeFontRow";
import { FONT_VARS, TYPOGRAPHY_TOKENS, type TypographyToken } from "./themeModel";
import { fontPairingsFacet } from "@pagehub/engine/host";
import { useEditorState } from "../../react/bindings";
import { Section, CollapsibleSection, SelectRow, SliderRow } from "./parts";

interface Props {
  fonts: { heading: string; body: string };
  getVar(name: string): string | null;
  setVar(name: string, value: string | null): void;
  setVars(entries: ReadonlyArray<readonly [string, string | null]>): void;
}

const familyValue = (f: string) => (f ? `"${f}", system-ui, sans-serif` : null);

const WEIGHT_OPTIONS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extrabold" },
] as const;

const LETTER_SPACING_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "-0.02em", label: "Tight" },
  { value: "0.02em", label: "Loose" },
  { value: "0.08em", label: "Wide" },
] as const;

const DEFAULTS: Record<string, { weight: string; size: number; lineHeight: number }> = {
  heading: { weight: "700", size: 1.5, lineHeight: 1.2 },
  body: { weight: "400", size: 1, lineHeight: 1.5 },
};

function TypeScaleRows({ tok, getVar, setVar }: { tok: TypographyToken; getVar: Props["getVar"]; setVar: Props["setVar"] }) {
  const def = DEFAULTS[tok.name]!;
  const weight = getVar(tok.weightVar) ?? def.weight;
  const sizeRaw = getVar(tok.sizeVar);
  const size = sizeRaw ? parseFloat(sizeRaw) : def.size;
  const lhRaw = getVar(tok.lineHeightVar);
  const lineHeight = lhRaw ? parseFloat(lhRaw) : def.lineHeight;
  const letter = getVar(tok.letterSpacingVar) ?? "normal";
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-base-content/50 mt-1 text-[10px] font-semibold tracking-wide uppercase">{tok.label}</h4>
      <SelectRow label="Weight" value={weight} options={WEIGHT_OPTIONS} labelWidth="w-24" onChange={(v) => setVar(tok.weightVar, v === def.weight ? null : v)} />
      <SliderRow label="Size" value={size} min={0.75} max={4} step={0.0625} labelWidth="w-24" suffix={`${size.toFixed(3).replace(/\.?0+$/, "")}rem`} onChange={(v) => setVar(tok.sizeVar, v === def.size ? null : `${v}rem`)} />
      <SliderRow label="Line height" value={lineHeight} min={0.9} max={2} step={0.05} labelWidth="w-24" suffix={lineHeight.toFixed(2)} onChange={(v) => setVar(tok.lineHeightVar, v === def.lineHeight ? null : String(v))} />
      <SelectRow label="Letter spacing" value={letter} options={LETTER_SPACING_OPTIONS} labelWidth="w-24" onChange={(v) => setVar(tok.letterSpacingVar, v === "normal" ? null : v)} />
    </div>
  );
}

export function TypographySection({ fonts, getVar, setVar, setVars }: Props) {
  const pairings = useEditorState((s) => s.facet(fontPairingsFacet));
  return (
    <Section title="Fonts" hint="Heading and body typefaces.">
      <ThemeFontRow label="Heading" labelWidth="w-28" value={fonts.heading} onChange={(f) => setVar(FONT_VARS.heading, familyValue(f))} />
      <ThemeFontRow label="Body" labelWidth="w-28" value={fonts.body} onChange={(f) => setVar(FONT_VARS.body, familyValue(f))} />

      {pairings.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-base-content/50 text-[10px] font-semibold tracking-wide uppercase">Pairings</span>
          <div className="flex flex-wrap gap-1">
            {pairings.map((p) => {
              const active = fonts.heading === p.heading && fonts.body === p.body;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setVars([[FONT_VARS.heading, familyValue(p.heading)], [FONT_VARS.body, familyValue(p.body)]])}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${active ? "border-primary bg-primary/10 text-base-content" : "border-base-300 text-base-content/70 hover:border-base-content/40 hover:text-base-content"}`}
                >
                  <span className="block font-semibold" style={{ fontFamily: `"${p.heading}"` }}>{p.heading}</span>
                  <span className="text-base-content/50 block" style={{ fontFamily: `"${p.body}"` }}>{p.body}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-1">
        <CollapsibleSection title="Type scale">
          {TYPOGRAPHY_TOKENS.map((tok) => (
            <TypeScaleRows key={tok.name} tok={tok} getVar={getVar} setVar={setVar} />
          ))}
        </CollapsibleSection>
      </div>
    </Section>
  );
}
