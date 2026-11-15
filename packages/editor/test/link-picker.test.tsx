import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { useState } from "react";
import { htmlKit, tailwindKit } from "@pagehub/engine/kits";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { editorKit } from "../src/index.ts";
import { CanvasHostContext, type CanvasHost } from "../src/features/canvas/canvasHost.ts";
import { LinkPicker } from "../src/features/links/LinkPicker.tsx";
import { ActionsEditor } from "../src/features/inspector/ActionsEditor.tsx";
import { render, withEditor, type Rendered } from "./harness.tsx";

const FILES = {
  "pages/index.liquid": `<main><a id="cta" href="/about">About</a></main>\n`,
  "pages/about.liquid": `<section id="team"><h2>Team</h2></section><section id="contact"></section>\n`,
  "pages/products/[handle].liquid": `<h1>{{ product.title }}</h1>\n`,
  "partials/header.liquid": `<header></header>\n`,
};

function editor(): TestEditor {
  return createTestEditor({ files: FILES, extensions: [htmlKit(), tailwindKit(), editorKit()] });
}

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

/** A LinkPicker over local href / newTab state; `changes` records every href it emits. */
function mount(start = "", e = editor()) {
  const changes: string[] = [];
  const tabs: boolean[] = [];
  function Host() {
    const [href, setHref] = useState(start);
    const [blank, setBlank] = useState(false);
    return (
      <>
        <LinkPicker idPrefix="t" href={href} newTab={blank} onChange={(v) => (changes.push(v), setHref(v))} onNewTabChange={(on) => (tabs.push(on), setBlank(on))} />
        <output id="href">{href}</output>
        <button id="external" type="button" onClick={() => setHref("mailto:x@y.com")} />
      </>
    );
  }
  const r = render(withEditor(e, <Host />));
  mounted = r;
  const tab = (label: string) => r.all('[data-link-picker] [role="tab"]').find((t) => t.textContent === label)!;
  const selectedTab = () => r.get('[data-link-picker] [role="tab"][aria-selected="true"]').textContent;
  return { r, changes, tabs, tab, selectedTab, href: () => r.get("#href").textContent };
}

describe("LinkPicker", () => {
  it("has the four tabs and lists linkable pages by name, Home first, without detail pages", () => {
    const { r, selectedTab } = mount();
    assert.deepEqual(r.all('[data-link-picker] [role="tab"]').map((t) => t.textContent), ["Page", "Website", "Email", "Phone"]);
    assert.equal(selectedTab(), "Page");
    assert.deepEqual(r.all("[data-link-page]").map((o) => o.getAttribute("data-link-page")), ["/", "/about"]);
    assert.deepEqual(r.all('[role="option"]').map((o) => o.querySelector("span")!.textContent), ["Home", "About"]);
    assert.equal(r.get<HTMLInputElement>("[data-link-search]").placeholder, "Choose a page");
  });

  it("picking a page writes its route and checks it; a section on it adds #id", async () => {
    const { r, href } = mount();
    await r.click(r.get('[data-link-page="/about"]'));
    assert.equal(href(), "/about");
    assert.equal(r.get('[data-link-page="/about"]').getAttribute("aria-selected"), "true");
    await r.click(r.get("#input-t-section"));
    const sections = r.all('[role="option"]').filter((o) => !o.hasAttribute("data-link-page"));
    assert.deepEqual(sections.map((o) => o.textContent), ["None", "#team", "#contact"]);
    await r.click(sections.find((o) => o.textContent === "#team")!);
    assert.equal(href(), "/about#team");
  });

  it("search filters the pages", async () => {
    const { r } = mount();
    await r.type(r.get("[data-link-search]"), "abo");
    assert.deepEqual(r.all("[data-link-page]").map((o) => o.getAttribute("data-link-page")), ["/about"]);
    await r.type(r.get("[data-link-search]"), "zzz");
    assert.match(r.get('[role="listbox"]').textContent!, /No pages found/);
  });

  it("opens on the tab the href is, with its value in the field", () => {
    const cases: [string, string, string | null][] = [
      ["/about", "Page", null],
      ["mailto:hi@example.com", "Email", "hi@example.com"],
      ["tel:+15551234567", "Phone", "+15551234567"],
      ["https://example.com", "Website", "https://example.com"],
      ["/shop", "Website", "/shop"],
      ["{{ product.url }}", "Website", "{{ product.url }}"],
    ];
    for (const [start, kind, field] of cases) {
      const { r, selectedTab } = mount(start);
      assert.equal(selectedTab(), kind, start);
      if (field !== null) assert.equal(r.get<HTMLInputElement>("[data-link-body] input").value, field, start);
      mounted!.unmount();
      mounted = null;
    }
  });

  it("web gets https:// for a bare domain; email → mailto:; phone → tel: without spaces or dashes", async () => {
    const { r, tab, href } = mount();
    await r.click(tab("Website"));
    await r.type(r.get("#input-t-web"), "example.com");
    assert.equal(href(), "https://example.com");
    assert.equal(r.get<HTMLInputElement>("#input-t-web").value, "example.com", "the field keeps what was typed");
    await r.click(tab("Email"));
    assert.equal(r.get<HTMLInputElement>("#input-t-email").placeholder, "name@example.com");
    await r.type(r.get("#input-t-email"), "hi@example.com");
    assert.equal(href(), "mailto:hi@example.com");
    await r.click(tab("Phone"));
    assert.equal(r.get<HTMLInputElement>("#input-t-phone").placeholder, "+1 555 123 4567");
    await r.type(r.get("#input-t-phone"), "+1 555-123 4567");
    assert.equal(href(), "tel:+15551234567");
    await r.click(tab("Website"));
    assert.equal(href(), "https://example.com", "back to a filled tab: its link again");
  });

  it("looking at an empty tab never blanks the href", async () => {
    const { r, tab, changes, href } = mount("/about");
    await r.click(tab("Email"));
    await r.click(tab("Phone"));
    assert.deepEqual(changes, []);
    assert.equal(href(), "/about");
  });

  it("the body keeps one fixed height across tabs", async () => {
    const { r, tab } = mount();
    for (const label of ["Page", "Website", "Email", "Phone"]) {
      await r.click(tab(label));
      assert.match(r.get("[data-link-body]").className, /\bh-52\b/, label);
    }
  });

  it("new tab toggles; it re-reads an href changed from outside", async () => {
    const { r, tabs, selectedTab } = mount("/about");
    await r.click(r.get("[data-link-new-tab]"));
    assert.deepEqual(tabs, [true]);
    await r.click(r.get("#external"));
    assert.equal(selectedTab(), "Email");
    assert.equal(r.get<HTMLInputElement>("#input-t-email").value, "x@y.com");
  });

  it("uses the host's page names and routes", () => {
    const e = editor();
    const host: CanvasHost = { pages: () => [{ path: "pages/about.liquid", url: "/our-story", name: "Our story" }] };
    const r = render(withEditor(e, <CanvasHostContext.Provider value={host}><LinkPicker idPrefix="h" href="/our-story" onChange={() => {}} /></CanvasHostContext.Provider>));
    mounted = r;
    assert.deepEqual(r.all('[role="option"]').map((o) => o.querySelector("span")!.textContent), ["Home", "Our story"]);
    assert.equal(r.get('[data-link-page="/our-story"]').getAttribute("aria-selected"), "true");
    assert.equal(r.all("[data-link-new-tab]").length, 0, "no onNewTabChange: no new-tab line");
  });
});

describe("Action editor: Link uses the link picker", () => {
  it("writes href, target and rel; rel stays reachable under Advanced; an emptied link keeps the action", async () => {
    const e = editor();
    const r = render(withEditor(e, <ActionsEditor handle={e.get("#cta")} />));
    mounted = r;
    const card = r.get('[data-action-card="link"]');
    assert.ok(card.querySelector("[data-link-picker]"), "the shared picker");
    assert.equal(card.querySelector('[placeholder="Page, web address, email or phone"]'), null, "the old free-text field is gone");
    assert.equal(r.get('[data-link-page="/about"]').getAttribute("aria-selected"), "true");
    const tab = (label: string) => r.all('[data-link-picker] [role="tab"]').find((t) => t.textContent === label)!;
    await r.click(tab("Email"));
    await r.type(r.get("#input-action-link-email"), "hi@example.com");
    assert.match(e.text(), /<a id="cta" href="mailto:hi@example\.com">/);
    await r.click(r.get("[data-link-new-tab]"));
    assert.match(e.text(), /href="mailto:hi@example\.com" target="_blank" rel="noopener noreferrer"/);
    const advanced = r.get<HTMLDetailsElement>("[data-action-advanced]");
    assert.equal(advanced.open, false, "rel is out of the main view");
    assert.ok(advanced.querySelector("#input-action-rel"), "but reachable");
    await r.click(r.get("[data-link-new-tab]"));
    assert.doesNotMatch(e.text(), /target=|rel=/);
    await r.type(r.get("#input-action-link-email"), "");
    assert.match(e.text(), /<a id="cta" href="">/);
    assert.ok(r.get('[data-action-card="link"]'), "the Link card stays");
  });
});
