/**
 * The page selector's last row: "Add page", which turns into a name field and Create. The host makes the page
 * (`canvasHost.addPage`) and opens it; a refusal (the plan's page cap, a taken name) shows under the field.
 */
import { useState } from "react";
import { Icon } from "../../primitives/icons";
import { Spinner } from "../../primitives/Spinner";

export function AddPageRow({ addPage, onAdded }: { addPage(name: string): Promise<string | null>; onAdded(): void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = () => (setNaming(false), setName(""), setError(null));
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const refusal = await addPage(trimmed).catch(() => "Couldn't add that page. Try again in a moment.");
    setBusy(false);
    if (refusal) return setError(refusal);
    cancel();
    onAdded();
  };

  if (!naming) {
    return (
      <button type="button" data-page-add="" onClick={() => setNaming(true)} className="border-base-300 text-base-content/80 hover:bg-base-200/60 hover:text-base-content flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm transition-colors">
        <Icon name="plus" className="size-4 shrink-0" />
        Add page
      </button>
    );
  }
  return (
    <div data-page-add-form="" className="border-base-300 flex flex-col gap-1.5 border-t p-2">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          aria-label="New page name"
          placeholder="Page name, like About"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") (e.stopPropagation(), cancel());
          }}
          className="input input-sm min-w-0 flex-1"
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim() || busy} onClick={() => void submit()}>
          {busy ? <Spinner className="size-3.5" label="Adding page" /> : "Create"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-error px-0.5 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
