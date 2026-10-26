/**
 * The TipTap schema for a rich-text leaf: an inline-only document (no paragraphs — the leaf
 * element itself is the block), text, `<br>`, `{{ output }}` chips, raw inline atoms (`<img>`,
 * `<wbr>`) and one mark per inline element kind. Every mark keeps the element's original open
 * tag in `src`, so untouched markup serializes back byte-exact; a mark a command creates or
 * changes has `src: null` and serializes canonically.
 */
import { Mark, Node, mergeAttributes, type Extensions, type KeyboardShortcutCommand } from "@tiptap/core";

export const NODE = { output: "liquidOutput", raw: "rawInline", br: "hardBreak" } as const;

/** Mark name → its canonical tag and the tags it parses from. */
export const MARK_TAGS = {
  bold: { tag: "strong", tags: ["strong", "b"], key: "Mod-b" },
  italic: { tag: "em", tags: ["em", "i"], key: "Mod-i" },
  underline: { tag: "u", tags: ["u"], key: "Mod-u" },
  strike: { tag: "s", tags: ["s", "del", "strike"], key: undefined },
  superscript: { tag: "sup", tags: ["sup"], key: undefined },
  subscript: { tag: "sub", tags: ["sub"], key: undefined },
  code: { tag: "code", tags: ["code"], key: undefined },
} as const;
export type SimpleMark = keyof typeof MARK_TAGS;

/** `class="…"` of a raw open tag. */
export const classOfSrc = (src: string | null | undefined): string | null => (src ? (/\sclass\s*=\s*["']([^"']*)["']/i.exec(src)?.[1] ?? null) : null);

const srcAttrs = (tag: string) => ({
  tag: { default: tag, rendered: false },
  src: { default: null, rendered: false },
});

function simpleMark(name: SimpleMark) {
  const spec = MARK_TAGS[name];
  return Mark.create({
    name,
    excludes: name === "superscript" ? "subscript" : name === "subscript" ? "superscript" : undefined,
    addAttributes: () => srcAttrs(spec.tag),
    parseHTML: () => spec.tags.map((tag) => ({ tag })),
    renderHTML: ({ mark }) => [mark.attrs.tag ?? spec.tag, { class: classOfSrc(mark.attrs.src) }, 0],
    addKeyboardShortcuts() {
      return spec.key ? { [spec.key]: () => this.editor.commands.toggleMark(name, { src: null }) } : {};
    },
  });
}

const Link = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes: () => ({ ...srcAttrs("a"), href: { default: null }, target: { default: null }, rel: { default: null } }),
  parseHTML: () => [{ tag: "a[href]" }],
  renderHTML: ({ HTMLAttributes }) => ["a", mergeAttributes(HTMLAttributes), 0],
});

/** Text colour / highlight: a `<span>` whose class is one theme token (`text-primary`, `bg-accent`). */
function tokenMark(name: "textColor" | "highlight", prefix: "text" | "bg") {
  return Mark.create({
    name,
    addAttributes: () => ({ ...srcAttrs("span"), token: { default: null, rendered: false } }),
    renderHTML: ({ mark }) => ["span", { class: `${prefix}-${mark.attrs.token}` }, 0],
  });
}

/** Any other inline element (`<span class>`, `<small>`, `<abbr>`, …), kept as written. */
const InlineEl = Mark.create({
  name: "inlineEl",
  addAttributes: () => srcAttrs("span"),
  renderHTML: ({ mark }) => [mark.attrs.tag, { class: classOfSrc(mark.attrs.src) }, 0],
});

const Doc = Node.create({ name: "doc", topNode: true, content: "inline*" });
const Text = Node.create({ name: "text", group: "inline" });

const HardBreak = Node.create({
  name: NODE.br,
  group: "inline",
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: "br" }],
  renderHTML: () => ["br"],
  addKeyboardShortcuts() {
    const br: KeyboardShortcutCommand = () => this.editor.commands.insertContent({ type: NODE.br });
    return { Enter: br, "Shift-Enter": br };
  },
});

function atom(name: string, label: (source: string) => string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: () => ({ source: { default: "", rendered: false } }),
    parseHTML: () => [{ tag: `span[data-rt-${name}]`, getAttrs: (el) => ({ source: (el as HTMLElement).getAttribute(`data-rt-${name}`) }) }],
    renderHTML: ({ node, HTMLAttributes }) => [
      "span",
      mergeAttributes(HTMLAttributes, { [`data-rt-${name}`]: node.attrs.source, class: "ph-rt-chip", contenteditable: "false" }),
      label(node.attrs.source as string),
    ],
  });
}

/** Every extension a rich-text leaf uses (plus the host's keyboard extension). */
export function richTextSchema(): Extensions {
  return [
    Doc,
    Text,
    HardBreak,
    atom(NODE.output, (s) => s),
    atom(NODE.raw, (s) => `<${/^<\s*([a-z0-9-]+)/i.exec(s)?.[1] ?? "?"}>`),
    ...(Object.keys(MARK_TAGS) as SimpleMark[]).map(simpleMark),
    Link,
    tokenMark("textColor", "text"),
    tokenMark("highlight", "bg"),
    InlineEl,
  ];
}

/** Theme tokens the colour panels offer. */
export const COLOR_TOKENS = ["primary", "secondary", "accent", "neutral", "base-content", "info", "success", "warning", "error"] as const;
