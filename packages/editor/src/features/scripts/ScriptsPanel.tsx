/**
 * The default `ScriptsPanel` slot: the site's own JavaScript files (`assets/*.js`), as the body of the right
 * slide-out drawer (opened by `panel.scripts`; the drawer owns the frame, title and close).
 *
 *   - the list of scripts, a "New script" form
 *   - the picked script: rename, delete, "Load on every page", the code in the shared code view
 *   - the `{% javascript %}` blocks of the page on the canvas, read-only
 *
 * Every change is a `script.*` command or a `source.replace`; saving is the editor's normal save. Scripts run on
 * the page opened in a new tab and on the published site, never on this canvas (its frame policy blocks them).
 *
 *   <Slot name="ScriptsPanel" open onClose={close} />   // mounted inside <Drawer> by RightDrawer
 */
import { useState } from "react";
import { everywhereNames, javascriptBlocks, scriptNameProblem, scriptNames } from "@pagehub/engine/kits";
import { useEditorState } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import { canvasPage } from "../canvas/canvasState";
import { CodeMirrorView } from "../code/CodeMirrorView";
import { PanelNote } from "../liquid/LiquidFields";
import { useCommit } from "../liquid/useCommit";
import { ScriptDetail } from "./ScriptDetail";

interface ScriptsPanelProps {
  open: boolean;
  onClose(): void;
}

const HEADING = "text-base-content/70 text-[11px] font-semibold tracking-wide uppercase";

/** "menu" → "menu.js"; a name that already ends in .js is kept. */
const withExtension = (v: string) => (v && !v.endsWith(".js") ? `${v}.js` : v);

function NewScript({ onCreated }: { onCreated(name: string): void }) {
  const commit = useCommit();
  const files = useEditorState((s) => s.files);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const name = withExtension(value.trim());
  const problem = value.trim() ? scriptNameProblem(files, name) : null;
  const close = () => (setOpen(false), setValue(""));
  const add = () => {
    if (!value.trim() || problem || !commit("script.create", { name })) return;
    onCreated(name);
    close();
  };
  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary w-full gap-1.5 text-xs" onClick={() => setOpen(true)} data-script-new="">
        <Icon name="plus" className="size-3.5" />
        New script
      </button>
    );
  }
  return (
    <div className="border-base-300/60 flex flex-col gap-1.5 rounded-md border p-2" data-script-new-form="">
      <input
        autoFocus
        value={value}
        aria-label="Script name"
        aria-invalid={!!problem || undefined}
        placeholder="menu.js"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), add()) : e.key === "Escape" ? close() : undefined)}
        className="input input-sm w-full font-mono text-xs"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="text-error min-h-4 text-[11px]">{problem}</span>
      <div className="flex justify-end gap-1">
        <button type="button" className="btn btn-xs btn-ghost text-xs" onClick={close}>
          Cancel
        </button>
        <button type="button" className="btn btn-xs btn-primary text-xs" disabled={!value.trim() || !!problem} onClick={add} data-script-create="">
          Create script
        </button>
      </div>
    </div>
  );
}

function PageBlocks() {
  const page = useEditorState((s) => canvasPage(s));
  const text = useEditorState((s) => (page ? (s.files.get(page) ?? "") : ""));
  const blocks = javascriptBlocks(text);
  const code = (line: number) => {
    const m = /\{%-?\s*javascript\s*-?%\}([\s\S]*?)\{%-?\s*endjavascript\s*-?%\}/g;
    for (const hit of text.matchAll(m)) if (text.slice(0, hit.index).split("\n").length === line) return hit[1]!.trim();
    return "";
  };
  return (
    <section className="flex flex-col gap-1.5" data-script-blocks="">
      <h3 className={HEADING}>On this page</h3>
      {blocks.length === 0 ? (
        <PanelNote>No {"{% javascript %}"} blocks on {page ?? "this page"}. A block is code that lives inside a section; it loads once however many times the section appears.</PanelNote>
      ) : (
        blocks.map((b) => (
          <details key={b.line} className="border-base-300/60 rounded-md border text-xs" data-script-block={b.line}>
            <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 select-none">
              <span className="text-base-content/50 shrink-0 tabular-nums">Line {b.line}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{b.preview || "(empty)"}</span>
            </summary>
            <div className="p-1.5">
              <CodeMirrorView value={code(b.line)} onChange={() => {}} language="javascript" readOnly label="javascript block, read only" minHeight="64px" maxHeight="240px" />
              <p className="text-base-content/50 mt-1 text-[11px]">To change it, select its section and use Edit code.</p>
            </div>
          </details>
        ))
      )}
    </section>
  );
}

export function ScriptsPanel({ open }: ScriptsPanelProps) {
  const names = useEditorState((s) => scriptNames(s.files).join("\n")).split("\n").filter(Boolean);
  const everywhere = useEditorState((s) => everywhereNames(s.files).join("\n")).split("\n");
  const [picked, setPicked] = useState<string | null>(null);
  if (!open) return null;
  const current = picked && names.includes(picked) ? picked : null;
  return (
    <div data-slot="ScriptsPanel" className="flex flex-col gap-5">
      <PanelNote>Scripts don't run on this canvas. They run when you open the page in a new tab, and on your published site.</PanelNote>

      <section className="flex flex-col gap-2" data-script-list="">
        <h3 className={HEADING}>Your scripts</h3>
        <ul className="border-base-300/60 divide-base-300/60 h-36 divide-y overflow-y-auto rounded-md border">
          {names.length === 0 ? (
            <li className="text-base-content/60 flex h-full items-center justify-center px-4 text-center text-xs">No scripts yet. Add one, then load it on every page or paste its tag into one page.</li>
          ) : (
            names.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setPicked(n)}
                  aria-current={n === current || undefined}
                  className={`hover:bg-base-200 flex h-9 w-full items-center gap-2 px-2.5 text-left text-xs ${n === current ? "bg-base-200" : ""}`}
                  data-script-row={n}
                >
                  <Icon name="code" className="text-base-content/50 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono">{n}</span>
                  {everywhere.includes(n) && <span className="text-base-content/60 shrink-0 text-[11px]">Every page</span>}
                </button>
              </li>
            ))
          )}
        </ul>
        <NewScript onCreated={setPicked} />
      </section>

      <section className="flex flex-col gap-2" data-script-editor="">
        <h3 className={HEADING}>Edit</h3>
        {current ? (
          <ScriptDetail key={current} name={current} onRenamed={setPicked} onDeleted={() => setPicked(null)} />
        ) : (
          <div className="text-base-content/60 border-base-300/60 flex h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-xs">Pick a script to edit its code.</div>
        )}
      </section>

      <PageBlocks />
    </div>
  );
}
