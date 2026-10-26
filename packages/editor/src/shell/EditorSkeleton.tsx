/**
 * The editor's shell while its files are still arriving: top bar, side panel and canvas frame at their
 * real sizes (so the editor drops in without anything moving), filled with skeletons. It shows from the
 * first frame of the open, so nothing blank sits between the host's ghost and the editor.
 */
import { Skeleton } from "../primitives/Skeleton";
import { PageSkeleton } from "../features/canvas/PageSkeleton";
import { InlineError } from "../primitives/InlineError";
import { SIDEBAR_WIDTH } from "./Sidebar";

export function EditorSkeleton({ className = "", error }: { className?: string; error?: { message: string; retry(): void } }) {
  return (
    <div data-editor-skeleton="" role={error ? undefined : "status"} aria-busy={!error} aria-label="Opening the editor" className={`${error ? "[&_[data-skeleton]]:animate-none " : ""}pagehub-editor bg-base-100 text-base-content flex h-full min-h-0 w-full flex-col overflow-hidden ${className}`} data-base>
      <header className="border-base-300 flex items-center gap-2 border-b px-2.5 py-2">
        <div className="flex shrink-0 items-center gap-0.5 lg:w-[calc(360px-0.5rem)]">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <div className="flex min-w-40 flex-1 items-center">
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
        <aside className="border-base-300 flex shrink-0 flex-col gap-3 border-r p-3 max-md:hidden" style={{ width: SIDEBAR_WIDTH }}>
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-8 w-2/3 rounded" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </aside>
        <div className="relative min-h-0 min-w-0 flex-1">
          <PageSkeleton />
          {error && <InlineError variant="banner" message={error.message} onRetry={error.retry} className="absolute inset-x-2 top-2 z-50" />}
        </div>
      </div>
    </div>
  );
}
