/**
 * `CommandTester.run(cmd, cases)`: each case opens `files`, optionally selects the nodes
 * matching `select` (in the first file), then checks the dry run and the run. `output:
 * false` means the command must not apply (and the dry run says so); a string is the
 * expected text of the first file. The dry run must never change state.
 */
import assert from "node:assert/strict";
import { createStore, type Store } from "../state/store";
import type { Extension } from "../extensions/extension";
import type { Command, UiContext } from "../commands/defineCommand";
import type { Path } from "../state/changes";

export interface CommandCase {
  files: Record<Path, string>;
  select?: string;
  /** Arguments, or a function of the store (to pass handles). */
  args?: unknown | ((store: Store) => unknown);
  ui?: UiContext;
  output?: string | false;
}

export const CommandTester = {
  run(cmd: Command<any>, cases: CommandCase[], opts: { extensions?: Extension } = {}): void {
    for (const c of cases) {
      const store = createStore({ files: c.files, extensions: [cmd, opts.extensions ?? []], ui: c.ui });
      const path = Object.keys(c.files)[0]!;
      if (c.select) store.select(store.find(path, c.select));
      const args = typeof c.args === "function" ? (c.args as (s: Store) => unknown)(store) : c.args;
      const before = store.state;
      let dispatched = 0;
      const off = store.subscribe((s) => s, () => dispatched++);
      const can = store.can(cmd, args);
      assert.equal(store.state, before, "dry run changed state");
      assert.equal(dispatched, 0, "dry run dispatched");
      if (c.output === false) {
        assert.equal(can, false, `${cmd.id}: can() should be false`);
        assert.equal(store.run(cmd, args), false, `${cmd.id}: run() should be false`);
        assert.equal(store.state.files.get(path), c.files[path]);
      } else {
        assert.equal(can, true, `${cmd.id}: can() should be true`);
        assert.equal(store.run(cmd, args), true, `${cmd.id}: run() should be true`);
        assert.equal(dispatched, 1, `${cmd.id}: run() should dispatch once`);
        if (c.output !== undefined) assert.equal(store.state.files.get(path), c.output);
      }
      off();
    }
  },
};
