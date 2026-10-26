/** `"300ms"` / `"5s"` / `"5"` (seconds) to milliseconds; `fallback` when empty or invalid. */
export function parseDuration(value: string | null | undefined, fallback: number): number {
  const m = /^\s*(\d*\.?\d+)\s*(ms|s)?\s*$/.exec(value ?? "");
  if (!m) return fallback;
  return Math.round(Number(m[1]) * (m[2] === "ms" ? 1 : 1000));
}
