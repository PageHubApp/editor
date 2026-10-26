/**
 * Handles: what plugins hold instead of offsets. A handle names one node of one file; the
 * registry remaps every live handle through each transaction's mapping (a move relocates
 * it, a removal kills it), and handle objects are shared — asking twice for the same node
 * returns the same handle.
 */
import { findAttribute, readTagArguments, type TagArgument, type TagWithArguments } from "../edit/ops";
import { childrenOf, pathAtOffset, type TreeNode } from "../parse/tree";
import { NodeTypes } from "../parse/parse";
import { resolveElement } from "../elements/resolve";
import { sessionIdentity, type Identity } from "../identity/session";
import type { ElementDef } from "../elements/defineElement";
import type { EditorState, Path } from "./state";
import type { Transaction } from "./transaction";

export type HandleKind = "element" | "liquid-block" | "liquid-tag" | "text";

export interface NodeHandle {
  readonly path: Path;
  /** False once its node was removed. */
  readonly alive: boolean;
  readonly kind: HandleKind;
  /** Element tag (`section`), Liquid tag name (`for`, `section`), or `#text` / `#output` / `#comment`. */
  readonly tag: string;
  /** Current source range (session coordinates; changes with every edit). */
  readonly range: { readonly from: number; readonly to: number };
  attr(name: string): string | undefined;
  classes(): string[];
  /** Liquid tag arguments. */
  args(): TagArgument[];
  parent(): NodeHandle | null;
  children(): NodeHandle[];
  is<E extends ElementDef<any>>(el: E): this is ElementHandle<E>;
  /** The element definition that claims this node (every kind resolves to one: HTML, Liquid tag or text fallback). */
  readonly element: ElementDef<any>;
  /** `data-edit-id` under persisted identity; null in session mode. */
  id(): string | null;
  /** The node's source text. */
  text(): string;
  /** The tree node in the current state (internal; throws when dead). */
  node(): TreeNode;
}

export interface ElementHandle<E extends ElementDef<any>> extends NodeHandle {
  readonly element: E;
}

const kindOf = (n: TreeNode): HandleKind =>
  n.kind === "content" ? (n.type === NodeTypes.LiquidTag ? "liquid-tag" : "text") : n.kind;

const tagOf = (n: TreeNode): string => {
  if (n.kind === "element") return n.tag;
  if (n.kind === "liquid-block") return n.tag;
  if (n.type === NodeTypes.LiquidTag) return (n.node as { name: string }).name;
  return n.type === NodeTypes.TextNode ? "#text" : n.type === NodeTypes.LiquidVariableOutput ? "#output" : n.type === NodeTypes.HtmlComment ? "#comment" : `#${n.type}`;
};

class Handle implements NodeHandle {
  dead = false;
  constructor(
    private readonly reg: HandleRegistry,
    readonly path: Path,
    public from: number,
    public to: number,
    readonly treeKind: TreeNode["kind"],
    readonly kind: HandleKind,
    readonly tag: string,
  ) {}

  get alive(): boolean {
    return !this.dead;
  }

  get range() {
    return { from: this.from, to: this.to };
  }

  get element(): ElementDef<any> {
    return resolveElement(this.reg.state, this.node(), this.reg.state.tree(this.path));
  }

  node(): TreeNode {
    if (this.dead) throw new Error(`handle on <${this.tag}> in ${this.path} is dead`);
    const n = this.reg.state.tree(this.path).at(this.from, this.to, this.treeKind);
    if (!n) throw new Error(`handle on <${this.tag}> in ${this.path} lost its node`);
    return n;
  }

  text(): string {
    return this.reg.state.files.get(this.path)!.slice(this.from, this.to);
  }

  attr(name: string): string | undefined {
    const n = this.node();
    if (n.kind !== "element") return undefined;
    const a = findAttribute(n.node, name);
    if (!a) return undefined;
    return "attributePosition" in a ? this.reg.state.files.get(this.path)!.slice(a.attributePosition.start, a.attributePosition.end) : "";
  }

  classes(): string[] {
    return (this.attr("class") ?? "").split(/\s+/).filter(Boolean);
  }

  args(): TagArgument[] {
    const n = this.node();
    if (this.kind !== "liquid-block" && this.kind !== "liquid-tag") return [];
    return readTagArguments(this.reg.state.files.get(this.path)!, n.node as unknown as TagWithArguments);
  }

  parent(): NodeHandle | null {
    const p = this.reg.state.tree(this.path).parent(this.node());
    return p ? this.reg.of(this.path, p) : null;
  }

  children(): NodeHandle[] {
    return childrenOf(this.node()).map((c) => this.reg.of(this.path, c));
  }

  is<E extends ElementDef<any>>(el: E): this is ElementHandle<E> {
    return !this.dead && resolveElement(this.reg.state, this.node(), this.reg.state.tree(this.path)) === el;
  }

  id(): string | null {
    return this.reg.identity.id(this);
  }
}

export class HandleRegistry {
  private readonly cache = new Map<string, Handle>();

  constructor(
    public state: EditorState,
    readonly identity: Identity = sessionIdentity,
  ) {}

  /** The handle for a tree node of `path` in the current state. */
  of(path: Path, n: TreeNode): NodeHandle {
    const key = `${path}:${n.range.start}:${n.range.end}:${n.kind}`;
    let h = this.cache.get(key);
    if (!h) {
      h = new Handle(this, path, n.range.start, n.range.end, n.kind, kindOf(n), tagOf(n));
      this.cache.set(key, h);
    }
    return h;
  }

  /** The innermost node containing `offset`. */
  at(path: Path, offset: number): NodeHandle | null {
    let nodes;
    try { nodes = this.state.tree(path).nodes; }
    catch { return null; } // a file that doesn't parse has no handles; the canvas reports it instead
    const hit = pathAtOffset(nodes, offset).at(-1);
    return hit ? this.of(path, hit) : null;
  }

  /** Remap every live handle through `tr` into `next` (called before fields update). */
  remap(tr: Transaction, next: EditorState): void {
    this.state = next;
    if (tr.changes.empty) return;
    const changed = new Set(tr.changes.paths);
    const live = [...this.cache.values()];
    this.cache.clear();
    for (const h of live) {
      if (changed.has(h.path)) {
        const r = tr.mapping.mapRange(h.path, h.from, h.to);
        let ok = !!r;
        if (r) {
          h.from = r.from;
          h.to = r.to;
          try {
            ok = !!next.tree(h.path).at(r.from, r.to, h.treeKind);
          } catch {
            ok = true; // unparseable remote text: keep the mapped range
          }
        }
        if (!ok) {
          h.dead = true;
          continue;
        }
      }
      const key = `${h.path}:${h.from}:${h.to}:${h.treeKind}`;
      if (!this.cache.has(key)) this.cache.set(key, h);
      else h.dead = true; // two handles collapsed onto one node; the first one keeps it
    }
  }
}
