// Condition / state-attribute models round-trip the exact forms the source converter emits
// (strings below are from the converted sites under pagehub.dev/.html-first/sites).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceOf, parseServer, parseShow, serializeServer, serializeShow } from "../src/features/inspector/conditions/conditionModel.ts";
import { stateKeysOf } from "../src/features/inspector/conditions/stateKeys.ts";
import { parseClassEntries, serializeClassEntries } from "../src/features/inspector/state/stateAttrs.ts";

describe("server conditions ({% if %})", () => {
  const SAMPLES = [
    "customer",
    "customer == blank",
    "customer.isMember == true",
    "customer.isMember != true",
    "customer.plans.pro != blank",
    "item.status == 'daftar'",
    "item.inStock == true and item.inventory > 0 and item.inventory < 5",
    "item.inStock == blank or item.inStock == true",
    "item.credit != blank and item.creditUrl == blank",
    "item.images.1 != blank",
    "request.query.ref == 'templates'",
    "stripe.bindingsMeta.shop_products.totalPages > 1",
    "request.query.tag contains 'x' == false",
  ];
  for (const s of SAMPLES)
    it(`round-trips ${s}`, () => {
      const g = parseServer(s);
      assert.ok(g, "parses");
      assert.equal(serializeServer(g!), s);
    });

  it("types each path", () => {
    const g = parseServer("request.query.ref == 'x' and customer.orderCount > 2 and company.logo != blank and item.title == 'A' and collections.plants.size > 0 and request.form.email != blank")!;
    assert.deepEqual(g.conds.map((c) => [c.type, c.key, c.op]), [
      ["url-param", "ref", "equals"],
      ["auth", "orderCount", "greater-than"],
      ["company", "logo", "exists"],
      ["item", "title", "equals"],
      ["connector", "collections.plants.size", "greater-than"],
      ["form-field", "email", "exists"],
    ]);
  });

  it("a bare truthy path reads as exists; mixed and / or and filters don't parse", () => {
    assert.deepEqual(parseServer("company.logo")!.conds[0], { type: "company", key: "logo", op: "exists", value: "" });
    assert.equal(parseServer("a and b or c"), null);
    assert.equal(parseServer("item.tags | size > 1"), null);
  });
});

describe("browser conditions (data-state-show)", () => {
  const SAMPLES = ["cart:open", "!notif:seen", "cart:count>0", "page:other=1", "!agent-chat-chat_chat:ended", "!store:filter||store:filter=all||store:filter=people", "pdp:current:matching-variant&&pdp:current:matching-variant.image", "ls:consent=yes"];
  for (const s of SAMPLES)
    it(`round-trips ${s}`, () => {
      const g = parseShow(s);
      assert.ok(g, "parses");
      assert.equal(serializeShow(g!), s);
    });

  it("ls: keys are local storage; all-single-atom ORs read as one any group", () => {
    assert.deepEqual(parseShow("ls:consent")![0]!.conds[0], { type: "localStorage", key: "consent", op: "exists", value: "" });
    const g = parseShow("a||b=1")!;
    assert.equal(g.length, 1);
    assert.equal(g[0]!.logic, "any");
  });

  it("a form field is field:<name>, with contains as *= and doesn't contain as !…*=", () => {
    for (const s of ["field:topic", "!field:topic", "field:topic=sales", "field:topic!=sales", "field:msg*=quote", "!field:msg*=quote", "field:topic=sales&&cart:open"]) {
      assert.equal(serializeShow(parseShow(s)!), s, s);
    }
    assert.deepEqual(parseShow("field:msg*=quote")![0]!.conds[0], { type: "form-field", key: "msg", op: "contains", value: "quote" });
    assert.deepEqual(parseShow("!field:msg*=quote")![0]!.conds[0], { type: "form-field", key: "msg", op: "not-contains", value: "quote" });
    assert.equal(serializeShow([{ logic: "all", conds: [{ type: "form-field", key: "topic", op: "equals", value: "sales" }] }]), "field:topic=sales");
  });

  it("&amp; in a stored attribute is the && operator", () => {
    assert.equal(serializeShow(parseShow("a&amp;&amp;b")!), "a&&b");
  });
});

describe("device", () => {
  it("md:hidden is phone only, max-md:hidden desktop only", () => {
    assert.equal(deviceOf(["p-4", "md:hidden"]), "mobile");
    assert.equal(deviceOf(["max-md:hidden"]), "desktop");
    assert.equal(deviceOf(["hidden", "md:flex"]), "all");
  });
});

describe("data-state-class entries", () => {
  it("round-trips arrow, short and server entries", () => {
    const v = "!store:filter||store:filter=all=>bg-accent border-accent text-accent-content;{{ ph_mod_11 }}";
    const e = parseClassEntries(v);
    assert.deepEqual(e[0], { kind: "test", test: "!store:filter||store:filter=all", classes: "bg-accent border-accent text-accent-content" });
    assert.deepEqual(e[1], { kind: "server", raw: "{{ ph_mod_11 }}" });
    assert.equal(serializeClassEntries(e), v);
    assert.deepEqual(parseClassEntries("tab=a:font-bold")[0], { kind: "test", test: "tab=a", classes: "font-bold" });
  });
});

describe("site state keys", () => {
  it("collects the keys every data-state-* attribute writes or reads", () => {
    const keys = stateKeysOf([
      `<button data-state-set="store:filter:all;notif:seen:1" data-state-class="store:filter=people=>x"></button>`,
      `<div data-state-show="cart:count>0||!cart:open"></div><input data-state-bind="url:q"><b data-state-step="url:page:-1"></b>`,
      `<i data-state-toggle="menu"></i><i data-state-in-view="deck:step=intro"></i><i data-compute-key="gp:score"></i>`,
    ]);
    assert.deepEqual(keys, ["cart:count", "cart:open", "deck:step", "gp:score", "menu", "notif:seen", "store:filter", "url:page", "url:q"]);
  });
});
