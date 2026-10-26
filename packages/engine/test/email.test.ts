import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "../src/testing/ruleTester.ts";
import { emailClass, emailElement, emailLiquidTag, emailRuntime, emailWeakElement, RUNTIME_ATTRIBUTES } from "../src/kits/email/emailRules.ts";
import { emailKit, EMAIL_TILES } from "../src/kits/email/emailKit.ts";
import { defaultGap, toEmailMarkup } from "../src/kits/email/toEmailMarkup.ts";
import { emailClassProblem } from "../src/kits/email/emailProfile.ts";
import { profileFacet } from "../src/host/profile.ts";
import { Configuration } from "../src/extensions/extension.ts";

test("email rules: elements an inbox can't show are errors, weak ones warnings", () => {
  RuleTester.run(emailElement, {
    valid: [`<p>Hi</p>`, `<a href="#">Go</a>`, `<table><tr><td>x</td></tr></table>`],
    invalid: [
      { code: `<form><p>x</p></form>`, errors: 1 },
      { code: `<button type="button">Go</button>`, errors: 1 },
      { code: `<video src="a.mp4"></video>`, errors: 1 },
    ],
  });
  RuleTester.run(emailWeakElement, { valid: [`<img src="a.png" alt="">`], invalid: [{ code: `<svg viewBox="0 0 1 1"></svg>`, errors: 1 }] });
});

test("email rules: runtime attributes and page-only Liquid tags are errors", () => {
  RuleTester.run(emailRuntime, {
    valid: [`<div class="p-4" data-email-role="button">x</div>`],
    invalid: [{ code: `<div popover id="x">x</div>`, errors: 1 }, { code: `<span data-cart-count>0</span>`, errors: 1 }],
  });
  RuleTester.run(emailLiquidTag, {
    valid: [`{% if order %}<p>{{ order.total }}</p>{% endif %}`, `{% for line in order.lines %}<p>{{ line.label }}</p>{% endfor %}`],
    invalid: [{ code: `{% section 'hero' %}`, errors: 1 }, { code: `{% paginate products by 3 %}<p>x</p>{% endpaginate %}`, errors: 1 }],
  });
});

test("email rules: the runtime attribute list is exactly the site runtime's", async () => {
  const { RUNTIME_SELECTOR } = await import("@pagehub/site-runtime");
  const names = new Set([...RUNTIME_SELECTOR.replace(/:not\([^)]*\)/g, "").matchAll(/\[([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
  // `popover` and `commandfor` are refused as browser-native interactivity (NATIVE_INTERACTIVE).
  for (const n of ["popover", "commandfor"]) names.delete(n);
  assert.deepEqual([...RUNTIME_ATTRIBUTES].sort(), [...names].sort());
});

test("email rules: classes email clients ignore are warnings", () => {
  RuleTester.run(emailClass, {
    valid: [`<div class="bg-primary text-primary-content px-[18px] md:flex-row rounded-[6px]">x</div>`],
    invalid: [{ code: `<div class="shadow-md absolute hover:bg-primary">x</div>`, errors: 3 }],
  });
  assert.equal(emailClassProblem("flex-row"), null);
  assert.match(emailClassProblem("animate-bounce") ?? "", /doesn't work/);
});

test("emailKit: one profile with a 600px canvas and the email tiles", () => {
  const config = Configuration.resolve([emailKit({ tiles: [{ key: "x", label: "Order items", icon: "list", category: "Email", snippet: "<p>x</p>" }] })]);
  const profile = config.facet(profileFacet);
  assert.equal(profile?.canvasWidth, 600);
  assert.equal(profile?.toolbox, false);
  assert.equal(profile?.tiles?.length, EMAIL_TILES.length + 1);
  assert.ok(profile?.elements?.includes("html.text"));
  assert.ok(!profile?.elements?.includes("html.button"));
});

test("toEmailMarkup: block wrappers become one-cell presentation tables", () => {
  const out = toEmailMarkup(`<div class="px-[32px] py-[56px] text-center" data-email-role="x" data-edit-id="a"><p class="text-lg">Hi &amp; bye</p></div>`);
  assert.equal(
    out,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="px-[32px] py-[56px] text-center" align="center"><p class="text-lg">Hi &amp; bye</p></td></tr></table>`,
  );
});

test("toEmailMarkup: a row becomes columns that stack, with the gap as padding", () => {
  const out = toEmailMarkup(`<div class="flex flex-col md:flex-row items-center gap-[16px]"><div>A</div><div>B</div></div>`);
  assert.match(out, /<td class="ph-col" width="50%" valign="middle" style="padding-right:8px">/);
  assert.match(out, /<td class="ph-col" width="50%" valign="middle" style="padding-left:8px">/);
  assert.doesNotMatch(out, /flex|gap-/);
  // A host resolves its own spacing tokens.
  assert.match(toEmailMarkup(`<div class="flex gap-space-sm"><p>A</p><p>B</p></div>`, { gap: (t) => (t === "gap-space-sm" ? 12 : undefined) }), /padding-right:6px/);
  // A grid of 2 with 3 children makes two rows.
  assert.equal((toEmailMarkup(`<div class="grid grid-cols-2"><p>1</p><p>2</p><p>3</p></div>`).match(/<tr>/g) ?? []).length, 3);
  assert.equal(defaultGap("gap-4"), 16);
});

test("toEmailMarkup: a filled link becomes a bulletproof button, images get border=0", () => {
  const out = toEmailMarkup(`<div class="text-center"><a href="https://x.test/?a=1&amp;b=2" class="bg-primary text-primary-content rounded-[6px] px-[18px] py-[10px]">Go</a><img src="a.png"></div>`);
  assert.match(out, /<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td class="bg-primary rounded-\[6px\]" align="center"><a href="https:\/\/x.test\/\?a=1&amp;b=2" class="text-primary-content px-\[18px\] py-\[10px\]" style="display:inline-block">Go<\/a>/);
  assert.match(out, /<img src="a.png" border="0" alt="">/);
});
