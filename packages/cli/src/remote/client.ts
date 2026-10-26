/**
 * The PageHub files API, as the CLI uses it (`/api/v1/sites/:id/files`, `.../source-pages`). One request helper, then a
 * typed method per call. A write answers with a tagged result (`ok` / `conflict` / `lint` / `rejected` / `maintenance`)
 * instead of throwing, so `push` can print each refusal the way it deserves. Everything else that goes wrong throws.
 */
import type { Remote } from "./config";
import { isSourcePath } from "./paths";

export type FileChange = { path: string; text: string } | { path: string; delete: true };

export interface FileListing {
  paths: string[];
  /** path → version (the sha256 of the file's text). */
  versions: Record<string, string>;
  /** The site's content version (counts saves). */
  version: number;
  styling?: string;
}

export interface RemotePage {
  pageId: string;
  name: string;
  slug: string;
  file: string | null;
  url: string;
  isHomePage: boolean;
  is404Page: boolean;
  isHidden: boolean;
  pathPattern: string | null;
}

export interface LintIssueWire {
  rule?: string;
  message: string;
  range?: { start: number; end?: number };
}

export interface FileConflictWire {
  path: string;
  /** The server's current text (`""` when the file was deleted there). */
  theirs: string;
  version: string;
}

export type SaveResult =
  | { kind: "ok"; versions: Record<string, string>; version: number; advisories: string[]; pages: RemotePage[] }
  | { kind: "conflict"; conflicts: FileConflictWire[] }
  | { kind: "lint"; path: string; message: string; issues: LintIssueWire[] }
  | { kind: "maintenance"; message: string }
  | { kind: "rejected"; status: number; message: string; path?: string };

export type PageResult = { kind: "ok"; page: RemotePage; version?: string } | Exclude<SaveResult, { kind: "ok" }>;

/** A page record to create along with its new file (`pages` of `POST …/files`; the route is read from the path). */
export interface PageRequest {
  path: string;
  name?: string;
}

/** A call that failed in a way the caller can't act on: no network, a rejected key, a missing site. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Client {
  baseUrl: string;
  listFiles(siteId: string): Promise<FileListing>;
  /** Null when the draft has no such file. */
  readFile(siteId: string, path: string): Promise<{ text: string; version: string } | null>;
  readFiles(siteId: string, paths: readonly string[]): Promise<Record<string, { text: string; version: string }>>;
  /** One atomic write. `pages` creates a page record for each new `pages/….liquid` file in the same write. */
  saveBatch(siteId: string, changes: readonly FileChange[], baseVersions: Record<string, string | null>, pages?: readonly PageRequest[]): Promise<SaveResult>;
  /** Does the server read several files in one call and create pages from files? Both shipped together. */
  supportsBulk(siteId: string): Promise<boolean>;
  listPages(siteId: string): Promise<RemotePage[]>;
  deletePage(siteId: string, pageId: string): Promise<PageResult>;
  /** A cheap authenticated call: how many sites the key can see. */
  countSites(): Promise<number>;
}

/** `GET …/files?read=` takes at most 40 paths. Without it: parallel single-file reads. */
const BULK_READ_FILES = 40;
const READ_CONCURRENCY = 8;
const TIMEOUT_MS = 60_000;

export function createClient(remote: Remote, fetchImpl: typeof fetch = fetch): Client {
  async function request(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    let res: Response;
    try {
      res = await fetchImpl(`${remote.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${remote.apiKey}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new ApiError(`Can't reach ${remote.baseUrl}: ${(e as Error).message}`);
    }
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { message: text.slice(0, 200) };
    }
    if (res.status === 401) throw new ApiError("The API key was rejected (401). Run `pagehub login` with a current key.", 401);
    return { status: res.status, body: parsed };
  }

  const site = (siteId: string) => `/api/v1/sites/${encodeURIComponent(siteId)}`;
  // A path keeps its slashes; `[handle]` and friends are escaped by encodeURIComponent per segment.
  const filePath = (siteId: string, path: string) => `${site(siteId)}/files/${path.split("/").map(encodeURIComponent).join("/")}`;
  const message = (r: { status: number; body: any }) => String(r.body?.message || r.body?.error || `HTTP ${r.status}`);

  function failure(r: { status: number; body: any }): Exclude<SaveResult, { kind: "ok" }> {
    const b = r.body ?? {};
    if (r.status === 409 && b.error === "version_conflict") {
      const conflicts: FileConflictWire[] = Array.isArray(b.conflicts) ? b.conflicts.filter((c: FileConflictWire) => typeof c?.path === "string" && isSourcePath(c.path)) : b.theirs !== undefined ? [{ path: "", theirs: b.theirs, version: b.version ?? "" }] : [];
      return { kind: "conflict", conflicts };
    }
    if (r.status === 422 && b.error === "lint") return { kind: "lint", path: String(b.path ?? ""), message: String(b.message ?? "lint failed"), issues: Array.isArray(b.issues) ? b.issues : [] };
    if (r.status === 503 && b.error === "maintenance") return { kind: "maintenance", message: String(b.message || "PageHub is in maintenance; writes are paused.") };
    if (r.status === 409 && b.error === "site_format_changed") return { kind: "rejected", status: 409, message: "This site isn't an HTML + Liquid site (its format changed); the files API can't edit it." };
    return { kind: "rejected", status: r.status, message: message(r), ...(typeof b.path === "string" ? { path: b.path } : {}) };
  }

  function expectOk(r: { status: number; body: any }, what: string, siteId?: string): void {
    if (r.status >= 200 && r.status < 300) return;
    if (r.status === 404 && siteId) throw new ApiError(`No site ${siteId} for this key (404).`, 404);
    if (r.status === 409 && r.body?.error === "site_format_changed") throw new ApiError(`${siteId ?? "That site"} isn't an HTML + Liquid site; the files API can't read it.`, 409);
    throw new ApiError(`${what} failed (${r.status}): ${message(r)}`, r.status);
  }

  async function readFile(siteId: string, path: string): Promise<{ text: string; version: string } | null> {
    const r = await request("GET", filePath(siteId, path));
    if (r.status === 404) return null;
    expectOk(r, `Reading ${path}`, siteId);
    return { text: r.body.text, version: r.body.version };
  }

  // `?read=` and `pages` on the batch write shipped together; a server without them ignores both query and field.
  let bulk: boolean | undefined;
  async function supportsBulk(siteId: string): Promise<boolean> {
    if (bulk === undefined) {
      const r = await request("GET", `${site(siteId)}/files?read=site.json`);
      bulk = r.status === 200 && Array.isArray(r.body?.files);
    }
    return bulk;
  }

  return {
    baseUrl: remote.baseUrl,

    async listFiles(siteId) {
      const r = await request("GET", `${site(siteId)}/files`);
      expectOk(r, "Listing files", siteId);
      // Every path the server names ends up on this disk and in a printed shell command: only paths a site may hold get through.
      const paths: string[] = (r.body.paths ?? []).filter((p: unknown): p is string => typeof p === "string" && isSourcePath(p));
      const versions: Record<string, string> = {};
      for (const [p, v] of Object.entries<string>(r.body.versions ?? {})) if (isSourcePath(p)) versions[p] = v;
      return { paths, versions, version: r.body.version ?? 0, styling: r.body.styling };
    },

    readFile,

    async readFiles(siteId, paths) {
      const out: Record<string, { text: string; version: string }> = {};
      const single = async (path: string) => {
        const file = await readFile(siteId, path);
        if (!file) throw new ApiError(`${path} is listed but could not be read (404).`, 404);
        out[path] = file;
      };
      if (!paths.length) return out;
      if (await supportsBulk(siteId)) {
        // Up to 40 files per request; what the answer's size cap leaves out (`skipped`) is read alone.
        for (let i = 0; i < paths.length; i += BULK_READ_FILES) {
          const group = paths.slice(i, i + BULK_READ_FILES);
          const r = await request("GET", `${site(siteId)}/files?read=${group.map(encodeURIComponent).join(",")}`);
          expectOk(r, "Reading files", siteId);
          for (const f of r.body.files ?? []) if (group.includes(f.path)) out[f.path] = { text: String(f.text), version: f.version };
          if (r.body.missing?.length) throw new ApiError(`${r.body.missing.join(", ")} is listed but could not be read.`, 404);
          for (const s of r.body.skipped ?? []) await single(s.path);
        }
        return out;
      }
      let next = 0;
      const worker = async () => {
        for (let i = next++; i < paths.length; i = next++) await single(paths[i]!);
      };
      await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, worker));
      return out;
    },

    supportsBulk,

    async saveBatch(siteId, changes, baseVersions, pages) {
      const r = await request("POST", `${site(siteId)}/files`, { changes, baseVersions, ...(pages?.length ? { pages } : {}) });
      if (r.status === 200) return { kind: "ok", versions: r.body.versions ?? {}, version: r.body.version ?? 0, advisories: r.body.advisories ?? [], pages: r.body.pages ?? [] };
      if (r.status === 404) throw new ApiError(`No site ${siteId} for this key (404).`, 404);
      if (r.status === 413) return { kind: "rejected", status: 413, message: "The request was too large for the server." };
      return failure(r);
    },

    async listPages(siteId) {
      const r = await request("GET", `${site(siteId)}/source-pages`);
      expectOk(r, "Listing pages", siteId);
      return r.body.pages ?? [];
    },

    async deletePage(siteId, pageId) {
      const r = await request("DELETE", `${site(siteId)}/source-pages/${encodeURIComponent(pageId)}`);
      if (r.status === 200) return { kind: "ok", page: r.body.page, version: r.body.version };
      return failure(r);
    },

    async countSites() {
      const r = await request("GET", "/api/v1/sites");
      expectOk(r, "Listing sites");
      const sites = r.body?.sites ?? r.body;
      return Array.isArray(sites) ? sites.length : 0;
    },
  };
}
