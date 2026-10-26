/**
 * The typing rules of the universal input as pure functions: which type a typed string means,
 * which keystrokes are refused, and how a (type, text) pair becomes the stored value and a class
 * token.
 *
 *   typeInto("10px", "tailwind")   // { type: "px", text: "10" }
 *   typeInto("w-", "px")           // { type: "tailwind", text: "w-", autocomplete: true }
 *   valueToToken("w", "10px")      // "w-[10px]"
 */
export type ValueType = "calc" | "var" | "tailwind" | "em" | "px" | "rem" | "%" | "vh" | "vw" | "vmin" | "vmax";

/** The type menu's order. */
export const TYPE_ORDER: readonly ValueType[] = ["calc", "var", "tailwind", "em", "px", "rem", "%", "vh", "vw", "vmin", "vmax"];
export const CSS_UNITS: readonly ValueType[] = ["em", "px", "rem", "%", "vh", "vw", "vmin", "vmax"];
const LIMITED: readonly ValueType[] = ["%", "vh", "vw", "vmin", "vmax"];
const RANGE = { min: -200, max: 1000 } as const;

export interface Typed {
  type: ValueType;
  text: string;
  /** Open the Tailwind autocomplete. */
  autocomplete?: boolean;
}

/** What the field shows for a stored value: the number for a unit value, else the value. */
export function parseValue(raw: string): Typed {
  const unit = /^(-?[0-9.]+)(px|em|rem|%|vh|vw|vmin|vmax)$/.exec(raw);
  if (unit) return { type: unit[2] as ValueType, text: unit[1]! };
  if (raw.startsWith("var(")) return { type: "var", text: raw };
  // The CSS-Function (calc) panel emits calc()/clamp()/min()/max() — all re-open in that panel.
  if (/^(calc|clamp|min|max)\(/.test(raw)) return { type: "calc", text: raw };
  return { type: "tailwind", text: raw };
}

/** The result of typing `next` while `type` is selected; `null` refuses the keystroke. */
export function typeInto(next: string, type: ValueType): Typed | null {
  const unit = /^(-?[0-9.]+)(px|em|rem|%|vh|vw|vmin|vmax)$/.exec(next);
  if (unit) return { type: unit[2] as ValueType, text: unit[1]! };
  const looksTailwind = /^[a-z]+-/i.test(next);
  if (CSS_UNITS.includes(type) && next !== "") {
    const partial = /^(-?[0-9.]+)([a-z%]*)$/i.exec(next);
    if (!partial) return looksTailwind ? { type: "tailwind", text: next, autocomplete: true } : null;
    const suffix = partial[2]!.toLowerCase();
    const okSuffix = suffix === "" || suffix === "%" || CSS_UNITS.some((u) => u.startsWith(suffix));
    if (!okSuffix) return looksTailwind ? { type: "tailwind", text: next, autocomplete: true } : null;
    const n = parseFloat(next);
    if (LIMITED.includes(type) && !Number.isNaN(n) && (n < RANGE.min || n > RANGE.max)) return null;
  }
  if (looksTailwind && type !== "tailwind" && type !== "calc") return { type: "tailwind", text: next, autocomplete: true };
  return { type, text: next, autocomplete: type === "tailwind" };
}

/** Switching types: unit to unit keeps the number; anything else clears it. */
export function switchType(from: ValueType, to: ValueType, text: string): string {
  return CSS_UNITS.includes(from) && CSS_UNITS.includes(to) ? text : "";
}

/** The stored value for a (type, text) pair. */
export function composeValue(type: ValueType, text: string): string {
  return text !== "" && CSS_UNITS.includes(type) ? `${text}${type}` : text;
}

/** `w-[10px]`, `w-4`, `w-[var(--x)]`, `w-[calc(1rem_+_2px)]` for a stored value; `""` for none. */
export function valueToToken(prefix: string, value: string): string {
  if (!value) return "";
  if (value.startsWith("var(") || value.startsWith("calc(") || /^-?[0-9.]+[a-z%]+$/.test(value)) return `${prefix}-[${value.replace(/\s+/g, "_")}]`;
  return value;
}

/** The stored value a class token holds (the inverse of `valueToToken`). */
export function tokenToValue(prefix: string, token: string): string {
  const arb = new RegExp(`^${prefix}-\\[(.+)\\]$`).exec(token);
  return arb ? arb[1]!.replace(/_/g, " ") : token;
}
