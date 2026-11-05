/**
 * Under the toolbar while editing text that renders more than once: typing here changes every copy, and the
 * `{{ … }}` fields are what keep each copy's own details (the session refuses edits that remove one). When the edited
 * copy shows a collection entry the host knows, the way to change just this copy is a button that opens that entry.
 */
import { EntryButton, entryOf, fieldLabel, useEntryLink } from "../canvas/EntryButton";

interface RepeatNoticeProps {
  copies: number;
  /** An edit was refused because it removed a field. */
  blocked: boolean;
  /** The rendered copy being edited. */
  copy: HTMLElement;
  /** The edited element's source, to tell which of the copy's entry fields this text shows. */
  source: string;
}

/** The entry field the edited text outputs (`{{ p.description }}` → `description`), else the copy's first field. */
function editedField(fields: readonly string[], source: string): string | null {
  return fields.find((f) => new RegExp(`\\.${f.replace(/[^\w-]/g, "")}\\b`).test(source)) ?? fields[0] ?? null;
}

export function RepeatNotice({ copies, blocked, copy, source }: RepeatNoticeProps) {
  const entry = entryOf(copy);
  const link = useEntryLink(entry?.rowId);
  const field = entry ? editedField(entry.fields, source) : null;
  const lead = blocked ? "The highlighted fields fill in each copy's own details, so they can't be typed over." : `This text shows on all ${copies} copies. Words you type here change every copy.`;
  return (
    <div data-rt-repeat-notice={blocked ? "blocked" : ""} role={blocked ? "status" : undefined} className={`mt-1 max-w-72 rounded-md px-2 py-1 text-xs shadow-sm ${blocked ? "bg-warning text-warning-content" : "bg-base-100 text-base-content"}`}>
      <p>
        {lead}
        {!link && blocked && " To change one copy, edit its entry in Collections."}
      </p>
      {link && (
        <p data-rt-entry-line="" className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>{field ? fieldLabel(field) : "This text"} comes from {link.label.collection}.</span>
          <EntryButton link={link} field={field} className="btn btn-xs" />
        </p>
      )}
    </div>
  );
}
