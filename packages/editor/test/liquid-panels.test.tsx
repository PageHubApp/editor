import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { unifiedDiff } from "@pagehub/engine";
import { liquidKit } from "@pagehub/engine/kits";
import type { TestEditor } from "@pagehub/engine/testing";
import { RepeatForEach } from "../src/features/liquid/ElementActions.tsx";
import { ConditionsEditor } from "../src/features/inspector/conditions/ConditionsEditor.tsx";
import { withEditor } from "./harness.tsx";
import { render, type Rendered } from "./harness.tsx";
import { inspector, inspectorUi, pageEditor, select } from "./inspectorFixture.tsx";
import { ComponentsProvider } from "../src/components.ts";
import { Inspector } from "../src/features/inspector/Inspector.tsx";
import { SectionEditor } from "../src/features/inspector/InspectorDetailView.tsx";
import { EditorStoreProvider } from "../src/react/bindings.tsx";
import { DEFAULT_COMPONENTS } from "../src/shell/defaults.tsx";

const F = "index.liquid";
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
  localStorage.clear();
});

const open = (src: string, sel: string, extra: Record<string, string> = {}) => {
  const e = pageEditor({ [F]: src, ...extra }, [liquidKit()]);
  select(e, sel);
  r = inspector(e);
  return e;
};
const field = (id: string) => document.getElementById(`input-${id}`) as HTMLInputElement;
const enter = (el: Element) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
const setField = async (id: string, value: string) => {
  await r!.type(field(id), value);
  enter(field(id));
};
const button = (text: string | RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text || b.getAttribute("aria-label") === text : text.test(b.textContent ?? "")))!;
/** The exact diff the panel edit must produce, then one undo restores the source. */
const expectEdit = (e: TestEditor, before: string, after: string) => {
  assert.equal(e.diff(), unifiedDiff(F, before, after));
  assert.ok(e.undo());
  assert.equal(e.text(), before);
  assert.ok(e.redo());
};

const LOOP = `<ul>
  {% for p in products %}
    <li>{{ p.title }}</li>
  {% endfor %}
</ul>
`;

describe("Liquid block panels: each edit is one command and one undo step", () => {
  it("for: limit is one liquid.setArg; list and reversed rewrite the head; else is added", async () => {
    const e = open(LOOP, "%for");
    assert.ok(document.querySelector('[data-liquid-panel="for"]'));
    await setField("for-limit", "6");
    expectEdit(e, LOOP, LOOP.replace("in products %}", "in products, limit: 6 %}"));
    await setField("for-collection", "collections.shoes");
    assert.equal(e.text(), LOOP.replace("in products %}", "in collections.shoes, limit: 6 %}"));
    await r!.click(document.getElementById("input-for-reversed")!);
    assert.equal(e.text(), LOOP.replace("in products %}", "in collections.shoes reversed, limit: 6 %}"));
    await r!.click(button("Add else (empty list)"));
    assert.equal(e.text(), LOOP.replace("in products %}", "in collections.shoes reversed, limit: 6 %}").replace("  {% endfor %}", "  {% else %}\n  {% endfor %}"));
    for (let i = 0; i < 4; i++) assert.ok(e.undo(), `step ${i}`);
    assert.equal(e.text(), LOOP, "four edits, four undo steps");
  });

  it("if: the condition is one liquid.setMarkup; elsif is added before else; else is removed", async () => {
    const src = `<main>\n  {% if customer %}\n    <p>Hi</p>\n  {% else %}\n    <p>Sign in</p>\n  {% endif %}\n</main>\n`;
    const e = open(src, "%if");
    await setField("condition", "customer.plans contains 'pro'");
    const one = src.replace("{% if customer %}", "{% if customer.plans contains 'pro' %}");
    expectEdit(e, src, one);
    await r!.click(button("Add elsif"));
    await setField("pending-Add elsif", "customer");
    const two = one.replace("  {% else %}", "  {% elsif customer %}\n  {% else %}");
    assert.equal(e.text(), two);
    await r!.click(button("Remove else branch"));
    assert.equal(e.text(), two.replace("  {% else %}\n    <p>Sign in</p>\n", ""));
    await setField("condition", "customer ==");
    assert.equal(field("condition").getAttribute("aria-invalid"), "true", "a condition that doesn't parse is refused");
  });

  it("case: a when branch is edited in place", async () => {
    const src = `{% case color %}{% when 'red' %}R{% when 'blue' %}B{% endcase %}\n`;
    const e = open(src, "%case");
    await setField("branch-2", "'blue', 'navy'");
    expectEdit(e, src, `{% case color %}{% when 'red' %}R{% when 'blue', 'navy' %}B{% endcase %}\n`);
  });

  it("paginate: page size; form: its type; render: a variable and Edit partial", async () => {
    const src = `{% paginate collections.blog.articles by 12 %}<a>x</a>{% endpaginate %}\n{% form 'contact' %}<input name="q">{% endform %}\n{% render 'card', title: "Hi" %}\n`;
    const e = open(src, "%paginate", { "partials/card.liquid": "<b>{{ title }}</b>\n" });
    await setField("paginate-by", "6");
    expectEdit(e, src, src.replace("by 12", "by 6"));
    select(e, "%form");
    await setField("form-name", "leads");
    assert.equal(e.text(), src.replace("by 12", "by 6").replace("'contact'", "'leads'"));
    select(e, "%render");
    await setField("arg-title", '"Bye"');
    assert.equal(e.text(), src.replace("by 12", "by 6").replace("'contact'", "'leads'").replace('"Hi"', '"Bye"'));
    await r!.click(document.querySelector("[data-liquid-edit-partial]")!);
    assert.equal(inspectorUi(e).componentEditor, "partials/card.liquid");
  });
});

describe("Partial panel: pick the partial, set the values it reads", () => {
  const src = `{% render 'card', title: "Hi", tone: "dark" %}\n`;
  const files = { "partials/card.liquid": "<b class=\"{{ tone }}\">{{ title }} {{ subtitle }}</b>\n", "partials/header.liquid": "<nav>{{ site.name }}</nav>\n" };
  const rows = () => [...document.querySelectorAll("[data-render-value]")].map((n) => n.getAttribute("data-render-value"));

  it("lists the variables the partial reads as named rows; editing and clearing one is one command", async () => {
    const e = open(src, "%render", files);
    assert.deepEqual(rows(), ["tone", "title", "subtitle"], "read by the partial, first use first");
    assert.equal(field("arg-subtitle").value, "");
    await setField("arg-subtitle", '"Hello"');
    expectEdit(e, src, `{% render 'card', title: "Hi", tone: "dark", subtitle: "Hello" %}\n`);
    await r!.click(button("Remove tone"));
    assert.equal(e.text(), `{% render 'card', title: "Hi", subtitle: "Hello" %}\n`);
  });

  it("the partial select rewrites the name and keeps the values", async () => {
    const e = open(src, "%render", files);
    await r!.click(document.getElementById("input-render-partial")!);
    await r!.click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === "header")!);
    assert.equal(e.text(), `{% render 'header', title: "Hi", tone: "dark" %}\n`);
  });

  it("Add value adds a name and a value together; a partial with no variables shows only Add value", async () => {
    const e = open(`{% render 'header' %}\n`, "%render", files);
    assert.deepEqual(rows(), []);
    assert.equal(document.querySelector("[data-render-values] h4"), null, "no Values heading when there is nothing to set");
    await r!.click(document.querySelector("[data-render-add-value]")!);
    await r!.type(document.getElementById("input-render-new-name")!, "eyebrow");
    assert.ok((document.querySelector("[data-render-add-confirm]") as HTMLButtonElement).disabled, "a value is needed too");
    await setField("render-new-value", '"New"');
    await r!.click(document.querySelector("[data-render-add-confirm]")!);
    assert.equal(e.text(), `{% render 'header', eyebrow: "New" %}\n`);
    assert.deepEqual(rows(), ["eyebrow"]);
    await r!.click(button("Remove eyebrow"));
    assert.equal(e.text(), `{% render 'header' %}\n`);
  });

  it("a partial the site doesn't have is marked and can't be opened", () => {
    open(`{% render 'ghost' %}\n`, "%render", files);
    assert.ok((document.querySelector("[data-liquid-edit-partial]") as HTMLButtonElement).disabled);
  });
});

const HERO = `<section>{% schema %}{"name":"Hero","settings":[
  {"type":"header","content":"Copy"},
  {"type":"text","id":"headline","label":"Headline","default":"Welcome"},
  {"type":"checkbox","id":"badge","label":"Show badge"},
  {"type":"range","id":"cols","label":"Columns","min":1,"max":4,"default":2},
  {"type":"select","id":"align","label":"Align","options":[{"value":"left","label":"Left"},{"value":"center","label":"Center"}]}
]}{% endschema %}</section>
`;

describe("Section settings: one input per {% schema %} setting, each change one liquid.setArg", () => {
  it("text, checkbox, range and select each write one argument; clearing removes it", async () => {
    const src = `{% section 'hero', headline: "Hello" %}\n`;
    const e = open(src, "%section", { "sections/hero.liquid": HERO });
    assert.deepEqual([...document.querySelectorAll("[data-setting]")].map((n) => n.getAttribute("data-setting")), ["headline", "badge", "cols", "align"]);
    assert.equal(field("setting-headline").value, "Hello");
    await setField("setting-headline", "Smog checks in 15 minutes");
    expectEdit(e, src, `{% section 'hero', headline: "Smog checks in 15 minutes" %}\n`);
    await r!.click(document.getElementById("input-setting-badge")!);
    assert.equal(e.text(), `{% section 'hero', headline: "Smog checks in 15 minutes", badge: true %}\n`);
    await setField("setting-cols", "9");
    assert.equal(field("setting-cols").getAttribute("aria-invalid"), "true", "out of range");
    await setField("setting-cols", "3");
    assert.equal(e.text(), `{% section 'hero', headline: "Smog checks in 15 minutes", badge: true, cols: 3 %}\n`);
    await r!.click(field("setting-align"));
    await r!.click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === "Center")!);
    assert.equal(e.text(), `{% section 'hero', headline: "Smog checks in 15 minutes", badge: true, cols: 3, align: "center" %}\n`);
    await setField("setting-headline", "");
    assert.equal(e.text(), `{% section 'hero', badge: true, cols: 3, align: "center" %}\n`, "cleared → the default applies");
    for (let i = 0; i < 5; i++) assert.ok(e.undo());
    assert.equal(e.text(), src);
  });
});

describe("Show only when… / Repeat for each…", () => {
  it("in the inspector, a wrapped element's Conditions / Data source sections are marked set and render their editors inline", () => {
    const src = `<ul>\n  {% for p in products %}\n    <li>{{ p.title }}</li>\n  {% endfor %}\n  {% if customer %}\n    <li>Account</li>\n  {% endif %}\n</ul>\n`;
    const e = open(src, "li");
    const values = () => [...document.querySelectorAll<HTMLInputElement>("[data-inspector-detail] input[type=text]")].map((i) => i.value).filter(Boolean).slice(0, 2);
    const dot = (id: string) => document.querySelector(`[data-section-id="${id}"] [data-section-set]`);
    assert.ok(dot("data-source"), "the repeat wrapper marks Data source");
    assert.equal(dot("conditions"), null, "no condition around the first li");
    assert.equal(document.querySelector('[data-section-id="conditions"] button[aria-label="Edit Conditions"]'), null, "no drill-in chevron");
    r!.unmount();
    r = render(withEditor(e, <SectionEditor kind="dataSource" handle={e.get("li")} />));
    assert.deepEqual(values(), ["products", "p"], "Source and Item name of the wrapping {% for p in products %}");
    r!.unmount();
    select(e, "ul > %if > li");
    r = render(withEditor(e, <SectionEditor kind="conditions" handle={e.get("ul > %if > li")} />));
    assert.ok(document.querySelector('[data-condition-part="server"] [data-condition="auth"]'), "the wrapping {% if customer %} reads as a signed-in-customer condition");
  });

  const PAGE = `<main>\n  <p>Hi</p>\n</main>\n`;
  const mountAt = (src: string, sel: string) => {
    const e = pageEditor({ [F]: src }, [liquidKit()]);
    select(e, sel);
    r = render(withEditor(e, <ConditionsEditor handle={e.get(sel)} />));
    return e;
  };

  it("conditions: a converted {% if a and b %} shows one card per term; editing a value and removing a term each rewrite the markup", async () => {
    const src = `<main>\n  {% if customer.isMember == true and item.image != blank %}\n    <p>Hi</p>\n  {% endif %}\n</main>\n`;
    const e = mountAt(src, "main > %if > p");
    const cards = document.querySelectorAll('[data-condition-part="server"] [data-condition]');
    assert.equal(cards.length, 2);
    assert.equal(field("server-0-key").value, "isMember");
    assert.equal(field("server-0-value").value, "true");
    assert.equal(field("server-1-key").value, "image");
    await setField("server-0-value", "false");
    assert.equal(e.text(), src.replace("== true", "== false"));
    assert.ok(e.undo());
    await r!.click(document.querySelectorAll<HTMLButtonElement>('[data-condition-part="server"] button[aria-label="Remove condition"]')[0]!);
    assert.equal(e.text(), src.replace("customer.isMember == true and ", ""));
    await r!.click(document.querySelectorAll<HTMLButtonElement>('[data-condition-part="server"] button[aria-label="Remove condition"]')[0]!);
    assert.equal(e.text(), PAGE, "removing the last term unwraps");
  });

  it("conditions: data-state-show reads as browser groups (an all-single-atom OR as one any group); device reads from md:hidden", () => {
    mountAt(`<main>\n  <p class="md:hidden" data-state-show="!store:filter||store:filter=all||store:filter=people">Hi</p>\n</main>\n`, "p");
    const groups = document.querySelectorAll('[data-condition-part="browser"] [data-condition-group]');
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.querySelectorAll("[data-condition]").length, 3);
    assert.equal(field("show-0-0-key").value, "store:filter");
    assert.equal(field("show-0-1-value").value, "all");
    assert.ok(document.querySelector('[data-condition-part="device"]'), "md:hidden is phone-only");
    assert.equal(document.querySelector('[data-condition-part="server"]'), null);
  });

  it("conditions: an expression the builder can't show stays editable as Liquid, and Remove condition unwraps", async () => {
    const src = `<main>\n  {% if a and b or c %}\n    <p>Hi</p>\n  {% endif %}\n</main>\n`;
    const e = mountAt(src, "main > %if > p");
    await setField("show-when", "customer");
    assert.equal(e.text(), src.replace("a and b or c", "customer"));
    await r!.click(button("Remove condition"));
    assert.equal(e.text(), PAGE);
  });

  it("wraps the element in {% for %} and edits the loop (data-source panel)", async () => {
    const e = pageEditor({ [F]: PAGE }, [liquidKit()]);
    select(e, "p");
    r = render(withEditor(e, <RepeatForEach handle={e.get("p")} />));
    // The Data source panel binds through its source/custom field (item defaults to `item`).
    await setField("ds-custom", "collections.posts");
    const wrapped = `<main>\n  {% for item in collections.posts %}\n    <p>Hi</p>\n  {% endfor %}\n</main>\n`;
    expectEdit(e, PAGE, wrapped);
    await setField("ds-limit", "3");
    assert.equal(e.text(), wrapped.replace("posts %}", "posts, limit: 3 %}"));
    await r!.click(button("Stop repeating"));
    assert.equal(e.text(), PAGE, "the loop and its limit are gone");
  });
});

describe("Edit code toggle follows the CodeView slot", () => {
  it("hidden when the host (or client role) hides CodeView", () => {
    const e = pageEditor({ [F]: LOOP }, [liquidKit()]);
    select(e, "%for");
    r = render(
      <EditorStoreProvider store={e}>
        <ComponentsProvider value={{ ...DEFAULT_COMPONENTS, CodeView: null }}>
          <Inspector />
        </ComponentsProvider>
      </EditorStoreProvider>,
    );
    assert.ok(document.querySelector('[data-liquid-panel="for"]'));
    assert.equal(document.querySelector("[data-liquid-code-toggle]"), null);
  });
});
