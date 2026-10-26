/**
 * InlineError — a failed load, in place, with a Retry. `banner` is the canvas's floating render-error
 * strip (solid, over the page); `panel` is the quiet row a panel shows above or instead of its content.
 */
export function InlineError({ message, onRetry, variant = "panel", className = "" }: { message: string; onRetry?: () => void; variant?: "banner" | "panel"; className?: string }) {
  const tone = variant === "banner" ? "bg-error text-error-content rounded-md px-3 py-2 font-mono text-xs shadow-lg" : "bg-error/10 text-error px-4 py-2 text-xs";
  return (
    <div role="alert" data-inline-error="" className={`flex items-center gap-3 ${tone} ${className}`}>
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <button type="button" data-retry="" onClick={onRetry} className="pointer-events-auto shrink-0 rounded border border-current px-2 py-0.5 font-sans font-medium hover:bg-black/10">
          Retry
        </button>
      )}
    </div>
  );
}
