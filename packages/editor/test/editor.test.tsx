import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Editor, DEFAULT_COMPONENTS, Slot, useEditorState, type SlotName } from "../src/index.ts";
import { MediaManager } from "../src/features/media/MediaManager.tsx";
import { SLOT_NAMES } from "../src/shell/defaults.tsx";
import { ComponentsProvider } from "../src/components.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { createTestEditor } from "@pagehub/engine/testing";
import { htmlKit } from "@pagehub/engine/kits";
import { fixtureEditor, render } from "./harness.tsx";

describe("<Editor> and the components map", () => {
  it("renders the PageHub arrangement: save banner, full-width top bar, tabbed sidebar beside the canvas", () => {
    const r = render(<Editor editor={fixtureEditor()} />);
    const root = r.get(".pagehub-editor");
    assert.equal(root.firstElementChild?.getAttribute("data-slot"), "SaveBanner");
    // The top bar spans the full width above the sidebar + canvas row, in three groups: left is the
    // history actions; the centre address pill holds the PageSelector (page switcher) then the
    // SaveStatus indicator; the right group leads with the BreakpointSwitcher device picker. So in
    // DOM order PageSelector, then SaveStatus, then BreakpointSwitcher.
    const topbar = r.get('[data-slot="TopBar"]');
    assert.deepEqual(
      [...topbar.querySelectorAll("[data-slot]")].map((n) => n.getAttribute("data-slot")),
      ["PageSelector", "SaveStatus", "BreakpointSwitcher"],
    );
    const aside = r.get("aside#toolbar[data-ph-panel]");
    assert.equal(aside.getAttribute("aria-label"), "Component settings");
    assert.ok(aside.querySelector("[data-sidebar-tabs]"), "the sidebar header is the Edit / Layers / Add tabs");
    assert.deepEqual(
      [...aside.querySelectorAll("[data-slot]")].map((n) => n.getAttribute("data-slot")).filter((n) => n !== "InspectorSection"), // the inspector's own sections
      ["Breadcrumb", "Inspector", "LayersPanel", "AddPanel"], // PageSelector moved to the TopBar header
    );
    assert.equal(aside.nextElementSibling?.querySelector("[data-slot]")?.getAttribute("data-slot"), "Canvas");
    r.unmount();
  });

  it("a replaced slot renders the replacement; null hides it", () => {
    const Mine = () => <div id="my-layers" />;
    const r = render(<Editor editor={fixtureEditor()} components={{ LayersPanel: Mine, AddPanel: null }} />);
    assert.ok(r.get("#my-layers"));
    assert.equal(r.all('[data-slot="LayersPanel"]').length, 0);
    assert.equal(r.all('[data-slot="AddPanel"]').length, 0);
    r.unmount();
  });

  it("hiding the Sidebar hides everything inside it", () => {
    const r = render(<Editor editor={fixtureEditor()} components={{ Sidebar: null }} />);
    assert.equal(r.all("aside#toolbar").length, 0);
    assert.equal(r.all('[data-slot="Inspector"]').length, 0);
    r.unmount();
  });

  it("unknown slot names are an error", () => {
    assert.throws(() => render(<Editor editor={fixtureEditor()} components={{ Toolbar: null } as never} />), /unknown editor slot "Toolbar"/);
  });

  it("requires editorKit() in the core", () => {
    const bare = createTestEditor({ files: { "a.liquid": "<p>x</p>" }, extensions: [htmlKit()] });
    assert.throws(() => render(<Editor editor={bare} />), /editorKit/);
  });

  it("every default slot renders on the fixture page (MediaManager is host-injected: null by default)", () => {
    const e = fixtureEditor();
    assert.equal(DEFAULT_COMPONENTS.MediaManager, null);
    const components = { ...DEFAULT_COMPONENTS, MediaManager };
    const props: Partial<Record<SlotName, object>> = {
      InspectorSection: { title: "Spacing", props: ["padding"] },
      MediaManager: { open: true, onClose() {} },
      ThemePanel: { open: true, onClose() {} },
      ModifiersPanel: { open: true, onClose() {} },
      ScriptsPanel: { open: true, onClose() {} },
      InspectorDetail: { kind: "conditions", open: true, onClose() {} },
      ColorPicker: { value: "", onChange() {} },
      IconPicker: { value: "", onChange() {} },
      FontPicker: { value: "", onChange() {} },
      CodeView: { value: "<p>x</p>", onChange() {} },
    };
    for (const name of SLOT_NAMES) {
      const r = render(
        <EditorStoreProvider store={e}>
          <ComponentsProvider value={components}>
            <Slot name={name} {...(props[name] as Record<string, unknown>)} />
          </ComponentsProvider>
        </EditorStoreProvider>,
      );
      assert.ok(document.querySelector(`[data-slot="${name}"]`), `${name} rendered`); // panels portal out of the container
      r.unmount();
    }
  });
});

describe("useEditorState", () => {
  it("re-renders only when the selected slice changes", async () => {
    const e = fixtureEditor();
    let renders = 0;
    function Probe() {
      renders++;
      const tag = useEditorState((s) => s.selection.primary?.tag ?? "none");
      return <span id="probe">{tag}</span>;
    }
    const r = render(
      <EditorStoreProvider store={e}>
        <Probe />
      </EditorStoreProvider>,
    );
    assert.equal(r.get("#probe").textContent, "section");
    const before = renders;
    const { act } = await import("react");
    act(() => void e.run("classes.set", { group: "gap", token: "gap-6" }));
    assert.equal(renders, before, "an edit that leaves the slice alone doesn't re-render");
    act(() => e.select(e.get("h1")));
    assert.equal(r.get("#probe").textContent, "h1");
    r.unmount();
  });
});
