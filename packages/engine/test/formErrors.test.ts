import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/runtime/createRenderer.ts";
import { renderPage } from "../src/runtime/renderPage.ts";
import type { FormHandler } from "../src/runtime/tags/form.ts";

const TPL = `{% form 'contact' %}{% if form.errors %}<div class="e">{{ form.errors | default_errors }}</div>{% endif %}{% if form.posted_successfully? %}<p class="ok">ok</p>{% endif %}{{ form.values.email }}{% endform %}`;
const render = async (formHandler: FormHandler, request: { method: string; form?: Record<string, string> }) => {
  const renderer = createRenderer({ files: () => undefined, formHandler });
  const page = await renderPage(renderer, { path: "pages/index.liquid", url: "/", title: "t", source: TPL }, { path: "/c", ...request }, { site: { name: "S", pages: [] }, dataSources: [] });
  return page.html;
};
const POSTED = { method: "POST", form: { form_type: "contact", email: "a@b.co" } };

test("form.errors is nil unless the post failed: {% if form.errors %} is false for a fresh form and after a success", async () => {
  assert.ok(!(await render(() => ({ ok: true }), { method: "GET" })).includes('class="e"'));
  const ok = await render(() => ({ ok: true }), POSTED);
  assert.ok(!ok.includes('class="e"'), ok);
  assert.ok(ok.includes('class="ok"'));
});

test("two forms of one name: the handler tells them apart by data-*, and null leaves the other as if nothing was posted", async () => {
  const two = `{% form 'leads', data-form-id: 'a' %}{% if form.posted_successfully? %}A-OK{% endif %}[{{ form.values.email }}]{% endform %}{% form 'leads', data-form-id: 'b' %}{% if form.posted_successfully? %}B-OK{% endif %}[{{ form.values.email }}]{% endform %}`;
  const renderer = createRenderer({ files: () => undefined, formHandler: s => (s.attrs?.["data-form-id"] === "b" ? { ok: true } : null) });
  const page = await renderPage(renderer, { path: "pages/index.liquid", url: "/", title: "t", source: two }, { path: "/c", method: "POST", form: { form_type: "leads", email: "a@b.co" } }, { site: { name: "S", pages: [] }, dataSources: [] });
  assert.ok(page.html.includes("B-OK[a@b.co]"), page.html);
  assert.ok(page.html.includes("[]</form>") && !page.html.includes("A-OK"), "the form that was not posted shows no outcome and none of the values");
});

test("form.errors | default_errors prints the refused submit's messages inside {% if form.errors %}", async () => {
  const out = await render(() => ({ ok: false, errors: [{ field: "email", message: "Enter a valid email" }] }), POSTED);
  assert.ok(out.includes('<div class="e"><div class="errors"><ul><li>Enter a valid email</li></ul></div></div>'), out);
  assert.ok(!out.includes('class="ok"'));
  assert.ok(out.endsWith("a@b.co</form>"), "form.values refills the fields");
});
