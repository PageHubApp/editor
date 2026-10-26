/**
 * Line and indentation helpers for edits. magic-string only splices bytes; these rules are
 * what make a spliced diff look hand-written:
 *  - a node that sits on its own lines is removed with those whole lines;
 *  - an inserted block takes the indent of where it lands;
 *  - a block's inner lines keep their indent relative to its first line.
 */
import type { Range } from "../parse/parse";

export function lineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1;
}

/** The whitespace between the start of the line and `offset` (empty if anything else is there). */
export function indentAt(source: string, offset: number): string {
  const before = source.slice(lineStart(source, offset), offset);
  return before.trim() ? before.match(/^[ \t]*/)![0] : before;
}

/** Only whitespace sits between the start of the line and `offset`. */
export function ownsLineStart(source: string, offset: number): boolean {
  return !source.slice(lineStart(source, offset), offset).trim();
}

/** Only whitespace sits between `offset` and the end of the line. */
export function ownsLineEnd(source: string, offset: number): boolean {
  return /^[ \t]*(\n|$)/.test(source.slice(offset));
}

/** Offset just past the newline that ends the line containing `offset` (or end of file). */
export function nextLineStart(source: string, offset: number): number {
  const nl = source.indexOf("\n", offset);
  return nl === -1 ? source.length : nl + 1;
}

/**
 * Re-indent a block from indent `from` to `to`, keeping relative indentation. The first
 * line is left alone (the caller places it). Lines indented less than `from` are kept
 * as they are; blank lines stay blank.
 */
export function reindent(block: string, from: string, to: string): string {
  return block
    .split("\n")
    .map((line, i) => {
      if (i === 0 || !line.trim()) return i === 0 ? line : "";
      return line.startsWith(from) ? to + line.slice(from.length) : line;
    })
    .join("\n");
}

/** Range to delete for a node: its whole lines when it owns them, else just the node. */
export function removalRange(source: string, node: Range): Range {
  if (ownsLineStart(source, node.start) && ownsLineEnd(source, node.end)) {
    return { start: lineStart(source, node.start), end: nextLineStart(source, node.end) };
  }
  return { start: node.start, end: node.end };
}
