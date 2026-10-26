/**
 * `emailEditorKit()` — the editor set up for an email: the engine's `emailKit()` (email-safe rules, a 600px canvas,
 * the Add panel narrowed to what can be sent) and an inspector that offers only what inboxes support: the element's
 * own settings, typography, background, borders and radius, alignment and size. No interactions, data bindings,
 * hover / effects or custom CSS; no Blocks or reusable components in the empty state.
 *
 *   <Editor storage={storage} extensions={[htmlKit(), tailwindKit(), liquidKit(), emailEditorKit({ tiles })]} />
 */
import type { Extension } from "@pagehub/engine";
import { emailKit, type EmailKitOptions } from "@pagehub/engine/kits";
import { inspectorConfig } from "../inspector/inspectorState";

/** Inspector sections an email keeps (the Component tab's own sections always show). */
export const EMAIL_INSPECTOR_SECTIONS: readonly string[] = ["typography", "background", "styles", "alignment", "size"];

export function emailEditorKit(opts: EmailKitOptions = {}): Extension {
  return [emailKit(opts), inspectorConfig({ sections: EMAIL_INSPECTOR_SECTIONS, blocks: false, reusable: false })];
}
