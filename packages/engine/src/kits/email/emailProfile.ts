/**
 * What an email can contain — the one description the email rules (./emailRules.ts), the markup step
 * (./toEmailMarkup.ts) and the editor's email profile (./emailKit.ts) all read.
 *
 * An email is authored like a page (simple blocks, Tailwind classes, Liquid) and sent as table layout with inline
 * styles: block wrappers become one-cell presentation tables, a `flex-row` / `grid-cols-N` row becomes columns
 * that stack on phones, and a filled link becomes a bulletproof button. What can't become that is refused: no
 * forms, media players, dialogs, runtime behaviours or page-only Liquid tags.
 */

/** Width of the email in px: the canvas, and the centred frame the sent email sits in. */
export const EMAIL_WIDTH = 600;

/** Viewport width at and below which columns stack. */
export const EMAIL_STACK_BREAKPOINT = 620;

/** Element definitions (`html.*`) whose Add tiles an email offers; the email kit adds its own Button, Columns, Divider and Spacer. */
export const EMAIL_ELEMENTS: readonly string[] = ["html.container", "html.heading", "html.text", "html.image", "html.link", "html.list"];

/** Elements no email client can show or use: an error. */
export const EMAIL_BLOCKED_TAGS: ReadonlySet<string> = new Set([
  "form", "input", "button", "select", "textarea", "option", "label", "fieldset",
  "iframe", "video", "audio", "source", "track", "canvas", "object", "embed",
  "dialog", "details", "summary", "template", "slot", "noscript",
]);

/** Elements most clients drop (Gmail strips inline SVG, Outlook ignores `<picture>` sources): a warning. */
export const EMAIL_WEAK_TAGS: ReadonlySet<string> = new Set(["svg", "picture", "math"]);

/** Liquid tags that only make sense on a site page (they render forms, sections, maps or paginate data). */
export const EMAIL_BLOCKED_LIQUID_TAGS: ReadonlySet<string> = new Set(["form", "section", "map", "paginate", "style", "block"]);

/**
 * Class tokens email clients ignore or that break the layout (positioning, effects, motion, DaisyUI components whose
 * CSS is variable chains and `:is()` selectors). Matched after one variant prefix (`md:`, `hover:`).
 */
export const EMAIL_UNSAFE_CLASS =
  /^(btn|card|badge|navbar|hero|menu|tab|tabs|modal|input|dropdown|drawer|collapse|carousel)(-|$)|^(backdrop-|animate-|transform|transition|duration-|ease-|delay-|filter|blur|drop-shadow|shadow|bg-linear|bg-gradient|bg-radial|bg-conic|overflow-|fixed$|sticky$|absolute$|inset-|top-|right-|bottom-|left-|translate-|rotate-|scale-|skew-|snap-)/;

/** Variant prefixes that can't be honoured in an email: no hover, focus or dark-mode CSS reaches an inbox reliably. */
export const EMAIL_UNSAFE_VARIANT = /^(hover|focus|focus-within|focus-visible|active|visited|group-[\w-]+|peer-[\w-]+|dark|motion-safe|motion-reduce|print|aria-[\w-]+|data-[\w-]+|has-[\w-]+):/;

/** The base token of a class (`md:flex-row` → `flex-row`, `!p-4` → `p-4`). */
export const classBase = (token: string): string => token.replace(/^!/, "").replace(/^[\w-]+:/, "");

/** Why a class token won't survive in an email, or null when it will. */
export function emailClassProblem(token: string): string | null {
  if (EMAIL_UNSAFE_VARIANT.test(token)) return `"${token}": email clients ignore ${token.slice(0, token.indexOf(":"))} styles`;
  if (EMAIL_UNSAFE_CLASS.test(classBase(token))) return `"${token}" doesn't work in email`;
  return null;
}

/** Attributes the email markup step reads and then removes: an author marks a part of the email with them. */
export const EMAIL_ROLE_ATTRIBUTE = "data-email-role";

/** Roles: `logo` (hidden when the site turns its logo off) and `button` (takes the site's email button colour). */
export type EmailRole = "logo" | "button";
