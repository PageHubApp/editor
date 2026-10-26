/**
 * A new `pages/*.liquid` file is a new page: the server also needs its record (name, URL, route captures). The URL
 * comes from the path, the same way the app builds a path from a URL (`sourcePathFor`), reversed:
 *
 *   pages/about.liquid              /about
 *   pages/docs/intro.liquid         /docs/intro        (slug docs, pattern intro)
 *   pages/shop/[handle].liquid      /shop/:handle      (slug shop, pattern :handle)
 *
 * The first segment is the page's slug, the rest its path pattern, `[name]` meaning the capture `:name`.
 */
export interface PageInput {
  name: string;
  slug: string;
  pathPattern: string | null;
  file: string;
}

const humanize = (segment: string): string => {
  const words = segment.replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : segment;
};

/** The page record for a new page file, or a reason the path can't name one. */
export function pageInputFromPath(file: string): PageInput | { error: string } {
  const segments = file.replace(/^pages\//, "").replace(/\.liquid$/, "").split("/");
  const slug = segments[0]!;
  if (/[[\]]/.test(slug)) return { error: `${file}: a page needs a fixed first segment (pages/<name>/[param].liquid), not a capture.` };
  const tail = segments.slice(1).map((s) => (/^\[[A-Za-z][A-Za-z0-9_]*\]$/.test(s) ? `:${s.slice(1, -1)}` : s));
  if (tail.some((s) => /[[\]]/.test(s))) return { error: `${file}: a capture is written [name], with letters, numbers or _ (starting with a letter).` };
  const literal = [...segments].reverse().find((s) => !s.startsWith("["))!;
  return { name: slug === "index" ? "Home" : humanize(literal), slug: slug === "index" ? "" : slug, pathPattern: tail.length ? tail.join("/") : null, file };
}
