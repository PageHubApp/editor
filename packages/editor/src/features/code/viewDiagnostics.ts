/**
 * Engine diagnostics → the code view's marks. A view shows one file, or one node of it (a
 * section's code view): diagnostics of other files and outside the node are dropped, ranges
 * become offsets into the shown text and are clamped to it, and a zero-width range widens to
 * one character so the mark is visible.
 *
 *   viewDiagnostics(editor.diagnostics, { path: "index.liquid", from: h.range.from, to: h.range.to })
 */
import type { Diagnostic } from "@pagehub/engine";

export interface ViewDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning";
  /** `<rule>: <message>` */
  message: string;
  rule: string;
}

interface ViewScope {
  path: string;
  /** Start of the shown text in the file (default 0). */
  from?: number;
  /** End of the shown text in the file (default: end of file). */
  to?: number;
}

export function viewDiagnostics(diagnostics: readonly Diagnostic[], scope: ViewScope): ViewDiagnostic[] {
  const base = scope.from ?? 0;
  const end = scope.to ?? Number.POSITIVE_INFINITY;
  const length = end - base;
  return diagnostics
    .filter((d) => d.path === scope.path && d.range.end >= base && d.range.start <= end)
    .map((d) => {
      const from = Math.max(0, Math.min(length, d.range.start - base));
      let to = Math.max(from, Math.min(length, d.range.end - base));
      if (to === from && to < length) to = from + 1;
      return { from, to, severity: d.severity, message: `${d.rule}: ${d.message}`, rule: d.rule };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to);
}
