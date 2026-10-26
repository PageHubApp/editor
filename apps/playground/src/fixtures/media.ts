/**
 * A media library for the playground (it has none of its own), whose `list()` / `folders()` take `delayMs` and fail
 * when `failing`: how the Media Manager's loading and error states are seen. Chosen with `?fixture=media`.
 */
import type { Extension } from "@pagehub/engine";
import { mediaFacet, memoryMediaStore, type MediaItem } from "@pagehub/engine/host";

export function mediaFixture({ delayMs = 0, failing = false }: { delayMs?: number; failing?: boolean } = {}): Extension {
  const items: MediaItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `demo-${i}`,
    name: `photo-${i + 1}.jpg`,
    contentType: "image/jpeg",
    size: 120_000 + i * 9_000,
    folder: null,
    url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='230' height='288'><rect width='230' height='288' fill='hsl(${i * 30} 40% 70%)'/></svg>`)}`,
    createdAt: Date.now() - i * 86_400_000,
  }));
  const base = memoryMediaStore({ items });
  const wait = async <T,>(value: () => T): Promise<T> => {
    await new Promise((r) => setTimeout(r, delayMs));
    if (failing) throw new Error("Could not load the media library (500).");
    return value();
  };
  const store = Object.assign(Object.create(base), { list: (q?: Parameters<typeof base.list>[0]) => wait(() => base.list(q)), folders: () => wait(() => base.folders()) });
  return mediaFacet.of(store);
}
