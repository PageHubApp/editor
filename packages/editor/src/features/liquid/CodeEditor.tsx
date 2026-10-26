/**
 * The code view: a node's source (a section, a loop) or a whole file in the
 * `CodeView` slot, with the engine's rule diagnostics at their ranges and Liquid
 * completions from the configured tags, filters and the names in scope. Edits stay a draft
 * until Apply (or ⌘S): one `source.replace` — line splices through the normal transaction
 * path, so it is one undo step, lint runs on it and save writes it like any other edit.
 *
 *   <CodeEditor handle={sectionHandle} />   // or <CodeEditor path="index.liquid" />
 */
import { useMemo, useState } from "react";
import { ruleOptionsOf, type Diagnostic, type NodeHandle } from "@pagehub/engine";
import { Slot, type CodeViewProps } from "../../components";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { viewDiagnostics } from "../code/viewDiagnostics";
import { PanelNote } from "./LiquidFields";
import { dataSourceGlobals, expressionCompletions } from "./completions";
import { useCommit } from "./useCommit";

interface CodeEditorProps {
  /** The node to show; omit for a whole file. */
  handle?: NodeHandle;
  /** The file to show when there is no `handle`. */
  path?: string;
  /** The code view's language (default Liquid). */
  language?: CodeViewProps["language"];
  /** Refuse an empty apply (a script file: an empty one is a deleted one). */
  nonEmpty?: boolean;
}

export function CodeEditor({ handle, path, language = "liquid", nonEmpty }: CodeEditorProps) {
  const store = useEditorStore();
  const commit = useCommit();
  const file = handle?.path ?? path ?? "";
  const source = useEditorState((s) => (handle ? (handle.alive ? handle.text() : "") : (s.files.get(file) ?? "")));
  const files = useEditorState((s) => s.files);
  const config = useEditorState((s) => s.config);
  const [draft, setDraft] = useState(source);
  const [base, setBase] = useState(source);
  const [failed, setFailed] = useState(false);
  if (base !== source) {
    // the source changed (applied, undone, edited on the canvas): an untouched draft follows
    if (draft === base) setDraft(source);
    setBase(source);
  }
  const diagnostics = useMemo(() => {
    void files;
    const all = (store as { diagnostics?: readonly Diagnostic[] }).diagnostics ?? [];
    const scope = handle?.alive ? { path: file, from: handle.range.from, to: handle.range.to } : { path: file };
    return viewDiagnostics(all, scope);
  }, [store, files, file, handle]);
  const completions = useMemo(() => {
    const { registry } = ruleOptionsOf(config);
    const data = (store as { data?: Record<string, unknown> }).data;
    return {
      tags: [...(registry?.tags ?? [])].sort(),
      filters: [...(registry?.filters ?? [])].sort(),
      variables: expressionCompletions(handle?.alive ? handle : null, data, dataSourceGlobals(config)),
    };
  }, [config, store, handle]);

  const apply = (text: string) => {
    if (text === source) return;
    if (nonEmpty && !text.trim()) return void setFailed(true);
    const ok = commit("source.replace", handle ? { text, at: handle } : { text, path: file });
    setFailed(!ok);
  };
  const props: CodeViewProps = {
    value: draft,
    onChange: (v) => {
      setDraft(v);
      setFailed(false);
    },
    language,
    // marks belong to the stored source; hidden while the draft differs
    diagnostics: draft === source ? diagnostics : [],
    completions,
    onSave: apply,
  };
  return (
    <div className="flex flex-col gap-1.5" data-code-editor={file}>
      <Slot name="CodeView" {...props} />
      {failed && <PanelNote>{nonEmpty && !draft.trim() ? "A script can't be empty. Delete it instead." : "This code can't be applied: it doesn't parse, or it breaks a tag. Fix it and apply again."}</PanelNote>}
      {draft === source && diagnostics.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px]" data-code-diagnostics="">
          {diagnostics.map((d, i) => (
            <li key={i} className={d.severity === "error" ? "text-error" : "text-warning"}>
              {d.message}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-1">
        <button type="button" className="btn btn-sm btn-ghost text-xs" disabled={draft === source} onClick={() => (setDraft(source), setFailed(false))}>
          Revert
        </button>
        <button type="button" className="btn btn-sm btn-primary text-xs" disabled={draft === source} onClick={() => apply(draft)} data-code-apply="">
          Apply
        </button>
      </div>
    </div>
  );
}
