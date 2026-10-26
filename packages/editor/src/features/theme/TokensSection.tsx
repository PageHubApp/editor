/**
 * Tokens section — the style-guide tokens beyond palette / radius / spacing.
 *
 * Edits the style-guide tokens inline: component depth, noise, shadow and border on surfaces; the
 * input border/bg/text/placeholder/focus-ring colours; and the link colours + underline. Each row
 * writes one `--var` to `theme.css`.
 */
import { ThemeColorRow } from "./ThemeColorRow";
import { STYLE_TOKENS, STYLE_TOKEN_GROUPS, type StyleTokenDef, type ThemeValues } from "./themeModel";
import { CollapsibleSection, SelectRow, SliderRow } from "./parts";

interface Props {
  values: ThemeValues;
  setVar(name: string, value: string | null): void;
}

function TokenRow({ def, raw, setVar }: { def: StyleTokenDef; raw: string | null; setVar: Props["setVar"] }) {
  if (def.kind === "color") {
    return (
      <ThemeColorRow
        name={def.cssVar.replace(/^--/, "")}
        label={def.label}
        value={raw}
        onChange={(v) => setVar(def.cssVar, v)}
      />
    );
  }
  if (def.kind === "select") {
    return <SelectRow label={def.label} value={raw ?? def.fallback} options={def.options ?? []} labelWidth="w-24" onChange={(v) => setVar(def.cssVar, v === def.fallback ? null : v)} />;
  }
  const n = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : Number(def.fallback);
  return (
    <SliderRow
      label={def.label}
      value={n}
      min={def.min ?? 0}
      max={def.max ?? 1}
      step={def.step ?? 1}
      labelWidth="w-24"
      suffix={def.format ? def.format(n) : String(n)}
      onChange={(v) => setVar(def.cssVar, String(def.fallback) === String(v) ? null : String(v))}
    />
  );
}

export function TokensSection({ values, setVar }: Props) {
  return (
    <CollapsibleSection title="Tokens" hint="Component depth, borders, shadows and the form-input and link styling.">
      {STYLE_TOKEN_GROUPS.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          <h4 className="text-base-content/50 mt-1 text-[10px] font-semibold tracking-wide uppercase">{g.label}</h4>
          {STYLE_TOKENS.filter((t) => t.group === g.id).map((t) => (
            <TokenRow key={t.key} def={t} raw={values.tokens[t.key] ?? null} setVar={setVar} />
          ))}
        </div>
      ))}
    </CollapsibleSection>
  );
}
