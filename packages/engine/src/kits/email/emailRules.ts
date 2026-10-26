/**
 * The email-safe subset as lint rules (see ./emailProfile.ts). In the email editor they run with the others: an error
 * blocks the save, so a design that can't be sent is never stored; a warning is shown and saved.
 *
 *   email-element      an element no inbox can show or use (form, button, video, dialog, …) — error
 *   email-weak-element one most clients drop (svg, picture) — warning
 *   email-runtime      an attribute the site runtime acts on (`popover`, `data-cart`, `data-state-*`, …) — error: no script
 *                      runs in an inbox
 *   email-liquid-tag   a page-only Liquid tag (`{% form %}`, `{% section %}`, `{% map %}`, `{% paginate %}`) — error
 *   email-class        a class email clients ignore or that breaks the layout (shadow, absolute, hover:, animate-) — warning
 */
import { elementName, type ElementNode } from "../../parse/parse";
import { defineRule, type Rule } from "../../rules/defineRule";
import { attrOf, attrsOf } from "../../rules/util";
import { EMAIL_BLOCKED_LIQUID_TAGS, EMAIL_BLOCKED_TAGS, EMAIL_WEAK_TAGS, emailClassProblem } from "./emailProfile";

export const emailElement = defineRule({
  meta: { id: "email-element", severity: "error", description: "Only elements an inbox can show: no forms, buttons, media players or dialogs." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      const tag = elementName(el).toLowerCase();
      if (EMAIL_BLOCKED_TAGS.has(tag)) ctx.report({ node: el, message: `<${tag}> can't be sent in an email. Use a link styled as a button, an image or text instead.` });
    },
  }),
});

/** The weak-tag half of `email-element` as its own warning rule, so its severity can differ. */
export const emailWeakElement = defineRule({
  meta: { id: "email-weak-element", severity: "warning", description: "Elements most inboxes drop (inline SVG, <picture>)." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      const tag = elementName(el).toLowerCase();
      if (EMAIL_WEAK_TAGS.has(tag)) ctx.report({ node: el, message: `<${tag}> doesn't show in Gmail and Outlook. Use an image instead.` });
    },
  }),
});

/** Browser-native interactivity (popovers, invokers): inboxes don't run it either. */
const NATIVE_INTERACTIVE: ReadonlySet<string> = new Set(["popover", "popovertarget", "popovertargetaction", "commandfor", "command"]);

/**
 * The attributes the site runtime acts on (`CHUNK_SELECTORS` + `CORE_SELECTORS` in @pagehub/site-runtime). Listed here,
 * not imported: the runtime package's selector module pulls in its chunk loader, which the editor's bundle must not
 * carry. test/email.test.ts checks every name against the runtime's own `needsRuntime`, so the two can't drift apart.
 */
export const RUNTIME_ATTRIBUTES: readonly string[] = [
  "data-cart", "data-cart-count", "data-cart-items", "data-autoplay", "data-animate", "data-track", "data-scrollspy", "data-form-state",
  "data-map", "data-fit-text", "data-scroll-effect", "data-drag-scroll", "data-wheel-horizontal", "data-scrollbar-autohide", "data-scroll-smoothing",
  "data-carousel", "data-state-set", "data-state-toggle", "data-state-clear", "data-state-step", "data-state-show", "data-state-class", "data-state-text",
  "data-state-src", "data-state-bind", "data-state-in-view", "data-state-compute", "data-chat-send", "data-chat", "data-on", "data-show-on",
  "data-tab-target", "data-autosubmit", "data-copy", "data-dismiss", "data-theme-toggle", "data-refetch", "closedby",
  "data-close-link", "data-print", "data-scroll-by", "data-set-field", "data-key-click", "data-lightbox",
];
const RUNTIME_SET: ReadonlySet<string> = new Set(RUNTIME_ATTRIBUTES);

export const emailRuntime = defineRule({
  meta: { id: "email-runtime", severity: "error", description: "No site-runtime attributes: no script runs in an inbox." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      for (const a of attrsOf(el)) {
        if (RUNTIME_SET.has(a.name) || NATIVE_INTERACTIVE.has(a.name)) ctx.report({ range: a.range, message: `${a.name} needs the site's script, which never runs in an email.` });
      }
    },
  }),
});

export const emailLiquidTag = defineRule({
  meta: { id: "email-liquid-tag", severity: "error", description: "No page-only Liquid tags (form, section, map, paginate)." },
  create: (ctx) => ({
    LiquidTag(node: { name?: unknown; position: { start: number; end: number } }) {
      const name = typeof node.name === "string" ? node.name : "";
      if (EMAIL_BLOCKED_LIQUID_TAGS.has(name)) ctx.report({ node: node as never, message: `{% ${name} %} only works on a site page, not in an email.` });
    },
  }),
});

export const emailClass = defineRule({
  meta: { id: "email-class", severity: "warning", description: "Classes email clients support: no positioning, shadows, motion or hover styles." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      const cls = attrOf(el, "class");
      if (!cls) return;
      for (const token of cls.value.split(/\s+/).filter(Boolean)) {
        const problem = emailClassProblem(token);
        if (problem) ctx.report({ range: cls.range, message: problem });
      }
    },
  }),
});

export const EMAIL_RULES: readonly Rule<any>[] = [emailElement, emailWeakElement, emailRuntime, emailLiquidTag, emailClass];
