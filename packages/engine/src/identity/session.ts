/**
 * Session identity (the default): handles live in memory and follow edits through
 * each transaction's mapping; nothing is written into source and `handle.id()` is null.
 * Persisted identity (`data-edit-id`) implements the same interface.
 */
import type { NodeHandle } from "../state/handles";

export interface Identity {
  readonly mode: "session" | "persisted";
  id(handle: NodeHandle): string | null;
}

export const sessionIdentity: Identity = {
  mode: "session",
  id: () => null,
};
