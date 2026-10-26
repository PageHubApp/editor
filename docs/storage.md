# Storage adapters

The editor never touches a disk or a database. It reads and writes files through a **storage adapter**, so the same editor can sit on a folder, a git repo, a CMS or your own API. This guide covers the contract, the error codes, and a worked adapter over HTTP.

Two adapters come with the engine:

| Adapter | Import | Use it for |
|---|---|---|
| `memoryStorage(files)` | `@pagehub/engine` | Tests, demos, a sample site kept in the browser |
| `fsStorage({ root })` | `@pagehub/engine/fs` | A folder on disk (Node only). Writes go to a temp file, then a rename |

The browser-side `httpStorage` in `@pagehub/dev-server/client` talks to the dev server's file API. You can read it as a second example.

## The contract

Build one with `defineStorage`:

```ts
import { defineStorage } from "@pagehub/engine";

const storage = defineStorage({
  id: "my-store",
  list: async () => ["index.html", "about.html"],
  read: async (path) => ({ text: "...", version: "7" }), // or null when the file doesn't exist
  write: async (path, text, { baseVersion }) => ({ ok: true, version: "8" }),
});
```

| Member | Required | What it does |
|---|---|---|
| `list()` | yes | Every site file path, POSIX style, relative to the site root. |
| `read(path)` | yes | `{ text, version }`, or `null` when the file doesn't exist. `version` is any string that changes when the file does (a counter, an etag, a hash). |
| `write(path, text, { baseVersion })` | yes | Saves the file. `baseVersion` is the version the edit started from, or `null` when the file must not exist yet. |
| `writeBatch(changes, { baseVersions })` | no | Saves several files as one atomic write. When present, the editor makes one call per save. |
| `watch(onChange)` | no | Calls `onChange(path)` when someone else changes a file. Returns an unsubscribe function. The editor merges the change in, or flags a conflict if you have unsaved edits to the same file. |
| `editIds(exceptPath?)` | no | Every `data-edit-id` in the site, for persisted identity. |

### Conflicts are results, not exceptions

`write` must never overwrite a file that moved on. If the stored version differs from `baseVersion`, return the other side's text and write nothing:

```ts
return { ok: false, conflict: { theirs: currentText, version: currentVersion } };
```

The editor shows its conflict banner (Reload theirs / Keep mine). On "Keep mine" it saves again against the new version.

### Batches are all or nothing

`writeBatch(changes, { baseVersions })` takes `changes` as `{ path, text } | { path, delete: true }`, and `baseVersions[path]` as the version each edit was based on (`null` means the file must not exist).

- If every base matches, apply all the changes and return `{ ok: true, versions }`, with the new version of each written file.
- If any base is stale, apply nothing and return `{ ok: false, conflicts: [{ path, theirs, version }] }`, listing every stale path.

`memoryStorage` and `fsStorage` both implement it.

## Errors

For any failure that isn't a version conflict, **throw a `StorageError`**. The editor turns the code into words the person can act on, instead of one generic failure.

| `code` | Meaning | Typical HTTP | The editor tells the person |
|---|---|---|---|
| `conflict` | The file moved on and you have no text to offer | 409 | The file changed elsewhere. |
| `format_changed` | The site was converted under an open editor | 409 `{ error: "site_format_changed" }` | Reload the page; don't overwrite. |
| `not-found` | The site or file is gone | 404 | Says it's gone. |
| `forbidden` | Signed out, or no longer allowed to edit | 401, 403 | Says they can't save. |
| `too-large` | The save is over your limit | 413 | Says it's too large. |
| `maintenance` | You froze writes on purpose | 503 `{ error: "maintenance", message }` | Editing is paused (shows `message`), keeps the draft, offers Try again. |
| `network` | No answer: offline, timeout, bad gateway | 408, 502, 503, 504, or none | Can't reach the server, with Try again. |
| `unknown` | Anything else | | A generic failure. |

`error.retryable` is true for `network` and `maintenance`. Only retryable errors get **Try again**.

Helpers so you don't map statuses yourself:

- `storageErrorFromResponse(status, body, what)` makes the right `StorageError` from an HTTP answer. `body.message` becomes `error.detail`, which the editor shows as written.
- `storageErrorFromNetwork(error, what)` makes one from a failed `fetch`.
- `isStorageError(value)` narrows an unknown error, even across duplicate copies of the package.

## A worked adapter

A storage over a JSON API. It sends the base version with each write and treats a 409 that carries the current file as a conflict result:

```ts
import {
  defineStorage,
  storageErrorFromNetwork,
  storageErrorFromResponse,
} from "@pagehub/engine";

export function apiStorage(base: string, siteId: string) {
  const url = (path: string) => `${base}/sites/${siteId}/files/${encodeURIComponent(path)}`;

  async function call(what: string, input: string, init?: RequestInit) {
    let res: Response;
    try {
      res = await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw storageErrorFromNetwork(e, what);
    }
    return res;
  }

  return defineStorage({
    id: `api:${siteId}`,

    async list() {
      const res = await call("list", `${base}/sites/${siteId}/files`);
      if (!res.ok) throw storageErrorFromResponse(res.status, await res.json().catch(() => null), "list");
      return (await res.json()) as string[];
    },

    async read(path) {
      const res = await call(`read ${path}`, url(path));
      if (res.status === 404) return null;
      if (!res.ok) throw storageErrorFromResponse(res.status, await res.json().catch(() => null), `read ${path}`);
      return (await res.json()) as { text: string; version: string };
    },

    async write(path, text, { baseVersion }) {
      const res = await call(`write ${path}`, url(path), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, baseVersion }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) return { ok: true, version: (body as { version: string }).version };
      // The server sends the file's current text with a 409: that's a conflict result, not a failure.
      if (res.status === 409 && body && typeof body.theirs === "string") {
        return { ok: false, conflict: { theirs: body.theirs, version: body.version } };
      }
      throw storageErrorFromResponse(res.status, body, `write ${path}`);
    },
  });
}
```

Hand it to the editor:

```tsx
<Editor storage={apiStorage("/api", "site-1")} />
```

## Hooks before a write

`prepareWrite` hooks run on each changed file just before it's written. A rule that reports an error blocks the save, and a sanitizing fix can rewrite the text. Content mode (the `client` role) and persisted identity use this internally. You normally don't need it in an adapter.

## Test your adapter

Open an editor over your adapter with `createEditor({ storage })` and call `editor.save()`. The result is `{ ok, written, conflicts, blocked }`: a clean editor writes nothing, an edited file shows up in `written`, and a stale `baseVersion` shows up in `conflicts` with nothing overwritten.
