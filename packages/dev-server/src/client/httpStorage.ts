/** Storage over the dev server's file API (`fileApi.ts`): the opened site folder is the site. Versions are opaque strings the server hands out. */
import { defineStorage, storageErrorFromNetwork, storageErrorFromResponse, type StorageDef } from "@pagehub/engine";

export interface HttpStorageOptions {
  /** The site this tab edits (default: `?site=` in the URL); every request carries it so tabs never share state. */
  site?: string | null;
  /** A load that has not answered in this long is an error (with Retry upstream), not an endless wait. */
  timeoutMs?: number;
}

const urlSite = () => new URLSearchParams(location.search).get("site");

/** `fetch` that fails as a `StorageError`: `network` when nothing answered, else the code for the status (`storageErrorFromResponse`). */
async function call(what: string, url: string, init?: RequestInit, ok: readonly number[] = []): Promise<Response> {
  const res = await fetch(url, init).catch((e) => {
    throw storageErrorFromNetwork(e, what);
  });
  if (res.ok || ok.includes(res.status)) return res;
  const body = await res.text();
  let parsed: unknown = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* not JSON: the text itself */
  }
  throw storageErrorFromResponse(res.status, parsed, what);
}

export function httpStorage({ site = urlSite(), timeoutMs = 20_000 }: HttpStorageOptions = {}): StorageDef {
  const siteQuery = site ? `site=${encodeURIComponent(site)}` : "";
  const api = (path: string) => `/api/file?${siteQuery}&path=${encodeURIComponent(path)}`;
  const json = { "content-type": "application/json" };
  return defineStorage({
    id: "http",
    list: async () => (await (await call("list files", `/api/files?${siteQuery}`, { signal: AbortSignal.timeout(timeoutMs) })).json()).files.map((f: { path: string }) => f.path),
    read: async (path) => {
      const res = await call(`read ${path}`, api(path), { signal: AbortSignal.timeout(timeoutMs) }, [404]);
      return res.status === 404 ? null : res.json();
    },
    write: async (path, text, { baseVersion }) => {
      const res = await call(`write ${path}`, api(path), { method: "PUT", headers: json, body: JSON.stringify({ text, baseVersion }) }, [409]);
      if (res.status === 409) {
        const { theirs, version } = await res.json();
        return { ok: false, conflict: { theirs, version } };
      }
      return { ok: true, version: (await res.json()).version };
    },
    // one atomic save: 200 `{ versions }`, or 409 `{ conflicts: [{ path, theirs, version }] }` with nothing written
    writeBatch: async (changes, { baseVersions }) => {
      const res = await call("save", `/api/batch?${siteQuery}`, { method: "POST", headers: json, body: JSON.stringify({ changes, baseVersions }) }, [409]);
      const body = await res.json();
      if (res.status === 409) {
        if (!Array.isArray(body.conflicts)) throw storageErrorFromResponse(409, body, "save");
        return { ok: false, conflicts: body.conflicts };
      }
      return { ok: true, versions: body.versions };
    },
    // another writer (a teammate, an agent, your own text editor) changed a file on disk: the dev server watches the folder and pushes `site:changed` over Vite's websocket
    watch: (onChange) => {
      const hot = import.meta.hot;
      if (!hot) return () => {};
      const on = (d: { site: string; path: string }) => (!site || d.site === site) && onChange(d.path);
      hot.on("site:changed", on);
      return () => hot.off("site:changed", on);
    },
  });
}
