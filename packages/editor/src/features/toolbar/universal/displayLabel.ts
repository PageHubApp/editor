/**
 * Humanize a Tailwind value for DISPLAY in a value field — `w-full` → "Full", `max-w-md` → "Medium",
 * `text-2xl` → "2X Large" — while the stored class token stays untouched (the field shows the label
 * when idle, the raw token while editing). The field's class `prefix` is known, so the stem is
 * stripped directly rather than inferred.
 */

const WORDS_BY_TOKEN: Record<string, string> = {
  "3xs": "3X Small",
  "2xs": "2X Small",
  xs: "Extra Small",
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
  "2xl": "2X Large",
  col: "Column",
  row: "Row",
  wrap: "Wrap",
  nowrap: "No Wrap",
  reverse: "Reverse",
};

function titleCaseToken(token: string): string {
  const t = token.trim();
  if (!t) return t;
  if (t === "none") return "None";
  if (t === "default") return "Default";
  if (t === "auto") return "Auto";
  if (t === "full") return "Full";
  const opacity = t.match(/^(.+?)\/(\d{1,3})$/);
  if (opacity && /[a-z]/i.test(opacity[1]!)) return `${titleCaseToken(opacity[1]!)} ${opacity[2]}%`;
  const mapped = WORDS_BY_TOKEN[t.toLowerCase()];
  if (mapped) return mapped;
  const xl = t.match(/^(\d+)xl$/i);
  if (xl) return `${xl[1]}X Large`;
  if (/^\d+(\.\d+)?$/.test(t)) return t; // bare numbers (gap-2 → "2") and fractions stay as typed
  if (/^\d+\/\d+$/.test(t)) return t; // fractions (w-1/2 → "1/2")
  return t
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => {
      const xlp = p.match(/^(\d+)xl$/i);
      if (xlp) return `${xlp[1]}X Large`;
      if (/^\d+$/.test(p)) return p;
      return WORDS_BY_TOKEN[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/**
 * The label a bare Tailwind token shows in its field. `prefix` is the field's class stem (`w`,
 * `max-w`, `gap`); a token equal to the stem reads "Default", a `stem-<token>` strips the stem.
 * Variant prefixes (`hover:`, `md:`) are kept and title-cased ("Hover: Full"). Non-token values
 * (arbitrary `[…]`, `var(--x)`, CSS units) are returned unchanged.
 */
export function humanizeTailwindValue(prefix: string, token: string): string {
  if (!token || token.includes("[") || token.includes("(")) return token;
  const colon = token.lastIndexOf(":");
  const variants = colon >= 0 ? token.slice(0, colon) : "";
  const base = colon >= 0 ? token.slice(colon + 1) : token;
  let body: string;
  if (base === prefix) body = "Default";
  else if (prefix && base.startsWith(`${prefix}-`)) body = titleCaseToken(base.slice(prefix.length + 1));
  else body = titleCaseToken(base);
  if (!variants) return body;
  const v = variants.split(":").filter(Boolean).map(titleCaseToken).join(": ");
  return `${v}: ${body}`;
}
