// The DOM flags and cursor-following preview a drag stamps while it runs.
/**
 * What a drag stamps while it runs. On the canvas document: `data-dragging` on the source's
 * renderings (CSS turns them into a flat tile unless copying), `body[data-is-dragging]`,
 * `body[data-dragging-type]` (a section drag outlines pages, headers and footers),
 * `body[data-ph-drag-copy]` in copy mode. The preview — a clone of the source that follows the
 * pointer — lives in the HOST document, not the canvas: the canvas is a scaled iframe, so a
 * `position: fixed` clone inside it floats at the wrong scale and place; the host overlay is where
 * every other drag chrome (bar, ghost, parent outline) already sits. The preview is opacity .88,
 * 1px dashed accent, radius 4, scale .96, grabbed at the press point (so that point stays under
 * the cursor), and sized to the source on screen. Everything is removed on end.
 */
export const PREVIEW_ID = "ph-drag-preview";

export function setDragFlags(doc: Document, els: readonly HTMLElement[], type: string): void {
  for (const el of els) el.setAttribute("data-dragging", "true");
  doc.body?.setAttribute("data-is-dragging", "true");
  doc.body?.setAttribute("data-dragging-type", type);
}

export function setCopyFlag(doc: Document, copy: boolean): void {
  doc.body?.toggleAttribute("data-ph-drag-copy", copy);
}

/** Remove the canvas-document flags (the preview is in the host document; clear it with `clearPreview`). */
export function clearDragFlags(doc: Document): void {
  for (const el of doc.querySelectorAll("[data-dragging]")) el.removeAttribute("data-dragging");
  for (const a of ["data-is-dragging", "data-dragging-type", "data-ph-drag-copy"]) doc.body?.removeAttribute(a);
}

interface PreviewOptions {
  /** On-screen (host px) size of the clone — the source as it appears in the canvas. */
  width: number;
  height: number;
  /** Canvas px → host px (the canvas zoom); 1 when `el` is already a host-document element (a panel tile). */
  scale: number;
  /** Where inside the clone the pointer grabbed it (host px), so that point tracks the cursor. */
  grabX: number;
  grabY: number;
}

/**
 * A fixed clone of `el` appended to `hostDoc` (opacity .88, 1px dashed accent, radius 4, scaled to
 * .96 about the grab point). The clone keeps the source's own size (`width/scale`) and is scaled by
 * `scale` so it paints at the on-screen size — a canvas element stays as large as it looks in the
 * scaled iframe, a panel tile stays 1:1.
 */
export function showPreview(hostDoc: Document, el: HTMLElement, opts: PreviewOptions): HTMLElement {
  clearPreview(hostDoc);
  const scale = opts.scale || 1;
  const box = hostDoc.createElement("div");
  box.id = PREVIEW_ID;
  box.setAttribute("aria-hidden", "true");
  box.dataset.grabX = String(opts.grabX);
  box.dataset.grabY = String(opts.grabY);
  Object.assign(box.style, {
    position: "fixed", left: "0px", top: "0px", width: `${opts.width}px`, height: `${opts.height}px`, zIndex: "2147483647",
    pointerEvents: "none", opacity: "0.88", border: "1px dashed rgb(59 130 246)", borderRadius: "4px", overflow: "hidden",
    transform: "scale(0.96)", transition: "transform 0.18s ease, opacity 0.15s ease", transformOrigin: `${opts.grabX}px ${opts.grabY}px`,
  });
  // `importNode` (not `cloneNode` + append) so a canvas-iframe element adopts into the host document.
  const clone = hostDoc.importNode(el, true) as HTMLElement;
  clone.removeAttribute("data-dragging");
  clone.removeAttribute("data-selected");
  if (scale !== 1) Object.assign(clone.style, { width: `${opts.width / scale}px`, height: `${opts.height / scale}px`, transform: `scale(${scale})`, transformOrigin: "top left" });
  box.appendChild(clone);
  hostDoc.body?.appendChild(box);
  return box;
}

/** Follow the pointer (host client coordinates), keeping the grab point under the cursor. */
export function movePreview(hostDoc: Document, x: number, y: number): void {
  const box = hostDoc.getElementById(PREVIEW_ID);
  if (!box) return;
  const num = (v: string | undefined, fallback: number) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
  box.style.left = `${x - num(box.dataset.grabX, box.offsetWidth / 2)}px`;
  box.style.top = `${y - num(box.dataset.grabY, box.offsetHeight / 2)}px`;
}

export function clearPreview(hostDoc: Document): void {
  hostDoc.getElementById(PREVIEW_ID)?.remove();
}
