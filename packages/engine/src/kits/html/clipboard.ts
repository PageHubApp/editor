/**
 * The clipboard is source text. A copy writes the node's source as `text/html`,
 * `text/plain` and a marker type (`text/x-pagehub-editor`) so another tab or editor pastes it
 * back byte for byte, and other apps get plain HTML. A paste of foreign HTML (no marker) takes
 * the copied fragment and escapes Liquid delimiters so it pastes as literal text.
 *
 * Commands read the configured `Clipboard` live on every `can()` (no cached "has node" flag —
 * the fix-table row). `memoryClipboard()` is the default, shared by every editor in the process;
 * `systemClipboard()` mirrors writes to the OS clipboard and can `refresh()` from it. A host's
 * native `paste` / `copy` events go through `readClipboardPayload` / `clipboardPayload`.
 */
import { defineFacet } from "../../extensions/extension";
import { escapeLiquid } from "../../import/importHtml";

export const CLIPBOARD_MIME = "text/x-pagehub-editor";

export interface ClipboardEntry {
  source: string;
  /** Came from another app (no marker): already Liquid-escaped. */
  foreign: boolean;
}

export interface Clipboard {
  read(): ClipboardEntry | null;
  write(source: string): void;
}

export function memoryClipboard(): Clipboard & { clear(): void } {
  let entry: ClipboardEntry | null = null;
  return {
    read: () => entry,
    write: (source) => void (entry = { source, foreign: false }),
    clear: () => void (entry = null),
  };
}

/** The default clipboard: one per process, so editors (and tabs of a host) share it. */
export const sharedClipboard = memoryClipboard();

/** The configured clipboard (highest precedence wins; `sharedClipboard` when none). */
export const clipboardFacet = defineFacet<Clipboard, Clipboard>({ id: "clipboard", combine: (values) => values[0] ?? sharedClipboard });

/** What a copy puts on a `DataTransfer` / `ClipboardItem`, by MIME type. */
export function clipboardPayload(source: string): Record<string, string> {
  return { "text/html": source, "text/plain": source, [CLIPBOARD_MIME]: source };
}

/** The copied fragment of an HTML clipboard document (`<!--StartFragment-->`, else `<body>`). */
export function htmlFragment(html: string): string {
  const frag = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/.exec(html);
  if (frag) return frag[1]!.trim();
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return (body ? body[1]! : html.replace(/^<meta[^>]*>/i, "")).trim();
}

/** Read a clipboard payload by type (`DataTransfer.getData`, or a map): ours first, then foreign HTML. */
export function readClipboardPayload(get: (type: string) => string | null | undefined): ClipboardEntry | null {
  const ours = get(CLIPBOARD_MIME) || get(`web ${CLIPBOARD_MIME}`);
  if (ours) return { source: ours, foreign: false };
  const html = get("text/html");
  if (html && htmlFragment(html)) return { source: escapeLiquid(htmlFragment(html)).source, foreign: true };
  return null;
}

interface AsyncClipboardLike {
  write?(items: unknown[]): Promise<void>;
  writeText?(text: string): Promise<void>;
  read?(): Promise<Array<{ types: readonly string[]; getType(type: string): Promise<{ text(): Promise<string> }> }>>;
}

/**
 * The OS clipboard (browser async Clipboard API) behind a synchronous cache: `write` updates
 * the cache and the OS clipboard (custom type as `web text/x-pagehub-editor`); `refresh()`
 * reads the OS clipboard into the cache (call it on window focus to pick up copies made in
 * other apps); `fromEvent` takes a native paste event's data.
 */
export function systemClipboard(opts: { clipboard?: AsyncClipboardLike; ClipboardItem?: new (items: Record<string, Blob>) => unknown } = {}): Clipboard & {
  refresh(): Promise<void>;
  fromEvent(data: { getData(type: string): string }): ClipboardEntry | null;
} {
  const g = globalThis as { navigator?: { clipboard?: AsyncClipboardLike }; ClipboardItem?: new (items: Record<string, Blob>) => unknown };
  const os = opts.clipboard ?? g.navigator?.clipboard;
  const Item = opts.ClipboardItem ?? g.ClipboardItem;
  let entry: ClipboardEntry | null = null;
  return {
    read: () => entry,
    write(source) {
      entry = { source, foreign: false };
      if (!os) return;
      const p = clipboardPayload(source);
      const blobs = (types: string[]) => Object.fromEntries(types.map((t) => [t === CLIPBOARD_MIME ? `web ${t}` : t, new Blob([p[t]!], { type: t })]));
      const attempt = async () => {
        if (os.write && Item) {
          try {
            return await os.write([new Item(blobs(["text/html", "text/plain", CLIPBOARD_MIME]))]);
          } catch {
            try {
              return await os.write([new Item(blobs(["text/html", "text/plain"]))]); // no web custom formats
            } catch {
              /* fall through */
            }
          }
        }
        await os.writeText?.(source);
      };
      attempt().catch(() => {});
    },
    async refresh() {
      if (!os?.read) return;
      try {
        const data: Record<string, string> = {};
        for (const item of await os.read()) for (const t of item.types) data[t] ??= await (await item.getType(t)).text();
        const r = readClipboardPayload((t) => data[t]);
        if (r && r.source !== entry?.source) entry = r;
      } catch {
        /* permission denied: keep the cache */
      }
    },
    fromEvent(data) {
      const r = readClipboardPayload((t) => data.getData(t));
      if (r) entry = r;
      return r;
    },
  };
}
