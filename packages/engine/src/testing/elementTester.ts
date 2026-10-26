/**
 * `ElementTester.run(el, cases)`: reads and writes an element's props on small fixtures.
 * Each case parses `code`, takes the first node that resolves to `el`, checks `read`
 * values, and applies `write` — asserting the exact output and that the edit touched only
 * the bytes that had to change. Throws (node:assert) on the first failure.
 */
import assert from "node:assert/strict";
import { createStore } from "../state/store";
import type { Extension } from "../extensions/extension";
import type { ElementDef } from "../elements/defineElement";
import type { BindingOptions } from "../elements/bindings";

export interface ElementCase {
  code: string;
  read?: Record<string, unknown>;
  write?: { prop: string; value: unknown; output: string } & BindingOptions;
  /** Read with a class variant. */
  variant?: string;
}

const PATH = "index.liquid";

/** A minimal edit deletes and inserts no more than the prefix/suffix diff window requires. */
export function assertMinimalChange(before: string, after: string, changes: readonly { from: number; to: number; insert: string }[]): void {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  const deleted = changes.reduce((n, c) => n + (c.to - c.from), 0);
  const inserted = changes.reduce((n, c) => n + c.insert.length, 0);
  assert.ok(deleted <= before.length - p - q, `edit replaced ${deleted} chars where ${before.length - p - q} had to change`);
  assert.ok(inserted <= after.length - p - q, `edit wrote ${inserted} chars where ${after.length - p - q} had to change`);
}

export const ElementTester = {
  run(el: ElementDef<any>, cases: ElementCase[], opts: { extensions?: Extension } = {}): void {
    for (const c of cases) {
      const store = createStore({ files: { [PATH]: c.code }, extensions: [el, opts.extensions ?? []] });
      const tree = store.state.tree(PATH);
      const node = tree.flat.find((n) => store.registry.of(PATH, n).is(el));
      assert.ok(node, `no node in ${JSON.stringify(c.code)} resolves to "${el.name}"`);
      const h = store.registry.of(PATH, node);
      for (const [prop, want] of Object.entries(c.read ?? {})) {
        assert.deepEqual(el.readProp(h, prop, { variant: c.variant }), want, `read ${prop} of ${JSON.stringify(c.code)}`);
      }
      if (c.write) {
        const { prop, value, output, ...bopts } = c.write;
        const tr = el.write(store.builder(), h, prop, value as never, bopts).done();
        store.dispatch(tr);
        assert.equal(store.state.files.get(PATH), output, `write ${prop} = ${JSON.stringify(value)}`);
        assertMinimalChange(c.code, output, tr.changes.splices(PATH));
      }
    }
  },
};
