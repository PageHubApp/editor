/**
 * Post-render HTML passes for `renderPage`: stamp `aria-current="page"` and add the head
 * snippets the site runtime needs before first paint. Hand-written scanners, no DOM, no parser:
 * one pass over the string, skipping comments and script / style / textarea / title bodies.
 */
import { THEME_SNIPPET } from "@pagehub/site-runtime/head/theme";
import { DISMISS_SNIPPET } from "@pagehub/site-runtime/head/dismiss";
import { escapeAttr } from "./escape";

const RAW_TEXT = ["script", "style", "textarea", "title"];

function normalizePath(href: string): string | null {
  const h = href.replace(/&amp;/g, "&").trim();
  if (!h.startsWith("/") || h.startsWith("//")) return null;
  const path = h.split(/[?#]/, 1)[0]!;
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/** End index (of the `>`) of the start tag opening at `from`, honouring quoted values; -1 when unterminated. */
function tagEnd(html: string, from: number): number {
  let quote = "";
  for (let i = from; i < html.length; i++) {
    const c = html[i]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const HAS_ARIA_CURRENT = /\saria-current[\s=>/]/i;

/** Add `aria-current="page"` to every `<a>` whose `href` path equals `currentPath` (query and hash ignored). */
export function stampAriaCurrent(html: string, currentPath: string): string {
  const target = normalizePath(currentPath);
  if (target === null || !html.includes("<a")) return html;
  let out = "";
  let last = 0;
  let i = 0;
  while ((i = html.indexOf("<", i)) !== -1) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)(?=[\s/>])/.exec(html.slice(i, i + 40));
    if (!m) {
      i++;
      continue;
    }
    const name = m[1]!.toLowerCase();
    const end = tagEnd(html, i + m[0].length);
    if (end === -1) break;
    if (RAW_TEXT.includes(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, end);
      i = close === -1 ? html.length : close;
      continue;
    }
    if (name === "a") {
      const tag = html.slice(i, end + 1);
      const href = HREF.exec(tag);
      const value = href ? (href[1] ?? href[2] ?? href[3] ?? "") : null;
      if (value !== null && !HAS_ARIA_CURRENT.test(tag) && normalizePath(value) === target) {
        out += html.slice(last, i + 2) + ' aria-current="page"';
        last = i + 2;
      }
    }
    i = end + 1;
  }
  return out + html.slice(last);
}

export { THEME_KEY } from "@pagehub/site-runtime/head/theme";
export { DISMISS_PREFIX as DISMISS_KEY_PREFIX } from "@pagehub/site-runtime/head/dismiss";

const USES_THEME = /\sdata-theme-toggle[\s=>/]/i;
const USES_DISMISS = /\sdata-dismiss[\s=>/]/i;

/** The head snippets a page needs (theme toggle, dismissible bands) as `<script nonce>` tags; "" when it uses neither. */
export function headSnippets(html: string, nonce?: string): string {
  if (nonce !== undefined && !/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error("invalid CSP nonce");
  const attr = nonce ? ` nonce="${escapeAttr(nonce)}"` : "";
  let out = "";
  if (USES_THEME.test(html)) out += `<script${attr}>${THEME_SNIPPET}</script>`;
  if (USES_DISMISS.test(html)) out += `<script${attr}>${DISMISS_SNIPPET}</script>`;
  return out;
}

/** Insert `snippet` just before `</head>`, or at the very start when the page has no head. */
export function injectIntoHead(html: string, snippet: string): string {
  if (!snippet) return html;
  const at = html.search(/<\/head\s*>/i);
  return at === -1 ? snippet + html : html.slice(0, at) + snippet + html.slice(at);
}
