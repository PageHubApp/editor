import "./setup.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, useRef, useState } from "react";
import { runKey } from "@pagehub/engine";
import { AccordionProvider, useAccordion } from "../src/features/toolbar/AccordionContext.tsx";
import { AnchoredPopover } from "../src/primitives/AnchoredPopover.tsx";
import { FloatingPanel } from "../src/primitives/FloatingPanel.tsx";
import { Modal } from "../src/primitives/Modal.tsx";
import { PopoverChip } from "../src/primitives/Chip.tsx";
import { SearchableMenuPopover } from "../src/primitives/SearchableMenuPopover.tsx";
import { ToolbarSection } from "../src/features/toolbar/ToolbarSection.tsx";
import { overlayDepth, useOverlay } from "../src/primitives/overlayStack.ts";
import { useConfirm } from "../src/primitives/ConfirmDialog.tsx";
import { attachKeymap } from "../src/features/keyboard/domKeymap.ts";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { fixtureEditor, render } from "./harness.tsx";

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const esc = () => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
const pointer = (el: EventTarget, type: string, init: PointerEventInit = {}) =>
  act(() => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, ...init })));

// Escape reaches the overlay stack only through the DOM keymap.
let detachKeymap = () => {};
beforeEach(() => void (detachKeymap = attachKeymap(fixtureEditor(), { platform: "other" })));

afterEach(() => {
  detachKeymap();
  resetOverlaysForTests();
  localStorage.clear();
});

describe("overlay stack and Esc order", () => {
  function Layer({ id, onClose }: { id: string; onClose(): void }) {
    useOverlay({ id, isOpen: true, onDismiss: onClose });
    return null;
  }

  it("Esc closes only the top overlay (LIFO)", async () => {
    const closed: string[] = [];
    const r = render(
      <>
        <Layer id="a" onClose={() => closed.push("a")} />
        <Layer id="b" onClose={() => closed.push("b")} />
      </>,
    );
    assert.equal(overlayDepth(), 2);
    await esc();
    assert.deepEqual(closed, ["b"]);
    assert.equal(overlayDepth(), 1);
    r.unmount();
    assert.equal(overlayDepth(), 0);
  });

  it("keymap: Escape runs overlay.dismissTop first, selection.up (parent, then deselect at the root) only when nothing is open", async () => {
    const e = fixtureEditor();
    let closed = 0;
    const r = render(<Layer id="x" onClose={() => closed++} />);
    assert.equal(runKey(e, "escape").command, "overlay.dismissTop");
    assert.equal(closed, 1);
    assert.equal(e.state.selection.handles.length, 1, "selection kept");
    r.unmount();
    assert.equal(runKey(e, "escape").command, "selection.up");
    assert.equal(e.state.selection.handles.length, 0, "the fixture's section is the root: Esc deselects");
  });

  it("an Esc a keymap already handled (defaultPrevented) is not handled twice", async () => {
    let closed = 0;
    const r = render(<Layer id="x" onClose={() => closed++} />);
    const ev = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    ev.preventDefault();
    await act(() => void window.dispatchEvent(ev));
    assert.equal(closed, 0);
    r.unmount();
  });
});

describe("AnchoredPopover", () => {
  function Harness({ initial = true, onChange = (_: boolean) => {} }) {
    const [open, setOpen] = useState(initial);
    const anchor = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={anchor} id="anchor" onClick={() => setOpen((o) => !o)} />
        <div id="outside" />
        <AnchoredPopover open={open} onOpenChange={(o) => (setOpen(o), onChange(o))} anchor={anchor} className="pop">
          <span id="inside" />
        </AnchoredPopover>
      </>
    );
  }

  it("portals to the body with data-state, z-index 60 and fixed positioning", () => {
    const r = render(<Harness />);
    const pop = r.get("[data-ph-popover]");
    assert.equal(pop.parentElement, document.body);
    assert.equal(pop.getAttribute("data-state"), "open");
    assert.equal(pop.style.zIndex, "60");
    assert.equal(pop.style.position, "fixed");
    r.unmount();
  });

  it("outside pointerdown closes; inside, anchor and right-click don't; unmounts after the 75ms fade", async () => {
    const changes: boolean[] = [];
    const r = render(<Harness onChange={(o) => changes.push(o)} />);
    await pointer(r.get("#inside"), "pointerdown");
    await pointer(r.get("#outside"), "pointerdown", { button: 2 });
    assert.deepEqual(changes, []);
    await pointer(r.get("#outside"), "pointerdown");
    assert.deepEqual(changes, [false]);
    assert.equal(r.get("[data-ph-popover]").getAttribute("data-state"), "closed");
    await wait(100);
    assert.equal(r.all("[data-ph-popover]").length, 0);
    r.unmount();
  });

  it("a press that only reaches the body (the canvas frame forwards its pointerdown there) closes it", async () => {
    const changes: boolean[] = [];
    const r = render(<Harness onChange={(o) => changes.push(o)} />);
    await pointer(document.body, "pointerdown");
    assert.deepEqual(changes, [false]);
    r.unmount();
  });

  it("focus moving into an iframe (the window blurs) closes it; a plain window blur does not", async () => {
    const changes: boolean[] = [];
    const r = render(<Harness onChange={(o) => changes.push(o)} />);
    await act(async () => void window.dispatchEvent(new Event("blur")));
    assert.deepEqual(changes, [], "no iframe is focused");
    const frame = document.createElement("iframe");
    frame.tabIndex = 0;
    document.body.append(frame);
    frame.focus();
    await act(async () => void window.dispatchEvent(new Event("blur")));
    assert.deepEqual(changes, [false]);
    frame.remove();
    r.unmount();
  });

  it("Esc closes it through the overlay stack", async () => {
    const r = render(<Harness />);
    assert.equal(overlayDepth(), 1);
    await esc();
    await wait(100);
    assert.equal(r.all("[data-ph-popover]").length, 0);
    r.unmount();
  });

  it("inside a FloatingPanel, a click in the popover does not close the panel", async () => {
    let panelClosed = 0;
    const r = render(
      <FloatingPanel isOpen onClose={() => panelClosed++} title="Color" storageKey="t-nested">
        <Harness />
      </FloatingPanel>,
    );
    await wait(30); // the panel's outside-click listener arms one frame after opening
    await pointer(r.get("#inside"), "pointerdown");
    assert.equal(panelClosed, 0);
    await pointer(document.body, "pointerdown");
    assert.equal(panelClosed, 1);
    r.unmount();
  });
});

describe("FloatingPanel", () => {
  const panel = (props: Partial<Parameters<typeof FloatingPanel>[0]> = {}, onClose = () => {}) =>
    render(
      <FloatingPanel isOpen onClose={onClose} title="Calc" storageKey="t-panel" autoSize={false} defaultWidth={300} defaultHeight={320} {...props}>
        <input id="field" />
      </FloatingPanel>,
    );

  it("opens centred at y 40 (or docked right / left), as a labelled dialog with z-index 999", () => {
    let r = panel();
    const el = r.get("[data-ph-floating-panel]");
    assert.equal(el.getAttribute("role"), "dialog");
    assert.equal(el.getAttribute("aria-label"), "Calc");
    assert.equal(el.style.top, "40px");
    assert.equal(el.style.left, `${Math.round(window.innerWidth / 2 - 150)}px`);
    assert.equal(el.style.zIndex, "999");
    r.unmount();
    r = panel({ dockToEdge: "right" });
    assert.equal(r.get("[data-ph-floating-panel]").style.left, `${window.innerWidth - 300 - 12}px`);
    r.unmount();
  });

  it("drags by the header with window listeners; a buttonless move ends the drag", async () => {
    const r = panel();
    const el = r.get("[data-ph-floating-panel]");
    const x0 = parseInt(el.style.left);
    await pointer(r.get("[data-drag-handle]"), "pointerdown", { clientX: 100, clientY: 100 });
    await pointer(window, "pointermove", { clientX: 130, clientY: 120 });
    assert.equal(el.style.left, `${x0 + 30}px`);
    assert.equal(el.style.top, "60px");
    await pointer(window, "pointermove", { clientX: 200, clientY: 200, buttons: 0 }); // missed up
    await pointer(window, "pointermove", { clientX: 300, clientY: 300 });
    assert.equal(el.style.left, `${x0 + 30}px`, "drag ended");
    r.unmount();
  });

  it("pointerdown on the close button does not drag; it closes", async () => {
    let closed = 0;
    const r = panel({}, () => closed++);
    const el = r.get("[data-ph-floating-panel]");
    const left = el.style.left;
    const close = r.get('[data-drag-handle] button[aria-label="Close"]');
    await pointer(close, "pointerdown", { clientX: 10, clientY: 10 });
    await pointer(window, "pointermove", { clientX: 90, clientY: 90 });
    assert.equal(el.style.left, left);
    await pointer(window, "pointerup");
    await r.click(close);
    assert.equal(closed, 1);
    r.unmount();
  });

  it("stays 12px inside the window while dragging", async () => {
    const r = panel();
    await pointer(r.get("[data-drag-handle]"), "pointerdown", { clientX: 500, clientY: 100 });
    await pointer(window, "pointermove", { clientX: -5000, clientY: -5000 });
    const el = r.get("[data-ph-floating-panel]");
    assert.equal(el.style.left, "12px");
    assert.equal(el.style.top, "12px");
    await pointer(window, "pointerup");
    r.unmount();
  });

  it("resizes from the e / s / se edges and persists the size (unless persistSize=false)", async () => {
    let r = panel();
    assert.deepEqual(r.all("[data-resize-edge]").map((h) => h.getAttribute("data-resize-edge")), ["e", "s", "se"]);
    await pointer(r.get('[data-resize-edge="se"]'), "pointerdown", { clientX: 0, clientY: 0 });
    await pointer(window, "pointermove", { clientX: 40, clientY: 30 });
    await pointer(window, "pointerup");
    assert.equal(r.get("[data-ph-floating-panel]").style.width, "340px");
    assert.deepEqual(JSON.parse(localStorage.getItem("pagehub-editor:resizable-t-panel")!), { width: 340, height: 350 });
    r.unmount();
    r = panel();
    assert.equal(r.get("[data-ph-floating-panel]").style.width, "340px", "restored");
    r.unmount();
    localStorage.clear();
    r = panel({ persistSize: false });
    await pointer(r.get('[data-resize-edge="e"]'), "pointerdown", { clientX: 0, clientY: 0 });
    await pointer(window, "pointermove", { clientX: 20, clientY: 0 });
    await act(() => void window.dispatchEvent(new Event("blur"))); // focus lost ends the gesture
    assert.equal(localStorage.getItem("pagehub-editor:resizable-t-panel"), null);
    r.unmount();
  });

  it("outside pointerdown closes it once armed; Headless UI portals and the tooltip don't", async () => {
    let closed = 0;
    const r = panel({}, () => closed++);
    const hui = document.createElement("div");
    hui.setAttribute("data-headlessui-portal", "");
    document.body.appendChild(hui);
    await pointer(document.body, "pointerdown");
    assert.equal(closed, 0, "not armed in the opening frame");
    await wait(30);
    await pointer(hui, "pointerdown");
    assert.equal(closed, 0);
    await pointer(document.body, "pointerdown");
    assert.equal(closed, 1);
    hui.remove();
    r.unmount();
  });

  it("Esc closes it", async () => {
    let closed = 0;
    const r = panel({}, () => closed++);
    await esc();
    assert.equal(closed, 1);
    r.unmount();
  });
});

describe("Modal + ConfirmDialog", () => {
  it("Esc closes only the top modal; the backdrop click closes; role dialog + aria-modal", async () => {
    const closed: string[] = [];
    const r = render(
      <>
        <Modal isOpen title="Outer" onClose={() => closed.push("outer")}>
          outer
        </Modal>
        <Modal isOpen title="Inner" onClose={() => closed.push("inner")}>
          inner
        </Modal>
      </>,
    );
    const dialogs = r.all('[role="dialog"]');
    assert.equal(dialogs.length, 2);
    assert.equal(dialogs[0]!.getAttribute("aria-modal"), "true");
    await esc();
    assert.deepEqual(closed, ["inner"]);
    await r.click(r.all("[data-modal-backdrop]")[0]!);
    assert.equal(closed.at(-1), "outer");
    r.unmount();
  });

  it("dismissable=false ignores Esc and the backdrop", async () => {
    let closed = 0;
    const r = render(
      <Modal isOpen dismissable={false} title="Busy" onClose={() => closed++}>
        x
      </Modal>,
    );
    await esc();
    await r.click(r.all("[data-modal-backdrop]")[0]!);
    assert.equal(closed, 0);
    r.unmount();
  });

  it("useConfirm resolves true on confirm and false on cancel / Esc, as an alertdialog", async () => {
    let ask!: ReturnType<typeof useConfirm>["ask"];
    function Host() {
      const c = useConfirm();
      ask = c.ask;
      return <>{c.dialog}</>;
    }
    const r = render(<Host />);
    let p!: Promise<boolean>;
    await act(() => void (p = ask({ title: "Delete this animation?", message: "It is used on 2 elements.", confirmText: "Delete" })));
    assert.equal(r.get('[role="alertdialog"]').textContent?.includes("Delete this animation?"), true);
    await r.click(r.get('[data-confirm="ok"]'));
    assert.equal(await p, true);
    await act(() => void (p = ask({ title: "Again?", message: "" })));
    await r.click(r.get('[data-confirm="cancel"]'));
    assert.equal(await p, false);
    await act(() => void (p = ask({ title: "Esc?", message: "" })));
    await esc();
    assert.equal(await p, false);
    r.unmount();
  });
});

describe("PopoverChip", () => {
  it("trigger opens, X clears, frame border is primary while open, label forwards to the trigger", async () => {
    const calls: string[] = [];
    const r = render(<PopoverChip label="Color" open summary="primary" onTriggerClick={() => calls.push("open")} onClear={() => calls.push("clear")} triggerAriaLabel="Pick color" clearAriaLabel="Clear color" />);
    const trigger = r.get('[aria-label="Pick color"]');
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.ok(trigger.parentElement!.className.includes("border-primary"));
    await r.click(trigger);
    await r.click(r.get('[aria-label="Clear color"]'));
    await r.click(r.get("button.truncate")); // the row label
    assert.deepEqual(calls, ["open", "clear", "open"]);
    assert.equal(r.get('[aria-label="Clear color"]').getAttribute("data-tooltip-content"), "Clear color");
    r.unmount();
  });
});

describe("SearchableMenuPopover", () => {
  const items = [
    { id: "width", label: "Width", keywords: ["size"] },
    { id: "height", label: "Height" },
    { id: "minW", label: "Min width", help: "Smallest width" },
  ];

  it("single mode: search filters label / id / keywords; picking selects and closes", async () => {
    const picked: string[] = [];
    const r = render(<SearchableMenuPopover trigger="+" triggerAriaLabel="Add property" items={items} onSelect={(i) => picked.push(i.id)} />);
    await r.click(r.get('[aria-label="Add property"]'));
    const input = r.get("[data-ph-popover] input") as HTMLInputElement;
    await r.type(input, "size");
    assert.deepEqual(r.all('[role="option"]').map((o) => o.textContent), ["Width"]);
    await r.type(input, "zzz");
    assert.ok(r.get("[data-ph-popover]").textContent!.includes('No matches for "zzz"'));
    await r.type(input, "");
    assert.equal(r.all('[role="option"]')[2]!.getAttribute("data-tooltip-content"), "Smallest width");
    await r.fire(r.all('[role="option"]')[1]!, "mousedown");
    assert.deepEqual(picked, ["height"]);
    await wait(100);
    assert.equal(r.all("[data-ph-popover]").length, 0);
    r.unmount();
  });

  it("multi mode: checkboxes and Add (N) apply the picks in click order; empty list message", async () => {
    let applied: string[] = [];
    const r = render(<SearchableMenuPopover multiSelect trigger="+" triggerAriaLabel="Add" items={items} onSelectMany={(xs) => (applied = xs.map((x) => x.id))} />);
    await r.click(r.get('[aria-label="Add"]'));
    const add = () => r.all("[data-ph-popover] button").find((b) => b.textContent!.startsWith("Add"))!;
    assert.equal(add().textContent, "Add");
    assert.ok((add() as HTMLButtonElement).disabled);
    await r.fire(r.all('[role="option"]')[2]!, "mousedown");
    await r.fire(r.all('[role="option"]')[0]!, "mousedown");
    assert.equal(add().textContent, "Add (2)");
    await r.click(add());
    assert.deepEqual(applied, ["minW", "width"]);
    r.unmount();
    const e = render(<SearchableMenuPopover trigger="+" triggerAriaLabel="Add" items={[]} emptyMessage="All properties added" />);
    await e.click(e.get('[aria-label="Add"]'));
    assert.ok(e.get("[data-ph-popover]").textContent!.includes("All properties added"));
    e.unmount();
  });
});

describe("ToolbarSection + AccordionContext", () => {
  const stored = () => JSON.parse(localStorage.getItem("pagehub-editor:accordion-state") ?? "{}");
  let api!: NonNullable<ReturnType<typeof useAccordion>>;
  const Grab = () => ((api = useAccordion()!), null);
  const sections = (forceOpen = false) => (
    <AccordionProvider forceOpen={forceOpen}>
      <Grab />
      <ToolbarSection title="Content" actions={<button id="act" />} help="What it shows">
        <span id="content-body" />
      </ToolbarSection>
      <ToolbarSection title="Size">
        <span id="size-body" />
      </ToolbarSection>
      <ToolbarSection title="Inner" nested>
        <span id="inner-body" />
      </ToolbarSection>
    </AccordionProvider>
  );
  const header = (r: ReturnType<typeof render>, title: string) => r.get(`[data-section="${title}"] [role="button"]`);

  it("only Content is open by default; the title toggles and persists, actions don't toggle", async () => {
    const r = render(sections());
    assert.equal(r.all("#content-body").length, 1);
    assert.equal(r.all("#size-body").length, 0);
    await r.click(r.get("#act"));
    assert.equal(r.all("#content-body").length, 1);
    await r.click(header(r, "Size"));
    assert.equal(r.all("#size-body").length, 1);
    assert.deepEqual(stored(), { Size: true });
    await act(() => void header(r, "Content").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(r.all("#content-body").length, 0);
    r.unmount();
  });

  it("help tooltip on the left after 750ms; the body is labelled by the header", () => {
    const r = render(sections());
    const h = header(r, "Content");
    assert.equal(h.getAttribute("data-tooltip-content"), "What it shows");
    assert.equal(h.getAttribute("data-tooltip-place"), "left");
    assert.equal(h.getAttribute("data-tooltip-delay-show"), "750");
    assert.equal(r.get('[data-section="Content"] [role="group"]').getAttribute("aria-labelledby"), h.id);
    r.unmount();
  });

  it("toggleAll closes every top-level section when any is open, else opens them; nested untouched", async () => {
    const r = render(sections());
    await act(() => api.toggleAll());
    assert.equal(api.anyOpen, false);
    assert.equal(stored().Inner, undefined);
    await act(() => api.toggleAll());
    assert.equal(r.all("#size-body").length, 1);
    assert.equal(r.all("#inner-body").length, 0);
    r.unmount();
  });

  it("openOnly opens the tab's sections and closes the rest; forceOpen (search) opens all without persisting", async () => {
    let r = render(sections());
    await act(() => api.openOnly(["Size"]));
    assert.deepEqual(stored(), { Content: false, Size: true, Inner: false });
    r.unmount();
    r = render(sections(true));
    assert.equal(r.all("#content-body, #size-body, #inner-body").length, 3);
    assert.deepEqual(stored(), { Content: false, Size: true, Inner: false }, "forced open is not stored");
    r.unmount();
  });

  it("outside a provider the section keeps its own state (open by default)", async () => {
    const r = render(
      <ToolbarSection title="Local">
        <span id="b" />
      </ToolbarSection>,
    );
    assert.equal(r.all("#b").length, 1);
    await r.click(r.get('[role="button"]'));
    assert.equal(r.all("#b").length, 0);
    r.unmount();
  });
});

describe("chrome guards", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const src = files(join(import.meta.dirname, "../src")).filter((f) => /\.tsx?$/.test(f));

  it("no native title= tooltip on a DOM element; no window confirm / alert / prompt", () => {
    for (const f of src) {
      const s = readFileSync(f, "utf8");
      // *.generated.ts files hold site-content HTML snippets (not editor chrome), where title= is legitimate content.
      if (!f.endsWith(".generated.ts")) assert.ok(!/<[a-z][a-z0-9]*\b[^>]*\stitle=/.test(s), `${f}: use data-tooltip-* instead of title=`);
      assert.ok(!/(^|[^.\w])(confirm|alert|prompt)\(/m.test(s.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")), `${f}: use useConfirm()`);
    }
  });

  it("gestures use window listeners: no React onPointerMove / onPointerUp props", () => {
    for (const f of src) assert.ok(!/onPointer(Move|Up)=/.test(readFileSync(f, "utf8")), `${f}: use useDragGesture`);
  });

  it("no arbitrary url() class literal in source (the editor sheet scans src: Tailwind would compile it into a url() import that breaks the host build)", () => {
    // Allowed only as a template-literal expression (`[url(${…})]`), which is built at runtime.
    for (const f of src) assert.ok(!/\[url\((?!\$\{)/.test(readFileSync(f, "utf8")), `${f}: build the url class at runtime, never write one literally`);
  });

  it("no JSX prop named css= (a host compiling this source with Emotion's JSX runtime strips it: blank colour swatches)", () => {
    for (const f of src) if (f.endsWith(".tsx")) assert.ok(!/\scss=\{/.test(readFileSync(f, "utf8")), `${f}: rename the css prop (e.g. fill)`);
  });
});
