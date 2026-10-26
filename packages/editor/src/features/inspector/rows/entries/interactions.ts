import { ar, at, esc, nt, rt } from "../build";
import type { PropEntry } from "../types";

const A = "action";
const C = "conditions";
const S = "stateBindings";
const D = "data-source";

const COND_NOTE = "Liquid `{% if %}` around the element (server); client-only conditions use `data-state-show`";

export const interactionEntries: PropEntry[] = [
  // ── Actions ──
  nt("action", "container text button link image", A, "What a click (or hover / load) does: a list of actions that run in order.", "native element per action (see rows below); a chain is several attributes on one element or nested elements", "per action type", { aliases: ["action:add", "click"] }),
  nt("actionType", "container text button link image", A, "Which kind of action.", "link -> `<a href>`; open-modal -> `<button commandfor command=\"show-modal\">`; show-hide -> `commandfor` + `popover`; copy -> `data-copy`; download -> `<a download>`; theme -> `data-theme-toggle`; cart -> `data-cart`; state -> `data-state-*`; agent -> `data-chat-send`", "tagName([\"a\",\"button\"]) + attr(\"commandfor\"|\"command\"|\"data-*\")"),
  rt("actionTrigger", "container text button link", A, "Run on click, hover or load.", "`data-state-on=\"click|hover|load|interval\"`; for show-hide hover use `group-hover:` classes / `popover=\"hint\"`", 'attr("data-state-on", t.enum(["click","hover","load","interval"]))', { runtime: "state-on" }),
  nt("actionDirection", "container button", A, "Show-hide direction: show, hide, toggle, tab.", "`command=\"show-popover|hide-popover|toggle-popover\"` (or `show-modal` / `close`); `tab` -> radio input + `peer-checked:` / `<details name>`", 'attr("command", t.enum(["show-popover","hide-popover","toggle-popover","show-modal","close"]))'),
  at("action.link.href", "button link container text image", A, "Link destination: URL, page, `#anchor`, `mailto:`, `tel:`.", "`href` on `<a>`; pages as `{{ routes.x }}` / path", 'attr("href", t.string())'),
  at("urlTarget", "button link container text image", A, "Open in the same tab or a new one.", "`target` (+ `rel=\"noopener\"`)", 'attr("target", t.enum(["_self","_blank","_parent","_top"]))', { aliases: ["action.link.target", "target"] }),
  at("relation", "container", A, "Link `rel` value.", "`rel` attribute", 'attr("rel", t.string())'),
  at("action.openModal.anchor", "button container", A, "Which modal opens.", "`commandfor=\"<dialog id>\"` with `command=\"show-modal\"` on a `<dialog id>`", 'attr("commandfor", t.string())'),
  at("action.showHide.target", "button container", A, "Which element shows / hides.", "`commandfor=\"<id>\"` targeting a `popover` element", 'attr("commandfor", t.string())'),
  nt("action.showHide.method", "button container", A, "Hide with a class or with inline style.", "not needed: `popover` / `hidden` is native; `class` vs `style` choice disappears", "-"),
  nt("action.showHide.group", "button container", A, "Tab group name.", "shared `name` on radio inputs or `<details name=\"g\">`", 'attr("name", t.string())'),
  rt("action.copy.text", "button container", A, "Text copied to the clipboard.", "`data-copy=\"{{ coupon.code }}\"` (existing)", 'attr("data-copy", t.string())'),
  at("action.download.url", "button link", A, "File to download.", "`<a href=\"{{ file | file_url }}\" download>`", 'attr("href", t.string())'),
  at("action.download.filename", "button link", A, "Saved file name.", "value of the `download` attribute", 'attr("download", t.string())'),
  rt("action.theme.toggle", "button", A, "Dark / light switch.", "`data-theme-toggle` (existing)", 'attr("data-theme-toggle", t.boolean())', { aliases: ["toggle-theme"] }),
  at("action.theme.dismissTarget", "button", A, "Hide an element after toggling the theme (a banner).", "second target via `commandfor=\"<id>\" command=\"hide-popover\"` on the same button", 'attr("commandfor", t.string())'),
  nt("toggleThemeDismissMethod", "button", A, "Hide the dismissed element by class or style.", "not needed: native `popover` hide", "-"),
  rt("action.cart.add", "button container", A, "Add to cart.", "`data-cart=\"add\"` on the button or `<form>` (existing)", 'attr("data-cart", t.enum(["add","open","checkout"]))', { aliases: ["add-to-cart", "toggle-cart", "cart-checkout"] }),
  at("action.cart.quantity", "button", A, "Quantity to add.", "`<input type=\"number\" name=\"quantity\" value=\"1\">` inside the cart form", 'attr("value", t.number())', { aliases: ["quantity"] }),
  at("action.cart.quantityField", "button", A, "Name of the input holding the quantity.", "the input's `name=\"quantity\"` inside the same `<form>`", 'attr("name", t.string())', { aliases: ["quantityField"] }),
  rt("action.cart.variantMatchStateKey", "button", A, "Use the variant matched by the pickers.", "variant id written to a hidden `<input name=\"id\" data-state-bind=\"pdp:variant\">`", 'attr("data-state-bind", t.string())', { runtime: "state-bind", aliases: ["variantMatchStateKey"] }),
  at("action.cart.successHref", "button", A, "Where checkout returns after paying.", "hidden `<input name=\"success_url\">` in the checkout form", 'attr("value", t.string())', { aliases: ["successHref"] }),
  at("action.cart.cancelHref", "button", A, "Where checkout returns when cancelled.", "hidden `<input name=\"cancel_url\">`", 'attr("value", t.string())', { aliases: ["cancelHref"] }),
  nt("action.manageSubscription", "button", A, "Open the billing portal.", "`<form method=\"post\" action=\"{{ routes.account_portal }}\"><button>`", 'attr("action", t.string())', { aliases: ["manage-subscription"] }),
  rt("action.agentSend.field", "button", A, "Send a field's text to the site chat.", "`data-chat-send=\"<field name>\"`", 'attr("data-chat-send", t.string())', { runtime: "chat-send", aliases: ["agent-send"] }),
  rt("action.storage.set", "button container", A, "Remember a value in localStorage.", "`data-state-set=\"local:key:value\"`", 'attr("data-state-set", t.string())', { runtime: "state-set", aliases: ["set-local-storage"] }),
  rt("action.storage.remove", "button container", A, "Forget a localStorage value.", "`data-state-clear=\"local:key\"`", 'attr("data-state-clear", t.string())', { runtime: "state-clear", aliases: ["remove-local-storage"] }),
  rt("action.state.set", "button container", A, "Write a state value.", "`data-state-set=\"key:value\"`", 'attr("data-state-set", t.string())', { runtime: "state-set", aliases: ["set-state"] }),
  rt("action.state.toggle", "button container", A, "Flip a flag or alternate two values.", "`data-state-toggle=\"key\"` / `\"key:a|b\"`", 'attr("data-state-toggle", t.string())', { runtime: "state-toggle", aliases: ["toggle-state"] }),
  rt("action.state.clear", "button container", A, "Clear a state key.", "`data-state-clear=\"key\"`", 'attr("data-state-clear", t.string())', { runtime: "state-clear", aliases: ["clear-state"] }),
  rt("action.state.step", "button container", A, "Increment / decrement with min, max, wrap, interval.", "`data-state-step=\"key:+1\"` + `data-min` `data-max` `data-wrap` `data-every`", 'attr("data-state-step", t.string())', { runtime: "state-step", aliases: ["increment-state", "decrement-state", "action.state.step.min", "action.state.step.max", "action.state.step.wrap", "action.state.step.intervalMs"] }),
  rt("setStateKind", "button container", A, "Kind of value being set: visibility, selection, flag, value.", "kind is implied by how the key is read (`data-state-show` = visibility, radio = selection); stored in the key prefix `flag:` / `sel:`", 'attr("data-state-set", t.string())', { runtime: "state-set" }),
  rt("toggleStateKind", "button container", A, "Kind of value being toggled.", "same as `setStateKind`", 'attr("data-state-toggle", t.string())', { runtime: "state-toggle" }),
  rt("conversion", "button link form", A, "Report a conversion when the action runs / the form sends.", "`data-track=\"ga4:generate_lead\"` (existing)", 'attr("data-track", t.string())'),
  nt("action.conditions", "container text button link", A, "Only run the action when conditions hold.", "wrap the action attributes: `{% if cond %}commandfor=\"x\" command=\"show-modal\"{% endif %}` or render a plain element otherwise", "-"),

  // ── Handlers ──
  rt("handlers", "container text button link", "handlers", "Per-element JavaScript for an event (onClick, onMouseEnter ...).", "`data-on=\"click:fnName\"` calling a function registered in the site's own script file (no inline code)", 'attr("data-on", t.string())', { runtime: "on", aliases: ["handlers:add"] }),
  rt("handlerEvent", "container text button link", "handlers", "Which event the handler listens to.", "the event name before `:` in `data-on`", 'attr("data-on", t.string())', { runtime: "on" }),
  rt("handlerOptions", "container text button link", "handlers", "Handler options (passive, once, capture).", "suffixes in `data-on`: `click:fn.once.passive`", 'attr("data-on", t.string())', { runtime: "on" }),

  // ── Conditions ──
  ar("conditions", "*", C, "Show the element only when conditions hold (groups joined by all / any).", COND_NOTE, "`{% if a and b %}` / `{% if a or b %}` around the element", { aliases: ["conditions:add", "conditionLogic"] }),
  ar("condType", "*", C, "Condition source: url-param, auth, device, company, connector, form-field, item, localStorage, state.", "url-param -> `request.query.x`; auth -> `customer`; device -> `md:hidden` / `max-md:hidden`; company -> `company.x`; connector -> `collections.x.size`; form-field -> `data-state-show` `field:x` (live); item -> loop variable; localStorage / state -> `data-state-show`", "-"),
  ar("condOp", "*", C, "Operator: equals, not-equals, contains, exists, greater-than ...", "`==` `!=` `contains` (truthy / `blank`) `>` `<`", "-"),
  ar("condAuthField", "*", C, "Which signed-in-customer field.", "`customer.<field>` in the `{% if %}`", "-"),
  ar("condAuthMember", "*", C, "Signed in / signed out.", "`{% if customer %}`", "-"),
  ar("condAuthPlan", "*", C, "Customer has a plan.", "`{% if customer.plans contains 'pro' %}`", "-"),
  ar("condAuthBoolValue", "*", C, "Boolean customer field value.", "`{% if customer.<field> == true %}`", "-"),
  ar("condAuthValue", "*", C, "Customer field equals a value.", "`{% if customer.<field> == 'x' %}`", "-"),
  ar("condCompanyField", "*", C, "Site (company) field check.", "`{% if site.<field> != blank %}`", "-"),
  ar("condConnCollection", "*", C, "Collection the connector condition reads.", "`{% if collections.<slug>.size > 0 %}`", "-"),
  ar("condConnProvider", "*", C, "Connector provider (Stripe, collections ...).", "which Liquid object is tested: `products`, `collections.x`, `customer`", "-"),
  ar("condDevice", "*", C, "Mobile / desktop only.", "responsive classes `hidden md:block` (visual) or `{% if request.device == 'mobile' %}` (server)", "-"),
  ar("condFormTarget", "*", C, "Which form field the condition watches.", "`form.values.<name>` inside `{% form %}`; client-side show-on-input uses `data-state-show` + `data-state-bind`", "-"),

  // ── State ──
  rt("stateBindings", "container", S, "State wiring of a container (visibility key, derived values, in-view key).", "the `data-state-*` attributes below", "-", { aliases: ["stateBindings:add", "containerStateWiring"] }),
  rt("visibilityStateKey", "container", S, "Show the container while a state key is set (drawers, cart).", "`data-state-show=\"cart:open\"`", 'attr("data-state-show", t.string())', { runtime: "state-show" }),
  rt("stateModifiers", "container button text", S, "Extra classes while a state value holds (active chip, current step).", "`data-state-class=\"key=value:bg-primary text-primary-content\"`", 'attr("data-state-class", t.string())', { runtime: "state-class" }),
  rt("computedStateBindings", "container", S, "Derived state, e.g. the variant that matches the picked options.", "`data-state-compute=\"variant-match\"` + `data-variants`, `data-axes`", 'attr("data-state-compute", t.string())', { runtime: "state-compute" }),
  rt("inViewState", "container", S, "Write the most-visible section into state (scroll rails).", "`data-state-in-view=\"deck:step=<slug>\"`", 'attr("data-state-in-view", t.string())', { runtime: "state-in-view" }),
  rt("stateBinding", "form-control", S, "Two-way bind a field to a state key (filters, search).", "`data-state-bind=\"url:q\"` + `data-debounce=\"200ms\"` + `data-bind-mode=\"checked\"`; URL keys also work with a GET `<form data-autosubmit>`", 'attr("data-state-bind", t.string())', { runtime: "state-bind", aliases: ["stateBinding.key", "stateBinding.mode", "stateBinding.debounceMs"] }),
  rt("state.text", "text", S, "Show a state value as text (`{{state.key}}`).", "`<span data-state-text=\"key\">`", 'attr("data-state-text", t.string())', { runtime: "state-text" }),

  // ── Data source ──
  ar("dataSource", "data", D, "Where a repeating list gets its rows (collection, products, orders ...).", "`{% for row in collections.slug %}` / `products` / `customer.orders`", "arg(\"in\", t.expression())", { aliases: ["dataSource.add"] }),
  ar("dataSource.provider", "data", D, "Provider: collection, Stripe, customer.", "which Liquid object the loop reads", "-"),
  ar("dataSource.collection", "data", D, "Collection slug.", "`collections.<slug>`", "-"),
  ar("dataSource.filter", "data", D, "Field filters.", "`| where: 'field', 'value'`", "-"),
  ar("dataSource.ids", "data", D, "Specific rows.", "`| where: 'id', ids` or a hand-written list", "-"),
  ar("dataSource.sort", "data", D, "Sort order.", "`| sort: 'field'` / `| reverse`", "-"),
  ar("dataSource.offset", "data", D, "Skip rows.", "`offset: 3` on `{% for %}`", 'arg("offset", t.number())'),
  ar("dataSource.limit", "data", D, "Row limit.", "`limit: 6` on `{% for %}`", 'arg("limit", t.number())'),
  ar("dataSource.facetKeys", "data", D, "Facets to count for a filter UI.", "`product_facets` object / `| facets: 'color,size'`", "-"),
  ar("dataSource.scope", "data", D, "Repeat over a list inside the parent row (`item.images`).", "nested `{% for image in item.images %}`", "-"),
  ar("dataSource.splitBy", "data", D, "Split a comma string into rows.", "`| split: ','`", "-"),
  ar("dataSource.ignoreUrl", "data", D, "Do not merge the page query into the fetch.", "omit `request.query` from the loop's `where`", "-"),
  rt("dataSource.stateInputs", "data", D, "Refetch when state / URL keys change (filters, pagination).", "GET `<form data-autosubmit>` -> `request.query.x` in the loop; `{% paginate %}` for pages", 'attr("data-autosubmit", t.string())'),
  ar("dataSource.publishStateKeys", "data", D, "Publish totals (pages, count) for pagination chrome.", "`paginate.pages`, `paginate.items` inside `{% paginate %}`", "-"),
  ar("dataSource.bindingKey", "data", D, "Stable name for a binding when several share a collection.", "a Liquid `{% assign %}` name", "-"),
  at("livePreview", "data", D, "Show live rows in the editor canvas.", "editor-only flag `data-edit-preview` (stripped on publish)", 'attr("data-edit-preview", t.boolean())'),
];
