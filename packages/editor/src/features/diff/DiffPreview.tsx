/**
 * The unsaved-changes view: the editor's pending diff (`pendingDiff()`), re-read after every
 * edit, with Save (`file.save`). A store without storage (no `pendingDiff`) shows the empty state.
 *
 * - `DiffPanel` is the view itself, for a host to place anywhere.
 * - `DiffPreview` is the `DiffPreview` slot's default: a dialog that the `diff.toggle` command
 *   opens (palette → "Show unsaved changes"), so it takes no room in the layout while closed.
 */
import { useMemo } from "react";
import type { FileDiff } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { Modal } from "../../primitives/Modal";
import { DiffView } from "./DiffView";

export function DiffPanel() {
  const store = useEditorStore();
  const run = useRunCommand();
  const files = useEditorState((s) => s.files);
  const versions = useEditorState((s) => s.versions);
  const diffs = useMemo(() => {
    void files;
    void versions; // a save moves the baseline and bumps the versions
    return (store as { pendingDiff?: () => FileDiff[] }).pendingDiff?.() ?? [];
  }, [store, files, versions]);
  const canSave = useEditorState(() => store.can("file.save"));
  return (
    <DiffView
      diffs={diffs}
      actions={
        <button type="button" className="btn btn-sm btn-primary text-xs" disabled={!diffs.length || !canSave} onClick={() => run("file.save")} data-diff-save="">
          Save
        </button>
      }
    />
  );
}

export function DiffPreview() {
  const store = useEditorStore();
  const open = useEditorState((s) => chromeOf(s).diffOpen);
  return (
    <>
      <span data-slot="DiffPreview" hidden />
      <Modal isOpen={open} onClose={() => void store.run("diff.close")} id="diff-preview" title="Unsaved changes" size="xl">
        <DiffPanel />
      </Modal>
    </>
  );
}
