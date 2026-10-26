/**
 * One script file in the Scripts panel: its name (rename, delete), whether it loads on every page, the snippet to
 * load it on one page, and the code in the shared code view. Every change is a `script.*` command or a
 * `source.replace`, so each is one undo step and saves through the normal save path.
 */
import { useState } from "react";
import { everywhereNames, pagesWithoutScripts, scriptNameProblem, scriptPath, scriptTag, scriptUses } from "@pagehub/engine/kits";
import { useEditorState } from "../../react/bindings";
import { useConfirm } from "../../primitives/ConfirmDialog";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { CodeEditor } from "../liquid/CodeEditor";
import { PanelNote } from "../liquid/LiquidFields";
import { useCommit } from "../liquid/useCommit";

const GHOST = "text-base-content/70 hover:text-base-content hover:bg-base-200 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors";

function RenameRow({ name, onDone }: { name: string; onDone(next: string | null): void }) {
  const files = useEditorState((s) => s.files);
  const [value, setValue] = useState(name);
  const problem = value === name ? null : scriptNameProblem(files, value, name);
  const save = () => (value === name ? onDone(null) : !problem && onDone(value));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <input
        autoFocus
        value={value}
        aria-label="Script name"
        aria-invalid={!!problem || undefined}
        onChange={(e) => setValue(e.target.value.trim())}
        onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), save()) : e.key === "Escape" ? onDone(null) : undefined)}
        onBlur={save}
        className="input input-sm w-full font-mono text-xs"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="text-error min-h-4 text-[11px]">{problem}</span>
    </div>
  );
}

export function ScriptDetail({ name, onRenamed, onDeleted }: { name: string; onRenamed(next: string): void; onDeleted(): void }) {
  const commit = useCommit();
  const { ask, dialog } = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const on = useEditorState((s) => everywhereNames(s.files).includes(name));
  const missing = useEditorState((s) => pagesWithoutScripts(s.files).length);
  const uses = useEditorState((s) => scriptUses(s.files, name).reduce((n, u) => n + u.count, 0));
  const snippet = scriptTag(name);

  const remove = async () => {
    const message = uses ? `It's linked ${uses} ${uses === 1 ? "time" : "times"} on your pages. Those links will stop loading anything.` : "You can undo this until you leave the editor.";
    if (!(await ask({ title: `Delete ${name}?`, message, confirmText: "Delete", cancelText: "Keep it", variant: "danger" }))) return;
    if (commit("script.remove", { name })) onDeleted();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="flex flex-col gap-2" data-script-detail={name}>
      <div className="flex items-center gap-1">
        {renaming ? (
          <RenameRow
            name={name}
            onDone={(next) => {
              setRenaming(false);
              if (next && commit("script.rename", { from: name, to: next })) onRenamed(next);
            }}
          />
        ) : (
          <>
            <h4 className="text-base-content min-w-0 flex-1 truncate font-mono text-sm font-semibold">{name}</h4>
            <button type="button" className="btn btn-xs btn-ghost text-xs" aria-label={`Rename ${name}`} onClick={() => setRenaming(true)} data-script-rename="">
              Rename
            </button>
            <button type="button" className={`${GHOST} hover:text-error`} aria-label={`Delete ${name}`} onClick={() => void remove()} data-script-delete="" {...tooltip("Delete this script", "top")}>
              <Icon name="trash" className="size-3.5" />
            </button>
          </>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" className="toggle toggle-sm" checked={on} onChange={(e) => commit("script.setEverywhere", { name, on: e.target.checked })} data-script-everywhere="" />
        <span className="text-base-content font-medium">Load on every page</span>
      </label>
      {on && missing > 0 && (
        <PanelNote>
          {missing} {missing === 1 ? "page doesn't" : "pages don't"} load it yet.{" "}
          <button type="button" className="link" onClick={() => commit("script.setEverywhere", { name, on: true })} data-script-add-missing="">
            Add to {missing === 1 ? "that page" : "those pages"}
          </button>
        </PanelNote>
      )}

      <CodeEditor key={name} path={scriptPath(name)} language="javascript" nonEmpty />

      <details className="text-xs" data-script-snippet="">
        <summary className="text-base-content/70 hover:text-base-content cursor-pointer select-none">Load it on one page only</summary>
        <div className="mt-1.5 flex flex-col gap-1.5">
          <PanelNote>Paste this into the page, near the end. Turn off "Load on every page" first.</PanelNote>
          <code className="bg-base-200 text-base-content block rounded-md px-2 py-1.5 font-mono text-[11px] break-all select-all">{snippet}</code>
          <button type="button" className="btn btn-xs btn-ghost self-start gap-1 text-xs" onClick={() => void copy()}>
            <Icon name="copy" className="size-3.5" />
            {copied === "yes" ? "Copied" : copied === "failed" ? "Couldn't copy. Select the text and copy it." : "Copy tag"}
          </button>
        </div>
      </details>
      {dialog}
    </div>
  );
}
