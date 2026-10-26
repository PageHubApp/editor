/**
 * Import / Export for the selected element — the HTML-first "the source IS the export" row. Export
 * shows the element's own HTML (read-only) with a Copy button (engine `element.copy` → the shared
 * clipboard + OS clipboard); Import pastes HTML in below the element (`element.paste` with the typed
 * source). Replaces the row's structure-note placeholder with a real control.
 *
 *   <ImportExportControl handle={h} />
 */
import { useState } from "react";
import { type NodeHandle } from "@pagehub/engine";
import { snippetOf, withoutEditIds } from "@pagehub/engine/kits";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { Icon } from "../../primitives/icons";

export function ImportExportControl({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const html = useEditorState((s) => (handle.alive && handle.kind === "element" ? withoutEditIds(snippetOf(s, handle)).trim() : ""));
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    run("element.copy");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const paste = () => {
    const source = draft.trim();
    if (!source) return;
    if (run("element.paste", { source })) setDraft("");
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 text-[11px]" data-import-export="">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-base-content/60 font-medium tracking-wide uppercase">Export</span>
          <button type="button" onClick={copy} className="text-base-content/70 hover:text-primary flex items-center gap-1 rounded px-1 transition-colors">
            <Icon name={copied ? "check" : "copy"} className="size-3.5" />
            {copied ? "Copied" : "Copy HTML"}
          </button>
        </div>
        <textarea
          readOnly
          value={html}
          rows={5}
          aria-label="Element HTML"
          onFocus={(e) => e.currentTarget.select()}
          className="input-plain border-base-300 bg-base-200 h-auto resize-none rounded-md border p-2 font-mono text-[10px] leading-snug"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-base-content/60 font-medium tracking-wide uppercase">Import</span>
          <button type="button" onClick={paste} disabled={!draft.trim()} className="text-base-content/70 hover:text-primary flex items-center gap-1 rounded px-1 transition-colors disabled:opacity-40">
            <Icon name="corner-down-left" className="size-3.5" />
            Paste below
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Paste HTML to insert after this element…"
          aria-label="HTML to import"
          className="input-plain border-base-300 bg-base-200 h-auto resize-none rounded-md border p-2 font-mono text-[10px] leading-snug"
        />
      </div>
    </div>
  );
}
