/**
 * Recover from invalid HTML nesting the way a browser does, so a page that reads fine in a browser is never refused
 * by the parser: `<ul><li>a<li>b</ul>`, a stray `</p>`, `<div><b>x</div>`, an element left open at the end.
 *
 * The strict parser (`parseSource`) stays strict (the editor maps every node to exact source bytes), so stored
 * source must parse. This pass is how source gets there: it runs where text enters (a write, an editor open, a
 * render) and ONLY when the strict parse fails. It never drops content: it inserts the closing tags a browser would
 * have implied and removes only a close tag that closes nothing. Attributes, text and Liquid are untouched, so
 * `data-edit-id`s stay as they are. If the repaired text still doesn't parse, the original comes back unchanged.
 */
import { parseSource } from "./parse";
import type { Environment } from "./environment";

export interface NestingFix {
  message: string;
  /** 1-based line in the ORIGINAL source. */
  line: number;
}

export interface RepairResult {
  source: string;
  fixes: NestingFix[];
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
/** Liquid tags with an `end` tag. A branch marker (`else`, `elsif`, `when`) ends the HTML opened in the branch before it. */
const LIQUID_BLOCKS = new Set(["if", "unless", "case", "for", "tablerow", "capture", "form", "paginate", "style", "javascript", "stylesheet", "schema", "comment", "raw"]);
const LIQUID_BRANCH = new Set(["else", "elsif", "when"]);

/** New tag → the open tags it implicitly closes when one of them is the innermost open element. */
const IMPLIED_END: Record<string, readonly string[]> = {
  li: ["li"],
  p: ["p"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  option: ["option"],
  optgroup: ["option", "optgroup"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  thead: ["tbody", "tfoot"],
  tbody: ["thead", "tbody", "tfoot"],
  tfoot: ["thead", "tbody"],
};

type Entry = { kind: "html"; name: string } | { kind: "liquid"; name: string };
interface Edit {
  at: number;
  remove: number;
  insert: string;
  message: string;
}

const lineAt = (s: string, i: number) => {
  let n = 1;
  for (let k = 0; k < i; k++) if (s.charCodeAt(k) === 10) n++;
  return n;
};

/** End offset (exclusive) of the Liquid output/tag starting at `i` (`{{`/`{%`), or -1. */
function liquidEnd(s: string, i: number): number {
  const close = s[i + 1] === "{" ? "}}" : "%}";
  const e = s.indexOf(close, i + 2);
  return e < 0 ? -1 : e + 2;
}

/** End offset (exclusive) of the HTML tag whose `<` is at `i`: honours quotes and Liquid inside attributes. */
function tagEnd(s: string, i: number): number {
  let quote = "";
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k]!;
    if (c === "{" && (s[k + 1] === "{" || s[k + 1] === "%")) {
      const e = liquidEnd(s, k);
      if (e < 0) return -1;
      k = e - 1;
    } else if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return k + 1;
  }
  return -1;
}

function scan(s: string): Edit[] | null {
  const edits: Edit[] = [];
  const stack: Entry[] = [];
  const closeAbove = (pos: number, stop: (e: Entry) => boolean, why: string) => {
    // Pop html entries (innermost first) until `stop`; each one is closed at `pos`.
    for (let k = stack.length - 1; k >= 0 && !stop(stack[k]!); k--) {
      const e = stack[k]!;
      if (e.kind !== "html") break;
      edits.push({ at: pos, remove: 0, insert: `</${e.name}>`, message: `Closed <${e.name}> ${why}` });
      stack.pop();
    }
  };
  let i = 0;
  while (i < s.length) {
    const lt = s.slice(i).search(/<|\{%|\{\{/);
    if (lt < 0) break;
    i += lt;
    if (s.startsWith("{{", i)) {
      const e = liquidEnd(s, i);
      if (e < 0) return null;
      i = e;
    } else if (s.startsWith("{%", i)) {
      const e = liquidEnd(s, i);
      if (e < 0) return null;
      const m = /^\{%-?\s*(end)?([a-z_]+)/.exec(s.slice(i, e));
      const name = m?.[2] ?? "";
      if (!m) {
        i = e;
        continue;
      }
      if (name === "raw" || name === "comment") {
        if (m[1]) {
          i = e;
          continue;
        }
        const rest = new RegExp(`\\{%-?\\s*end${name}\\s*-?%\\}`).exec(s.slice(e));
        if (!rest) return null;
        i = e + rest.index + rest[0].length;
        continue;
      }
      if (m[1] && LIQUID_BLOCKS.has(name)) {
        if (!stack.some((x) => x.kind === "liquid" && x.name === name)) {
          i = e;
          continue;
        }
        closeAbove(i, (x) => x.kind === "liquid", `before {% end${name} %}`);
        if (stack.at(-1)?.kind === "liquid") stack.pop();
      } else if (!m[1] && LIQUID_BRANCH.has(name)) {
        closeAbove(i, (x) => x.kind === "liquid", `before {% ${name} %}`);
      } else if (!m[1] && LIQUID_BLOCKS.has(name)) stack.push({ kind: "liquid", name });
      i = e;
    } else if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i + 4);
      if (e < 0) return null;
      i = e + 3;
    } else {
      const close = /^<\/([a-zA-Z][^\s/>{]*)\s*>/.exec(s.slice(i, i + 80));
      if (close) {
        const name = close[1]!.toLowerCase();
        const end = i + close[0].length;
        const idx = lastIndexOfHtml(stack, name);
        if (idx < 0) edits.push({ at: i, remove: close[0].length, insert: "", message: `Removed stray </${name}>` });
        else {
          closeAbove(i, (x) => x.kind === "html" && x.name === name, `before </${name}>`);
          stack.pop();
        }
        i = end;
        continue;
      }
      const open = /^<([a-zA-Z][^\s/>{]*)/.exec(s.slice(i, i + 80));
      if (!open) {
        i += 1;
        continue;
      }
      const name = open[1]!.toLowerCase();
      const end = tagEnd(s, i);
      if (end < 0) return null;
      const selfClosing = s[end - 2] === "/";
      for (let top = stack.at(-1); top?.kind === "html" && IMPLIED_END[name]?.includes(top.name); top = stack.at(-1)) {
        edits.push({ at: i, remove: 0, insert: `</${top.name}>`, message: `Closed <${top.name}> before <${name}>` });
        stack.pop();
      }
      if (RAW_TEXT.has(name) && !selfClosing) {
        const rest = new RegExp(`</${name}\\s*>`, "i").exec(s.slice(end));
        if (!rest) return null;
        i = end + rest.index + rest[0].length;
        continue;
      }
      if (!VOID.has(name) && !selfClosing) stack.push({ kind: "html", name });
      i = end;
    }
  }
  closeAbove(s.length, (x) => x.kind === "liquid", "at the end of the file");
  return edits;
}

function lastIndexOfHtml(stack: readonly Entry[], name: string): number {
  for (let k = stack.length - 1; k >= 0; k--) {
    const e = stack[k]!;
    if (e.kind === "liquid") return -1; // never close across a Liquid block boundary
    if (e.name === name) return k;
  }
  return -1;
}

/** Valid source comes back as it is. Invalid nesting comes back repaired, with what was done; unrepairable stays as it is. */
export function repairNesting(source: string, env?: Environment): RepairResult {
  try {
    parseSource(source, "strict", { env });
    return { source, fixes: [] };
  } catch {
    /* fall through to the repair */
  }
  const edits = scan(source);
  if (!edits?.length) return { source, fixes: [] };
  // Edits at the same offset keep scan order (inner closers first).
  const ordered = edits.map((e, n) => ({ e, n })).sort((a, b) => a.e.at - b.e.at || a.n - b.n).map((x) => x.e);
  let out = "";
  let pos = 0;
  for (const e of ordered) {
    out += source.slice(pos, e.at) + e.insert;
    pos = e.at + e.remove;
  }
  out += source.slice(pos);
  try {
    parseSource(out, "strict", { env });
  } catch {
    return { source, fixes: [] };
  }
  return { source: out, fixes: ordered.map((e) => ({ message: e.message, line: lineAt(source, e.at) })) };
}

/** One line for a UI or log: what was fixed in `path`. */
export function describeNestingFixes(path: string, fixes: readonly NestingFix[]): string {
  return `Fixed invalid HTML nesting in ${path} (${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}, first: ${fixes[0]!.message}, line ${fixes[0]!.line})`;
}
