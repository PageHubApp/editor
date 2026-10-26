import { splitArgs, type BuiltinFilter, type FilterCtx } from "./types";

const cache = new Map<string, Intl.NumberFormat>();
function formatter(lang: string, currency: string): Intl.NumberFormat {
  const key = `${lang}|${currency}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lang, { style: "currency", currency });
    if (cache.size > 100) cache.clear();
    cache.set(key, f);
  }
  return f;
}

function formatMoney(v: unknown, args: unknown[], ctx: FilterCtx, withCode: boolean): string {
  if (v == null || v === "" || !Number.isFinite(Number(v))) return "";
  const { kv } = splitArgs(args);
  const currency = String(kv.currency ?? ctx.get(["site", "currency"]) ?? "USD").toUpperCase();
  const lang = String(kv.lang ?? ctx.get(["site", "lang"]) ?? "en-US");
  const f = formatter(lang, currency);
  const digits = f.resolvedOptions().maximumFractionDigits ?? 2;
  const text = f.format(Number(v) / 10 ** digits);
  return withCode ? `${text} ${currency}` : text;
}

/** Amounts are minor units (cents), like Shopify. Currency / lang: options, else `site.currency` / `site.lang`, else USD / en-US. */
export const money: BuiltinFilter = {
  name: "money",
  returns: "string",
  describe: "Format minor units (cents) as money: {{ 4999 | money }} is $49.99. Options: currency, lang.",
  run: (v, a, ctx) => formatMoney(v, a, ctx, false),
};

export const money_with_currency: BuiltinFilter = {
  name: "money_with_currency",
  returns: "string",
  describe: "Like money, with the currency code: {{ 4999 | money_with_currency }} is $49.99 USD.",
  run: (v, a, ctx) => formatMoney(v, a, ctx, true),
};
