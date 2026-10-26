/**
 * A site's own JavaScript files: `assets/<name>.js` (docs/action-items/specs/site-js-allowed.md). A file is linked
 * with `<script src="{{ 'app.js' | asset_url }}" defer></script>`. Every command is one transaction (one undo step).
 *
 * - `script.create { name, text? }` — a new file (a one-line comment when no text is given).
 * - `script.rename { from, to }` — the file under a new name; every `asset_url` of the old name follows.
 * - `script.remove { name }` — the file's text is emptied and its tag leaves the "every page" partial. An empty
 *   `assets/*.js` is an absent file: the host's storage turns the save of one into a delete, and the lists below skip it.
 * - `script.setEverywhere { name, on }` — list the file in `partials/site-scripts.liquid` and make sure every page
 *   renders that partial, so the script loads on all of them.
 */
import { defineCommand } from "../../commands/defineCommand";
import type { Files, Path } from "../../state/changes";
import { build } from "./blockCommands";

export const SCRIPT_FILE = /^assets\/([a-z0-9][a-z0-9_.-]*\.js)$/;
/** What a person may call a script file (the server's `ASSET_FILE_RE`, without the folder). */
export const SCRIPT_NAME = /^[a-z0-9][a-z0-9_.-]*\.js$/;
/** The partial that loads the "every page" scripts; not a component a person places. */
export const SCRIPTS_PARTIAL_NAME = "site-scripts";
export const SCRIPTS_PARTIAL: Path = `partials/${SCRIPTS_PARTIAL_NAME}.liquid`;
const RENDER_TAG = `{% render '${SCRIPTS_PARTIAL_NAME}' %}`;
const PARTIAL_NOTE = "{%- comment -%}Scripts that load on every page. Edit them in the editor's Scripts panel.{%- endcomment -%}";

export const scriptPath = (name: string): Path => `assets/${name}`;

/** The tag that loads one file; paste it into a page to load the script on that page only. */
export const scriptTag = (name: string): string => `<script src="{{ '${name}' | asset_url }}" defer></script>`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const refOf = (name: string) => new RegExp(`(['"])${escapeRe(name)}\\1(\\s*\\|\\s*asset_url)`, "g");
const isMarkupPath = (p: Path) => /\.(liquid|html?)$/.test(p);
const isPage = (p: Path) => /^pages\/.+\.liquid$/.test(p);

/** The site's script files with content, sorted. */
export function scriptNames(files: Files): string[] {
  const out: string[] = [];
  for (const [p, t] of files) {
    const name = SCRIPT_FILE.exec(p)?.[1];
    if (name && t.trim()) out.push(name);
  }
  return out.sort();
}

/** Why `name` can't be a script file's name, or null. */
export function scriptNameProblem(files: Files, name: string, except?: string): string | null {
  if (!SCRIPT_NAME.test(name)) return "Use lowercase letters, numbers, dashes and dots, and end it with .js.";
  if (name !== except && files.get(scriptPath(name))?.trim()) return `A script named ${name} already exists.`;
  return null;
}

/** Files `name` is listed in by the "every page" partial. */
export function everywhereNames(files: Files): string[] {
  const text = files.get(SCRIPTS_PARTIAL) ?? "";
  return [...text.matchAll(/(['"])([^'"]+)\1\s*\|\s*asset_url/g)].map((m) => m[2]!);
}

/** Markup files (other than the "every page" partial) that link `name` with `asset_url`, and how many times. */
export function scriptUses(files: Files, name: string): Array<{ path: Path; count: number }> {
  const out: Array<{ path: Path; count: number }> = [];
  for (const [path, text] of files) {
    if (!isMarkupPath(path) || path === SCRIPTS_PARTIAL) continue;
    const count = text.match(refOf(name))?.length ?? 0;
    if (count) out.push({ path, count });
  }
  return out;
}

/** Pages that don't render the "every page" partial. */
export function pagesWithoutScripts(files: Files): Path[] {
  return [...files].filter(([p, t]) => isPage(p) && !t.includes(RENDER_TAG)).map(([p]) => p).sort();
}

/** `{% javascript %}` blocks in a file: where each starts (line, 1-based) and its first line of code. */
export function javascriptBlocks(text: string): Array<{ line: number; preview: string }> {
  const out: Array<{ line: number; preview: string }> = [];
  for (const m of text.matchAll(/\{%-?\s*javascript\s*-?%\}([\s\S]*?)\{%-?\s*endjavascript\s*-?%\}/g)) {
    const first = m[1]!.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    out.push({ line: text.slice(0, m.index).split("\n").length, preview: first.length > 60 ? `${first.slice(0, 57)}...` : first });
  }
  return out;
}

const partialText = (names: readonly string[]) => `${PARTIAL_NOTE}\n${names.map(scriptTag).join("\n")}${names.length ? "\n" : ""}`;

function setText(tr: { startState: { files: Files }; replace(at: { path: Path; from: number; to: number }, text: string): unknown }, path: Path, next: string): void {
  const old = tr.startState.files.get(path) ?? "";
  if (old !== next) tr.replace({ path, from: 0, to: old.length }, next);
}

export const scriptCreate = defineCommand<{ name: string; text?: string }>({
  id: "script.create",
  title: "New script",
  run(ctx, args) {
    if (!args || typeof args.name !== "string" || scriptNameProblem(ctx.state.files, args.name)) return false;
    return build(ctx, (tr) => {
      tr.annotate({ group: {} });
      setText(tr, scriptPath(args.name), args.text ?? `// ${args.name}\n`);
    });
  },
});

export const scriptRename = defineCommand<{ from: string; to: string }>({
  id: "script.rename",
  title: "Rename script",
  run(ctx, args) {
    const files = ctx.state.files;
    const text = args ? files.get(scriptPath(args.from)) : undefined;
    if (!args || !text?.trim() || args.from === args.to || scriptNameProblem(files, args.to, args.from)) return false;
    return build(ctx, (tr) => {
      tr.annotate({ group: {} });
      setText(tr, scriptPath(args.to), text);
      setText(tr, scriptPath(args.from), "");
      const re = refOf(args.from);
      for (const [path, body] of files) {
        if (!isMarkupPath(path)) continue;
        setText(tr, path, body.replace(re, (_m, q: string, tail: string) => `${q}${args.to}${q}${tail}`));
      }
    });
  },
});

export const scriptRemove = defineCommand<{ name: string }>({
  id: "script.remove",
  title: "Delete script",
  run(ctx, args) {
    const files = ctx.state.files;
    if (!args || !files.get(scriptPath(args.name))) return false;
    return build(ctx, (tr) => {
      tr.annotate({ group: {} });
      setText(tr, scriptPath(args.name), "");
      if (files.has(SCRIPTS_PARTIAL)) setText(tr, SCRIPTS_PARTIAL, partialText(everywhereNames(files).filter((n) => n !== args.name)));
    });
  },
});

export const scriptSetEverywhere = defineCommand<{ name: string; on: boolean }>({
  id: "script.setEverywhere",
  title: "Load script on every page",
  run(ctx, args) {
    const files = ctx.state.files;
    if (!args || !files.get(scriptPath(args.name))?.trim()) return false;
    const listed = everywhereNames(files).filter((n) => n !== args.name);
    const next = args.on ? [...listed, args.name].sort() : listed;
    return build(ctx, (tr) => {
      tr.annotate({ group: {} });
      setText(tr, SCRIPTS_PARTIAL, partialText(next));
      if (!args.on) return;
      for (const path of pagesWithoutScripts(files)) {
        const body = files.get(path)!;
        setText(tr, path, `${body}${body.endsWith("\n") ? "" : "\n"}${RENDER_TAG}\n`);
      }
    });
  },
});

export const SCRIPT_COMMANDS = [scriptCreate, scriptRename, scriptRemove, scriptSetEverywhere] as const;
