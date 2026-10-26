/**
 * `emailKit()` — the email profile for an editor: the email-safe rules (./emailRules.ts) and the profile the editor
 * reads (`profileFacet`): a 600px canvas, the Add panel narrowed to the elements an email can send plus the email
 * tiles below. A host adds its own tiles (the parts each kind of email is about: order lines, a sign-in button).
 *
 *   createEditor({ storage, extensions: [htmlKit(), tailwindKit(), liquidKit(), emailKit({ tiles })] })
 *
 * Add it next to `htmlKit()` / `tailwindKit()` / `liquidKit()`, never in place of them: an email is still HTML.
 */
import type { Extension } from "../../extensions/extension";
import { profileFacet, type ProfileTile } from "../../host/profile";
import { EMAIL_ELEMENTS, EMAIL_WIDTH } from "./emailProfile";
import { EMAIL_RULES } from "./emailRules";

/** The email building blocks every kind offers. Buttons are links: a `<button>` can't be sent. */
export const EMAIL_TILES: readonly ProfileTile[] = [
  {
    key: "email:button",
    label: "Button",
    icon: "click",
    category: "Buttons",
    description: "A link styled as a button. It takes the site's email button colour.",
    snippet: `<a href="{{ site.url }}" data-email-role="button" class="bg-primary text-primary-content rounded-[6px] px-[18px] py-[10px] text-sm font-semibold">Visit the site</a>`,
  },
  {
    key: "email:columns",
    label: "Columns",
    icon: "layout-grid",
    category: "Layout",
    description: "Two columns side by side. They stack on phones.",
    snippet: `<div class="flex flex-row gap-[16px]">\n  <div><p>First column</p></div>\n  <div><p>Second column</p></div>\n</div>`,
  },
  {
    key: "email:divider",
    label: "Divider",
    icon: "minus",
    category: "Dividers",
    description: "A thin line between parts of the email.",
    snippet: `<div class="border-t border-base-300 my-[24px]"></div>`,
  },
  {
    key: "email:spacer",
    label: "Spacer",
    icon: "box",
    category: "Layout",
    description: "Empty space.",
    snippet: `<div class="h-[24px]"></div>`,
  },
];

export interface EmailKitOptions {
  /** More Add tiles (the host's email parts). */
  tiles?: readonly ProfileTile[];
}

export function emailKit(opts: EmailKitOptions = {}): Extension {
  return [EMAIL_RULES, profileFacet.of({ name: "email", canvasWidth: EMAIL_WIDTH, elements: EMAIL_ELEMENTS, toolbox: false, tiles: [...EMAIL_TILES, ...(opts.tiles ?? [])] })];
}
