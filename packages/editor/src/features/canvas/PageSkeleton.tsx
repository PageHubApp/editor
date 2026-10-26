import { Skeleton } from "../../primitives/Skeleton";

/** What the canvas shows on its very first render: the rough shape of a page (header, hero, a card row), filling the frame. */
export function PageSkeleton() {
  return (
    <div data-page-skeleton="" aria-busy role="status" aria-label="Loading page" className="bg-base-100 pointer-events-none absolute inset-0 z-20 flex flex-col gap-8 overflow-hidden p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 rounded" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 pt-10">
        <Skeleton className="h-10 w-3/4 rounded" />
        <Skeleton className="h-10 w-1/2 rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
