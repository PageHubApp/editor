import { NodeTypes, allNodes, parseSource, segmentsText, type LiquidHtmlNode } from "@pagehub/engine";
import { useRunCommand } from "../../../../react/bindings";
import { Chip } from "../../../../primitives/Chip";
import { ToolbarSegmentedControl } from "../../../toolbar/primitives/ToolbarSegmentedControl";
import { IconInput } from "../../../pickers/IconInput";
import { useLeafInner, type ElementControlProps } from "./elementControlShared";

/** A leaf's icon: its ref (empty for the image form) and the source range of the whole icon, wrapper element included. */
interface LeafIcon {
  ref: string;
  start: number;
  end: number;
}

/** A `<span>` whose only (non-blank) child satisfies `ok`: the Icon element's shape. */
function isSpanAround(n: LiquidHtmlNode, ok: (child: LiquidHtmlNode) => boolean): boolean {
  if (n.type !== NodeTypes.HtmlElement || segmentsText(n.name) !== "span") return false;
  const kids = n.children.filter((c) => !(c.type === NodeTypes.TextNode && !c.value.trim()));
  return kids.length === 1 && ok(kids[0]!);
}

/** `<img class="size-full object-contain">`: the image form of an icon (`isIconImage` in the engine). */
function isIconImg(n: LiquidHtmlNode): boolean {
  if (n.type !== NodeTypes.HtmlVoidElement || segmentsText(n.name as string) !== "img") return false;
  const cls = n.attributes.find((a) => "name" in a && segmentsText(a.name as string) === "class");
  const value = cls && "value" in cls && Array.isArray(cls.value) ? cls.value.map((v) => ("value" in v ? String(v.value) : "")).join("") : "";
  return value.split(/\s+/).includes("size-full") && value.split(/\s+/).includes("object-contain");
}

/**
 * The first icon in a leaf's inner source, read from the engine's parse: a `{{ 'set/Name' | icon }}` output, widened to
 * its `<span>` when that span holds nothing else (the Icon element's form, `iconFilterOf`), or the image form of an icon
 * (`isIconImage`) which has no ref. The range always covers the whole icon, so the text around it never includes its markup.
 */
function findIcon(inner: string): LeafIcon | null {
  let doc;
  try {
    doc = parseSource(inner, "tolerant");
  } catch {
    return null;
  }
  for (const [node, parent] of allNodes(doc)) {
    if (node.type !== NodeTypes.LiquidVariableOutput || typeof node.markup === "string") continue;
    const { expression, filters } = node.markup;
    if (expression.type !== NodeTypes.String || filters[0]?.name !== "icon" || !expression.value) continue;
    const wrapper = parent && isSpanAround(parent, (c) => c === node) ? parent : null;
    const range = wrapper ?? node;
    return { ref: expression.value, start: range.position.start, end: range.position.end };
  }
  for (const [node] of allNodes(doc)) {
    if (isSpanAround(node, isIconImg)) return { ref: "", start: node.position.start, end: node.position.end };
  }
  return null;
}

/** A leaf's inner split into its icon (ref + raw markup), the icon's side, and the label around it. */
export function parseLeafInner(inner: string): { ref: string; source: string; position: "before" | "after"; text: string } {
  const icon = findIcon(inner);
  if (!icon) return { ref: "", source: "", position: "before", text: inner.trim() };
  const before = inner.slice(0, icon.start).trim();
  const after = inner.slice(icon.end).trim();
  return { ref: icon.ref, source: inner.slice(icon.start, icon.end), position: before && !after ? "after" : "before", text: `${before} ${after}`.trim() };
}

/** Split a leaf's inner into its icon ref, the icon's side, and the remaining label. */
export function parseIconInner(inner: string): { ref: string; position: "before" | "after"; text: string } {
  const { ref, position, text } = parseLeafInner(inner);
  return { ref, position, text };
}

/** The icon markup for `ref`: the existing icon with its ref swapped (keeps its wrapper and attributes), else a bare output. */
function iconMarkup(ref: string, prev: { ref: string; source: string }): string {
  return prev.ref && prev.source ? prev.source.split(prev.ref).join(ref) : `{{ '${ref}' | icon }}`;
}

/** Rebuild a leaf's inner from its icon markup (`""` = none), the icon's side and the label. */
export function buildLeafInner(icon: string, position: "before" | "after", text: string): string {
  if (!icon) return text;
  if (!text) return icon;
  return position === "after" ? `${text} ${icon}` : `${icon} ${text}`;
}

/** Rebuild a leaf's inner from an icon ref, its side and the label. */
export function buildIconInner(ref: string, position: "before" | "after", text: string): string {
  return buildLeafInner(ref ? `{{ '${ref}' | icon }}` : "", position, text);
}

const ICON_POSITION_OPTIONS: { value: "before" | "after"; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];

/**
 * Button / Link inline **Icon** picker. The icon is an inline `{{ 'tb/TbPhone' | icon }}` output living inside
 * the element's text, before or after the label — so the ref round-trips through the leaf's inner source. The
 * `IconInput` opens the `IconPicker` slot and writes a `<set>/<Name>` ref; a Before / After toggle appears once set.
 */
export function IconValueControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const inner = useLeafInner(handle);
  const leaf = parseLeafInner(inner);
  const { ref, position, text } = leaf;
  const write = (nextRef: string, nextPos: "before" | "after" = position) =>
    run("text.setInner", { target: handle, source: buildLeafInner(nextRef ? iconMarkup(nextRef, leaf) : "", nextPos, text) });
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-icon-control="">
      <IconInput label="Icon" value={ref} onChange={(v) => write(v)} />
      {ref && (
        <Chip label="Position" frame="bare">
          <div className="min-w-0 flex-1">
            <ToolbarSegmentedControl<"before" | "after"> dense aria-label="Icon position" value={position} onChange={(p) => write(ref, p)} options={ICON_POSITION_OPTIONS} />
          </div>
        </Chip>
      )}
    </div>
  );
}

