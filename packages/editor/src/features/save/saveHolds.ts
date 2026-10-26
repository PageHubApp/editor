/**
 * What autosave must wait for. A gesture in flight (a drag, a resize, an IME composition) holds saving until it
 * ends; text typed in a rich-text session sits in a buffer until it commits, so a leave-flush asks the buffers to
 * commit first. Page-wide on purpose: one editor is active at a time and the primitives that start gestures
 * (`useDragGesture`, the rich-text session) have no store to hold against.
 */
let held = 0;
const committers = new Set<() => void>();

/** Hold autosave until the returned function is called (call it once; later calls do nothing). */
export function holdAutosave(): () => void {
  held++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held--;
  };
}

export const autosaveHeld = (): boolean => held > 0;

/** A buffer of uncommitted edits (typed text): autosave asks it to commit before a leave-flush. Returns the unregister. */
export function registerPendingCommit(commit: () => void): () => void {
  committers.add(commit);
  return () => void committers.delete(commit);
}

export function commitPending(): void {
  for (const c of [...committers]) c();
}
