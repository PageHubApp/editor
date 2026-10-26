import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { ConfirmDialog } from "../src/primitives/ConfirmDialog.tsx";
import { Modal } from "../src/primitives/Modal.tsx";
import { FloatingPanel } from "../src/primitives/FloatingPanel.tsx";
import { ToolbarDropdown } from "../src/features/toolbar/ToolbarDropdown.tsx";
import { ToolbarItemView } from "../src/features/toolbar/ToolbarItemView.tsx";
import { render } from "./harness.tsx";

const live: ReturnType<typeof render>[] = [];
afterEach(() => void live.splice(0).forEach((r) => r.unmount()));
const mount = (ui: React.ReactNode) => (live.push(render(ui)), live.at(-1)!);
const pointer = (el: EventTarget, type: string, init: PointerEventInit = {}) => act(() => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, ...init })));

describe("toggle / checkbox", () => {
  it("writes the `on` value when switched on, and '' when switched off", async () => {
    const out: string[] = [];
    const on = mount(<ToolbarItemView type="toggle" label="Wrap" on="flex-wrap" value="" onChange={(v) => out.push(v)} />);
    await on.click(on.get("input[type=checkbox]"));
    assert.deepEqual(out, ["flex-wrap"]);
    on.unmount();
    live.length = 0;
    const off = mount(<ToolbarItemView type="checkbox" label="Wrap" on="flex-wrap" value="flex-wrap" onChange={(v) => out.push(v)} />);
    assert.equal((off.get("input[type=checkbox]") as HTMLInputElement).checked, true);
    await off.click(off.get("input[type=checkbox]"));
    assert.equal(out.at(-1), "");
  });
});

describe("ToolbarDropdown", () => {
  const dropdown = (props: object = {}) =>
    mount(
      <ToolbarDropdown value="a" onChange={() => {}} {...props}>
        <option value="">None</option>
        <option value="a">Alpha</option>
      </ToolbarDropdown>,
    );
  it("is a Headless UI listbox: portalled at z-index 80, list max-h-72, the empty option reads None", async () => {
    const r = dropdown();
    await r.click(r.get("button[aria-haspopup=listbox]"));
    const list = r.get("[role=listbox]");
    assert.ok(list.closest("body") && !r.container.contains(list), "portalled out of the row");
    assert.match(list.parentElement!.innerHTML + list.outerHTML, /max-h-72/);
    assert.equal(list.closest<HTMLElement>("[style*='z-index']")?.style.zIndex, "80");
    assert.deepEqual(r.all("[role=option]").map((o) => o.textContent), ["None", "Alpha"]);
  });
  it("the portalled list carries the host's data-theme, so the dark palette reaches it outside the wrapper", async () => {
    const r = mount(
      <div data-theme="dark">
        <ToolbarDropdown value="a" onChange={() => {}}>
          <option value="a">Alpha</option>
        </ToolbarDropdown>
      </div>,
    );
    await r.click(r.get("button[aria-haspopup=listbox]"));
    const list = r.get("[role=listbox]");
    assert.ok(!r.container.contains(list), "portalled out of the wrapper");
    assert.equal(list.getAttribute("data-theme"), "dark");
  });
  it("opening it blurs an active contentEditable", async () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.tabIndex = 0;
    document.body.appendChild(editable);
    editable.focus();
    const r = dropdown();
    await r.click(r.get("button[aria-haspopup=listbox]"));
    assert.notEqual(document.activeElement, editable);
    editable.remove();
  });
});

describe("focus trap", () => {
  it("Tab from the last control wraps to the first, in a FloatingPanel and in a Modal", async () => {
    const tab = (el: Element, shiftKey = false) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true })));
    for (const ui of [
      <FloatingPanel key="p" isOpen onClose={() => {}} title="T" storageKey="t-trap"><button id="last">last</button></FloatingPanel>,
      <Modal key="m" isOpen onClose={() => {}} title="T"><button id="last">last</button></Modal>,
    ]) {
      const r = mount(ui);
      await act(async () => new Promise((res) => setTimeout(res, 30)));
      const last = r.get("#last");
      last.focus();
      await tab(last);
      assert.notEqual(document.activeElement, last, "focus left the last control");
      assert.ok(r.get("[role=dialog]").contains(document.activeElement), "and stayed inside the dialog");
      r.unmount();
      live.length = 0;
    }
  });
});

describe("FloatingPanel and ConfirmDialog fixes", () => {
  it("the title and the close button are reachable by assistive tech (the header is not aria-hidden)", () => {
    const r = mount(
      <FloatingPanel isOpen onClose={() => {}} title="Calc" storageKey="t-a11y">
        <input />
      </FloatingPanel>,
    );
    const close = r.get("[role=dialog] button[aria-label]");
    assert.equal(close.closest("[aria-hidden=true]"), null);
    assert.equal(r.get("[role=dialog]").getAttribute("aria-label") ?? r.get("[role=dialog]").getAttribute("aria-labelledby") ? true : false, true);
  });
  it("north / west edges grow the panel from that side: the size follows the drag and the origin moves with it", async () => {
    const r = mount(
      <FloatingPanel isOpen onClose={() => {}} title="Calc" storageKey="t-nw" autoSize={false} defaultWidth={300} defaultHeight={320} edges={["n", "w"]} persistSize={false} initialPosition={{ x: 200, y: 200 }}>
        <span />
      </FloatingPanel>,
    );
    const el = () => r.get("[data-ph-floating-panel]");
    await pointer(r.get('[data-resize-edge="w"]'), "pointerdown", { clientX: 200, clientY: 0 });
    await pointer(window, "pointermove", { clientX: 160, clientY: 0 });
    await pointer(window, "pointerup");
    assert.equal(el().style.width, "340px", "dragging west by 40 widens");
    assert.equal(parseFloat(el().style.left || el().style.transform.match(/translate\(?(-?[\d.]+)/)?.[1] || "NaN"), 160, "and the left edge follows the pointer");
    await pointer(r.get('[data-resize-edge="n"]'), "pointerdown", { clientX: 0, clientY: 200 });
    await pointer(window, "pointermove", { clientX: 0, clientY: 170 });
    await pointer(window, "pointerup");
    assert.equal(el().style.height, "350px");
  });
  it("ConfirmDialog uses theme tokens only: no hard-coded red / yellow / blue / green, no white text", () => {
    for (const variant of ["danger", "warning", "info", "success"] as const) {
      const r = mount(<ConfirmDialog isOpen onClose={() => {}} onConfirm={() => {}} title="Sure?" message="x" variant={variant} />);
      const html = r.get("[role=alertdialog]").outerHTML;
      assert.doesNotMatch(html, /\b(?:bg|text|border)-(?:red|yellow|blue|green|white)\b/);
      assert.doesNotMatch(html, /text-neutral-content/, "neutral-content is only valid on bg-neutral");
      r.unmount();
      live.length = 0;
    }
  });
});
