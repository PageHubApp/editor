// Inspector parity leftovers (docs/features/html-first-inspector-parity.md): an action's gate in the condition builder,
// alt text as chips, animation exit / stagger, shadow tiles, video source, icon image, URL filters + pagination in the
// Data source panel, and the canvas's sample detail-page params.
import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ReactNode } from "react";
import { lint } from "@pagehub/engine";
import { liquidKit } from "@pagehub/engine/kits";
import type { TestEditor } from "@pagehub/engine/testing";
import { ComponentsProvider } from "../src/components.ts";
import { defaultCanvasRender } from "../src/features/canvas/canvasContext.ts";
import { sampleRequest } from "../src/features/canvas/sampleParams.ts";
import { ActionsEditor } from "../src/features/inspector/ActionsEditor.tsx";
import { ActionConditionsEditor } from "../src/features/inspector/ActionConditionsEditor.tsx";
import { setActionGate } from "../src/features/inspector/actionGate.ts";
import { iconImageSource } from "../src/features/inspector/componentRowControls.tsx";
import { AnimationControl } from "../src/features/inspector/controls/AnimationControl.tsx";
import { appendVariable, joinBound, removeVariable, setText, splitBound, variablePath } from "../src/features/inspector/controls/boundText.ts";
import { VideoProviderControl } from "../src/features/inspector/controls/element/VideoProviderControl.tsx";
import { VideoSourceControl } from "../src/features/inspector/controls/element/VideoSourceControl.tsx";
import { buildVideoSrc, uploadedIdFromSrc, videoIdFromSrc, videoProviderFromSrc } from "../src/features/inspector/controls/element/videoProviders.ts";
import { DataSourcePanel } from "../src/features/inspector/DataSourcePanel.tsx";
import { distinctValues, filterFormMarkup, urlFilterMarkup } from "../src/features/inspector/dataSourceActions.ts";
import { RowControl } from "../src/features/inspector/PropertyRow.tsx";
import { inspectorRows } from "../src/features/inspector/rows/inspectorRows.ts";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";
import { render, type Rendered } from "./harness.tsx";
import { pageEditor, select } from "./inspectorFixture.tsx";

const F = "index.liquid";
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
  localStorage.clear();
});

const open = (src: string, sel: string, ui: (e: TestEditor) => ReactNode) => {
  const e = pageEditor({ [F]: src }, [liquidKit()]);
  select(e, sel);
  r = render(
    <EditorStoreProvider store={e}>
      <ComponentsProvider value={DEFAULT_COMPONENTS}>{ui(e)}</ComponentsProvider>
    </EditorStoreProvider>,
  );
  return e;
};
const field = (id: string) => document.getElementById(`input-${id}`) as HTMLInputElement;
const enter = (el: Element) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
const setField = async (id: string, value: string) => {
  await r!.type(field(id), value);
  enter(field(id));
};
const button = (text: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text || b.getAttribute("aria-label") === text : text.test(b.textContent ?? "")))!;
const row = (id: string) => inspectorRows().find((x) => x.id === id)!;

describe("an action's 'only fire when' gate uses the condition builder", () => {
  const BTN = `<button class="btn" data-cart="add">Buy</button>`;

  it("a parseable gate shows condition cards; changing one rewrites the {% if %}, removing the last ungates", async () => {
    const e = open(BTN, "button", (ed) => <ActionConditionsEditor handle={ed.get("button")} />);
    assert.ok(button("Add to Cart: only fire when…"), "an ungated action offers the builder, not a Liquid field");
    assert.equal(document.querySelector("[id^=input-action-if-add-to-cart]"), null);
    await act(async () => void setActionGate(e, e.get("button"), "add-to-cart", "customer"));
    assert.ok(document.querySelector('[data-condition="auth"]'), "the gate reads back as a signed-in customer condition");
    assert.equal(field("action-if-add-to-cart"), null, "no raw 'Only if' field for a gate the builder can show");
    await r!.click(document.querySelector('[data-condition="auth"] [role="tab"][aria-selected="false"]')!);
    assert.match(e.text(), /\{% if customer == blank %\}data-cart="add"\{% endif %\}/);
    assert.deepEqual(lint(e.text()), [], "the gate the editor writes passes the lint every save runs");
    await r!.click(document.querySelector<HTMLElement>('[data-condition="auth"] button[aria-label="Remove condition"]')!);
    assert.match(e.text(), /<button class="btn" data-cart="add">/, "removing the only condition ungates the action");
  });

  it("the Action list keeps a gated action (its card says so) and removing it clears the gate too", async () => {
    const e = open(BTN, "button", (ed) => <ActionsEditor handle={ed.get("button")} />);
    await act(async () => void setActionGate(e, e.get("button"), "add-to-cart", "customer"));
    assert.ok(document.querySelector('[data-action-card="add-to-cart"] [data-action-gated]'), "still listed, marked gated");
    await r!.click(button("Remove Add to Cart"));
    assert.doesNotMatch(e.text(), /data-cart|\{% if/);
  });

  it("a gate the builder can't show (mixed and / or) stays editable as Liquid", async () => {
    const e = open(BTN, "button", (ed) => <ActionConditionsEditor handle={ed.get("button")} />);
    await act(async () => void setActionGate(e, e.get("button"), "add-to-cart", "a == 1 or b == 2 and c == 3"));
    assert.deepEqual(lint(e.text()), [], "a raw-Liquid gate is the same shape");
    assert.ok(field("action-if-add-to-cart"), "falls back to the expression field");
    assert.equal(document.querySelector("[data-condition]"), null);
  });
});

describe("alt text is variable chips plus text", () => {
  const IMG = `<img src="a.png" alt="Photo of {{ item.title }} today">`;

  it("splits and joins bound text", () => {
    const parts = splitBound("Photo of {{ item.title }} today");
    assert.deepEqual(parts, ["Photo of ", "{{ item.title }}", " today"]);
    assert.equal(variablePath(parts[1]!), "item.title");
    assert.equal(variablePath("{{ item.title | upcase }}"), "item.title");
    assert.equal(joinBound(setText(parts, 2, " later")), "Photo of {{ item.title }} later");
    assert.equal(joinBound(removeVariable(parts, 1)), "Photo of  today");
    assert.deepEqual(splitBound("plain"), ["plain"]);
    assert.equal(joinBound(appendVariable(["x "], "item.name")), "x {{ item.name }}");
  });

  it("the Alt text row shows the binding as a chip, not Liquid, and the chip's X removes just that variable", async () => {
    const e = open(IMG, "img", (ed) => <RowControl row={row("alt")} handle={ed.get("img")} />);
    const chip = document.querySelector("[data-bound-chip]")!;
    assert.equal(chip.textContent?.trim(), "item.title");
    for (const i of document.querySelectorAll<HTMLInputElement>("input")) assert.ok(!i.value.includes("{{"), `no input shows raw Liquid (${i.value})`);
    const text = [...document.querySelectorAll<HTMLInputElement>("[data-bound-text] input")].map((i) => i.value);
    assert.deepEqual(text, ["Photo of ", " today"]);
    await r!.click(button("Remove item.title"));
    assert.match(e.text(), /alt="Photo of  today"/);
  });
});

describe("animation: exit and stagger", () => {
  it("Exit appears with an entrance and writes data-animate-exit", async () => {
    const e = open(`<div data-animate="fade-up">x</div>`, "div", () => <AnimationControl />);
    assert.ok(document.querySelector('[data-animation-attr="data-animate-exit"]'), "Exit is offered once there is an entrance");
    await r!.click(field("data-animate-exit"));
    await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === "Fade out up")!);
    assert.match(e.text(), /data-animate-exit="fade-out-up"/);
  });

  it("Exit is hidden until there is an entrance; Stagger children is always offered and writes data-animate-stagger", async () => {
    const e = open(`<ul><li data-animate="fade-in">a</li></ul>`, "ul", () => <AnimationControl />);
    assert.equal(document.querySelector('[data-animation-attr="data-animate-exit"]'), null);
    const stagger = document.querySelector('[data-animation-attr="data-animate-stagger"]')!;
    await r!.click([...stagger.querySelectorAll<HTMLElement>("button, [role=radio]")].find((b) => b.textContent?.trim() === "100")!);
    assert.match(e.text(), /<ul data-animate-stagger="100ms">/);
  });
});

describe("shadow preset tiles", () => {
  it("draw each size with its shadow; clicking picks it, clicking the active tile clears it", async () => {
    const e = open(`<section class="p-4">x</section>`, "section", (ed) => <RowControl row={row("shadow")} handle={ed.get("section")} />);
    const tile = (k: string) => document.querySelector<HTMLElement>(`[data-shadow-tile="${k}"]`)!;
    assert.match(tile("shadow-lg").querySelector("span")!.style.boxShadow, /10px 15px/);
    assert.equal(tile("shadow-none").querySelector("span")!.style.boxShadow, "none");
    await r!.click(tile("shadow-lg"));
    assert.match(e.text(), /class="p-4 shadow-lg"/);
    assert.equal(tile("shadow-lg").getAttribute("aria-checked"), "true");
    await r!.click(tile("shadow-lg"));
    assert.doesNotMatch(e.text(), /shadow-lg/);
  });
});

describe("video source", () => {
  it("knows an uploaded video from a direct URL, and writes the file_url form", () => {
    const up = `{{ "abc-123" | file_url }}`;
    assert.equal(videoProviderFromSrc("video", up), "uploaded");
    assert.equal(videoProviderFromSrc("video", "https://x.test/v.mp4"), "file");
    assert.equal(uploadedIdFromSrc(up), "abc-123");
    assert.equal(uploadedIdFromSrc(buildVideoSrc("uploaded", "abc-123")), "abc-123");
    assert.ok(!buildVideoSrc("uploaded", "abc-123").includes('"'), "safe to write as an attribute value");
    assert.equal(videoIdFromSrc(up), "", "a library id never carries to a hosted provider");
    assert.equal(videoProviderFromSrc("video", buildVideoSrc("uploaded", "")), "uploaded", "an Uploaded video with nothing picked yet stays Uploaded");
    assert.equal(videoProviderFromSrc("iframe", buildVideoSrc("youtube", "")), "youtube", "so does a YouTube embed with no id");
  });

  it("an uploaded video picks from the library (video filter); a hosted one takes its id; a file its URL", async () => {
    open(`<video src='{{ "abc" | file_url }}'></video>`, "video", (ed) => <VideoSourceControl handle={ed.get("video")} row={row("videoId")} />);
    assert.ok(document.querySelector('[data-video-source="uploaded"]'));
    assert.match(document.body.textContent ?? "", /public: anyone with the link/);
    r!.unmount();
    const e = open(`<iframe src="https://www.youtube.com/embed/abc"></iframe>`, "iframe", (ed) => <VideoSourceControl handle={ed.get("iframe")} row={row("videoId")} />);
    assert.equal(field("video-source").value, "abc", "YouTube shows the id, not the URL");
    await setField("video-source", "dQw4w9WgXcQ");
    assert.match(e.text(), /src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
    r!.unmount();
    open(`<video src="https://x.test/v.mp4"></video>`, "video", (ed) => <VideoSourceControl handle={ed.get("video")} row={row("videoId")} />);
    assert.equal(field("video-source").value, "https://x.test/v.mp4");
    r!.unmount();
    const up = open(`<video src="https://x.test/v.mp4"></video>`, "video", (ed) => <VideoProviderControl handle={ed.get("video")} row={row("provider")} />);
    await r!.click(field("video-provider"));
    await r!.click([...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.includes("Uploaded"))!);
    assert.match(up.text(), /<video src="\{\{ '' \| file_url \}\}">/, "switching to Uploaded writes a src the attribute can hold");
  });
});

describe("icon image", () => {
  it("an image icon is the converter's span + full-size img, carrying the icon's own class and id", () => {
    assert.equal(
      iconImageSource({ class: "size-6", id: "mark", "data-edit-name": null }, `{{ 'abc' | image_url }}`),
      `<span class="size-6 inline-flex items-center justify-center" id="mark"><img class="size-full object-contain" src="{{ 'abc' | image_url }}" alt=""></span>`,
    );
  });
});

describe("Data source: URL filters and pagination", () => {
  const GRID = `<div class="grid">{% for item in products %}<article class="card">{{ item.title }}</article>{% endfor %}</div>`;
  const panel = (src = GRID) => open(src, ".card", (ed) => <DataSourcePanel handle={ed.get(".card")} />);

  it("builds the converter's markup", () => {
    assert.equal(urlFilterMarkup("rows", "categories", "category"), `{% if request.query.category and request.query.category != '' %}{% assign rows = rows | where: 'categories', request.query.category %}{% endif %}`);
    assert.match(filterFormMarkup("category", "categories", ["Tees", "Hats"]), /<form method="get" data-autosubmit[\s\S]*<option value="">All<\/option>[\s\S]*selected>Tees</);
    assert.match(filterFormMarkup("q", "title", []), /<input type="search" name="q"/);
    assert.deepEqual(distinctValues([{ c: ["a", "b"] }, { c: ["b", "c"] }, { c: "d" }], "c"), ["a", "b", "c", "d"]);
  });

  it("Add URL filter creates the managed assign + filter, lists it, and Insert filter form adds the GET form above the grid", async () => {
    const e = panel();
    await r!.click(button("Add URL filter"));
    await setField("ds-url-field", "categories");
    await setField("ds-url-param", "category");
    await r!.click(button("Add URL filter"));
    assert.match(e.text(), /\{% assign productsRows = products %\}\s*\{% if request\.query\.category and request\.query\.category != '' %\}\{% assign productsRows = productsRows \| where: 'categories', request\.query\.category %\}\{% endif %\}\s*\{% for item in productsRows %\}/);
    assert.ok(document.querySelector("[data-liquid-branch='?category → categories']"), "the filter is listed in the panel");
    await r!.click(document.querySelector("[data-ds-insert-form]")!);
    assert.match(e.text(), /^<form method="get" data-autosubmit[\s\S]*name="category"[\s\S]*<\/form>\s*<div class="grid">/);
    assert.ok(e.undo() && e.undo() && e.undo(), "each step undoes");
    assert.equal(e.text(), GRID);
  });

  it("Add pagination wraps the loop with Prev / Next; Per page edits it; Remove returns the loop", async () => {
    const e = panel();
    await r!.click(button("Add pagination"));
    assert.match(e.text(), /\{% paginate products by 12 %\}\s*\{% for item in products %\}[\s\S]*\{% endfor %\}\s*<nav[^>]*aria-label="Pages"[\s\S]*paginate\.next[\s\S]*<\/nav>\s*\{% endpaginate %\}/);
    assert.ok(field("ds-page-size"), "the panel reads the paginate block");
    assert.equal(field("ds-page-size").value, "12");
    await setField("ds-page-size", "6");
    assert.match(e.text(), /\{% paginate products by 6 %\}/);
    await r!.click(button("Remove pagination"));
    assert.equal(e.text(), GRID);
  });

  it("a URL filter on a paginated list keeps paginate reading the filtered variable", async () => {
    const e = panel();
    await r!.click(button("Add pagination"));
    await r!.click(button("Add URL filter"));
    await setField("ds-url-field", "categories");
    await setField("ds-url-param", "category");
    await r!.click(button("Add URL filter"));
    assert.match(e.text(), /\{% paginate productsRows by 12 %\}/);
    assert.match(e.text(), /\{% for item in productsRows %\}/);
    assert.ok(document.querySelector("[data-liquid-branch='?category → categories']"), "still found past the paginate block");
  });
});

describe("the canvas gives a detail page a sample row", () => {
  const PAGE = `{% assign rows = product | where: 'slug', request.params.handle %}{% for item in rows %}<h1>{{ item.title }}</h1>{% endfor %}`;

  it("takes the param from the first row of the list the page filters by", () => {
    const data = { product: [{ slug: "fern-pot", title: "Fern" }, { slug: "moss", title: "Moss" }], collections: { plants: [{ slug: "monstera" }] } };
    assert.deepEqual(sampleRequest(PAGE, data).params, { handle: "fern-pot" });
    assert.deepEqual(sampleRequest(`{% assign r = collections.plants | where: 'slug', request.params.slug %}`, data).params, { slug: "monstera" });
    assert.deepEqual(sampleRequest(PAGE, {}).params, {}, "no rows, no param");
    assert.deepEqual(sampleRequest(`<p>{{ request.params.handle }}</p>`, data).params, {}, "a param no list is filtered by stays unset");
  });

  it("the canvas render shows the sample row, where it used to be empty", async () => {
    const e = pageEditor({ [F]: PAGE }, [liquidKit()]);
    Object.assign(e, { data: { product: [{ slug: "fern-pot", title: "Fern pot" }] } });
    const html = await defaultCanvasRender(e)(e.state, F);
    assert.match(html, /<h1[^>]*>Fern pot<\/h1>/);
  });
});
