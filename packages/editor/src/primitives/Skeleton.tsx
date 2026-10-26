import type { ReactNode } from "react";
import { useDelayedFlag } from "./useDelayedFlag";

/**
 * Skeleton — one pulsing placeholder block. Size it with `className` to match the loaded content
 * exactly (so nothing shifts when the data arrives): `<Skeleton className="h-[9.5rem] rounded-xl" />`.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden data-skeleton="" className={`bg-base-200 animate-pulse ${className}`} />;
}

/**
 * SkeletonRegion — a group of skeletons that reserves its full size at once but stays invisible for
 * the first `LOADING_DELAY_MS`, so a fast load shows nothing and a slow one shows placeholders
 * without anything moving when the real content replaces them.
 */
export function SkeletonRegion({ children, className = "", label = "Loading" }: { children: ReactNode; className?: string; label?: string }) {
  const shown = useDelayedFlag(true);
  return (
    <div aria-busy role="status" aria-label={label} data-skeleton-region="" className={`${shown ? "" : "invisible"} ${className}`}>
      {children}
    </div>
  );
}
