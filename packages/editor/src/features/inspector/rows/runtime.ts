import type { NewRuntimeAttr } from "./types";

/**
 * Site-runtime attributes this map needs that are NOT in the site-runtime attribute table yet.
 * Existing ones (data-cart, data-autosubmit, data-autoplay, data-animate, data-track, data-theme-toggle,
 * data-copy, data-dismiss, data-scrollspy, form enhance, map) are referenced without an id.
 */
export const NEW_RUNTIME: readonly NewRuntimeAttr[] = [
  { id: "fit-text", attributes: 'data-fit-text="oneline|multiline|box|boxoneline"', on: "any text element", module: "chunks/fit-text.ts",
    spec: "Scale font-size until the text fits one line / the box (binary search on resize); static text stays readable without JS." },
  { id: "scroll-effect", attributes: 'data-scroll-effect="horizontal|timeline" + data-scroll-direction, data-scroll-speed, data-scroll-runway, data-scroll-smoothing', on: "section container", module: "chunks/scroll-effect.ts",
    spec: "Pin the section for `runway` screens and map vertical scroll to a horizontal pan (`horizontal`) or drive a CSS scroll-timeline preset (`timeline`); `smoothing` lerps the position." },
  { id: "overflow-ux", attributes: "data-drag-scroll, data-wheel-horizontal, data-scrollbar-autohide=\"1500ms\", data-scroll-smoothing", on: "overflow container", module: "core/overflow.ts",
    spec: "Pointer-drag scrolling, wheel-to-horizontal, auto-hiding scrollbar after a delay, smoothed wheel; each attribute is independent." },
  { id: "carousel", attributes: 'data-carousel="dots arrows"', on: "scroll-snap track", module: "chunks/carousel.ts",
    spec: "Adds prev/next buttons and dot indicators to a scroll-snap track; pairs with data-autoplay for timing." },
  { id: "animate-stagger", attributes: 'data-animate-stagger="80ms"', on: "parent of data-animate children", module: "chunks/animate.ts",
    spec: "Offsets each child's entrance delay by the step." },
  { id: "animate-trigger", attributes: 'data-animate-trigger="view|load"', on: "any [data-animate]", module: "chunks/animate.ts",
    spec: "Play the entrance on scroll-into-view (default) or immediately on load; hover entrances are plain `hover:` classes." },
  { id: "animate-exit", attributes: 'data-animate-exit="fade-out"', on: "any [data-animate]", module: "chunks/animate.ts",
    spec: "Plays the named exit preset when the element scrolls out of view." },
  { id: "state-set", attributes: 'data-state-set="key:value" (key prefix `local:` persists in localStorage)', on: "button, any clickable", module: "chunks/state.ts",
    spec: "Writes a value into the page state registry (flag / selection / value / visibility kinds); `local:` keys persist." },
  { id: "state-toggle", attributes: 'data-state-toggle="key" or "key:a|b"', on: "button", module: "chunks/state.ts",
    spec: "Flips a flag, or alternates a key between two values." },
  { id: "state-clear", attributes: 'data-state-clear="key"', on: "button", module: "chunks/state.ts",
    spec: "Removes a key from the registry (and from localStorage for `local:` keys)." },
  { id: "state-step", attributes: 'data-state-step="key:+1" + data-min, data-max, data-wrap, data-every="5s"', on: "button or timer host", module: "chunks/state.ts",
    spec: "Increment / decrement a numeric key with bounds and wrap, optionally on an interval." },
  { id: "state-on", attributes: 'data-state-on="click|hover|load|interval"', on: "any element that carries a data-state-* action or data-dismiss", module: "chunks/state.ts",
    spec: "Chooses the trigger for the element's state action (default click)." },
  { id: "state-show", attributes: 'data-state-show="key=value" (also `key!=value`, `key`, `!key`, `key>3`)', on: "any", module: "chunks/state.ts",
    spec: "Sets `hidden` unless the condition holds; also drives `visibilityStateKey` and state-type conditions." },
  { id: "state-class", attributes: 'data-state-class="key=value:class a b; key2=value2:class c"', on: "any", module: "chunks/state.ts",
    spec: "Adds the listed classes while the condition holds (state modifiers, e.g. active chip styling)." },
  { id: "state-text", attributes: 'data-state-text="key"', on: "any inline element", module: "chunks/state.ts",
    spec: "Shows the current value of a state key as text (replaces `{{state.key}}` interpolation)." },
  { id: "state-in-view", attributes: 'data-state-in-view="key=value"', on: "section / container", module: "chunks/state.ts",
    spec: "The most-visible member of a key group writes `key`, `key:index`, `key:number`, `key:count` into state." },
  { id: "state-bind", attributes: 'data-state-bind="key" + data-debounce="200ms" + data-bind-mode="checked"', on: "input, select, textarea", module: "chunks/state.ts",
    spec: "Two-way binds a form control to a state key; `url:` keys mirror to the query string (GET navigation or history.replaceState)." },
  { id: "state-compute", attributes: "data-state-compute='variant-match' data-variants='{{ product.variants | json }}' data-axes=\"Size,Color\"", on: "container around variant pickers", module: "chunks/state.ts",
    spec: "Computes a derived key (matching variant id) from the selected option axes." },
  { id: "chat-send", attributes: 'data-chat-send="field-name"', on: "button / form", module: "chunks/chat.ts",
    spec: "Sends the named field's value (or the button text) to the site chat widget and opens it." },
  { id: "on", attributes: 'data-on="click:openChat; mouseenter:preview.once"', on: "any element", module: "chunks/on.ts",
    spec: "Calls a function the site registers in its own script file (`PageHub.on('openChat', (event, el) => …)`), never inline code. Event options as suffixes: `.once`, `.passive`, `.capture`, `.prevent`. CSP-safe: the site script is an external file." },
];

export const RUNTIME_IDS: ReadonlySet<string> = new Set(NEW_RUNTIME.map((r) => r.id));
