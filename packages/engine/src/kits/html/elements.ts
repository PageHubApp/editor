/**
 * The HTML the editor knows: one `defineElement` per type, props bound to attributes,
 * text and tag names. Anything else resolves to the generic `html.element`.
 */
import { defineElement } from "../../elements/defineElement";
import { attr, tagName, text } from "../../elements/bindings";
import { t } from "../../schema/t";
import { typeSpec } from "../../elements/inspectorSpec";
import { iconFilterOf, isIconImage } from "./iconFilter";

const s = () => t.string().optional();
const common = { id: attr("id", s()), class: attr("class", s()) };

export const sectionElement = defineElement({ inspector: typeSpec("container"),
  name: "html.section",
  match: "section",
  props: { ...common },
  insert: { label: "Section", icon: "layout-rows", category: "layout", template: "<section>\n  <h2>Heading</h2>\n</section>" },
  describe: "A page section (<section>).",
});

export const containerElement = defineElement({ inspector: typeSpec("container"),
  name: "html.container",
  match: "div, header, footer, nav, main, article, aside, figure, fieldset",
  props: { ...common, tagName: tagName(["div", "header", "footer", "nav", "main", "article", "aside", "figure", "fieldset"]) },
  insert: { label: "Container", icon: "box", category: "layout", template: "<div></div>" },
  describe: "A generic container (div, header, footer, nav, main, article, aside, figure, fieldset).",
});

export const headingElement = defineElement({ inspector: typeSpec("text"),
  name: "html.heading",
  match: "h1, h2, h3, h4, h5, h6",
  props: { ...common, level: tagName(["h1", "h2", "h3", "h4", "h5", "h6"]), text: text() },
  insert: { label: "Heading", icon: "heading", category: "text", template: "<h2>Heading</h2>" },
  describe: "A heading, h1–h6.",
});

export const textElement = defineElement({ inspector: typeSpec("text"),
  name: "html.text",
  match: "p, blockquote, figcaption, span, small, strong, em, b, i, code, pre",
  props: { ...common, text: text() },
  insert: { label: "Text", icon: "text", category: "text", template: "<p>Text</p>" },
  describe: "Text: a paragraph, quote, caption or inline text.",
});

/** A standalone icon as the converter writes it: a `<span>` holding only a `{{ 'set/Name' | icon }}` output (`iconFilter.ts`). Matched before the generic text span. */
export const iconElement = defineElement({ inspector: typeSpec("icon"),
  name: "html.icon",
  match: (n) => iconFilterOf(n) !== null || isIconImage(n),
  props: { ...common },
  insert: {
    label: "Icon",
    icon: "sparkles",
    category: "icons",
    template: '<span class="fill-current inline-flex items-center justify-center size-6 [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{{ "tb/TbStar" | icon }}</span>',
  },
  describe: "A standalone icon: a <span> holding one `{{ 'set/Name' | icon }}` output. Size and colour are classes on the span.",
});

export const imageElement = defineElement({ inspector: typeSpec("image"),
  name: "html.image",
  match: "img",
  props: { ...common, src: attr("src", s()), alt: attr("alt", s()), width: attr("width", t.int().optional()), height: attr("height", t.int().optional()), loading: attr("loading", t.enum(["lazy", "eager"]).optional()) },
  insert: { label: "Image", icon: "photo", category: "media", template: '<img src="" alt="">' },
  describe: "An image (<img>). `alt` is required for accessibility (empty for decorative images).",
});

export const pictureElement = defineElement({ inspector: typeSpec("image"), name: "html.picture", match: "picture", props: { ...common }, describe: "Responsive image sources (<picture>)." });

export const linkElement = defineElement({ inspector: typeSpec("link"),
  name: "html.link",
  match: "a",
  props: { ...common, href: attr("href", s()), target: attr("target", s()), rel: attr("rel", s()), text: text() },
  insert: { label: "Link", icon: "link", category: "text", template: '<a href="#">Link</a>' },
  describe: "A hyperlink (<a>).",
});

export const buttonElement = defineElement({ inspector: typeSpec("button"),
  name: "html.button",
  match: "button",
  props: { ...common, type: attr("type", t.enum(["button", "submit", "reset"]).optional()), text: text() },
  insert: { label: "Button", icon: "click", category: "form", template: '<button type="button">Button</button>' },
  peerInherit: { whenParentIs: ["html.container", "html.section"], reference: "left-neighbor" },
  describe: "A button.",
});

export const formElement = defineElement({ inspector: typeSpec("form"),
  name: "html.form",
  match: "form",
  props: { ...common, action: attr("action", s()), method: attr("method", t.enum(["get", "post"]).optional()) },
  insert: { label: "Form", icon: "forms", category: "form", template: '<form>\n  <button type="submit">Send</button>\n</form>' },
  describe: "An HTML form (for site forms handled by the host, use {% form %}).",
});

const field = { ...common, name: attr("name", s()), required: attr("required", s()) };

export const inputElement = defineElement({ inspector: typeSpec("form-control"),
  name: "html.input",
  match: "input",
  props: { ...field, type: attr("type", s()), placeholder: attr("placeholder", s()), value: attr("value", s()) },
  insert: { label: "Input", icon: "input", category: "form", template: '<input type="text" name="" aria-label="">' },
  describe: "A form input.",
});

export const selectElement = defineElement({ inspector: typeSpec("form-control"), name: "html.select", match: "select", props: { ...field }, describe: "A select box." });

export const textareaElement = defineElement({ inspector: typeSpec("form-control"),
  name: "html.textarea",
  match: "textarea",
  props: { ...field, placeholder: attr("placeholder", s()), rows: attr("rows", t.int().optional()) },
  describe: "A multi-line text input.",
});

export const labelElement = defineElement({ inspector: typeSpec("text"), name: "html.label", match: "label", props: { ...common, for: attr("for", s()), text: text() }, describe: "A form label." });

export const listElement = defineElement({ inspector: typeSpec("container", { items: "<li>Item</li>" }),
  name: "html.list",
  match: "ul, ol, dl",
  props: { ...common, tagName: tagName(["ul", "ol", "dl"]) },
  insert: { label: "List", icon: "list", category: "text", template: "<ul>\n  <li>Item</li>\n</ul>" },
  describe: "A list (ul, ol, dl).",
});

export const listItemElement = defineElement({ inspector: typeSpec("container"), name: "html.listItem", match: "li, dt, dd", props: { ...common, text: text() }, describe: "A list item." });

export const tableElement = defineElement({ inspector: typeSpec("container"), name: "html.table", match: "table", props: { ...common }, describe: "A data table." });
export const tablePartElement = defineElement({ inspector: typeSpec("container"), name: "html.tablePart", match: "thead, tbody, tfoot, tr, td, th, caption", props: { ...common }, describe: "Part of a table (row, cell, section)." });

export const dialogElement = defineElement({ inspector: typeSpec("container"), name: "html.dialog", match: "dialog", props: { ...common, open: attr("open", s()) }, describe: "A dialog (<dialog>)." });

export const detailsElement = defineElement({ inspector: typeSpec("container"),
  name: "html.details",
  match: "details",
  props: { ...common, open: attr("open", s()) },
  insert: { label: "Details", icon: "chevron-down", category: "layout", template: "<details>\n  <summary>Summary</summary>\n  <p>Details</p>\n</details>" },
  describe: "A disclosure widget (<details> with <summary>).",
});

export const summaryElement = defineElement({ inspector: typeSpec("text"), name: "html.summary", match: "summary", props: { ...common, text: text() }, describe: "The visible label of a <details>." });

export const videoElement = defineElement({ inspector: { ...typeSpec("video"), byTag: { audio: typeSpec("audio") } },
  name: "html.video",
  match: "video, audio",
  props: { ...common, src: attr("src", s()), poster: attr("poster", s()), controls: attr("controls", s()), autoplay: attr("autoplay", s()), muted: attr("muted", s()), loop: attr("loop", s()) },
  describe: "A video or audio player.",
});

export const iframeElement = defineElement({ inspector: typeSpec("embed"),
  name: "html.iframe",
  match: "iframe",
  props: { ...common, src: attr("src", s()), title: attr("title", s()), loading: attr("loading", t.enum(["lazy", "eager"]).optional()) },
  describe: "An embedded page (<iframe>).",
});

export const svgElement = defineElement({ inspector: typeSpec("icon"), name: "html.svg", match: "svg", props: { ...common, viewBox: attr("viewBox", s()) }, describe: "An inline SVG graphic (edited as a whole)." });

// ── Map children ──
// A pin / route child of a {% map %} block. The site-runtime map chunk reads `data-lat`/`data-lng`
// (pin) and `data-path` + `data-color`/`data-weight`/`data-opacity`/`data-dashed` (route). Matched
// before the generic container so a `<div data-lat>` resolves to MapPoint, not Container.
export const mapPointElement = defineElement({ inspector: typeSpec("map-pin"),
  name: "html.mapPoint",
  match: "[data-lat], [data-pin]",
  props: { ...common, lat: attr("data-lat", t.number().optional()), lng: attr("data-lng", t.number().optional()), text: text() },
  describe: "A map pin: a {% map %} child with `data-lat`/`data-lng`; its heading is the popup title, the rest the description.",
});

export const mapPathElement = defineElement({ inspector: typeSpec("map-path"),
  name: "html.mapPath",
  match: "[data-path], [data-route]",
  props: { ...common, path: attr("data-path", s()), color: attr("data-color", s()), weight: attr("data-weight", t.number().optional()), opacity: attr("data-opacity", t.number().optional()), dashed: attr("data-dashed", t.boolean().optional()), text: text() },
  describe: "A map route line: a {% map %} child with `data-path` (one `lat,lng` per line) plus `data-color`/`data-weight`/`data-opacity`/`data-dashed`; its text is the caption.",
});

export const HTML_ELEMENTS = [
  // Map children first: a `<div data-lat>` / `<div data-path>` must resolve to MapPoint / MapPath
  // before the generic `div` container claims it.
  mapPointElement, mapPathElement,
  iconElement, sectionElement, containerElement, headingElement, textElement, imageElement, pictureElement, linkElement, buttonElement, formElement, inputElement,
  selectElement, textareaElement, labelElement, listElement, listItemElement, tableElement, tablePartElement, dialogElement, detailsElement, summaryElement,
  videoElement, iframeElement, svgElement,
] as const;
