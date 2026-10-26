/**
 * HTML import cleanup. Plain HTML in, source that parses strict and renders
 * back to the same visible content out.
 *
 *   escapeLiquid   literal `{{` / `{%` in content become inert (`{% raw %}` in text, literal outputs
 *                  in attribute values and comments), splicing the ORIGINAL source so formatting stays
 *   importHtml     escape → strict parse → on failure `parse5.serialize(parse5.parse(…))` and parse again
 *                  → apply the `sanitize` rule fixes (bad `data-edit-*` values …) → report, listing the page's own
 *                  scripts (kept: a site may carry JS)
 */
import { parse, parseFragment, serialize } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Environment } from "../parse/environment";
import { parseSource } from "../parse/parse";
import { applyFixes } from "../rules/fixer";
import { coreRules } from "../rules/coreRules";
import { jsIn } from "../rules/core/security";
import { runRules } from "../rules/run";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export interface ImportReport {
  /** The strict parse failed on the escaped source, so parse5 rewrote the markup (formatting lost once). */
  normalised: boolean;
  firstError?: string;
  escapes: { textRaw: number; textInline: number; attrs: number; comments: number };
  /** Attributes whose NAME held Liquid syntax (`<div {{#if x}}>`); they can't be expressed, so they were dropped. */
  droppedAttrs: number;
  /** One entry per sanitize fix applied (bad `data-edit-*` values …). */
  sanitized: Array<{ rule: string; message: string }>;
  /** The page's own JavaScript, kept as it was: one entry per `<script>`, `on*` handler and `javascript:` URL, for the owner's information. */
  scripts: string[];
  /** Error-level diagnostics left after import. Empty means the result lints clean. */
  remaining: Array<{ rule: string; message: string }>;
}

export interface ImportOptions {
  env?: Environment;
  /** Apply the sanitize fixes. Default true. */
  sanitize?: boolean;
}

const LIQUID = /\{\{|\{%/;
const emptyEscapes = (): ImportReport["escapes"] => ({ textRaw: 0, textInline: 0, attrs: 0, comments: 0 });

/** `{{` / `{%` as literal outputs; `q` is the quote the output sits next to (so the literal can't break out). */
function literal(s: string, q: "'" | '"' = "'"): string {
  return s.replace(/\{\{|\{%/g, (m) => `{{ ${q}${m}${q} }}`);
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  const kids = "content" in node && node.content ? node.content.childNodes : "childNodes" in node ? node.childNodes : [];
  for (const k of kids) walk(k, visit);
}

export function escapeLiquid(html: string): { source: string; stats: ImportReport["escapes"]; droppedAttrs: number; scripts: string[] } {
  const stats = emptyEscapes();
  let droppedAttrs = 0;
  const scripts: string[] = [];
  const edits: Edit[] = [];
  const root = isDocument(html) ? parse(html, { sourceCodeLocationInfo: true }) : parseFragment(html, { sourceCodeLocationInfo: true });

  walk(root as unknown as Node, (n) => {
    if ("attrs" in n && "tagName" in n) for (const f of jsIn((n as Element).tagName, (n as Element).attrs)) scripts.push(f.message);
    const loc = (n as { sourceCodeLocation?: { startOffset: number; endOffset: number; attrs?: Record<string, { startOffset: number; endOffset: number }> } | null }).sourceCodeLocation;
    if (!loc) return;
    if (n.nodeName === "#text") {
      const slice = html.slice(loc.startOffset, loc.endOffset);
      if (!LIQUID.test(slice)) return;
      // A script's or style's text is raw: no Liquid tag may sit inside it (no-liquid-tag-in-script), so the whole
      // element goes in one `{% raw %}` block.
      const parent = (n as { parentNode?: { nodeName?: string; sourceCodeLocation?: { startOffset: number; endOffset: number } | null } }).parentNode;
      const pl = parent?.sourceCodeLocation;
      if ((parent?.nodeName === "script" || parent?.nodeName === "style") && pl) {
        const whole = html.slice(pl.startOffset, pl.endOffset);
        if (!/endraw/.test(whole)) {
          edits.push({ start: pl.startOffset, end: pl.endOffset, text: `{% raw %}${whole}{% endraw %}` });
          stats.textRaw++;
          return;
        }
      }
      if (/endraw/.test(slice)) {
        edits.push({ start: loc.startOffset, end: loc.endOffset, text: literal(slice) });
        stats.textInline++;
      } else {
        edits.push({ start: loc.startOffset, end: loc.endOffset, text: `{% raw %}${slice}{% endraw %}` });
        stats.textRaw++;
      }
    } else if (n.nodeName === "#comment") {
      const slice = html.slice(loc.startOffset, loc.endOffset);
      if (!LIQUID.test(slice)) return;
      edits.push({ start: loc.startOffset, end: loc.endOffset, text: literal(slice) });
      stats.comments++;
    } else if ("attrs" in n && loc.attrs) {
      for (const a of (n as Element).attrs) {
        const al = loc.attrs[a.name];
        if (!al) continue;
        const slice = html.slice(al.startOffset, al.endOffset);
        if (!LIQUID.test(slice)) continue;
        if (LIQUID.test(a.name)) {
          edits.push({ start: al.startOffset, end: al.endOffset, text: "" });
          droppedAttrs++;
          continue;
        }
        const eq = slice.indexOf("=");
        const head = slice.slice(0, eq + 1);
        const value = slice.slice(eq + 1);
        let next: string;
        if (value.startsWith("'")) next = head + literal(value, '"');
        else if (value.startsWith('"')) next = head + literal(value);
        else next = `${head}"${literal(value.replace(/"/g, "&quot;"))}"`;
        edits.push({ start: al.startOffset, end: al.endOffset, text: next });
        stats.attrs++;
      }
    }
  });

  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const e of edits) {
    if (e.start < at) continue; // overlapping (should not happen); keep the earlier edit
    out += html.slice(at, e.start) + e.text;
    at = e.end;
  }
  return { source: out + html.slice(at), stats, droppedAttrs, scripts };
}

const isDocument = (html: string) => /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);

export function importHtml(html: string, opts: ImportOptions = {}): { source: string; report: ImportReport } {
  const { source: escaped, stats, droppedAttrs, scripts } = escapeLiquid(html);
  const report: ImportReport = { normalised: false, escapes: stats, droppedAttrs, sanitized: [], scripts, remaining: [] };
  let source = escaped;
  try {
    parseSource(source, "strict", { env: opts.env });
  } catch (e) {
    report.normalised = true;
    report.firstError = (e as Error).message.split("\n")[0];
    source = isDocument(escaped) ? serialize(parse(escaped)) : serialize(parseFragment(escaped));
    parseSource(source, "strict", { env: opts.env }); // still failing means a bug here, not in the input; let it throw
  }

  const runOpts = { env: opts.env };
  const path = "import.html";
  if (opts.sanitize !== false) {
    for (let pass = 0; pass < 4; pass++) {
      const { output, applied } = applyFixes(source, runRules(coreRules, { [path]: source }, runOpts, [path]), { kind: "sanitize" });
      if (!applied.length || output === source) break;
      for (const d of applied) report.sanitized.push({ rule: d.rule, message: d.message });
      source = output;
    }
  }
  report.remaining = runRules(coreRules, { [path]: source }, runOpts, [path])
    .filter((d) => d.severity === "error")
    .map((d) => ({ rule: d.rule, message: d.message }));
  return { source, report };
}
