import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { defineCommand } from "@pagehub/engine";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor } from "@pagehub/engine/testing";
import { Editor, editorKit } from "../src/index.ts";
import { TopBar } from "../src/features/topbar/TopBar.tsx";
import { chromeOf } from "../src/shell/chromeState.ts";
import { canvasOf } from "../src/features/canvas/canvasState.ts";
import { setRichText } from "../src/features/richtext/richTextState.ts";
import { listPageFiles, pageName, pageRoute } from "../src/features/topbar/pages.ts";
import { actRun, fixtureEditor, render as mount } from "./harness.tsx";

const mounted: Array<ReturnType<typeof mount>> = [];
const render: typeof mount = (ui) => {
  const r = mount(ui);
  mounted.push(r);
  return r;
};
afterEach(() => {
  for (const r of mounted.splice(0)) r.unmount();
});

const items = (r: ReturnType<typeof render>) => r.all("[data-topbar-item]").map((b) => b.getAttribute("data-topbar-item"));

describe("top bar (3.6)", () => {
  it("three groups — left: Undo, Redo; centre: the address pill (PageSelector + SaveStatus); right: [BreakpointSwitcher], Preview, More (Insert, Save and the board toggle are not top-bar buttons)", () => {
    const r = render(<Editor editor={fixtureEditor()} />);
    const [left, pillWrap, right] = r.all('[data-slot="TopBar"] header > div') as [HTMLElement, HTMLElement, HTMLElement];
    // Insert lives in the Add panel and Save is the pill's status, so neither is a top-bar button.
    assert.deepEqual(items(r), ["history.undo", "history.redo", "preview.toggle", "menu.more"]);
    // Left group: the history actions only.
    assert.deepEqual([...left.children].map((c) => c.getAttribute("data-topbar-item")), ["history.undo", "history.redo"]);
    // Centre: the rounded address pill holds the PageSelector (page switcher) and the SaveStatus indicator.
    const pill = pillWrap.firstElementChild!;
    assert.deepEqual([...pill.querySelectorAll("[data-slot]")].map((c) => c.getAttribute("data-slot")), ["PageSelector", "SaveStatus"]);
    const rightKids = [...right.children].map((c) => c.getAttribute("data-topbar-item") ?? c.getAttribute("data-slot"));
    assert.deepEqual(rightKids, ["BreakpointSwitcher", "preview.toggle", "menu.more"], "device switcher leads the right cluster");
    assert.equal(r.all('[data-topbar-item="component.toggleEditor"]').length, 0, "the Components-editor toggle moved out of the top bar");
    assert.match(r.get('[data-topbar-item="history.undo"]').getAttribute("data-tooltip-content")!, /^Undo \(/);
  });

  it("into: no header of its own; the groups render in the host's elements", () => {
    const address = document.createElement("div");
    const controls = document.createElement("div");
    document.body.append(address, controls);
    const Bar = () => <TopBar into={{ address, controls }} />;
    const r = render(<Editor editor={fixtureEditor()} components={{ TopBar: Bar }} />);
    assert.equal(r.all("header").length, 0);
    assert.deepEqual([...address.querySelectorAll("[data-slot]")].map((c) => c.getAttribute("data-slot")), ["PageSelector", "SaveStatus"]);
    for (const host of [address, controls]) {
      const scope = host.firstElementChild!;
      assert.ok(scope.hasAttribute("data-ph-editor-scope"), "portalled groups carry the scope so the scoped utilities reach them");
      assert.ok(scope.hasAttribute("data-theme") || !document.documentElement.hasAttribute("data-theme"), "and the chrome theme");
    }
    assert.deepEqual([...controls.firstElementChild!.children].map((c) => c.getAttribute("data-topbar-item") ?? c.getAttribute("data-slot")), ["BreakpointSwitcher", "preview.toggle", "menu.more"]);
    assert.equal(r.all('[data-topbar-item="history.undo"]').length, 0, "no nav target, no history group");
    address.remove();
    controls.remove();
  });

  it("Publish shows only when a host registers site.publish", () => {
    const publish = defineCommand({ id: "site.publish", title: "Publish", run: () => true });
    const e = createTestEditor({ files: { "index.liquid": "<p>x</p>" }, extensions: [htmlKit(), tailwindKit(), editorKit(), publish] });
    const r = render(<Editor editor={e} />);
    assert.ok(items(r).includes("site.publish"));
  });

  it("Undo / Redo: disabled with empty history; hidden while editing text", () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} components={{ InlineTextToolbar: null }} />); // no TipTap session in this test
    assert.equal((r.get('[data-topbar-item="history.undo"]') as HTMLButtonElement).disabled, true);
    actRun(e, "attr.set", { name: "id", value: "x", at: e.get("h1") });
    assert.equal((r.get('[data-topbar-item="history.undo"]') as HTMLButtonElement).disabled, false);
    act(() => void e.dispatch((tr) => tr.effect(setRichText, { editing: e.get("h1") })));
    assert.equal(r.all('[data-topbar-item="history.undo"], [data-topbar-item="history.redo"]').length, 0);
  });

  it("Preview: turns editing off and clears the selection (eye ↔ code); Esc / exit restores the selection", async () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    const sel = e.state.selection.primary;
    await r.click(r.get('[data-topbar-item="preview.toggle"]'));
    assert.equal(chromeOf(e.state).preview, true);
    assert.equal(e.state.selection.handles.length, 0);
    assert.equal(r.all('aside[data-sidebar-open="true"]').length, 0, "sidebar hidden in preview");
    actRun(e, "preview.exit");
    assert.equal(e.state.selection.primary, sel);
  });

  it("More toggles the drawer: Settings / View / Tools / Preferences, state-titled toggles, click outside closes", async () => {
    const e = fixtureEditor();
    const r = render(<Editor editor={e} />);
    await r.click(r.get('[data-topbar-item="menu.more"]'));
    const menu = r.get("[data-more-menu]");
    assert.deepEqual([...menu.querySelectorAll("[data-more-section]")].map((s) => s.getAttribute("aria-label")), ["Settings", "View", "Tools", "Preferences"]);
    // The component-board toggle lives here (Tools), not on the top bar, and still state-titles itself.
    assert.equal(r.get('[data-command="component.toggleEditor"]').closest("[data-more-section]")?.getAttribute("aria-label"), "Tools");
    assert.equal(r.get('[data-command="component.toggleEditor"]').textContent?.startsWith("Switch to components editor"), true);
    assert.equal(r.get('[data-command="view.toggleGridlines"]').textContent?.startsWith("Show grid lines"), true);
    assert.equal(r.get('[data-command="view.toggleMarkers"]').textContent?.startsWith("Show breakpoint lines"), true);
    assert.equal(r.get('[data-command="sidebar.toggleSide"]').textContent, "Move settings panel to the right");
    await r.click(r.get('[data-command="view.toggleMarkers"]'));
    assert.equal(canvasOf(e.state).markers, true);
    assert.equal(chromeOf(e.state).drawer, null, "a pick closes");
    await r.click(r.get('[data-topbar-item="menu.more"]'));
    await r.fire(document.body, "pointerdown");
    assert.equal(chromeOf(e.state).drawer, null, "click outside closes");
  });

  it("hidden by the host: TopBar: null", () => {
    const r = render(<Editor editor={fixtureEditor()} components={{ TopBar: null }} />);
    assert.equal(r.all('[data-slot="TopBar"]').length, 0);
  });
});

describe("page selector (3.6)", () => {
  const files = (n: number) => Object.fromEntries([["index.liquid", "<p>home</p>"], ["partials/x.liquid", "<p>p</p>"], ...Array.from({ length: n - 1 }, (_, i) => [`page-${i}.liquid`, `<p>${i}</p>`])]);
  const site = (n = 3) => createTestEditor({ files: files(n), extensions: [htmlKit(), tailwindKit(), editorKit()] });

  it("routes and names from page files", () => {
    assert.deepEqual(["index.liquid", "about.html", "blog/index.html", "blog/first-post.liquid"].map((p) => pageRoute(p)), ["/", "/about", "/blog", "/blog/first-post"]);
    assert.equal(pageName("index.liquid"), "Home");
    assert.equal(pageName("contact-us.liquid"), "Contact us");
  });

  it("trigger: home or file icon + slug; tooltip 'Name — /route'; rows show name + route; picking switches the canvas page", async () => {
    const e = site();
    const r = render(<Editor editor={e} canvasHost={{ previewUrl: (route) => `/preview${route}` }} />);
    const trigger = r.get("[data-page-trigger]");
    assert.equal(trigger.getAttribute("data-tooltip-content"), "Home — /");
    assert.ok(trigger.querySelector('[data-glyph="home"], svg'));
    assert.ok(r.get('[data-slot="TopBar"] header > div:nth-child(2) [data-slot="PageSelector"]'), "fills the top bar's centre address pill");
    assert.equal(r.all('[data-slot="Breadcrumb"] [data-slot="PageSelector"]').length, 0, "no longer in the breadcrumb row");
    await r.click(trigger);
    assert.equal(r.get("[data-page-menu]").textContent?.includes("Pages"), true);
    assert.equal(r.all("[data-page-search]").length, 0, "no search under 8 pages");
    assert.deepEqual(r.all("[data-page-row]").map((b) => b.getAttribute("data-page-row")), ["index.liquid", "page-0.liquid", "page-1.liquid"]);
    assert.equal(r.get('[data-page-row="page-1.liquid"]').textContent, "Page 1/page-1");
    await r.click(r.get('[data-page-row="page-1.liquid"]'));
    assert.equal(canvasOf(e.state).page, "page-1.liquid");
    assert.equal(r.all("[data-page-menu]").length, 0);
    assert.equal(r.get("[data-page-trigger]").textContent, "Page 1");
    assert.equal(r.get("[data-page-open]").getAttribute("aria-label"), "Open page in a new tab");
    assert.equal(r.get("[data-page-open]").getAttribute("target"), "_blank");
    assert.equal(r.get("[data-page-open]").getAttribute("href"), "/preview/page-1", "the link is the host's previewUrl for the current route");
  });

  it("hosted layout: pages live under pages/; routes are relative to it and Home opens first", async () => {
    assert.deepEqual(
      ["pages/index.liquid", "pages/account.liquid", "pages/products/[handle].liquid", "pages/blog/index.liquid"].map((p) => pageRoute(p, "pages/")),
      ["/", "/account", "/products/:handle", "/blog"],
    );
    assert.equal(pageName("pages/products/[handle].liquid", "pages/"), "Handle");
    assert.deepEqual(listPageFiles(["pages/account.liquid", "partials/nav.liquid", "theme.css", "pages/index.liquid", "layout/theme.liquid", "pages/plants/[slug].liquid"]), ["pages/index.liquid", "pages/account.liquid", "pages/plants/[slug].liquid"]);

    // alphabetically `account` comes first, yet the editor opens on Home
    const e = createTestEditor({
      files: { "pages/account.liquid": "<p>a</p>", "pages/index.liquid": "<p>h</p>", "pages/plants/[slug].liquid": "<p>p</p>", "partials/nav.liquid": "<p>n</p>" },
      extensions: [htmlKit(), tailwindKit(), editorKit()],
    });
    const r = render(<Editor editor={e} />);
    assert.equal(r.get("[data-page-trigger]").getAttribute("data-tooltip-content"), "Home — /");
    await r.click(r.get("[data-page-trigger]"));
    assert.deepEqual(r.all("[data-page-row]").map((b) => b.textContent), ["Home/", "Account/account", "Slug/plants/:slug"]);
  });

  it("host page records give the route and name; a page without one is derived from its file", async () => {
    const e = createTestEditor({
      files: { "pages/index.liquid": "<p>h</p>", "pages/shop.liquid": "<p>s</p>", "pages/extra.liquid": "<p>x</p>" },
      extensions: [htmlKit(), tailwindKit(), editorKit()],
    });
    const pages = [{ path: "pages/index.liquid", url: "/", name: "Welcome" }, { path: "pages/shop.liquid", url: "/store", name: "The shop" }];
    const r = render(<Editor editor={e} canvasHost={{ pages: () => pages }} />);
    assert.equal(r.get("[data-page-trigger]").getAttribute("data-tooltip-content"), "Home — /");
    await r.click(r.get("[data-page-trigger]"));
    assert.deepEqual(r.all("[data-page-row]").map((b) => b.textContent), ["Home/", "The shop/store", "Extra/extra"]);
  });

  it("no canvasHost.previewUrl, no 'Open in new tab' link", () => {
    const r = render(<Editor editor={site()} />);
    assert.equal(r.all("[data-page-open]").length, 0);
  });

  it("search at 8+ pages ('No pages found'); a deleted page falls back to home", async () => {
    const e = site(8);
    const r = render(<Editor editor={e} />);
    await r.click(r.get("[data-page-trigger]"));
    await r.type(r.get("[data-page-search]"), "zzz");
    assert.match(r.get("[data-page-menu]").textContent!, /No pages found/);
    actRun(e, "canvas.set", { page: "missing.liquid" });
    assert.equal(r.get("[data-page-trigger]").getAttribute("data-tooltip-content"), "Home — /");
  });
});
