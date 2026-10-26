interface Overlay {
  key: object;
  close(): void;
}
const stacks = new WeakMap<Document, Overlay[]>();

function stackOf(doc: Document): Overlay[] {
  let s = stacks.get(doc);
  if (!s) {
    const list: Overlay[] = [];
    // Escape closes the most recently opened overlay, one per press. Off in the editing canvas.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || doc.documentElement.hasAttribute("data-ph-edit")) return;
      list[list.length - 1]?.close();
    };
    doc.addEventListener("keydown", onKey);
    s = list;
    stacks.set(doc, s);
  }
  return s;
}

/** Puts an open overlay on top of the document's Escape stack (a repeat call moves it to the top). `key` identifies it for `untrackOverlay`. */
export function trackOverlay(doc: Document, key: object, close: () => void): void {
  const list = stackOf(doc);
  const i = list.findIndex((o) => o.key === key);
  if (i >= 0) list.splice(i, 1);
  list.push({ key, close });
}

export function untrackOverlay(doc: Document, key: object): void {
  const s = stacks.get(doc);
  const i = s ? s.findIndex((o) => o.key === key) : -1;
  if (s && i >= 0) s.splice(i, 1);
}
