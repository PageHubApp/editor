/**
 * The Action and Handlers section pickers' data: the categorized action types the Action "+"
 * lists and, per type, the HTML / data-* attributes that define it in the source (actions are
 * native `href` / `command` / `data-*`, never a stored action object) plus the one detail field
 * to edit after picking; and the DOM events the Handlers "+" lists with the `data-on` event name
 * each one writes.
 *
 * Each entry carries the native source form the picker writes, not a reusable action object.
 * Pure data, no React.
 */

/** A detail field shown after an action is picked (the attribute it reads / writes). */
export interface ActionField {
  /** The attribute the field edits. */
  attr: string;
  label: string;
  kind: "string" | "enum";
  options?: readonly string[];
  /** Picker label per option, for options that are raw attribute values (`toggle-popover`). */
  optionLabels?: Readonly<Record<string, string>>;
  placeholder?: string;
}

interface ActionSpec {
  /** Picker label. */
  label: string;
  /** Right-aligned category, or "" for Link (which has no group). */
  group: string;
  /** Attributes written to the source on pick: `[name, value]` (value `""` = boolean attr). */
  attrs: ReadonlyArray<readonly [string, string]>;
  /**
   * The detail fields the action's popover edits after it's picked — every attribute that
   * defines it (the full action sub-form, not one input). Empty for flag-only
   * actions (toggle theme). Each field binds a native attribute from the property map's `action`
   * rows (`interactions.ts`): a link's `href` / `target` / `rel`, a show-hide's `commandfor` /
   * `command` (direction) / `data-state-on` (trigger), a download's `href` / `download`, etc.
   */
  fields: readonly ActionField[];
  /** Its effect is something the canvas can show or hide, so the card carries the view-only "Open on canvas" toggle. */
  preview?: true;
}

const CART_FIELD: ActionField = { attr: "data-cart", label: "Cart", kind: "enum", options: ["add", "open", "checkout"], optionLabels: { add: "Add to cart", open: "Open cart", checkout: "Check out" } };
/** Open in the same tab or a new one (`target` + implicit `rel=noopener`). */
const TARGET_FIELD: ActionField = { attr: "target", label: "Open in", kind: "enum", options: ["_self", "_blank", "_parent", "_top"], optionLabels: { _self: "Same tab", _blank: "New tab", _parent: "Parent frame", _top: "Top frame" } };
const REL_FIELD: ActionField = { attr: "rel", label: "Rel", kind: "string", placeholder: "noopener, nofollow…" };

/** Action type id → its label, category and source form. Order = the picker's order. */
export const ACTION_SPECS: Record<string, ActionSpec> = {
  link: { label: "Link", group: "", attrs: [["href", ""]], fields: [{ attr: "href", label: "Link", kind: "string", placeholder: "/page, #anchor, https://…" }, TARGET_FIELD, REL_FIELD] },
  "open-modal": { label: "Open Modal", group: "Open", attrs: [["command", "show-modal"]], fields: [{ attr: "commandfor", label: "Modal", kind: "string", placeholder: "dialog id" }, { attr: "command", label: "Command", kind: "enum", options: ["show-modal", "close"], optionLabels: { "show-modal": "Open", close: "Close" } }], preview: true },
  "show-hide": { label: "Show / Hide", group: "Open", attrs: [["command", "toggle-popover"]], fields: [{ attr: "commandfor", label: "Target", kind: "string", placeholder: "element id" }, { attr: "command", label: "Direction", kind: "enum", options: ["toggle-popover", "show-popover", "hide-popover"], optionLabels: { "toggle-popover": "Toggle", "show-popover": "Show", "hide-popover": "Hide" } }, { attr: "data-state-on", label: "Trigger", kind: "enum", options: ["click", "hover", "load"], optionLabels: { click: "Click", hover: "Hover", load: "Page load" } }], preview: true },
  "add-to-cart": { label: "Add to Cart", group: "Commerce", attrs: [["data-cart", "add"]], fields: [CART_FIELD] },
  "toggle-cart": { label: "Toggle Cart", group: "Commerce", attrs: [["data-cart", "open"]], fields: [CART_FIELD], preview: true },
  "cart-checkout": { label: "Checkout Cart", group: "Commerce", attrs: [["data-cart", "checkout"]], fields: [CART_FIELD] },
  "manage-subscription": { label: "Manage Subscription", group: "Commerce", attrs: [["action", ""]], fields: [{ attr: "action", label: "Portal URL", kind: "string", placeholder: "account portal route" }] },
  "toggle-theme": { label: "Toggle light / dark", group: "System", attrs: [["data-theme-toggle", ""]], fields: [] },
  "copy-to-clipboard": { label: "Copy to Clipboard", group: "System", attrs: [["data-copy", ""]], fields: [{ attr: "data-copy", label: "Text to copy", kind: "string" }] },
  "download-file": { label: "Download File", group: "System", attrs: [["download", ""], ["href", ""]], fields: [{ attr: "href", label: "File URL", kind: "string" }, { attr: "download", label: "File name", kind: "string", placeholder: "report.pdf" }] },
  "agent-send": { label: "Send Agent Message", group: "System", attrs: [["data-chat-send", ""]], fields: [{ attr: "data-chat-send", label: "Field name", kind: "string" }] },
  "set-local-storage": { label: "Set Local Storage", group: "Storage", attrs: [["data-state-set", "local:"]], fields: [{ attr: "data-state-set", label: "Set", kind: "string", placeholder: "local:key:value" }] },
  "remove-local-storage": { label: "Remove Local Storage", group: "Storage", attrs: [["data-state-clear", "local:"]], fields: [{ attr: "data-state-clear", label: "Remove", kind: "string", placeholder: "local:key" }] },
  "set-state": { label: "Set State", group: "State", attrs: [["data-state-set", ""]], fields: [{ attr: "data-state-set", label: "Set", kind: "string", placeholder: "key:value" }], preview: true },
  "toggle-state": { label: "Toggle State", group: "State", attrs: [["data-state-toggle", ""]], fields: [{ attr: "data-state-toggle", label: "Toggle", kind: "string", placeholder: "key or key:a|b" }], preview: true },
  "clear-state": { label: "Clear State", group: "State", attrs: [["data-state-clear", ""]], fields: [{ attr: "data-state-clear", label: "Clear", kind: "string", placeholder: "key" }], preview: true },
  "increment-state": { label: "Increment State", group: "State", attrs: [["data-state-step", ""]], fields: [{ attr: "data-state-step", label: "Step", kind: "string", placeholder: "key:+1" }], preview: true },
  "decrement-state": { label: "Decrement State", group: "State", attrs: [["data-state-step", ""]], fields: [{ attr: "data-state-step", label: "Step", kind: "string", placeholder: "key:-1" }], preview: true },
};

/** The action types in picker order (keys of `ACTION_SPECS`). */
export const ACTION_TYPE_ORDER: readonly string[] = Object.keys(ACTION_SPECS);

/** A DOM event the Handlers "+" can add, with the React-style name it is known by elsewhere. */
interface HandlerEvent {
  /** The event name written into `data-on` (e.g. `click`). */
  event: string;
  /** Picker label. */
  label: string;
}

/** Events the Handlers "+" lists, in picker order. The id (`event`) is the `data-on` name. */
export const HANDLER_EVENTS: readonly HandlerEvent[] = [
  { event: "click", label: "On Click" },
  { event: "dblclick", label: "On Double Click" },
  { event: "mouseenter", label: "On Mouse Enter" },
  { event: "mouseleave", label: "On Mouse Leave" },
  { event: "mousedown", label: "On Mouse Down" },
  { event: "mouseup", label: "On Mouse Up" },
  { event: "focus", label: "On Focus" },
  { event: "blur", label: "On Blur" },
  { event: "keydown", label: "On Key Down" },
  { event: "keyup", label: "On Key Up" },
  { event: "submit", label: "On Submit" },
  { event: "change", label: "On Change" },
  { event: "input", label: "On Input" },
];

/** The handler options the site runtime recognises as a `data-on` suffix (`chunks/on.ts`). */
export const HANDLER_OPTIONS = ["once", "passive", "capture", "prevent"] as const;
export type HandlerOption = (typeof HANDLER_OPTIONS)[number];
const OPTION_SET: ReadonlySet<string> = new Set(HANDLER_OPTIONS);

/** Human labels for the handler-option checkboxes (`prevent` = `event.preventDefault()` first). */
export const HANDLER_OPTION_LABELS: Record<HandlerOption, string> = {
  prevent: "Prevent default",
  once: "Run once",
  passive: "Passive",
  capture: "Capture phase",
};

/**
 * One `data-on` entry: the event, the name of the registered function it calls (`PageHub.on`),
 * and the listener options. Serialises as `event:name.opt.opt` — exactly the shape the site
 * runtime parses in `packages/site-runtime/src/chunks/on.ts`.
 */
export interface DataOnEntry {
  event: string;
  fn: string;
  opts: HandlerOption[];
}

/** Parse a `data-on` attribute (`"click:openChat; mouseenter:preview.once"`) into its entries. */
export function parseDataOn(value: string): DataOnEntry[] {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(":");
      if (i === -1) return { event: part, fn: "", opts: [] };
      const event = part.slice(0, i).trim();
      // The runtime strips trailing known options off the dotted tail; the rest is the fn name.
      const parts = part.slice(i + 1).trim().split(".");
      const opts: HandlerOption[] = [];
      while (parts.length > 1 && OPTION_SET.has(parts[parts.length - 1]!)) opts.unshift(parts.pop() as HandlerOption);
      return { event, fn: parts.join("."), opts };
    });
}

/** Serialize `data-on` entries back to the attribute value. */
export function serializeDataOn(entries: readonly DataOnEntry[]): string {
  return entries
    .map((e) => `${e.event}:${[e.fn, ...e.opts.filter((o) => HANDLER_OPTIONS.includes(o))].join(".")}`)
    .join("; ");
}

/**
 * Which action types are currently set on an element, read from its attributes (the inverse of
 * `ACTION_SPECS[*].attrs`). Lets the Action section re-open the real sub-form for an action the
 * author already picked, instead of a structure note. A `get` reads one attribute (null = unset).
 */
export function detectActiveActions(get: (attr: string) => string | null): string[] {
  const has = (a: string) => get(a) !== null;
  const found: string[] = [];
  const href = get("href");
  if (has("download")) found.push("download-file");
  else if (href !== null) found.push("link");
  const command = get("command");
  if (command !== null) found.push(command === "show-modal" || command === "close" ? "open-modal" : "show-hide");
  else if (has("commandfor")) found.push("show-hide");
  const cart = get("data-cart");
  if (cart !== null) found.push(cart === "open" ? "toggle-cart" : cart === "checkout" ? "cart-checkout" : "add-to-cart");
  if (has("data-theme-toggle")) found.push("toggle-theme");
  if (has("data-copy")) found.push("copy-to-clipboard");
  if (has("data-chat-send")) found.push("agent-send");
  const stateSet = get("data-state-set");
  if (stateSet !== null) found.push(stateSet.startsWith("local:") ? "set-local-storage" : "set-state");
  if (has("data-state-toggle")) found.push("toggle-state");
  const stateClear = get("data-state-clear");
  if (stateClear !== null) found.push(stateClear.startsWith("local:") ? "remove-local-storage" : "clear-state");
  const step = get("data-state-step");
  if (step !== null) found.push(step.includes("-") ? "decrement-state" : "increment-state");
  if (has("action")) found.push("manage-subscription");
  return [...new Set(found)];
}
