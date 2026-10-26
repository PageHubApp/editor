/** Storage for the built-in sample: memory storage that persists every write to the browser's localStorage. */
import { memoryStorage, type StorageDef } from "@pagehub/engine";
import { SAMPLE_FILES } from "./sample.ts";

const KEY = "pagehub-editor:sample";

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* unreadable: start from the sample */
  }
  return { ...SAMPLE_FILES };
}

export function resetSample() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function localSampleStorage(): StorageDef {
  const memory = memoryStorage(load());
  return {
    ...memory,
    async write(...args: Parameters<typeof memory.write>) {
      const result = await memory.write(...args);
      if (result.ok) {
        try {
          localStorage.setItem(KEY, JSON.stringify(memory.snapshot()));
        } catch {
          /* quota or private mode: the edit stays in this tab only */
        }
      }
      return result;
    },
  };
}
