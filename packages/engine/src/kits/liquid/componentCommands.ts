/**
 * Reusable components. In HTML-first a component is a partial file (`partials/<name>.liquid`)
 * and an instance is a `{% render '<name>' %}` tag. Each command is one transaction (one undo
 * step, never merged with a quick repeat) of minimal splices:
 *
 * - `component.convert { at? }` — lift the element into a new partial (named from its
 *   `data-edit-name` / label / first heading / section hint, else `component-N`; `-2`, `-3` … when taken) and replace it with
 *   `{% render '<name>' %}`. Enclosing `{% for %}` variables the markup reads are passed as
 *   arguments (`{% render 'card', p: p %}`), since a partial has its own scope. Can't run on a
 *   `{% render %}` / `{% section %}` tag ("Component exists").
 * - `component.unlink { at? }` — replace a `{% render %}` tag with the partial's markup,
 *   re-indented to the tag. Named arguments become `{% assign %}` lines before it; the
 *   `with` / `for` forms can't be inlined as written, so the command refuses them.
 *
 * A partial whose text is empty counts as absent (undoing a convert leaves the file empty;
 * the engine has no file deletion).
 *
 * `component.styleOnly` / `component.contentOnly` are deliberately not defined: a `{% render %}`
 * instance carries no markup of its own, so there is no per-instance style or content to keep
 * half-linked. Per-instance variation is arguments (`{% render 'card', title: … %}`) or
 * `{% section %}` settings, which the section-settings panel edits with `liquid.setArg`.
 */
import { defineCommand, selectAfter, type CommandContext } from "../../commands/defineCommand";
import { indentAt, reindent } from "../../edit/whitespace";
import { setSelection } from "../../state/state";
import type { Files, Path } from "../../state/changes";
import type { NodeHandle } from "../../state/handles";
import { build } from "./blockCommands";
import { SCRIPTS_PARTIAL_NAME } from "./scriptCommands";

export const PARTIAL_FILE = /^partials\/([\w-]+)\.liquid$/;
const INCLUDE_TAG = /^\{%-?\s*(render|section)\s+(['"])([\w-]+)\2\s*(,|with\b|for\b|-?%\})/;
const FOR_VAR = /^\{%-?\s*for\s+([a-z_][\w]*)\s+in\b/i;

export const partialPath = (name: string): Path => `partials/${name}.liquid`;

/** Does a partial with this name exist (non-empty)? */
export const hasPartial = (files: Files, name: string): boolean => !!files.get(partialPath(name))?.trim();

/** Partial names with content, sorted. */
export function partialNames(files: Files): string[] {
  const out: string[] = [];
  for (const [p, t] of files) {
    const m = PARTIAL_FILE.exec(p);
    if (m && t.trim()) out.push(m[1]!);
  }
  return out.sort();
}

/**
 * A partial that is only author code (one `{% raw %}` block, the converter's site-wide head / footer code): rendered on
 * every page like any partial, but not something a person places, so it is not a reusable component.
 */
export function isCodePartial(text: string): boolean {
  return /^\s*\{%-?\s*raw\s*-?%\}[\s\S]*\{%-?\s*endraw\s*-?%\}\s*$/.test(text);
}

/**
 * The site's reusable components: every partial with content that is not code-only, sorted. The one list the Add
 * panel, the dashboard's components screen and the server's library functions show.
 */
export function componentNames(files: Files): string[] {
  return partialNames(files).filter((name) => name !== SCRIPTS_PARTIAL_NAME && !isCodePartial(files.get(partialPath(name)) ?? ""));
}

const isMarkupPath = (path: Path) => /\.(liquid|html)$/.test(path);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `{% render 'name'` / `{% section "name"` (any whitespace control), capturing everything up to the name. */
const useOf = (name: string) => new RegExp(`(\\{%-?\\s*(?:render|section)\\s+)(['"])${escapeRe(name)}\\2(?=\\s*(?:,|with\\b|for\\b|-?%\\}))`, "g");

/** Where a component is used: each markup file with `{% render %}` / `{% section %}` tags of it, and how many. */
export function componentUses(files: Files, name: string): Array<{ path: Path; count: number }> {
  const re = useOf(name);
  const out: Array<{ path: Path; count: number }> = [];
  for (const [path, text] of files) {
    if (!isMarkupPath(path) || path === partialPath(name)) continue;
    const count = text.match(re)?.length ?? 0;
    if (count) out.push({ path, count });
  }
  return out;
}

/**
 * Rename component `from` to `to` (a free name): the new partial with the old one's text, every `{% render %}` /
 * `{% section %}` of it rewritten, and the old partial to delete. Files that don't change are left out.
 */
export function renameComponentFiles(files: Files, from: string, to: string): { writes: Record<Path, string>; remove: Path } {
  const text = files.get(partialPath(from));
  if (!text?.trim()) throw new Error(`no component named ${from}`);
  if (hasPartial(files, to)) throw new Error(`a component named ${to} already exists`);
  const writes: Record<Path, string> = { [partialPath(to)]: text };
  const re = useOf(from);
  for (const [path, body] of files) {
    if (!isMarkupPath(path) || path === partialPath(from)) continue;
    const next = body.replace(re, (_m, open: string, q: string) => `${open}${q}${to}${q}`);
    if (next !== body) writes[path] = next;
  }
  return { writes, remove: partialPath(from) };
}

/** "Hero Card" → "hero-card"; nothing usable → "component". */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "component";
}

/** `base`, else `base-2`, `base-3` … — the first name with no partial. */
export function uniquePartialName(files: Files, base: string): string {
  const b = slugify(base);
  if (!hasPartial(files, b)) return b;
  let n = 2;
  while (hasPartial(files, `${b}-${n}`)) n++;
  return `${b}-${n}`;
}

/** Words a class token or id can name a section by, when the element carries no label of its own. */
const SECTION_WORDS = /^(hero|banner|card|cards|cta|nav|navbar|menu|testimonials?|pricing|faq|gallery|features?|services?|contact|team|logos?|stats|footer|header|newsletter|about|steps|process|reviews?|products?|blog|posts?)(?:-|$)/;

const textOf = (html: string) => html.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

/** At most this many words of a heading make a name. */
const NAME_WORDS = 4;

/**
 * A meaningful partial name for markup being converted: its `data-edit-name`, `aria-label`, `data-edit-label`, the first
 * heading's text, an id or class that names a section ("hero", "pricing"), or the semantic tag (`header` / `footer` /
 * `nav`). Nothing usable: `component-N` (the first free number), never a bare tag like `div`.
 */
export function deriveComponentName(files: Files, h: NodeHandle, markup: string): string {
  const slug = (s: string) => slugify(s.split(/\s+/).slice(0, NAME_WORDS).join(" "));
  const own = h.attr("data-edit-name") || h.attr("aria-label") || h.attr("data-edit-label");
  if (own?.trim()) return uniquePartialName(files, own);
  const heading = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(markup);
  const headingText = heading ? textOf(heading[1]!) : "";
  if (/[a-z0-9]/i.test(headingText)) return uniquePartialName(files, slug(headingText));
  const hint = [h.attr("id") ?? "", ...(h.attr("class") ?? "").split(/\s+/)].find((t) => SECTION_WORDS.test(t));
  if (hint) return uniquePartialName(files, hint);
  if (h.tag === "header" || h.tag === "footer" || h.tag === "nav") return uniquePartialName(files, h.tag);
  let n = 1;
  while (hasPartial(files, `component-${n}`)) n++;
  return `component-${n}`;
}

/** The include a `{% render %}` / `{% section %}` tag names, and whether it has `with` / `for`. */
export function includeOf(h: NodeHandle | null | undefined): { tag: "render" | "section"; name: string; form: "plain" | "args" | "with" | "for" } | null {
  if (!h?.alive || h.kind !== "liquid-tag" || (h.tag !== "render" && h.tag !== "section")) return null;
  const m = INCLUDE_TAG.exec(h.text());
  if (!m) return null;
  const form = m[4] === "," ? "args" : m[4]!.startsWith("with") ? "with" : m[4]!.startsWith("for") ? "for" : "plain";
  return { tag: m[1] as "render" | "section", name: m[3]!, form };
}

/** Write `text` as the content of a new (or emptied) partial in this transaction. */
export function addPartial(ctx: CommandContext, name: string, text: string): Path {
  const path = partialPath(name);
  const old = ctx.tr.startState.files.get(path) ?? "";
  ctx.tr.replace({ path, from: 0, to: old.length }, text);
  return path;
}

/** Loop variables of enclosing `{% for %}` blocks that `text` reads. */
function loopVarsUsed(h: NodeHandle, text: string): string[] {
  const out: string[] = [];
  for (let p = h.parent(); p; p = p.parent()) {
    if (p.kind !== "liquid-block" || p.tag !== "for") continue;
    const v = FOR_VAR.exec(p.text())?.[1];
    if (v && !out.includes(v) && new RegExp(`\\b${v}\\b`).test(text)) out.push(v);
  }
  if (out.length && /\bforloop\b/.test(text)) out.push("forloop");
  return out;
}

const target = (ctx: CommandContext, at?: NodeHandle): NodeHandle | null => {
  const h = at ?? ctx.selection.primary;
  return h?.alive ? h : null;
};

/** Why `component.convert` can't run on `h` ("Component exists"), or null when it can. */
export function convertBlocker(h: NodeHandle | null): "exists" | "none" | null {
  if (!h) return "none";
  if (includeOf(h)) return "exists";
  return h.kind === "element" && h.tag !== "html" && h.tag !== "body" && h.tag !== "head" ? null : "none";
}

/** The context-menu label: "Component exists" when the selection already is one. */
export function convertTitle(h: NodeHandle | null): string {
  return convertBlocker(h) === "exists" ? "Component exists" : "Convert to component";
}

export const componentConvert = defineCommand<{ at?: NodeHandle; name?: string } | undefined>({
  id: "component.convert",
  title: "Convert to component",
  run(ctx, args) {
    const h = target(ctx, args?.at);
    if (!h || convertBlocker(h)) return false;
    const source = ctx.state.files.get(h.path)!;
    const raw = source.slice(h.range.from, h.range.to);
    const markup = reindent(raw, indentAt(source, h.range.from), "");
    const name = args?.name ? uniquePartialName(ctx.state.files, args.name) : deriveComponentName(ctx.state.files, h, raw);
    const pass = loopVarsUsed(h, raw).map((v) => `, ${v}: ${v}`).join("");
    const tag = `{% render '${name}'${pass} %}`;
    return build(ctx, (tr) => {
      tr.annotate({ group: {} }).replace(h, tag);
      addPartial(ctx, name, `${markup}\n`);
      const pos = tr.done().mapping.map(h.range.from, h.path, -1);
      tr.effect(setSelection, selectAfter(() => nodeAt(ctx, h.path, pos)));
    });
  },
});

/** The outermost-but-one node starting at `pos` (the element or tag a splice put there). */
function nodeAt(ctx: CommandContext, path: Path, pos: number): NodeHandle[] {
  let h = ctx.registry?.at(path, pos) ?? null;
  while (h && h.range.from !== pos) h = h.parent();
  while (h && h.kind === "text") h = h.parent();
  return h && h.range.from === pos ? [h] : [];
}

export const componentUnlink = defineCommand<{ at?: NodeHandle } | undefined>({
  id: "component.unlink",
  title: "Unlink component",
  run(ctx, args) {
    const h = target(ctx, args?.at);
    const inc = includeOf(h);
    if (!h || !inc || inc.tag !== "render" || inc.form === "with" || inc.form === "for") return false;
    const body = ctx.state.files.get(partialPath(inc.name))?.replace(/\s+$/, "");
    if (!body) return false;
    const source = ctx.state.files.get(h.path)!;
    const indent = indentAt(source, h.range.from);
    const assigns = h.args().map((a) => `{% assign ${a.name} = ${a.source} %}\n${indent}`).join("");
    const text = assigns + reindent(body, "", indent);
    return build(ctx, (tr) => {
      tr.annotate({ group: {} }).replace(h, text);
      const pos = tr.done().mapping.map(h.range.from, h.path, -1) + assigns.length;
      tr.effect(setSelection, selectAfter(() => nodeAt(ctx, h.path, pos)));
    });
  },
});

export const COMPONENT_COMMANDS = [componentConvert, componentUnlink] as const;
