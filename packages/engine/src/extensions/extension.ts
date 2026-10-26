/**
 * Extensions are imported values combined through facets. An `Extension` is a value or a
 * (nested) array of them; flattening is depth-first and dedupes by identity, precedence
 * buckets (`Prec`) order the result, and each facet combines its inputs with a documented
 * rule. Everything is resolved — and every collision reported — at config time.
 */
import type { StateField } from "../state/state";

/** Objects that stand for an extension (an element, a command, a rule) implement this. */
export const EXTENSION: unique symbol = Symbol.for("pagehub-editor.extension");
export interface Extendable {
  [EXTENSION](): Extension;
}

export type PrecName = "highest" | "high" | "default" | "low" | "lowest";
const PREC_ORDER: readonly PrecName[] = ["highest", "high", "default", "low", "lowest"];

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Who registered a value: the plugin name, or "(root)" for the host's own list. */
export interface FacetInput<I> {
  value: I;
  source: string;
  prec: PrecName;
}

export class Facet<I, O> {
  constructor(
    readonly id: string,
    private readonly combiner: (values: readonly I[], inputs: readonly FacetInput<I>[]) => O,
  ) {}
  /** Combine inputs (highest precedence first). */
  combine(values: readonly I[], inputs: readonly FacetInput<I>[] = values.map((value) => ({ value, source: "(root)", prec: "default" }))): O {
    return this.combiner(values, inputs);
  }
  of(value: I): Extension {
    return new FacetProvider(this, value);
  }
}

export class FacetProvider<I> {
  constructor(
    readonly facet: Facet<I, unknown>,
    readonly value: I,
  ) {}
}

export class PrecExtension {
  constructor(
    readonly prec: PrecName,
    readonly inner: Extension,
  ) {}
}

/** Lazy runtime half of a plugin (see the plugin docs). */
export type RuntimeExtension = unknown;

export interface PluginExtension {
  readonly kind: "plugin";
  readonly name: string;
  readonly requires: readonly Extension[];
  readonly extensions: readonly Extension[];
  readonly runtime?: () => Promise<{ default: RuntimeExtension[] }>;
  readonly contributed: Extension;
}

export type ExtensionValue = FacetProvider<any> | StateField<any> | PrecExtension | PluginExtension | Extendable;
export type Extension = ExtensionValue | readonly Extension[];

export function defineFacet<I, O>(opts: { id: string; combine: (values: readonly I[], inputs: readonly FacetInput<I>[]) => O }): Facet<I, O> {
  return new Facet(opts.id, opts.combine);
}

export const Prec: Record<PrecName, (e: Extension) => Extension> = {
  highest: (e) => new PrecExtension("highest", e),
  high: (e) => new PrecExtension("high", e),
  default: (e) => new PrecExtension("default", e),
  low: (e) => new PrecExtension("low", e),
  lowest: (e) => new PrecExtension("lowest", e),
};

const isPlugin = (e: unknown): e is PluginExtension => typeof e === "object" && e !== null && (e as PluginExtension).kind === "plugin";
const isExtendable = (e: unknown): e is Extendable => typeof e === "object" && e !== null && EXTENSION in e;
const isField = (e: unknown): e is StateField<unknown> => typeof e === "object" && e !== null && (e as { isStateField?: boolean }).isStateField === true;

/** A readable name for an extension in error messages. */
export function extensionName(e: unknown): string {
  if (isPlugin(e)) return `plugin "${e.name}"`;
  if (e instanceof FacetProvider) return `${e.facet.id} value`;
  const named = e as { name?: unknown; id?: unknown; meta?: { id?: unknown } };
  if (typeof named?.name === "string") return `"${named.name}"`;
  if (typeof named?.id === "string") return `"${named.id}"`;
  if (typeof named?.meta?.id === "string") return `"${named.meta.id}"`;
  return "an extension";
}

/** The resolved configuration: facet outputs, state fields and plugins. */
export class Configuration {
  private readonly outputs = new Map<Facet<any, any>, unknown>();
  readonly fields: readonly StateField<unknown>[];
  readonly plugins: readonly PluginExtension[];

  private constructor(
    private readonly inputs: Map<Facet<any, any>, FacetInput<unknown>[]>,
    fields: StateField<unknown>[],
    plugins: PluginExtension[],
  ) {
    this.fields = fields;
    this.plugins = plugins;
    for (const [facet, list] of inputs) this.outputs.set(facet, facet.combine(list.map((i) => i.value), list));
  }

  static resolve(extensions: Extension): Configuration {
    const buckets: Record<PrecName, Array<{ value: ExtensionValue; source: string }>> = { highest: [], high: [], default: [], low: [], lowest: [] };
    const seen = new Set<unknown>();
    const plugins: PluginExtension[] = [];
    const walk = (e: Extension, prec: PrecName, source: string): void => {
      if (Array.isArray(e)) {
        for (const x of e as readonly Extension[]) walk(x, prec, source);
        return;
      }
      if (e == null) throw new ConfigError(`undefined extension in ${source}`);
      if (seen.has(e)) return;
      seen.add(e);
      if (e instanceof PrecExtension) return walk(e.inner, e.prec, source);
      if (isPlugin(e)) {
        plugins.push(e);
        walk(e.extensions, prec, e.name);
        walk(e.contributed, prec, e.name);
        return;
      }
      if (isExtendable(e)) return walk(e[EXTENSION](), prec, source);
      if (e instanceof FacetProvider || isField(e)) {
        buckets[prec].push({ value: e as ExtensionValue, source });
        return;
      }
      throw new ConfigError(`${extensionName(e)} in ${source} is not an extension`);
    };
    walk(extensions, "default", "(root)");

    for (const p of plugins) {
      for (const req of p.requires.flat(Infinity as 1) as unknown[]) {
        if (!seen.has(req)) throw new ConfigError(`plugin "${p.name}" requires ${extensionName(req)}, which is not configured`);
      }
    }

    const inputs = new Map<Facet<any, any>, FacetInput<unknown>[]>();
    const fields: StateField<unknown>[] = [];
    for (const prec of PREC_ORDER) {
      for (const { value, source } of buckets[prec]) {
        if (value instanceof FacetProvider) {
          const list = inputs.get(value.facet) ?? [];
          list.push({ value: value.value, source, prec });
          inputs.set(value.facet, list);
        } else fields.push(value as StateField<unknown>);
      }
    }
    return new Configuration(inputs, fields, plugins);
  }

  facet<O>(facet: Facet<any, O>): O {
    if (!this.outputs.has(facet)) this.outputs.set(facet, facet.combine([], []));
    return this.outputs.get(facet) as O;
  }

  /** Raw inputs of a facet with their sources (for describe / docs). */
  facetInputs<I>(facet: Facet<I, unknown>): readonly FacetInput<I>[] {
    return (this.inputs.get(facet) ?? []) as FacetInput<I>[];
  }

  /** Load every plugin's lazy runtime half. */
  async loadRuntimes(): Promise<RuntimeExtension[]> {
    const halves = await Promise.all(this.plugins.filter((p) => p.runtime).map((p) => p.runtime!()));
    return halves.flatMap((m) => m.default);
  }
}

/** A combine rule: values keyed by `key`; a second registration of a key is a config error naming both sources. */
export function uniqueBy<I>(what: string, key: (v: I) => string) {
  return (_values: readonly I[], inputs: readonly FacetInput<I>[]): Map<string, I> => {
    const out = new Map<string, I>();
    const from = new Map<string, string>();
    for (const { value, source } of inputs) {
      const k = key(value);
      if (out.has(k)) throw new ConfigError(`${what} "${k}" is registered twice: by ${from.get(k)} and by ${source}`);
      out.set(k, value);
      from.set(k, source);
    }
    return out;
  };
}
