/**
 * Eleventy's side of the contract, as host plug-ins (the engine itself knows nothing about 11ty):
 *
 *   front matter   a leading `--- … ---` block: keys become page data (`title`), `layout` names a layout
 *   layouts        `layouts/<name>` wraps the page; `{{ content }}` is the page body
 *   collections    `collections.post` is every `src/blog/*.md` tagged `post`, oldest first, like 11ty
 *   filters        `url` (Eleventy's path-prefix filter; no prefix here, so it returns its input)
 *
 * The editor edits the .liquid files, layouts and partials as they are. Eleventy keeps building them.
 */
import {
  t,
  type EditorState,
  type Path,
} from "@pagehub/engine";
import {
  defineFilter,
  type JsonValue,
  type Renderer,
} from "@pagehub/engine/render";
import {
  instrumentFiles,
} from "@pagehub/engine/canvas";

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface Parsed {
  data: Record<string, string>;
  body: string;
}

/** Front matter as flat `key: value` strings (all this site uses). The body keeps its byte offsets by blanking the block, not removing it. */
export function parseFrontMatter(text: string): Parsed {
  const m = FRONT.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]!] = kv[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: text.slice(m[0].length) };
}

/** Eleventy's `url` filter with no path prefix. */
export const url = defineFilter({
  name: "url",
  args: [t.string().optional()],
  returns: "url",
  describe: "Eleventy's url filter (this site has no path prefix, so the value comes back unchanged).",
  run: (v) => (v == null ? "" : String(v)),
});

const stem = (path: Path) => path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

export interface Post {
  url: string;
  date: string;
  inputPath: Path;
  data: Record<string, JsonValue>;
}

/** `collections.post`: markdown files under `blog/` whose directory data (`blog/blog.json`) tags them `post`. */
export function collectionsOf(files: Record<Path, string>): { post: Post[] } {
  const dirData = JSON.parse(files["blog/blog.json"] ?? "{}") as { tags?: string | string[] };
  const tags = ([] as string[]).concat(dirData.tags ?? []);
  const post = Object.keys(files)
    .filter((p) => /^blog\/[^/]+\.md$/.test(p))
    .map((p): Post => {
      const { data } = parseFrontMatter(files[p]!);
      const date = new Date(data.date ?? 0).toISOString();
      return { url: `/blog/${stem(p)}/`, date, inputPath: p, data: { ...data, tags } };
    })
    .filter((p) => tags.includes("post") || (p.data.tags as string[]).includes("post"))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { post };
}

/** Site data the way Eleventy builds it: `_data/*.json` by file name, plus collections. */
export function siteData(files: Record<Path, string>): Record<string, JsonValue> {
  const data: Record<string, JsonValue> = { collections: collectionsOf(files) as unknown as JsonValue };
  for (const [p, text] of Object.entries(files)) {
    const m = /^_data\/([^/]+)\.json$/.exec(p);
    if (m) data[m[1]!] = JSON.parse(text) as JsonValue;
  }
  return data;
}

const MARK = "PHEleventyContentMarker";
const pageUrl = (path: Path, data: Record<string, string>) => data.permalink ?? "/" + stem(path) + "/";

/**
 * Render a page the way Eleventy would: the page body, then each layout in its chain with the
 * body as `{{ content }}`. Instrumentation comes from `instrumentFiles`, which keys every element
 * to its offset in the real file, so clicks land on the right source even though the front matter
 * is blanked for rendering.
 */
export async function renderEleventyPage(renderer: Renderer, state: EditorState, path: Path, base: Record<string, JsonValue>): Promise<string> {
  const original = new Map<Path, string>();
  for (const [p, text] of state.files) original.set(p, text);
  const sources = instrumentFiles(state);
  const body = (p: Path) => parseFrontMatter(sources[p] ?? original.get(p) ?? "");
  const files = Object.fromEntries([...Object.keys(sources)].map((p) => [p, body(p).body]));

  const page = body(path);
  const data = { ...base, ...page.data, page: { url: pageUrl(path, page.data), date: page.data.date ?? null, fileSlug: stem(path) } } as Record<string, unknown>;
  let html = await renderer.render(path, data, { overrides: files, mode: "editor" });
  let layout = page.data.layout;
  while (layout) {
    const lp = `layouts/${layout}`;
    if (!(lp in files)) break;
    const wrap = await renderer.render(lp, { ...data, content: MARK }, { overrides: files, mode: "editor" });
    html = wrap.replace(MARK, () => html);
    layout = body(lp).data.layout;
  }
  return html;
}
