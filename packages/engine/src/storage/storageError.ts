/**
 * `StorageError` — why a storage adapter could not read or write, as a code a host can act on.
 *
 * An adapter throws one for anything that is not a version conflict (a conflict on `write` is the
 * `{ ok: false, conflict }` result, which carries the other side's text). The editor reads the code to
 * choose what to tell the person: "editing is paused" for `maintenance`, "reload" for `format_changed`,
 * "you're offline" for `network`, and so on, instead of showing every failure as the same generic error.
 *
 *   conflict        the stored file moved on and the adapter has no text to offer (a bare 409)
 *   format_changed  the site was converted or migrated under an open editor: reload, don't overwrite
 *   not-found       the site or file is gone
 *   forbidden       signed out, or no longer allowed to edit
 *   too-large       the save is over the host's size limit
 *   maintenance     the host froze writes on purpose (HTTP 503 `{ error: "maintenance" }`); retry later, keep the draft
 *   network         the server could not be reached, or timed out (offline, 502, 504)
 *   unknown         anything else
 */
export type StorageErrorCode = "conflict" | "format_changed" | "not-found" | "forbidden" | "too-large" | "maintenance" | "network" | "unknown";

export const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = ["conflict", "format_changed", "not-found", "forbidden", "too-large", "maintenance", "network", "unknown"];

export class StorageError extends Error {
  override name = "StorageError";
  /** The HTTP status behind it, when there was one. */
  readonly status?: number;
  /** A message the host wants shown to the person (e.g. the maintenance notice), as opposed to `message`, which is for logs. */
  readonly detail?: string;
  constructor(readonly code: StorageErrorCode, message?: string, opts: { status?: number; detail?: string; cause?: unknown } = {}) {
    super(message ?? code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.status = opts.status;
    this.detail = opts.detail;
  }
  /** Worth retrying later without changing anything. */
  get retryable(): boolean {
    return this.code === "network" || this.code === "maintenance";
  }
}

/** True for a `StorageError` even across duplicated copies of the package. */
export function isStorageError(e: unknown): e is StorageError {
  return e instanceof StorageError || (e instanceof Error && e.name === "StorageError" && STORAGE_ERROR_CODES.includes((e as StorageError).code));
}

/**
 * The `StorageError` for an HTTP answer, for adapters over a web API. `body` is the parsed JSON when
 * there was any. Rules: 409 `{ error: "site_format_changed" }` → `format_changed`, other 409 → `conflict`;
 * 503 `{ error: "maintenance" }` → `maintenance` (its `message` becomes `detail`); 401/403 → `forbidden`;
 * 404 → `not-found`; 413 → `too-large`; 408/502/503/504 → `network`.
 */
export function storageErrorFromResponse(status: number, body?: unknown, what = "request"): StorageError {
  const o = body && typeof body === "object" ? (body as { error?: unknown; message?: unknown }) : {};
  const tag = typeof o.error === "string" ? o.error : "";
  const detail = typeof o.message === "string" ? o.message : undefined;
  const make = (code: StorageErrorCode) => new StorageError(code, `${what}: ${status}${tag ? ` ${tag}` : ""}`, { status, detail });
  if (status === 409) return make(tag === "site_format_changed" ? "format_changed" : "conflict");
  if (status === 503 && tag === "maintenance") return make("maintenance");
  if (status === 401 || status === 403) return make("forbidden");
  if (status === 404) return make("not-found");
  if (status === 413) return make("too-large");
  if (status === 408 || status === 502 || status === 503 || status === 504) return make("network");
  return make("unknown");
}

/** A `StorageError` for a `fetch` that never got an answer (offline, DNS, timeout, abort). */
export function storageErrorFromNetwork(e: unknown, what = "request"): StorageError {
  const timeout = e instanceof Error && e.name === "TimeoutError";
  return new StorageError("network", timeout ? `${what}: the server did not answer in time` : `${what}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
}
