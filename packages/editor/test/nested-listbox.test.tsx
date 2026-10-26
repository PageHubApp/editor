// A field's option list opened inside a popover renders OUTSIDE that popover's DOM subtree (portalled
// to the floating layer), so the popover's scroll box can never clip or squeeze it, and a press in
// it still counts as inside the popover.
import "./setup.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, useRef, useState } from "react";
import { AnchoredPopover } from "../src/primitives/AnchoredPopover.tsx";
import { resetOverlaysForTests } from "../src/primitives/overlayStack.ts";
import { Z_LISTBOX } from "../src/primitives/zIndex.ts";
import { UniversalInput } from "../src/features/toolbar/universal/UniversalInput.tsx";
import { render } from "./harness.tsx";

const pointer = (el: EventTarget) => act(() => void el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 })));

afterEach(() => resetOverlaysForTests());

function RowPopover({ onClose }: { onClose(): void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState("");
  return (
    <>
      <button ref={anchor} id="row" />
      <AnchoredPopover open onOpenChange={(o) => !o && onClose()} anchor={anchor} maxHeightCeiling={200}>
        <div id="body" style={{ overflow: "auto", maxHeight: 80 }}>
          <UniversalInput value={value} onChange={setValue} options={["transition", "transition-none", "transition-all", "transition-colors", "transition-opacity"]} ariaLabel="Property" />
        </div>
      </AnchoredPopover>
    </>
  );
}

describe("nested listboxes inside a popover", () => {
  it("the autocomplete portals outside the popover, above it, never wrapping; picking keeps the popover open", async () => {
    let closed = 0;
    const r = render(<RowPopover onClose={() => closed++} />);
    const input = r.get<HTMLInputElement>("input[aria-label=Property]");
    await act(() => void input.focus());
    const list = r.get("[data-unified-dropdown]");
    const body = r.get("#body");
    assert.equal(body.contains(list), false, "the list is not inside the popover body");
    assert.equal(r.all("[data-ph-popover]")[0]!.contains(list), false, "nor inside the row popover");
    const host = list.closest<HTMLElement>("[data-ph-popover]")!;
    assert.equal(host.style.zIndex, String(Z_LISTBOX));
    assert.match(list.className, /whitespace-nowrap/);
    await pointer(list.querySelector("button")!);
    assert.equal(closed, 0, "a press in the nested list is inside the row popover");
    await pointer(document.body);
    assert.equal(closed, 1);
    r.unmount();
  });

  it("the value-type menu portals outside the popover too", async () => {
    const r = render(<RowPopover onClose={() => {}} />);
    await act(() => r.get<HTMLButtonElement>("button[aria-haspopup=menu]").click());
    const menu = r.get("[data-type-selector-dropdown]");
    assert.equal(r.get("#body").contains(menu), false);
    r.unmount();
  });
});

// Guard: no option list in the chrome is an in-flow `absolute` box (it would be clipped by any
// scrolling ancestor). Lists go through ListboxPopover / AnchoredPopover / a portalled Headless list.
// Allowlist: lists that are already inside their own portalled surface and positioned relative to it.
const ALLOW: ReadonlySet<string> = new Set([
  // The rich-text variable flyout: a sub-menu of the portalled variable panel, positioned beside its row.
  "features/richtext/VariablePanel.tsx",
  // The context-menu Insert submenu: a child of the fixed MenuSurface, opening beside its item.
  "features/menus/InsertSubmenu.tsx",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("chrome guard: option lists are portalled", () => {
  it("no role=listbox / role=menu element is absolutely positioned in flow", () => {
    const src = join(import.meta.dirname, "../src");
    const bad: string[] = [];
    for (const f of files(src)) {
      const rel = f.slice(src.length + 1);
      if (ALLOW.has(rel) || rel.endsWith(".generated.ts")) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/<\w+[^>]*role="(?:listbox|menu)"[^>]*>/g)) if (/className="[^"]*\babsolute\b/.test(m[0]) || /className=\{`[^`]*\babsolute\b/.test(m[0])) bad.push(`${rel}: ${m[0].slice(0, 100)}`);
    }
    assert.deepEqual(bad, []);
  });
});
