import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// `dangerouslySetInnerHTML={{ __html }}` is a new object every render, and React 19 resets the element's innerHTML
// when it changes. Under the pointer (hover / focus re-render it) that swaps the nodes between mousedown and mouseup
// and the click never fires. Use `useStableHtml` / `HtmlSpan` (src/primitives/useStableHtml.tsx).
const SRC = new URL("../src", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

test("no inline dangerouslySetInnerHTML object in editor components", () => {
  const bad = files(SRC).flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/dangerouslySetInnerHTML=\{\{/.test(line) ? [`${f.slice(SRC.length + 1)}:${i + 1}`] : [])),
  );
  assert.deepEqual(bad, [], "use dangerouslySetInnerHTML={useStableHtml(html)} or <HtmlSpan html={…} />");
});
