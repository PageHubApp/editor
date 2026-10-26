/**
 * `TransactionBuilder` (`ctx.tr`): every edit verb resolves its handles in the text as
 * edited so far, builds splices with the edit ops (whitespace rules unchanged), and records
 * one mapping step. `done()` composes the steps into one transaction and checks every
 * changed file still parses strict.
 */
import {
  EditError,
  insertSplices,
  lineSplices,
  moveSplices,
  removeSplices,
  replaceSplices,
  setAttributeSplices,
  setTagArgumentSplices,
  setTextSplices,
  wrapSplices,
  type ContainerNode,
  type InsertTarget,
  type Splice,
  type TagWithArguments,
} from "../edit/ops";
import { parseSource, isBlankText } from "../parse/parse";
import { parserTagsFacet } from "../extensions/facets";
import { ChangeSet, type Files, type Path } from "./changes";
import { Mapping, relocation, type MapStep, type Relocation } from "./mapping";
import { SourceTree, type EditorState, type EffectValue, type StateEffect } from "./state";
import { Transaction, type Annotations } from "./transaction";
import type { NodeHandle } from "./handles";
import type { TreeNode } from "../parse/tree";

export type InsertPoint = { before: NodeHandle } | { after: NodeHandle } | { prepend: NodeHandle } | { append: NodeHandle };

export class TransactionBuilder {
  private files: Files;
  private readonly steps: MapStep[] = [];
  private readonly effects: EffectValue<unknown>[] = [];
  private annotations: Partial<Annotations> = {};
  private readonly trees = new Map<Path, SourceTree>();

  constructor(readonly startState: EditorState) {
    this.files = startState.files;
  }

  /** True once any verb changed text. */
  get docChanged(): boolean {
    return this.steps.length > 0;
  }

  /** True once any effect was attached. */
  get hasEffects(): boolean {
    return this.effects.length > 0;
  }

  /** Current (edited-so-far) text of a file. */
  text(path: Path): string {
    const t = this.files.get(path);
    if (t === undefined) throw new EditError(`no file ${path}`);
    return t;
  }

  private tree(path: Path): SourceTree {
    const text = this.text(path);
    if (!this.steps.length) return this.startState.tree(path);
    let t = this.trees.get(path);
    if (!t || t.text !== text) {
      t = new SourceTree(path, text, parseSource(text, "strict", { env: this.startState.facet(parserTagsFacet) }));
      this.trees.set(path, t);
    }
    return t;
  }

  private mapping(): Mapping {
    return new Mapping(this.steps);
  }

  /** The handle's node in the text as edited so far. */
  private resolve(h: NodeHandle): TreeNode {
    if (!h.alive) throw new EditError(`handle on <${h.tag}> is dead`);
    const r = this.mapping().mapRange(h.path, h.range.from, h.range.to);
    const treeKind = h.kind === "element" || h.kind === "liquid-block" ? h.kind : "content";
    const n = r && this.tree(h.path).at(r.from, r.to, treeKind);
    if (!n) throw new EditError(`<${h.tag}> was removed earlier in this transaction`);
    return n;
  }

  private step(path: Path, splices: Splice[], relocations: Relocation[] = []): this {
    if (!splices.length) return this;
    const changes = ChangeSet.ofFile(path, splices);
    const inverse = changes.invert(this.files);
    this.files = changes.apply(this.files);
    this.steps.push({ changes, inverse, relocations });
    return this;
  }

  private target(at: InsertPoint): { path: Path; target: InsertTarget } {
    if ("before" in at) return { path: at.before.path, target: { anchor: this.resolve(at.before).node, where: "before" } };
    if ("after" in at) return { path: at.after.path, target: { anchor: this.resolve(at.after).node, where: "after" } };
    const parent = "prepend" in at ? at.prepend : at.append;
    const n = this.resolve(parent);
    if (n.kind === "content") throw new EditError(`<${parent.tag}> cannot have children`);
    return { path: parent.path, target: { parent: n.node as ContainerNode, where: "prepend" in at ? "prepend" : "append" } };
  }

  insert(at: InsertPoint, snippet: string): this {
    const { path, target } = this.target(at);
    return this.step(path, insertSplices(this.text(path), snippet, target));
  }

  move(h: NodeHandle, to: InsertPoint): this {
    const n = this.resolve(h);
    const { path, target } = this.target(to);
    if (path !== h.path) throw new EditError("move across files is not supported; remove + insert instead");
    const text = this.text(path);
    const { splices, landed } = moveSplices(text, n.node, target);
    const old = text.slice(n.range.start, n.range.end);
    return this.step(path, splices, [relocation(path, n.range.start, old, landed.from, landed.text, lineSplices(old, landed.text))]);
  }

  remove(h: NodeHandle): this {
    return this.step(h.path, removeSplices(this.text(h.path), this.resolve(h).node));
  }

  setAttr(h: NodeHandle, name: string, value: string | null): this {
    const n = this.resolve(h);
    if (n.kind !== "element") throw new EditError(`setAttr needs an element, got ${h.kind}`);
    const text = this.text(h.path);
    // trim each splice to the bytes that differ, so a class tweak is a one-token diff
    const splices = setAttributeSplices(text, n.node, name, value).map((sp) => {
      const old = text.slice(sp.from, sp.to);
      let p = 0;
      while (p < old.length && p < sp.insert.length && old[p] === sp.insert[p]) p++;
      let q = 0;
      while (q < old.length - p && q < sp.insert.length - p && old[old.length - 1 - q] === sp.insert[sp.insert.length - 1 - q]) q++;
      return { from: sp.from + p, to: sp.to - q, insert: sp.insert.slice(p, sp.insert.length - q) };
    });
    return this.step(h.path, splices.filter((sp) => sp.from !== sp.to || sp.insert));
  }

  /** Text of a text node, or the inner content of an element (escaped unless `raw`). */
  setText(h: NodeHandle, text: string, opts: { raw?: boolean } = {}): this {
    const n = this.resolve(h);
    this.annotations.group ??= h;
    if (n.kind === "content") return this.step(h.path, setTextSplices(n.range, text, opts));
    if (n.kind !== "element" || !n.closeTag) throw new EditError(`<${h.tag}> has no text content`);
    const real = n.children.filter((c) => !(c.kind === "content" && isBlankText(c.node)));
    const range = real.length ? { start: real[0]!.range.start, end: real.at(-1)!.range.end } : { start: n.openTag.end, end: n.openTag.end };
    return this.step(h.path, setTextSplices(range, text, opts));
  }

  /** Replace a node, or a raw range given in the start state's coordinates. */
  replace(h: NodeHandle | { path: Path; from: number; to: number }, text: string): this {
    if ("alive" in h) return this.step(h.path, replaceSplices(this.resolve(h).node, text));
    const m = this.mapping();
    const from = m.map(h.from, h.path, 1);
    return this.step(h.path, replaceSplices({ start: from, end: Math.max(from, m.map(h.to, h.path, -1)) }, text));
  }

  wrap(h: NodeHandle, open: string, close: string): this {
    return this.step(h.path, wrapSplices(this.text(h.path), this.resolve(h).node, open, close));
  }

  /** Set a Liquid tag argument (value is source text); a missing argument is appended. */
  setTagArg(h: NodeHandle, name: string, valueSource: string): this {
    const n = this.resolve(h);
    if (h.kind !== "liquid-block" && h.kind !== "liquid-tag") throw new EditError(`setTagArg needs a Liquid tag, got <${h.tag}>`);
    return this.step(h.path, setTagArgumentSplices(this.text(h.path), n.node as unknown as TagWithArguments, name, valueSource, { add: true }));
  }

  /** Rename an element's tag (open and close tag). */
  setTagName(h: NodeHandle, name: string): this {
    const n = this.resolve(h);
    if (n.kind !== "element") throw new EditError(`setTagName needs an element, got ${h.kind}`);
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new EditError(`invalid tag name "${name}"`);
    const splices: Splice[] = [{ from: n.openTag.start + 1, to: n.openTag.start + 1 + n.tag.length, insert: name }];
    if (n.closeTag) splices.push({ from: n.closeTag.start + 2, to: n.closeTag.start + 2 + n.tag.length, insert: name });
    return this.step(h.path, splices);
  }

  /** Append raw change steps (undo, redo, remote); they must start at the text as edited so far. */
  applyMapping(m: Mapping): this {
    for (const s of m.steps) {
      this.files = s.changes.apply(this.files);
      this.steps.push(s);
    }
    return this;
  }

  applyChanges(cs: ChangeSet): this {
    return cs.empty ? this : this.applyMapping(Mapping.of(cs, cs.invert(this.files)));
  }

  effect<T>(e: StateEffect<T>, value: T): this {
    this.effects.push({ type: e, value });
    return this;
  }

  annotate(a: Partial<Annotations>): this {
    this.annotations = { ...this.annotations, ...a };
    return this;
  }

  /** The finished transaction. Every changed file must still parse strict. */
  done(): Transaction {
    let changes = ChangeSet.empty;
    for (const s of this.steps) changes = changes.compose(s.changes);
    for (const path of changes.paths) {
      try {
        this.tree(path);
      } catch (e) {
        throw new EditError(`edit leaves ${path} unparseable: ${(e as Error).message}`);
      }
    }
    return Transaction.create(this.startState, {
      changes,
      mapping: this.mapping(),
      effects: this.effects,
      annotations: this.annotations,
      trees: [...this.trees.values()],
    });
  }
}
