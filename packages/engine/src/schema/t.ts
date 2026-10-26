/**
 * Prop / argument schemas. One schema per prop set, used everywhere: it validates
 * (`check`), coerces from source text (`parse`), writes source text (`serialize`) and
 * exports JSON Schema (`toJSONSchema`) for docs, inspector forms and MCP tool descriptions.
 *
 * Source text has two contexts: `"attr"` (an attribute value, unquoted text) and `"arg"`
 * (a Liquid tag argument: strings are quoted literals, written with `liquidString`).
 */
import { liquidString } from "../edit/ops";

export type SourceContext = "attr" | "arg";
export type SchemaType = "string" | "number" | "boolean" | "enum" | "array" | "object" | "hash" | "handle" | "tokens" | "expression";

export class SchemaError extends Error {
  override name = "SchemaError";
}

interface Spec {
  type: SchemaType;
  int?: boolean;
  optional?: boolean;
  default?: unknown;
  hasDefault?: boolean;
  min?: number;
  max?: number;
  description?: string;
  values?: readonly string[];
  items?: Schema<any>;
  shape?: Record<string, Schema<any>>;
}

export type CheckResult<T> = { ok: true; value: T } | { ok: false; error: string };

const unquote = (src: string): string | null => {
  const m = /^(["'])([\s\S]*)\1$/.exec(src.trim());
  return m ? m[2]! : null;
};

/** Split `a: 1, b: "x, y"` at top-level commas. */
function splitArgs(src: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim());
}

/** A Liquid expression fragment that can't break out of its tag (`collections.blog`, `(1..5)`). */
export const isSafeExpression = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !/%\}|\{%|\}\}|\{\{|[\r\n]/.test(v);

export class Schema<T> {
  constructor(readonly spec: Readonly<Spec>) {}

  private with(patch: Partial<Spec>): any {
    return new Schema({ ...this.spec, ...patch });
  }

  optional(): Schema<T | undefined> {
    return this.with({ optional: true });
  }
  default(value: T): Schema<T> {
    const r = this.check(value);
    if (!r.ok) throw new SchemaError(`bad default: ${r.error}`);
    return this.with({ default: value, hasDefault: true });
  }
  min(n: number): Schema<T> {
    return this.with({ min: n });
  }
  max(n: number): Schema<T> {
    return this.with({ max: n });
  }
  int(): Schema<T> {
    return this.with({ int: true });
  }
  describe(text: string): Schema<T> {
    return this.with({ description: text });
  }

  get type(): SchemaType {
    return this.spec.type;
  }

  /** Validate a value; `undefined` takes the default, or passes when optional. */
  check(value: unknown): CheckResult<T> {
    const s = this.spec;
    if (value === undefined) {
      if (s.hasDefault) return { ok: true, value: s.default as T };
      if (s.optional) return { ok: true, value: undefined as T };
      return { ok: false, error: "required" };
    }
    const fail = (error: string): CheckResult<T> => ({ ok: false, error });
    const range = (n: number, what: string): CheckResult<T> | null => {
      if (s.min !== undefined && n < s.min) return fail(`${what} must be ≥ ${s.min}`);
      if (s.max !== undefined && n > s.max) return fail(`${what} must be ≤ ${s.max}`);
      return null;
    };
    switch (s.type) {
      case "string":
        if (typeof value !== "string") return fail("expected a string");
        return range(value.length, "length") ?? { ok: true, value: value as T };
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return fail("expected a number");
        if (s.int && !Number.isInteger(value)) return fail("expected an integer");
        return range(value, "value") ?? { ok: true, value: value as T };
      case "boolean":
        return typeof value === "boolean" ? { ok: true, value: value as T } : fail("expected a boolean");
      case "enum":
        return typeof value === "string" && s.values!.includes(value) ? { ok: true, value: value as T } : fail(`expected one of ${s.values!.map((v) => JSON.stringify(v)).join(", ")}`);
      case "array": {
        if (!Array.isArray(value)) return fail("expected an array");
        const bad = range(value.length, "length");
        if (bad) return bad;
        const out: unknown[] = [];
        for (const [i, v] of value.entries()) {
          const r = s.items!.check(v);
          if (!r.ok) return fail(`[${i}]: ${r.error}`);
          out.push(r.value);
        }
        return { ok: true, value: out as T };
      }
      case "object":
      case "hash": {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("expected an object");
        const out: Record<string, unknown> = {};
        for (const [k, schema] of Object.entries(s.shape!)) {
          const r = schema.check((value as Record<string, unknown>)[k]);
          if (!r.ok) return fail(`${k}: ${r.error}`);
          if (r.value !== undefined) out[k] = r.value;
        }
        for (const k of Object.keys(value)) if (!(k in s.shape!)) return fail(`unknown key ${k}`);
        return { ok: true, value: out as T };
      }
      case "tokens": {
        if (!Array.isArray(value)) return fail("expected an array of tokens");
        const bad = value.find((v) => typeof v !== "string" || !s.values!.includes(v));
        if (bad !== undefined) return fail(`unknown token ${JSON.stringify(bad)}; expected any of ${s.values!.map((v) => JSON.stringify(v)).join(", ")}`);
        return { ok: true, value: [...new Set(value as string[])] as T };
      }
      case "expression":
        return isSafeExpression(value) ? { ok: true, value: value.trim() as T } : fail("expected a Liquid expression");
      case "handle": {
        const h = value as { path?: unknown; alive?: unknown };
        return typeof h === "object" && typeof h.path === "string" && typeof h.alive === "boolean" ? { ok: true, value: value as T } : fail("expected a node handle");
      }
    }
  }

  /** `check` that throws. */
  validate(value: unknown): T {
    const r = this.check(value);
    if (!r.ok) throw new SchemaError(r.error);
    return r.value;
  }

  /** Coerce source text into a value (missing source → default / undefined). */
  parse(source: string | undefined, ctx: SourceContext = "attr"): T {
    if (source === undefined) return this.validate(undefined);
    const s = this.spec;
    const text = source.trim();
    const str = (): string => {
      if (ctx === "attr") return source;
      const v = unquote(text);
      if (v === null) throw new SchemaError(`expected a string literal, got ${text}`);
      return v;
    };
    let value: unknown;
    switch (s.type) {
      case "string":
      case "enum":
        value = str();
        break;
      case "number":
        value = text === "" ? NaN : Number(text);
        if (Number.isNaN(value)) throw new SchemaError(`expected a number, got ${JSON.stringify(text)}`);
        break;
      case "boolean":
        if (text === "true" || (ctx === "attr" && text === "")) value = true;
        else if (text === "false") value = false;
        else throw new SchemaError(`expected true or false, got ${JSON.stringify(text)}`);
        break;
      case "array":
      case "object":
        if (ctx === "arg") throw new SchemaError(`${s.type} values can't be written as Liquid arguments`);
        try {
          value = JSON.parse(text);
        } catch {
          throw new SchemaError(`expected JSON, got ${JSON.stringify(text)}`);
        }
        break;
      case "hash": {
        const out: Record<string, unknown> = {};
        for (const part of splitArgs(text)) {
          const m = /^([\w-]+)\s*:\s*([\s\S]*)$/.exec(part);
          if (!m) throw new SchemaError(`expected name: value, got ${JSON.stringify(part)}`);
          const schema = s.shape![m[1]!];
          if (!schema) throw new SchemaError(`unknown key ${m[1]}`);
          out[m[1]!] = schema.parse(m[2]!, "arg");
        }
        value = out;
        break;
      }
      case "tokens":
        // an attribute holds space-separated tokens; as an argument they are one quoted string
        value = (ctx === "arg" ? str() : source).split(/\s+/).filter(Boolean);
        break;
      case "expression":
        value = text;
        break;
      case "handle":
        throw new SchemaError("a handle has no source form");
    }
    return this.validate(value);
  }

  /** Source text for a value. */
  serialize(value: T, ctx: SourceContext = "attr"): string {
    const v = this.validate(value) as unknown;
    if (v === undefined) throw new SchemaError("nothing to serialize");
    switch (this.spec.type) {
      case "string":
      case "enum":
        return ctx === "arg" ? liquidString(v as string) : (v as string);
      case "number":
      case "boolean":
        return String(v);
      case "array":
      case "object":
        if (ctx === "arg") throw new SchemaError(`${this.spec.type} values can't be written as Liquid arguments`);
        return JSON.stringify(v);
      case "hash":
        return Object.entries(v as Record<string, unknown>)
          .map(([k, x]) => `${k}: ${this.spec.shape![k]!.serialize(x, "arg")}`)
          .join(", ");
      case "tokens":
        return ctx === "arg" ? liquidString((v as string[]).join(" ")) : (v as string[]).join(" ");
      case "expression":
        return v as string;
      case "handle":
        throw new SchemaError("a handle has no source form");
    }
  }

  toJSONSchema(): Record<string, unknown> {
    const s = this.spec;
    const out: Record<string, unknown> = {};
    switch (s.type) {
      case "string":
        out.type = "string";
        if (s.min !== undefined) out.minLength = s.min;
        if (s.max !== undefined) out.maxLength = s.max;
        break;
      case "number":
        out.type = s.int ? "integer" : "number";
        if (s.min !== undefined) out.minimum = s.min;
        if (s.max !== undefined) out.maximum = s.max;
        break;
      case "boolean":
        out.type = "boolean";
        break;
      case "enum":
        out.type = "string";
        out.enum = [...s.values!];
        break;
      case "array":
        out.type = "array";
        out.items = s.items!.toJSONSchema();
        if (s.min !== undefined) out.minItems = s.min;
        if (s.max !== undefined) out.maxItems = s.max;
        break;
      case "object":
      case "hash": {
        out.type = "object";
        out.properties = Object.fromEntries(Object.entries(s.shape!).map(([k, v]) => [k, v.toJSONSchema()]));
        const required = Object.entries(s.shape!).filter(([, v]) => !v.spec.optional && !v.spec.hasDefault).map(([k]) => k);
        if (required.length) out.required = required;
        out.additionalProperties = false;
        break;
      }
      case "tokens":
        out.type = "array";
        out.items = { type: "string", enum: [...s.values!] };
        out.uniqueItems = true;
        break;
      case "expression":
        out.type = "string";
        out["x-liquid-expression"] = true;
        break;
      case "handle":
        out.type = "object";
        out["x-handle"] = true;
        break;
    }
    if (s.hasDefault) out.default = s.default;
    if (s.description) out.description = s.description;
    return out;
  }
}

type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<any>>;
type ObjectOf<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

export const t = {
  string: (): Schema<string> => new Schema({ type: "string" }),
  number: (): Schema<number> => new Schema({ type: "number" }),
  int: (): Schema<number> => new Schema({ type: "number", int: true }),
  boolean: (): Schema<boolean> => new Schema({ type: "boolean" }),
  enum: <const V extends string>(values: readonly V[]): Schema<V> => new Schema({ type: "enum", values }),
  array: <S extends Schema<any>>(items: S): Schema<Infer<S>[]> => new Schema({ type: "array", items }),
  object: <S extends Shape>(shape: S): Schema<ObjectOf<S>> => new Schema({ type: "object", shape }),
  /** Liquid named arguments (`a: 1, b: "x"`) as one value. */
  hash: <S extends Shape>(shape: S): Schema<ObjectOf<S>> => new Schema({ type: "hash", shape }),
  /** A set of space-separated tokens from a fixed list (`data-carousel="dots arrows"`). */
  tokens: <const V extends string>(values: readonly V[]): Schema<V[]> => new Schema({ type: "tokens", values }),
  /** A Liquid expression, written unquoted (`arg("in", t.expression())`). */
  expression: (): Schema<string> => new Schema({ type: "expression" }),
  /** A node handle (command arguments). */
  handle: <H = unknown>(): Schema<H> => new Schema({ type: "handle" }),
};
