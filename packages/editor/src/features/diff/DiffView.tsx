/**
 * A unified diff, file by file: the `pendingDiff()` view (unsaved changes before a write),
 * and the same view for an AI edit awaiting acceptance. Each file is a header (path,
 * +added / −removed) and its hunks; the body scrolls inside a fixed-height frame.
 *
 *   <DiffView diffs={editor.pendingDiff()} actions={<button>Save</button>} />
 */
import type { ReactNode } from "react";
import type { FileDiff } from "@pagehub/engine";

type DiffLineKind = "add" | "del" | "ctx" | "hunk";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** The body lines of a unified diff (the `---` / `+++` headers dropped). */
export function diffLines(unified: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const line of unified.split("\n")) {
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line === "") continue;
    if (line.startsWith("@@")) out.push({ kind: "hunk", text: line });
    else if (line[0] === "+") out.push({ kind: "add", text: line.slice(1) });
    else if (line[0] === "-") out.push({ kind: "del", text: line.slice(1) });
    else out.push({ kind: "ctx", text: line.slice(1) });
  }
  return out;
}

const LINE: Record<DiffLineKind, string> = {
  add: "bg-success/15 text-base-content",
  del: "bg-error/15 text-base-content",
  ctx: "text-base-content/70",
  hunk: "bg-base-200 text-base-content/50",
};
const MARK: Record<DiffLineKind, string> = { add: "+", del: "−", ctx: " ", hunk: "" };

export function DiffView({ diffs, actions, empty = "No unsaved changes." }: { diffs: readonly FileDiff[]; actions?: ReactNode; empty?: string }) {
  return (
    <div data-diff-view="" className="bg-base-100 border-base-300 flex h-[60vh] flex-col overflow-hidden rounded-md border text-xs">
      <div className="min-h-0 flex-1 overflow-auto">
        {diffs.length === 0 ? (
          <p className="text-base-content/60 p-3" data-diff-empty="">
            {empty}
          </p>
        ) : (
          diffs.map((d) => {
            const lines = diffLines(d.unified);
            const added = lines.filter((l) => l.kind === "add").length;
            const removed = lines.filter((l) => l.kind === "del").length;
            return (
              <section key={d.path} data-diff-file={d.path} className="border-base-300 border-b last:border-b-0">
                <header className="bg-base-200 sticky top-0 flex items-center justify-between gap-2 px-3 py-1.5 font-mono">
                  <span className="truncate">{d.path}</span>
                  <span className="shrink-0">
                    <span className="text-success">+{added}</span> <span className="text-error">−{removed}</span>
                  </span>
                </header>
                <pre className="m-0 font-mono leading-5">
                  {lines.map((l, i) => (
                    <div key={i} data-diff-line={l.kind} className={`flex px-3 whitespace-pre ${LINE[l.kind]}`}>
                      <span aria-hidden className="w-4 shrink-0 select-none">
                        {MARK[l.kind]}
                      </span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                </pre>
              </section>
            );
          })
        )}
      </div>
      {actions && <footer className="border-base-300 flex justify-end gap-1 border-t p-2">{actions}</footer>}
    </div>
  );
}
