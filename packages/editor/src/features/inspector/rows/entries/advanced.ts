import { at, nt, ss } from "../build";
import type { PropEntry } from "../types";

const P = "properties";
const U = "ui";
const DS = "design-system";

const aria = (key: string, attr: string, does: string, schema = "t.string()") =>
  at(key, "*", P, does, `\`${attr}\` attribute`, `attr("${attr}", ${schema})`);

export const advancedEntries: PropEntry[] = [
  // ── Attributes ──
  at("properties.elementId", "*", P, "Element id (jump target, label target).", "`id` attribute", 'attr("id", t.string())', { aliases: ["id"] }),
  aria("ariaLabel", "aria-label", "Accessible name.", "t.string()"),
  aria("ariaDescribedBy", "aria-describedby", "Points to the element that describes this one."),
  aria("ariaExpanded", "aria-expanded", "Expanded / collapsed.", 't.enum(["true","false"])'),
  aria("ariaSelected", "aria-selected", "Selected state.", 't.enum(["true","false"])'),
  aria("ariaHidden", "aria-hidden", "Hide from screen readers (decorative).", 't.enum(["true","false"])'),
  aria("ariaLive", "aria-live", "Announce changes.", 't.enum(["off","polite","assertive"])'),
  aria("role", "role", "ARIA role."),
  aria("tabIndex", "tabindex", "Keyboard tab order.", "t.number()"),
  at("dataAttributes", "*", P, "Custom `data-*` attributes (and `attrs` pass-through).", "any `data-*` / `aria-*` attribute on the element", 'attr("<name>", t.string())', { aliases: ["attrs"] }),
  at("style", "*", P, "Inline CSS.", "`style` attribute (CSP allows `style-src 'unsafe-inline'` for authored styles; a class is preferred)", 'attr("style", t.string())'),
  at("className", "*", "custom-css", "Raw class list.", "`class` attribute", 'attr("class", t.string())'),

  // ── Editor metadata (data-edit-*) ──
  at("permissions", "*", "permissions", "Lock the element: no drag, no delete, no drop-in, sealed.", "`data-edit-lock=\"drag delete drop-in move-out\"` / `\"sealed\"`", 'attr("data-edit-lock", t.tokens(["drag","delete","drop-in","move-out","sealed"]))', { aliases: ["canDelete", "canEditName", "custom.permissions", "custom.sealed"] }),
  at("custom.displayName", "*", P, "Name shown in the layers panel.", "`data-edit-name`", 'attr("data-edit-name", t.string())', { aliases: ["displayName"] }),
  at("custom.source", "*", P, "Which library block a section came from.", "`data-edit-block`", 'attr("data-edit-block", t.string())', { aliases: ["custom"] }),
  at("aiContext", "*", "ai-context", "Notes for the AI about this element.", "`data-edit-note` (stripped on publish)", 'attr("data-edit-note", t.string())', { aliases: ["design.notes"] }),
  at("design.tags", "*", "ai-context", "Tags for finding the element.", "`data-edit-tags` (stripped on publish)", 'attr("data-edit-tags", t.string())'),
  nt("importExport", "*", "import-export", "Copy the element out / paste it in.", "its HTML source is the export; clipboard copy / paste of the range (kits/html clipboard)", "-"),
  nt("activeTab", "container text form-control", U, "Which tab (normal / hover ...) the inspector shows.", "editor session state; nothing in the document", "-"),

  // ── Page / structure ──
  nt("header.type", "header footer", "component", "Header / footer role of the container.", "`<header>` / `<footer>` element", 'tagName(["header","footer"])', { aliases: ["footer.type"] }),

  // ── Site-level (design system, not per element) ──
  ss("theme-design-system", "background", DS, "The site's palette, type and spacing tokens.", "theme `settings_schema` + `@theme` CSS variables in the site stylesheet; used as `bg-primary`, `font-heading`", "settings.* (color, font_picker, range)"),
  ss("pallet", "background", DS, "Palette colours.", "theme colour settings -> `--color-*` variables", "settings.colors_* (color)"),
  ss("typography", "background", DS, "Heading / body font tokens.", "theme font settings -> `--heading-font-family`, `--body-font-family`", "settings.type_* (font_picker)"),
  ss("styleGuide", "background", DS, "Radius, spacing density, content width, input styles.", "theme settings -> CSS variables (`--content-width`, `--spacing-density`)", "settings.* (range, select)"),
  ss("inject", "background", DS, "Site-wide head / footer snippets.", "`html` settings output by `layout/theme.liquid` (`{{ settings.head_code }}`)", "settings.head_code / foot_code (html)"),
  ss("company", "background", DS, "Business name, email, phone, logo.", "the `site` object (`{{ site.name }}`) fed by settings", "settings.company_* (text, image_picker)"),
  ss("integrations", "background", DS, "Third-party IDs (analytics, pixels).", "settings -> the `<head>` snippet and the `#runtime-config` JSON", "settings.* (text)"),
  ss("redirects", "background", DS, "URL redirects.", "site config file `redirects` (one `from -> to` per line), not page markup", "settings.redirects (textarea)"),
  nt("pageMedia", "background", DS, "The site media library.", "files under `assets/` / `files/`, referenced by `image_url` / `file_url`", "-"),
  nt("savedComponents", "background", DS, "Reusable components.", "partial files under `snippets/` / `sections/`, used with `{% render %}`", "-"),
  nt("design", "background", DS, "Per-node design notes and tags container.", "see `custom.*`, `aiContext`, `design.tags`", "-"),

  // ── Inspector UI ids that the grep over `propKey=` also returns (not document props) ──
  nt("buttons", "*", U, "Toolbar button-group control.", "inspector control, no document state", "-"),
  nt("media-add-actions", "*", U, "Media manager: add menu.", "host media picker UI", "-"),
  nt("media-folder-filter-popover", "*", U, "Media manager: folder filter.", "host media picker UI", "-"),
  nt("media-kind-filter", "*", U, "Media manager: kind filter.", "host media picker UI", "-", { aliases: ["media-kind-filter-compact"] }),
  nt("media-move-selected", "*", U, "Media manager: move selection.", "host media picker UI", "-"),
  nt("media-sort-field", "*", U, "Media manager: sort field.", "host media picker UI", "-", { aliases: ["media-sort-field-compact"] }),
];
