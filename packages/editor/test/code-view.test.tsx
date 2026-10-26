import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { EditorView } from "@codemirror/view";
import { diagnosticCount } from "@codemirror/lint";
import { unifiedDiff, type Diagnostic } from "@pagehub/engine";
import { htmlKit, liquidKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { ComponentsProvider } from "../src/components.ts";
import { CodeEditor } from "../src/features/liquid/CodeEditor.tsx";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { CodeMirrorView } from "../src/features/code/CodeMirrorView.tsx";
import { viewDiagnostics } from "../src/features/code/viewDiagnostics.ts";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { render, type Rendered } from "./harness.tsx";

const F = "index.liquid";
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

const diag = (start: number, end: number, extra: Partial<Diagnostic> = {}): Diagnostic => ({ rule: "unknown-filter", severity: "warning", message: "x", path: F, range: { start, end }, ...extra });

describe("viewDiagnostics: engine ranges → code view ranges", () => {
  it("keeps the file's diagnostics, offsets them into a node's view, clamps and widens empty ranges", () => {
    const all = [diag(30, 34), diag(2, 5, { path: "other.liquid" }), diag(5, 12, { severity: "error", rule: "parse" }), diag(50, 50), diag(80, 90)];
    assert.deepEqual(viewDiagnostics(all, { path: F }).map((d) => [d.from, d.to, d.severity]), [[5, 12, "error"], [30, 34, "warning"], [50, 51, "warning"], [80, 90, "warning"]]);
    assert.deepEqual(viewDiagnostics(all, { path: F, from: 10, to: 60 }).map((d) => [d.from, d.to]), [[0, 2], [20, 24], [40, 41]], "clamped to the node, outside ones dropped");
    assert.equal(viewDiagnostics(all, { path: F })[0]!.message, "parse: x");
  });
});

const SRC = `<main>\n  <p>{{ title | shout }}</p>\n</main>\n`;

function mount(src = SRC, sel?: string) {
  const e = createTestEditor({ files: { [F]: src }, extensions: [htmlKit(), liquidKit()] });
  r = render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={{ ...DEFAULT_COMPONENTS, CodeView: CodeMirrorView as never }}>
        {sel ? <CodeEditor handle={e.get(sel)} /> : <CodeEditor path={F} />}
      </ComponentsProvider>
    </EditorStoreProvider>,
  );
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  return { e, view };
}

describe("CodeEditor: CodeMirror with the engine's diagnostics; Apply is one source.replace", () => {
  it("draws each rule diagnostic at its source range", () => {
    const { e, view } = mount();
    const d = e.diagnostics.find((x) => x.rule === "unknown-filter")!;
    assert.ok(d, "the sample has an unknown filter");
    assert.equal(diagnosticCount(view.state), e.diagnostics.length);
    const marks = [...document.querySelectorAll(".cm-lintRange")].map((m) => m.textContent);
    assert.ok(marks.includes(SRC.slice(d.range.start, d.range.end)), `mark covers "${SRC.slice(d.range.start, d.range.end)}"`);
    assert.match(document.querySelector("[data-code-diagnostics]")!.textContent!, /unknown-filter/);
  });

  it("edits stay a draft until Apply; Apply writes the exact diff as one undo step, and marks follow", async () => {
    const { e, view } = mount();
    const next = SRC.replace("shout", "upcase");
    act(() => view.dispatch({ changes: { from: SRC.indexOf("shout"), to: SRC.indexOf("shout") + 5, insert: "upcase" } }));
    assert.equal(e.text(), SRC, "nothing written while typing");
    assert.equal(diagnosticCount(view.state), 0, "stale marks hidden while the draft differs");
    await r!.click(document.querySelector("[data-code-apply]")!);
    assert.equal(e.diff(), unifiedDiff(F, SRC, next));
    assert.equal(e.diagnostics.filter((x) => x.rule === "unknown-filter").length, 0);
    act(() => void assert.ok(e.undo()));
    assert.equal(e.text(), SRC);
    assert.equal(view.state.doc.toString(), SRC, "the untouched draft follows undo");
    assert.equal(diagnosticCount(view.state), e.diagnostics.length);
  });

  it("code that doesn't parse is refused and stays in the view", async () => {
    const { e, view } = mount();
    act(() => view.dispatch({ changes: { from: 0, to: 6, insert: "<main" } }));
    await r!.click(document.querySelector("[data-code-apply]")!);
    assert.equal(e.text(), SRC);
    assert.match(document.body.textContent!, /can't be applied/);
    assert.equal(view.state.doc.toString(), SRC.replace("<main>", "<main"));
  });

  it("a node's code view shows its own source, its diagnostics at node offsets, and applies inside the file", async () => {
    const src = `<main>\n  <h1>{{ t | shout }}</h1>\n  {% for p in products %}\n    <p>{{ p | shout }}</p>\n  {% endfor %}\n</main>\n`;
    const { e, view } = mount(src, "%for");
    const h = e.get("%for");
    assert.equal(view.state.doc.toString(), h.text());
    const inNode = e.diagnostics.filter((d) => d.range.start >= h.range.from && d.range.end <= h.range.to);
    assert.equal(inNode.length, 1, "the loop holds one unknown filter");
    assert.equal(diagnosticCount(view.state), inNode.length, "only the node's diagnostics");
    assert.deepEqual([...document.querySelectorAll(".cm-lintRange")].map((m) => m.textContent), inNode.map((d) => src.slice(d.range.start, d.range.end)));
    const at = h.text().indexOf("<p>");
    act(() => view.dispatch({ changes: { from: at, to: at + 3, insert: '<p class="x">' } }));
    await r!.click(document.querySelector("[data-code-apply]")!);
    assert.equal(e.diff(), unifiedDiff(F, src, src.replace("<p>", '<p class="x">')));
  });
});
