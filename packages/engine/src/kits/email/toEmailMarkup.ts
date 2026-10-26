/**
 * `toEmailMarkup` — a rendered email body (the Liquid output: simple blocks with Tailwind classes) → the table layout
 * inboxes need. Pure: no CSS here; the host compiles the classes and inlines them afterwards.
 *
 *   block wrapper   `div` / `section` / `header` / `footer` / `main` / `article` / `aside` / `nav` → a one-cell
 *                   presentation table; the cell carries the classes and style. `max-w-[Npx]` caps the table at N px,
 *                   `mx-auto` centres it, `text-center` / `text-right` also sets the cell's `align`.
 *   columns         a wrapper whose desktop layout is a row (`flex-row`, or `grid grid-cols-N` with N > 1; a prefixed
 *                   token such as `md:flex-row` is the desktop value) → one cell per child, `ph-col` so they stack on
 *                   phones, `valign` from `items-*`, the column gap as cell padding.
 *   button          an `<a>` with a background class (`bg-*`) or `data-email-role="button"` → a bulletproof button: a
 *                   table cell carries the background, border and radius, the link keeps the text and padding.
 *   image           `border="0"`, and `display:block` unless it sits in centred / right-aligned text.
 *
 * `data-email-*` and `data-edit-*` attributes are dropped from the output.
 */
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];

export interface EmailMarkupOptions {
  /**
   * Column gap of a `gap-*` / `gap-x-*` token in px. Default: arbitrary px (`gap-[16px]`) and the numeric scale
   * (`gap-4` = 16px); a host with its own spacing tokens (`gap-space-sm`) passes their compiled value.
   */
  gap?: (token: string) => number | undefined;
}

const BLOCK_TAGS = new Set(["div", "section", "header", "footer", "main", "article", "aside", "nav"]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["style", "script"]);
const TABLE = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

const PREFIX_RE = /^(sm|md|lg|xl|2xl):/;
const LAYOUT_RE = /^(flex|inline-flex|flex-row|flex-col|flex-wrap|flex-nowrap|flex-1|flex-auto|flex-none|grow|shrink-0|grid|grid-cols-\d+|items-(start|center|end|stretch|baseline)|justify-(start|center|end|between|around|evenly)|gap(-[xy])?-.+|place-.+|self-.+)$/;

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Default column gap: `gap-[16px]`, `gap-x-[1rem]`, the numeric scale (`gap-4` = 16px) and `gap-px`. */
export function defaultGap(token: string): number | undefined {
  const m = /^gap(?:-x)?-(.+)$/.exec(token);
  if (!m) return undefined;
  const v = m[1]!;
  if (v === "px") return 1;
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v) * 4;
  const arb = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(v);
  if (arb) return parseFloat(arb[1]!) * (arb[2] === "rem" ? 16 : 1);
  return undefined;
}

interface Layout {
  columns: number;
  valign: "top" | "middle" | "bottom";
  gapToken: string | null;
}

/** The desktop layout of a wrapper: a prefixed token (`md:flex-row`) overrides its unprefixed counterpart. */
function readLayout(tokens: readonly string[]): Layout {
  const base = tokens.filter((t) => !PREFIX_RE.test(t));
  const desktop = tokens.filter((t) => PREFIX_RE.test(t)).map((t) => t.replace(PREFIX_RE, ""));
  const pick = (re: RegExp) => [...desktop].reverse().find((t) => re.test(t)) ?? [...base].reverse().find((t) => re.test(t));
  const isFlex = !!pick(/^(flex|inline-flex)$/);
  const direction = pick(/^flex-(row|col)$/);
  const isGrid = !!pick(/^grid$/);
  const cols = pick(/^grid-cols-\d+$/);
  let columns = 0;
  if (isFlex && direction !== "flex-col") columns = -1; // one column per child
  if (isGrid && cols) columns = Math.max(0, parseInt(cols.slice("grid-cols-".length), 10)) || 0;
  if (columns === 1) columns = 0;
  const items = pick(/^items-(start|center|end)$/);
  return {
    columns,
    valign: items === "items-center" ? "middle" : items === "items-end" ? "bottom" : "top",
    gapToken: pick(/^gap(-x)?-.+$/) ?? null,
  };
}

const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const classTokens = (el: Element) => (attr(el, "class") ?? "").split(/\s+/).filter(Boolean);
const keptAttrs = (el: Element, drop: readonly string[] = []) =>
  el.attrs.filter((a) => !a.name.startsWith("data-email-") && !a.name.startsWith("data-edit-") && !drop.includes(a.name));
const attrString = (attrs: ReadonlyArray<{ name: string; value: string }>) => attrs.map((a) => (a.value === "" && a.name !== "alt" ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join("");
const isElement = (n: Node): n is Element => "tagName" in n;
const isBlank = (n: Node) => n.nodeName === "#text" && !(n as { value: string }).value.trim();

type Align = "left" | "center" | "right";

/** `text-left|center|right` (the last one wins; a responsive one is the desktop value). */
function textAlignOf(tokens: readonly string[]): Align | null {
  const hit = [...tokens].reverse().find((t) => /^((sm|md|lg):)?text-(left|center|right)$/.test(t));
  return hit ? (hit.replace(PREFIX_RE, "").slice(5) as Align) : null;
}

function joinStyle(...parts: Array<string | undefined>): string {
  return parts.map((p) => (p ?? "").trim().replace(/;$/, "")).filter(Boolean).join(";");
}

export function toEmailMarkup(html: string, opts: EmailMarkupOptions = {}): string {
  const gapOf = (token: string | null): number => (token ? (opts.gap?.(token) ?? defaultGap(token) ?? 0) : 0);

  const children = (nodes: readonly Node[], align: Align): string => nodes.map((n) => node(n, align)).join("");

  function node(n: Node, align: Align): string {
    if (n.nodeName === "#text") return escText((n as { value: string }).value);
    if (n.nodeName === "#comment") return `<!--${(n as { data: string }).data}-->`;
    if (!isElement(n)) return "";
    const tag = n.tagName;
    if (BLOCK_TAGS.has(tag)) return block(n, align);
    if (tag === "a" && isButton(n)) return button(n, align);
    if (tag === "img") return image(n, align);
    if (tag === "template") return "";
    const inner = RAW_TEXT_TAGS.has(tag) ? n.childNodes.map((c) => (c as { value?: string }).value ?? "").join("") : children(n.childNodes, textAlignOf(classTokens(n)) ?? align);
    return VOID_TAGS.has(tag) ? `<${tag}${attrString(keptAttrs(n))}>` : `<${tag}${attrString(keptAttrs(n))}>${inner}</${tag}>`;
  }

  function block(el: Element, inherited: Align): string {
    const tokens = classTokens(el);
    const layout = readLayout(tokens);
    const own = textAlignOf(tokens);
    const align = own ?? inherited;
    // The table: width, an optional px cap, centring.
    const maxW = [...tokens].reverse().find((t) => /^max-w-\[\d+px\]$/.test(t));
    const centred = tokens.includes("mx-auto");
    const cellClass = tokens.filter((t) => !LAYOUT_RE.test(t.replace(PREFIX_RE, "")) && t !== maxW && t !== "mx-auto").join(" ");
    const tableStyle = maxW ? `max-width:${maxW.slice(7, -3)}px${centred ? ";margin:0 auto" : ""}` : "";
    const tableAttrs = `${TABLE} width="100%"${centred ? ` align="center"` : ""}${tableStyle ? ` style="${tableStyle}"` : ""}`;
    const cellAttrs = keptAttrs(el, ["class"]);
    const cell = `<td${cellClass ? ` class="${escAttr(cellClass)}"` : ""}${own && own !== "left" ? ` align="${own}"` : ""}${attrString(cellAttrs)}>`;
    const inner = layout.columns ? columns(el, layout, align) : children(el.childNodes, align);
    return `<table ${tableAttrs}><tr>${cell}${inner}</td></tr></table>`;
  }

  function columns(el: Element, layout: Layout, align: Align): string {
    const kids = el.childNodes.filter((c) => !isBlank(c) && c.nodeName !== "#comment");
    if (!kids.length) return "";
    const perRow = layout.columns === -1 ? kids.length : layout.columns;
    const gap = gapOf(layout.gapToken);
    const rows: Node[][] = [];
    for (let i = 0; i < kids.length; i += perRow) rows.push(kids.slice(i, i + perRow));
    const width = `${Math.floor(100 / perRow)}%`;
    const tr = (row: Node[]) =>
      row
        .map((kid, i) => {
          const pad = gap ? joinStyle(i > 0 ? `padding-left:${gap / 2}px` : "", i < perRow - 1 ? `padding-right:${gap / 2}px` : "") : "";
          return `<td class="ph-col" width="${width}" valign="${layout.valign}"${pad ? ` style="${pad}"` : ""}>${node(kid, align)}</td>`;
        })
        .join("");
    return `<table ${TABLE} width="100%">${rows.map((r) => `<tr>${tr(r)}</tr>`).join("")}</table>`;
  }

  function isButton(el: Element): boolean {
    return attr(el, "data-email-role") === "button" || classTokens(el).some((t) => /^bg-/.test(t));
  }

  /** The background box (fill, border, radius) goes on a cell, the text and padding stay on the link. */
  function button(el: Element, align: Align): string {
    const tokens = classTokens(el);
    const box = tokens.filter((t) => /^(bg-|rounded|border)/.test(t));
    const text = tokens.filter((t) => !box.includes(t) && !/^(inline-block|inline-flex|block|flex|items-.+|justify-.+|gap-.+)$/.test(t));
    const link = `<a${attrString(keptAttrs(el, ["class", "style"]))}${text.length ? ` class="${escAttr(text.join(" "))}"` : ""} style="${escAttr(joinStyle("display:inline-block", attr(el, "style")))}">${children(el.childNodes, align)}</a>`;
    const tableAlign = align === "left" ? "" : ` align="${align}"`;
    return `<table ${TABLE}${tableAlign}><tr><td${box.length ? ` class="${escAttr(box.join(" "))}"` : ""} align="center">${link}</td></tr></table>`;
  }

  function image(el: Element, align: Align): string {
    const style = align === "left" ? joinStyle("display:block", attr(el, "style")) : attr(el, "style");
    const attrs = [...keptAttrs(el, ["style", "border"]), { name: "border", value: "0" }, ...(style ? [{ name: "style", value: style }] : [])];
    if (!attrs.some((a) => a.name === "alt")) attrs.push({ name: "alt", value: "" });
    return `<img${attrString(attrs)}>`;
  }

  return children(parseFragment(html).childNodes as Node[], "left");
}
