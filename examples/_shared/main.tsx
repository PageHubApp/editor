/**
 * Shared browser entry for the examples. The site's files live on disk; `serve.ts` exposes them
 * at `/__api/*` and this file wraps that in a storage adapter, so every edit you save is a
 * minimal diff in the example's own folder (`git diff` shows it).
 *
 * The example's `editor.config.ts` (bundled in as `@example/config`) says what the site needs
 * beyond HTML: extra kits, sample data, a canvas renderer. URL options: `?role=client` opens
 * content mode (D5), `?role=viewer` is read-only.
 */
import { createRoot } from "react-dom/client";
import { defineStorage, storageErrorFromNetwork, storageErrorFromResponse, type StorageDef } from "@pagehub/engine";
import { Editor } from "@pagehub/editor";
// @ts-expect-error resolved by esbuild to the example's editor.config.ts
import setup from "@example/config";
import type { ExampleSetup } from "./types.ts";

function httpStorage(base = "/__api"): StorageDef {
  // a failed request throws a `StorageError` (network / forbidden / ...), so the editor can say why
  const j = async (what: string, r: Promise<Response>) => {
    const res = await r.catch((e) => {
      throw storageErrorFromNetwork(e, what);
    });
    if (!res.ok) throw storageErrorFromResponse(res.status, await res.text().catch(() => ""), what);
    return res.json();
  };
  return defineStorage({
    id: "http",
    list: () => j("list files", fetch(`${base}/list`)),
    read: async (path) => {
      const r = await fetch(`${base}/read?path=${encodeURIComponent(path)}`).catch((e) => {
        throw storageErrorFromNetwork(e, `read ${path}`);
      });
      return r.status === 404 ? null : j(`read ${path}`, Promise.resolve(r));
    },
    write: (path, text, { baseVersion }) =>
      j(`write ${path}`, fetch(`${base}/write?path=${encodeURIComponent(path)}&base=${encodeURIComponent(baseVersion ?? "")}`, { method: "PUT", body: text })),
    writeBatch: (changes, { baseVersions }) => j("save", fetch(`${base}/batch`, { method: "POST", body: JSON.stringify({ changes, baseVersions }) })),
  });
}

async function main() {
  const storage = httpStorage();
  const files: Record<string, string> = {};
  for (const p of await storage.list()) {
    const f = await storage.read(p);
    if (f) files[p] = f.text;
  }
  const cfg: ExampleSetup = await setup({ files });
  const role = (new URLSearchParams(location.search).get("role") as "client" | "viewer" | null) ?? undefined;
  createRoot(document.getElementById("root")!).render(
    <Editor
      storage={storage}
      role={role}
      data={cfg.data}
      extensions={cfg.extensions}
      canvasRender={cfg.canvasRender}
      // the diff preview renders in the flow under the canvas and squeezes the editor
      components={{ DiffPreview: null }}
    />,
  );
}
void main();
