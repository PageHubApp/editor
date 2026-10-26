/**
 * Every class token in `markup`'s `class="…"` attributes, entity-decoded (`[&amp;_li]:py-1` → `[&_li]:py-1`).
 *
 * A CSS compiler (Tailwind) needs the classes a page actually uses, and components hard-code classes in
 * their markup (a form label's `mb-1`, an icon wrapper's `size-full`) that no node prop carries, so the list
 * is read off the rendered output. `data-*-class` attributes count too: they carry classes the site runtime
 * applies to markup it builds in the browser (cart rows), which the compiler would never see otherwise.
 *
 * Pass the output of `renderPage`. Order is first appearance; duplicates are dropped.
 */
export function classesInMarkup(markup: string): string[] {
  const out = new Set<string>();
  for (const m of markup.matchAll(/\s(?:class|data-[\w-]+-class)="([^"]*)"/g)) {
    const value = m[1]!
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    for (const cls of value.split(/\s+/)) if (cls) out.add(cls);
  }
  return [...out];
}
