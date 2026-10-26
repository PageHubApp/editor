/**
 * Per-browser chrome preferences (panel sizes, accordion state, pins). Every read and write is
 * guarded: storage can be missing, full or blocked, and the chrome must work without it.
 */
const PREFIX = "pagehub-editor:";

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // preferences are best-effort
  }
}
