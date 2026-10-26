/**
 * Shared breakpoint-scope constants + helpers for the Classes editor (the add input and the chip
 * breakpoint row). `AddScope` is the layer a newly-typed bare class targets: `base` (no prefix) or
 * one of the five breakpoints — the "Apply to" scope.
 */
import { splitClass } from "@pagehub/engine";
import { BREAKPOINTS, scopePrefix, type Breakpoint, type Scope } from "@pagehub/engine/kits";

export type AddScope = Breakpoint | "base";

export const BREAKPOINT_PREFIXES = ["sm:", "md:", "lg:", "xl:", "2xl:"] as const;

/** The breakpoint row, base first (Base / SM / MD / LG / XL / 2XL). */
export const LAYERS: ReadonlyArray<{ to: AddScope; label: string; hint: string }> = [
  { to: "base", label: "Base", hint: "default" },
  { to: "sm", label: "SM", hint: "640px+" },
  { to: "md", label: "MD", hint: "768px+" },
  { to: "lg", label: "LG", hint: "1024px+" },
  { to: "xl", label: "XL", hint: "1280px+" },
  { to: "2xl", label: "2XL", hint: "1536px+" },
];

export const scopeFor = (s: AddScope): Scope => (s === "base" ? {} : { breakpoint: s });
export const prefixFor = (s: AddScope): string => scopePrefix(scopeFor(s));
export const scopeLabel = (s: AddScope): string => (s === "base" ? "Base" : s.toUpperCase());

/** The breakpoint layer a class token sits on (`md:p-4` → `md`; no breakpoint prefix → `base`). */
export const layerOf = (token: string): AddScope => (splitClass(token)[0].split(":").find((p) => (BREAKPOINTS as readonly string[]).includes(p)) as Breakpoint | undefined) ?? "base";
