/**
 * The editor's view of a parsed file: HTML elements and Liquid blocks as nodes, Liquid
 * branches as slots, and text / `{{ }}` outputs as leaf content. Every node keeps its
 * source range, so a click on the canvas maps back to bytes and an edit maps to a splice.
 */
import {
  isBlankText,
  isElement,
  isLiquidBlock,
  elementName,
  segmentsText,
  NodeTypes,
  type DocumentNode,
  type ElementNode,
  type LiquidBlockNode,
  type LiquidHtmlNode,
  type Range,
} from "./parse";

interface TreeNodeBase {
  /** Document-order key, unique within one `buildTree` result. Not stable across edits — `data-edit-id` is. */
  key: string;
  range: Range;
  node: LiquidHtmlNode;
}

export interface TreeAttribute {
  /** Static name (`{{…}}` marks Liquid inside a name, a lint error); the raw source for a Liquid entry. */
  name: string;
  range: Range;
  /** True when this "attribute" is a Liquid tag or output sitting in the attribute list. */
  liquid: boolean;
}

export interface ElementTreeNode extends TreeNodeBase {
  kind: "element";
  tag: string;
  node: ElementNode;
  /** The opening tag `<div …>`. */
  openTag: Range;
  /** The closing tag `</div>`; null for void and self-closing elements. */
  closeTag: Range | null;
  attributes: TreeAttribute[];
  children: TreeNode[];
}

export interface TreeBranch {
  /** `main` for the first branch, else the branch tag (`else`, `elsif`, `when`); `body` for tags without branches. */
  name: string;
  range: Range;
  children: TreeNode[];
}

export interface BlockTreeNode extends TreeNodeBase {
  kind: "liquid-block";
  tag: string;
  node: LiquidBlockNode;
  openTag: Range;
  closeTag: Range;
  branches: TreeBranch[];
}

export interface ContentTreeNode extends TreeNodeBase {
  kind: "content";
  /** Parser node type: `TextNode`, `LiquidVariableOutput`, `HtmlComment`, `LiquidTag` (non-block), … */
  type: string;
}

export type TreeNode = ElementTreeNode | BlockTreeNode | ContentTreeNode;

const range = (p: Range): Range => ({ start: p.start, end: p.end });

/**
 * Build the editor tree. `if` / `unless` / `case` / `for` hold `LiquidBranch` children;
 * `form` / `paginate` / `capture` hold their body directly — both become `branches[]`.
 */
export function buildTree(ast: DocumentNode): TreeNode[] {
  let next = 0;
  const visitAll = (nodes: LiquidHtmlNode[]): TreeNode[] =>
    nodes.flatMap((n) => {
      const t = visit(n);
      return t ? [t] : [];
    });

  const visit = (n: LiquidHtmlNode): TreeNode | null => {
    if (isElement(n)) {
      const key = `n${next++}`;
      const closeTag = "blockEndPosition" in n && n.blockEndPosition ? range(n.blockEndPosition) : null;
      return {
        key,
        kind: "element",
        tag: elementName(n),
        node: n,
        range: range(n.position),
        openTag: range(n.blockStartPosition),
        closeTag,
        attributes: n.attributes.map((a) => {
          const liquid = a.type === NodeTypes.LiquidTag || a.type === NodeTypes.LiquidVariableOutput;
          return {
            name: liquid ? a.source.slice(a.position.start, a.position.end) : segmentsText((a as unknown as { name: Parameters<typeof segmentsText>[0] }).name),
            range: range(a.position),
            liquid,
          };
        }),
        children: "children" in n && Array.isArray(n.children) ? visitAll(n.children) : [],
      };
    }
    if (isLiquidBlock(n)) {
      const key = `n${next++}`;
      const branched = n.children.length > 0 && n.children.every((c) => c.type === NodeTypes.LiquidBranch);
      const branches: TreeBranch[] = branched
        ? n.children.map((b) => {
            const branch = b as Extract<LiquidHtmlNode, { type: NodeTypes.LiquidBranch }>;
            return {
              name: branch.name ?? "main",
              range: range(branch.position),
              children: visitAll(branch.children),
            };
          })
        : [
            {
              name: "body",
              range: { start: n.blockStartPosition.end, end: n.blockEndPosition.start },
              children: visitAll(n.children),
            },
          ];
      return {
        key,
        kind: "liquid-block",
        tag: n.name,
        node: n,
        range: range(n.position),
        openTag: range(n.blockStartPosition),
        closeTag: range(n.blockEndPosition),
        branches,
      };
    }
    if (isBlankText(n)) return null;
    return { key: `n${next++}`, kind: "content", type: n.type, node: n, range: range(n.position) };
  };

  return visitAll(ast.children);
}

/** All tree nodes in document order. */
export function flattenTree(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const go = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.kind === "element") go(n.children);
      else if (n.kind === "liquid-block") n.branches.forEach((b) => go(b.children));
    }
  };
  go(tree);
  return out;
}

/** Children of a tree node across all its branches. */
export function childrenOf(node: TreeNode): TreeNode[] {
  if (node.kind === "element") return node.children;
  if (node.kind === "liquid-block") return node.branches.flatMap((b) => b.children);
  return [];
}

/**
 * The path from the outermost node to the innermost one containing `offset` — what a
 * click on the canvas resolves to. Empty when the offset is in top-level whitespace.
 */
export function pathAtOffset(tree: TreeNode[], offset: number): TreeNode[] {
  const path: TreeNode[] = [];
  let level = tree;
  for (;;) {
    const hit = level.find((n) => n.range.start <= offset && offset < n.range.end);
    if (!hit) return path;
    path.push(hit);
    level = childrenOf(hit);
  }
}
