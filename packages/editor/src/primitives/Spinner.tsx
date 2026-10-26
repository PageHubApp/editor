import { Icon } from "./icons";

/** Spinner — the editor's one in-progress glyph (the same `loader` icon the save status spins). */
export function Spinner({ className = "size-4", label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-spinner="" className="inline-flex items-center">
      <Icon name="loader" className={`animate-spin ${className}`} />
    </span>
  );
}
