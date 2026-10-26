/**
 * The folder as storage, over HTTP: a framework-free `node:http` handler on the engine's `fsStorage` (optimistic
 * versions, temp-file-then-rename writes, atomic batches). One protocol, one client (`client/httpStorage.ts`).
 *
 *   GET  /api/files                     → { files: [{ path, version }] }
 *   GET  /api/file?path=                → { text, version } | 404
 *   PUT  /api/file?path=   { text, baseVersion }  → { version } | 409 { theirs, version }
 *   POST /api/batch  { changes, baseVersions }    → { versions } | 409 { conflicts } (nothing written)
 *
 * Only site files are reachable (`isSiteFile`), and nothing outside the site folder. Hand it to a server by calling
 * it with the request, response and parsed URL: it answers `true` when the path was its own, `false` otherwise.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DevEngine } from "./engine";
import { insideSite, isSiteFile } from "./sites";

type Root = string | ((url: URL) => string | null | Promise<string | null>);

export interface FileApiOptions {
  /** The site folder, or a function choosing it per request (`null` answers 404 "no such site"). */
  root: Root;
  /** The engine's file-system storage (`fsStorage`); a function when the engine reloads. */
  engine: Pick<DevEngine, "fsStorage"> | (() => Pick<DevEngine, "fsStorage"> | Promise<Pick<DevEngine, "fsStorage">>);
}

export const FILE_API_PATH = /^\/api\/(files?|batch)$/;

export const sendJson = (res: ServerResponse, status: number, body: unknown) => void res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export function createFileApi({ root, engine }: FileApiOptions): (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean> {
  return async (req, res, url) => {
    if (!FILE_API_PATH.test(url.pathname)) return false;
    const dir = typeof root === "string" ? root : await root(url);
    if (!dir) {
      sendJson(res, 404, { error: "no such site" });
      return true;
    }
    const { fsStorage } = typeof engine === "function" ? await engine() : engine;
    const storage = fsStorage({ root: dir, include: isSiteFile });

    if (url.pathname === "/api/files") {
      const files = await Promise.all((await storage.list()).map(async (path) => ({ path, version: (await storage.read(path))?.version ?? "" })));
      sendJson(res, 200, { files });
      return true;
    }

    if (url.pathname === "/api/batch") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" }), true;
      const { changes, baseVersions = {} } = JSON.parse(await readBody(req));
      if (!Array.isArray(changes) || !changes.length || changes.some((c: { path: string }) => !insideSite(dir, c.path))) return sendJson(res, 400, { error: "bad path" }), true;
      const result = await storage.writeBatch!(changes, { baseVersions });
      if (!result.ok) return sendJson(res, 409, { conflicts: result.conflicts }), true;
      return sendJson(res, 200, { versions: result.versions }), true;
    }

    const path = url.searchParams.get("path") || "";
    if (!insideSite(dir, path)) return sendJson(res, 400, { error: "bad path" }), true;
    if (req.method === "GET") {
      const file = await storage.read(path);
      return file ? sendJson(res, 200, file) : sendJson(res, 404, { error: "not found" }), true;
    }
    if (req.method === "PUT") {
      const { text, baseVersion } = JSON.parse(await readBody(req));
      const result = await storage.write(path, text, { baseVersion: baseVersion ?? null });
      return result.ok ? sendJson(res, 200, { version: result.version }) : sendJson(res, 409, result.conflict), true;
    }
    return sendJson(res, 405, { error: "method not allowed" }), true;
  };
}
