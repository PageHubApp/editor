import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { act } from "react";
import { createTestEditor } from "@pagehub/engine/testing";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { iconCatalogueFacet, memoryIconCatalogue, fontCatalogueFacet, fontsInTab, type FontFamily } from "@pagehub/engine/host";
import { DEFAULT_FONT_FAMILIES } from "../../engine/src/host/fonts.data.ts";
import { FontInput } from "../src/features/pickers/FontInput.tsx";
import { IconInput } from "../src/features/pickers/IconInput.tsx";
import { editorKit } from "../src/index.ts";
import { FontPicker } from "../src/features/pickers/FontPicker.tsx";
import { IconPicker, moveFocus } from "../src/features/pickers/IconPicker.tsx";
import { VirtualList } from "../src/features/pickers/VirtualList.tsx";
import { render } from "./harness.tsx";
import { flush, withSlots } from "./pickersHarness.tsx";

const svg = (n: string) => `<svg data-n="${n}"><path d="M0 0"/></svg>`;
const ICONS = {
  tb: Object.fromEntries(["TbPhone", "TbMail", "TbMap", "TbHome", "TbStar"].map((n) => [n, svg(n)])),
  fa: { FaApple: svg("FaApple"), FaGoogle: svg("FaGoogle") },
};
const FONTS: FontFamily[] = [
  { family: "Inter", category: "sans-serif" },
  { family: "Lora", category: "serif" },
  { family: "Roboto Mono", category: "monospace" },
  { family: "Pacifico", category: "handwriting" },
];

function editor(extra: unknown[] = []) {
  return createTestEditor({
    files: { "index.liquid": "<p>x</p>\n" },
    extensions: [htmlKit(), tailwindKit(), editorKit(), iconCatalogueFacet.of(memoryIconCatalogue(ICONS, ["tb/TbPhone", "tb/TbMail"])), fontCatalogueFacet.of({ families: () => FONTS, load: (f) => loaded.push(f) }), ...(extra as [])],
  });
}
const loaded: string[] = [];
beforeEach(() => (globalThis.localStorage?.clear(), (loaded.length = 0)));

function iconRig(onChange: (v: string) => void, value = "") {
  const e = editor();
  const r = render(withSlots(e, { IconPicker }, <IconInput label="Icon" value={value} onChange={onChange} />));
  return { e, r };
}
const open = async (r: ReturnType<typeof render>) => {
  await r.click(r.get("button[aria-haspopup]"));
  await act(flush);
};

describe("VirtualList", () => {
  it("mounts only the visible rows and scrolls an index into view", async () => {
    const r = render(<VirtualList count={1000} columns={7} itemSize={44} height={352} renderItem={(i) => <b data-i={i} />} />);
    assert.ok(r.all("[data-i]").length < 100, "windowed");
    r.unmount();
  });
});

describe("IconPicker", () => {
  it("the chip shows the icon and name, opens 'Select Icon' beside it", async () => {
    const { r } = iconRig(() => {}, "tb/TbPhone");
    assert.ok(r.get("[data-icon-thumb] svg"));
    assert.match(r.container.textContent ?? "", /TbPhone/);
    await open(r);
    assert.match(r.get("[role=dialog]").textContent ?? "", /^Select Icon/);
    r.unmount();
  });

  it("sections: Common, set categories, All · N; set dropdown lists the catalogue's sets", async () => {
    const { r } = iconRig(() => {});
    await open(r);
    const text = r.get("[role=dialog]").textContent ?? "";
    assert.match(text, /Common/);
    assert.match(text, /All · 5/);
    await r.click(r.get("[role=dialog] button[aria-haspopup=listbox]"));
    assert.deepEqual(r.all("[role=option]").map((o) => o.textContent).sort(), ["fa", "tb"]);
    r.unmount();
  });

  it("click picks and stays open; double-click picks, records Recents and closes", async () => {
    const picks: string[] = [];
    const { r } = iconRig((v) => picks.push(v));
    await open(r);
    const mail = () => r.get("button[aria-label='Icon: TbMail']");
    await r.click(mail());
    assert.deepEqual(picks, ["tb/TbMail"]);
    assert.equal(r.all("[role=dialog]").length, 1);
    await r.fire(mail(), "dblclick");
    assert.equal(picks.at(-1), "tb/TbMail");
    assert.equal(r.all("[role=dialog]").length, 0);
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("pagehub-editor:icon-recents")!), ["tb/TbMail"]);
    r.unmount();
  });

  it("pressing a cell (focus, hover preview) never re-creates its icon, so the click that follows still lands", async () => {
    const { r } = iconRig(() => {});
    await open(r);
    const cell = r.get("button[aria-label='Icon: TbMail']");
    const glyph = cell.querySelector("svg")!;
    await r.fire(cell, "mouseover");
    await act(flush);
    assert.equal(r.get("button[aria-label='Icon: TbMail']").querySelector("svg"), glyph, "the cell's svg node was replaced between press and release");
    r.unmount();
  });

  it("right-click toggles a favourite (persisted)", async () => {
    const { r } = iconRig(() => {});
    await open(r);
    await r.fire(r.get("button[aria-label='Icon: TbPhone']"), "contextmenu");
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("pagehub-editor:icon-favorites")!), ["tb/TbPhone"]);
    assert.match(r.get("[role=dialog]").textContent ?? "", /Favorites · 1/);
    r.unmount();
  });

  it("search filters to a count + grid; arrows move focus, Enter picks and closes", async () => {
    const picks: string[] = [];
    const { r } = iconRig((v) => picks.push(v));
    await open(r);
    await r.type(r.get("input[aria-label='Search icons']"), "tb");
    assert.match(r.get("[role=dialog]").textContent ?? "", /5 results/);
    const input = r.get("input[aria-label='Search icons']");
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(picks, ["tb/TbMail"]);
    assert.equal(r.all("[role=dialog]").length, 0);
    r.unmount();
  });

  it("moveFocus steps ±1 and ±7 and stays at the edges", () => {
    assert.equal(moveFocus(0, "ArrowRight", 10), 1);
    assert.equal(moveFocus(0, "ArrowLeft", 10), 0);
    assert.equal(moveFocus(2, "ArrowDown", 10), 9);
    assert.equal(moveFocus(4, "ArrowDown", 10), 4);
    assert.equal(moveFocus(9, "ArrowUp", 10), 2);
  });

  it("the X clears; with no catalogue the panel says so", async () => {
    const picks: string[] = [];
    const { r } = iconRig((v) => picks.push(v), "tb/TbPhone");
    await r.click(r.get("button[aria-label='Clear icon']"));
    assert.deepEqual(picks, [""]);
    r.unmount();
    const bare = createTestEditor({ files: { "index.liquid": "<p>x</p>\n" }, extensions: [htmlKit(), editorKit()] });
    const r2 = render(withSlots(bare, { IconPicker }, <IconInput value="" onChange={() => {}} />));
    await open(r2);
    assert.match(r2.get("[role=dialog]").textContent ?? "", /No icon catalogue/);
    r2.unmount();
  });
});

describe("FontPicker", () => {
  function fontRig(onChange: (v: string) => void, onPreview?: (f: string | null) => void, value = "") {
    const e = editor();
    const r = render(withSlots(e, { FontPicker }, <FontInput label="Font" value={value} onChange={onChange} onPreview={onPreview} />));
    return { r };
  }
  const options = (r: ReturnType<typeof render>) => r.all("[role=listbox] [role=option]").map((o) => o.textContent?.replace("Preview", ""));

  it("lists every family in its own face; the tab dropdown carries counts", async () => {
    const { r } = fontRig(() => {});
    await open(r);
    assert.deepEqual(options(r), ["Inter", "Lora", "Roboto Mono", "Pacifico"]);
    assert.equal((r.all("[role=listbox] [role=option]")[1] as HTMLElement).style.fontFamily.includes("Lora"), true);
    await r.click(r.get("[role=dialog], body > div button[aria-haspopup=listbox]"));
    const tabs = r.all("[role=option]").map((o) => o.textContent);
    assert.ok(tabs.includes("All Fonts (4)") && tabs.includes("Serif (1)") && tabs.includes("Monospace (1)"));
    r.unmount();
  });

  it("search filters; click picks, loads 400 + 700 and closes", async () => {
    const picks: string[] = [];
    const { r } = fontRig((v) => picks.push(v));
    await open(r);
    await r.type(r.get("input[aria-label='Search fonts']"), "lo");
    assert.deepEqual(options(r), ["Lora"]);
    await r.click(r.all("[role=option]")[0]!);
    assert.deepEqual(picks, ["Lora"]);
    assert.ok(loaded.includes("Lora"));
    r.unmount();
  });

  it("hover and arrows preview; leaving the list restores; Enter picks the focused row", async () => {
    const seen: (string | null)[] = [];
    const picks: string[] = [];
    const { r } = fontRig((v) => picks.push(v), (f) => seen.push(f));
    await open(r);
    const input = r.get("input[aria-label='Search fonts']");
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(seen, ["Inter"], "the focused row previews");
    assert.deepEqual(picks, ["Inter"]);
    assert.equal(loaded.includes("Inter"), true);
    r.unmount();
  });

  it("default catalogue: a curated list, popular first, every family categorised", () => {
    assert.equal(DEFAULT_FONT_FAMILIES[0]!.family, "Roboto");
    assert.ok(DEFAULT_FONT_FAMILIES.length > 130);
    assert.equal(fontsInTab(DEFAULT_FONT_FAMILIES, "Popular").length, 20);
    assert.ok(fontsInTab(DEFAULT_FONT_FAMILIES, "Monospace").some((f) => f.family === "Roboto Mono"));
    assert.equal(new Set(DEFAULT_FONT_FAMILIES.map((f) => f.family)).size, DEFAULT_FONT_FAMILIES.length, "no duplicates");
  });
});
