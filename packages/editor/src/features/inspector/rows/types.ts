/** Property-map types. Pure data, no React. */

/** Where a prop key lives in HTML + Liquid (nothing is retired). */
export type Home =
  | "tailwind-class" // a class token in one Tailwind group (optionally with a variant prefix)
  | "html-attribute" // a plain HTML / ARIA / data-edit-* attribute
  | "liquid-arg" // a Liquid tag argument / filter argument / expression
  | "native" // a native element or platform feature, or document structure
  | "site-runtime" // a data-* attribute handled by packages/site-runtime
  | "schema-setting" // a `{% schema %}` setting (section / theme settings)
  | "escalate"; // no workable form yet; needs Will

/** The inspector tab a key appears on today. `site` and `ui` are outside the per-element inspector. */
export type Tab = "component" | "layout" | "design" | "interactions" | "advanced" | "site" | "ui";

export interface PropEntry {
  /** Today's prop key (or registry id when the registry has no prop key). Unique. */
  key: string;
  /** Other names for the same key (registry ids, dotted paths). Unique across the whole map. */
  aliases?: string[];
  /** Components that read or write it; `*` means every element. */
  components: string[];
  tab: Tab;
  /** Inspector section id (see `SECTION_TITLES`). */
  section: string;
  /** What it does for the author. */
  does: string;
  home: Home;
  /** Plain-words description of the HTML + Liquid form. */
  how: string;
  /** The exact element binding (`cls(...)`, `attr(...)`, `arg(...)`, `text()`, `tagName(...)`) or "-" for non-binding forms. */
  binding: string;
  /** Tailwind group id, for `tailwind-class`. */
  group?: string;
  /** The Tailwind group is not in `TAILWIND_GROUPS` yet. */
  newGroup?: boolean;
  /** Variant prefix (`hover`, `dark`) the value is written under. */
  variant?: string;
  /** Id into `NEW_RUNTIME` when the key needs a new site-runtime attribute. */
  runtime?: string;
  /** Required for `escalate`. */
  reason?: string;
}

export interface NewRuntimeAttr {
  id: string;
  /** Attribute(s) the author writes. */
  attributes: string;
  on: string;
  /** Module / lazy chunk in packages/site-runtime. */
  module: string;
  /** One-line spec. */
  spec: string;
}
