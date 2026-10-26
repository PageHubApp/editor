/**
 * The default `SaveBanner` slot: an amber alert across the top of the editor with a dismiss X —
 * why the last save failed, or (out of date) which files changed somewhere else, with "Reload"
 * (take their version of those files) and "Keep mine" (write ours over it). A `StorageError` gets its own
 * words (`describeSaveError`): "editing is paused" for a maintenance freeze (a status, not an alert),
 * "can't reach the server" for the network, and "Try again" where trying again can help.
 */
import { useEditorStore } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import { saveSession, useSaveSession } from "./saveSession";

const ACTION = "shrink-0 rounded-md px-2 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-400/15";

export function SaveBanner() {
  const editor = useEditorStore();
  const { banner } = useSaveSession(editor);
  if (!banner) return <div data-slot="SaveBanner" hidden />;
  const session = saveSession(editor);
  const message =
    banner.kind === "conflict"
      ? `${banner.paths.length === 1 ? banner.paths[0] : `${banner.paths.length} files`} changed somewhere else since you opened ${banner.paths.length === 1 ? "it" : "them"}. Your edits aren't saved.`
      : banner.message;
  const retry = banner.kind === "paused" || (banner.kind === "error" && banner.retry);
  return (
    <div
      role={banner.kind === "paused" || banner.kind === "notice" ? "status" : "alert"}
      data-slot="SaveBanner"
      data-save-banner={banner.kind}
      className="flex shrink-0 items-start gap-3 border-b border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50"
    >
      <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      {retry && (
        <button type="button" data-save-retry="" className={ACTION} onClick={session.retry}>
          Try again
        </button>
      )}
      {banner.kind === "conflict" && (
        <>
          <button type="button" data-conflict-reload="" className={ACTION} onClick={() => void session.resolve("reload")}>
            Reload theirs
          </button>
          <button type="button" data-conflict-keep="" className={ACTION} onClick={() => void session.resolve("override")}>
            Keep mine
          </button>
        </>
      )}
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-400/15"
        onClick={session.dismiss}
        aria-label="Dismiss notice"
      >
        <Icon name="x" className="size-4" />
      </button>
    </div>
  );
}
