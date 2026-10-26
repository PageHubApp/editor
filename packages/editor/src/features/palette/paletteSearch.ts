/**
 * Palette matching: case-insensitive fuzzy search over a command's title or category.
 * Scores: a prefix match is 1000 minus the extra length; a contiguous substring is 700 (at a
 * word start) or 500, minus its index; scattered letters add 8 at a word start or 3 elsewhere,
 * minus the gaps between them; no match is dropped.
 */
export interface PaletteEntry {
  id: string;
  title: string;
  category: string;
  /** The first binding's key string (`mod+z`), or null. */
  shortcut: string | null;
  /** The command can run now; false rows are greyed and inert. */
  enabled: boolean;
}

const isWordStart = (text: string, i: number): boolean => i === 0 || !/[a-z0-9]/.test(text[i - 1]!);

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - (t.length - q.length);
  const at = t.indexOf(q);
  if (at >= 0) return (isWordStart(t, at) ? 700 : 500) - at;
  let score = 0;
  let from = 0;
  let last = -1;
  for (const ch of q) {
    const i = t.indexOf(ch, from);
    if (i < 0) return null;
    score += isWordStart(t, i) ? 8 : 3;
    if (last >= 0) score -= i - last - 1;
    last = i;
    from = i + 1;
  }
  return score;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Filter and order entries: by score when searching, then category A–Z, then title A–Z. */
export function searchEntries(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const q = query.trim();
  const scored = entries.flatMap((entry) => {
    if (!q) return [{ entry, score: 0 }];
    const a = fuzzyScore(q, entry.title);
    const b = fuzzyScore(q, entry.category);
    const score = a === null ? b : b === null ? a : Math.max(a, b);
    return score === null ? [] : [{ entry, score }];
  });
  return scored
    .sort((x, y) => y.score - x.score || byText(x.entry.category, y.entry.category) || byText(x.entry.title, y.entry.title))
    .map((x) => x.entry);
}
