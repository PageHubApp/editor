/** `{{` followed by the characters typed since, up to the caret (no braces or line breaks). */
const TRIGGER = /\{\{ ?([^{}\n]*)$/;

/** The open `{{…` right before the caret in `before`: how many characters it spans and the query after it. */
export function findTrigger(before: string): { length: number; query: string } | null {
  const m = TRIGGER.exec(before);
  return m ? { length: m[0].length, query: m[1]!.trim() } : null;
}
