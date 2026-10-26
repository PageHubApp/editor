import { CodeEditor } from "../../../liquid/CodeEditor";
import type { ElementControlProps } from "./elementControlShared";

/**
 * Embed **Code** editor. An Embed is an `<iframe>` / raw-HTML
 * snippet; "the code" is the element's own markup. The `CodeEditor` (the CodeMirror `CodeView`
 * slot) edits that source as a draft and commits one `source.replace` on Apply — so a user can
 * paste any embed markup and it is validated by the parser before it lands.
 */
export function EmbedCodeControl({ handle, row }: ElementControlProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-embed-code="">
      <span className="text-base-content text-xs font-medium">{row.label}</span>
      <CodeEditor handle={handle} />
    </div>
  );
}
