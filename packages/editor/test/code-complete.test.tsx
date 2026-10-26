import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, useState } from "react";
import { completionStatus, currentCompletions } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { htmlKit, liquidKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { ComponentsProvider } from "../src/components.ts";
import { CodeEditor } from "../src/features/liquid/CodeEditor.tsx";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { CodeMirrorView } from "../src/features/code/CodeMirrorView.tsx";
import { render, type Rendered } from "./harness.tsx";

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Types `text` one character at a time at the end of the document, the way the keyboard does (`input.type`). */
function type(view: EditorView, text: string, from = view.state.doc.length) {
  let at = from;
  for (const ch of text) {
    act(() => view.dispatch({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: "input.type" }));
    at++;
  }
}

const COMPLETIONS = { variables: ["products", "product", "page"], filters: ["image_url"], tags: ["form"] };

/** The host's shape: the text lives in state and every edit comes back through `value`, with diagnostics pushed alongside. */
function Host({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  return <CodeMirrorView value={text} onChange={setText} language="liquid" completions={COMPLETIONS} diagnostics={[]} />;
}

function mount(initial = "") {
  r = render(<Host initial={initial} />);
  return EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
}

describe("CodeMirrorView: Liquid suggestions open while typing, not only on Ctrl+Space", () => {
  it("a variable inside {{ }} offers the site's names after a few characters", async () => {
    const view = mount();
    type(view, "{{ prod");
    await wait(250);
    assert.equal(completionStatus(view.state), "active", "the list opens by itself");
    const labels = currentCompletions(view.state).map((c) => c.label);
    assert.ok(labels.includes("products") && labels.includes("product"), labels.join(","));
    assert.ok(!labels.includes("page"), "filtered to what was typed");
  });

  it("a filter after | and a tag after {% open the list too", async () => {
    const view = mount();
    type(view, "{{ title | ima");
    await wait(250);
    assert.ok(currentCompletions(view.state).some((c) => c.label === "image_url"), "filter");
    type(view, " }} {% fo");
    await wait(250);
    assert.ok(currentCompletions(view.state).some((c) => c.label === "form"), "tag");
  });

  it("typing inside braces that already close, in the middle of a page", async () => {
    const src = '<main class="x">\n  <p>{{  }}</p>\n</main>\n';
    const view = mount(src);
    type(view, "prod", src.indexOf("{{ ") + 3);
    await wait(250);
    assert.equal(completionStatus(view.state), "active");
    assert.ok(currentCompletions(view.state).some((c) => c.label === "products"));
  });

  it("typing a new expression before Liquid that already exists, in text and in an attribute", async () => {
    const src = '<main>\n  <p>X</p>\n  <a href="Y">z</a>\n  {% for p in products %}<li>{{ p.title }}</li>{% endfor %}\n</main>\n';
    for (const [mark, name] of [["X", "text"], ["Y", "attribute"]] as const) {
      const view = mount(src);
      type(view, "{{ prod", src.indexOf(mark) + 0);
      await wait(250);
      assert.equal(completionStatus(view.state), "active", name);
      assert.ok(currentCompletions(view.state).some((c) => c.label === "products"), name);
      r!.unmount();
    }
  });

  it("through the real CodeEditor, with the engine's tags, filters and the names in scope", async () => {
    const e = createTestEditor({ files: { "index.liquid": "<main>\n  <p></p>\n</main>\n" }, extensions: [htmlKit(), liquidKit()], data: { company: { name: "Acme" }, products: [] } as never });
    r = render(
      <EditorStoreProvider store={e}>
        <ComponentsProvider value={{ ...DEFAULT_COMPONENTS, CodeView: CodeMirrorView as never }}>
          <CodeEditor path="index.liquid" />
        </ComponentsProvider>
      </EditorStoreProvider>,
    );
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
    type(view, "{{ comp", "<main>\n  <p>".length);
    await wait(250);
    assert.equal(completionStatus(view.state), "active", "opens without Ctrl+Space");
    assert.ok(currentCompletions(view.state).some((c) => c.label.startsWith("company")), currentCompletions(view.state).map((c) => c.label).join(","));
  });

  it("one character is enough after {{ and a space, and a word typed in a tag", async () => {
    const view = mount();
    type(view, "{% if p");
    await wait(250);
    assert.ok(currentCompletions(view.state).some((c) => c.label === "page"), "variable in a tag");
  });
});
