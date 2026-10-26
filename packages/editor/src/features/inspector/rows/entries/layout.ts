import { at, nt, rt, tw } from "../build";
import type { PropEntry } from "../types";

const A = "alignment";
const S = "size";
const ST = "styles";

/** Layout tab: modifiers, items, layout, size; plus the Styles "display" group that the registry files here. */
export const layoutEntries: PropEntry[] = [
  // ── Modifiers / Items ──
  tw("modifiers", "*", "modifiers", "One-click style presets stacked on top of the classes.", "modifier-presets", { aliases: ["modifiers:add"],
    how: "a preset is a named class-token bundle; toggling adds / removes those tokens (kit-defined `modifiers` facet, no new markup)", binding: "cls(<each token's own group>) via ModifierPreset.apply" }),
  nt("preset-items", "container data", "preset-items", "Add or remove the child items of a preset group (cards, tabs, list rows).", "editor insert command: `insert.template` of the preset's child markup", "defineElement.insert.template", { aliases: ["preset:add-child"] }),

  // ── Layout ──
  tw("layoutPreset", "container data", A, "Pick a layout (row, column, grid, stack) in one click.", "display", { aliases: ["layout.preset"],
    how: "writes `display`, `flex-direction`, `grid-cols`, `gap`, `items-*`, `justify-*` tokens together", binding: 'cls("display") + cls("flex-direction") + cls("grid-cols") + cls("gap") + cls("align-items") + cls("justify-content")' }),
  tw("display", "*", ST, "Display mode (block / flex / grid / hidden ...).", "display"),
  tw("flexDirection", "container data", A, "Row or column direction.", "flex-direction"),
  tw("gap", "container data", A, "Gap between children (uniform).", "gap"),
  tw("gapX", "container data", A, "Column gap.", "gap-x"),
  tw("gapY", "container data", A, "Row gap.", "gap-y"),
  tw("space", "container data", A, "Space between children (space-x / space-y).", "space-x", { binding: 'cls("space-x") + cls("space-y")' }),
  tw("alignItems", "container data", A, "Cross-axis alignment.", "align-items"),
  tw("justifyContent", "container data", A, "Main-axis alignment.", "justify-content"),
  tw("justifyItems", "container data", A, "Grid item inline alignment.", "justify-items"),
  tw("alignSelf", "*", A, "Own cross-axis alignment.", "align-self"),
  tw("justifySelf", "*", A, "Own inline alignment in a grid.", "justify-self"),
  tw("flexBase", "*", A, "Flex grow / shrink / basis (`flex-1`, `basis-1/3`).", "flex", { binding: 'cls("flex") + cls("basis")' }),
  tw("placeContent", "container data", A, "place-content shorthand.", "place-content"),
  tw("gridSpan", "*", A, "Column and row span in a grid.", "col-span", { binding: 'cls("col-span") + cls("row-span")' }),
  tw("gridColSpan", "*", A, "Column span.", "col-span"),
  tw("gridRowSpan", "*", A, "Row span.", "row-span"),
  tw("place", "container data", A, "place-items / place-self bundle.", "place-items", { binding: 'cls("place-items") + cls("place-self")' }),
  tw("placeItems", "container data", A, "place-items.", "place-items"),
  tw("placeSelf", "*", A, "place-self.", "place-self"),
  tw("padding", "*", A, "Padding (all / axes / sides, spacing tokens).", "p", { how: "`p` / `px` / `py` / `pt` / `pr` / `pb` / `pl` groups", binding: 'cls("p") | cls("px") | cls("py") | cls("pt") | cls("pr") | cls("pb") | cls("pl")' }),
  tw("margin", "*", A, "Margin (all / axes / sides).", "m", { how: "`m` / `mx` / `my` / `mt` / `mr` / `mb` / `ml` groups", binding: 'cls("m") | cls("mx") | cls("my") | cls("mt") | cls("mr") | cls("mb") | cls("ml")' }),
  tw("scrollPadding", "container", A, "Scroll padding (anchors under a fixed header).", "scroll-p", { binding: 'cls("scroll-p") | cls("scroll-px") | cls("scroll-py") | cls("scroll-pt")' }),
  tw("scrollMargin", "container", A, "Scroll margin.", "scroll-m", { binding: 'cls("scroll-m") | cls("scroll-mt")' }),
  tw("overflow", "container", A, "Overflow clipping / scrolling.", "overflow", { aliases: ["containerOverflow"] }),
  rt("overflow.dragScroll", "container", A, "Let visitors drag the overflow area with the pointer.", "`data-drag-scroll` on the overflow container", 'attr("data-drag-scroll", t.boolean())', { runtime: "overflow-ux" }),
  rt("overflow.wheelHorizontal", "container", A, "Mouse wheel scrolls sideways.", "`data-wheel-horizontal`", 'attr("data-wheel-horizontal", t.boolean())', { runtime: "overflow-ux" }),
  rt("overflow.autoHide", "container", A, "Hide the scrollbar until the area is used.", "`data-scrollbar-autohide` (value = hide delay)", 'attr("data-scrollbar-autohide", t.string())', { runtime: "overflow-ux" }),
  rt("overflow.hideDelay", "container", A, "Delay before the scrollbar hides.", "value of `data-scrollbar-autohide`, e.g. `1500ms`", 'attr("data-scrollbar-autohide", t.string())', { runtime: "overflow-ux" }),
  rt("overflow.smoothing", "container", A, "Smoothed wheel scrolling.", "`data-scroll-smoothing` (0-1)", 'attr("data-scroll-smoothing", t.number())', { runtime: "overflow-ux" }),

  // ── Size ──
  tw("width", "*", S, "Width.", "width"),
  tw("height", "*", S, "Height.", "height"),
  tw("minWidth", "*", S, "Minimum width.", "min-width"),
  tw("minHeight", "*", S, "Minimum height.", "min-height"),
  tw("maxWidth", "*", S, "Maximum width (`max-w-page`, `max-w-2xl`).", "max-width"),
  tw("maxHeight", "*", S, "Maximum height.", "max-height"),
  tw("aspectRatio", "*", S, "Aspect ratio.", "aspect"),
  tw("size", "icon container", S, "Square size (width + height together); the Icon size slider writes it.", "size"),
  tw("boxSizing", "*", S, "box-sizing.", "box"),

  // ── Position & misc layout utilities (Styles section) ──
  tw("position", "*", ST, "Position mode.", "position"),
  tw("inset", "*", ST, "Offsets (top / right / bottom / left; uniform, axes or sides).", "inset", { binding: 'cls("inset") | cls("inset-x") | cls("inset-y") | cls("top") | cls("right") | cls("bottom") | cls("left")' }),
  tw("zIndex", "*", ST, "Stacking order.", "z-index"),
  tw("order", "*", ST, "Flex / grid order.", "order"),
  tw("float", "*", ST, "Float.", "float"),
  tw("visibility", "*", ST, "visible / invisible.", "visibility"),
  tw("columns", "container", ST, "CSS multi-column count / width.", "columns"),
  tw("break", "container", ST, "Column / page break control.", "break-before", { binding: 'cls("break-before") + cls("break-inside") + cls("break-after")' }),
  tw("breakBefore", "container", ST, "break-before.", "break-before"),
  tw("breakInside", "container", ST, "break-inside.", "break-inside"),
  tw("breakAfter", "container", ST, "break-after.", "break-after"),
  tw("isolation", "*", ST, "isolation: isolate.", "isolation"),
  tw("table", "container", ST, "Table layout bundle (table elements).", "table-layout", { binding: 'cls("table-layout") + cls("caption")' }),
  tw("tableLayout", "container", ST, "table-layout.", "table-layout"),
  tw("captionSide", "container", ST, "caption-side.", "caption"),
  nt("container.type", "container", "component", "What the container is: section, header, footer, page, list, list item, table parts, plain div.", "the element's tag name (`<section>`, `<header>`, `<ul>`, `<li>`, `<table>` ...)", 'tagName(["div","section","header","footer","main","nav","ul","ol","li","table","thead","tbody","tr","td","th","article","aside"])', { aliases: ["type"] }),
  at("details.open", "container", "component", "Start expanded: the saved `open` attribute on a `<details>` (the canvas always shows it open; use Show closed to preview).", "`open` attribute on `<details>`", 'attr("open", t.boolean())', { aliases: ["open", "details", "accordion"] }),
  at("anchor", "container header footer", "properties", "In-page anchor name (`#features`).", "`id` attribute on the section", 'attr("id", t.string())'),
  nt("tabGroup", "container", "stateBindings", "Join a group of tab panels so only one shows.", "radio inputs + `peer-checked:` / `has-[:checked]:` classes (native); for non-radio triggers `<details name=\"group\">`", 'attr("name", t.string()) on <details> / radio'),
];
