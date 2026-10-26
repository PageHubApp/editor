import { CHUNK_SELECTORS, loadChunk, type ChunkModule, type ChunkName } from "./chunks";
import { readConfig, type RuntimeConfig } from "./config";
import { attributionSubmit, captureAttribution } from "./core/attribution";
import { autosubmitChange, autosubmitInput } from "./core/autosubmit";
import { closedbyClick } from "./core/closedby";
import { copyClick } from "./core/copy";
import { dismissClick, dismissScan } from "./core/dismiss";
import { prefetchOnIntent } from "./core/prefetch";
import { hub } from "./hub";
import { themeClick } from "./core/themeToggle";

/**
 * `data-ph-edit` on the root = the editing canvas: render chunks (map, carousel, state visibility, animate…)
 * still mount, but author behaviour — `data-on` JS, form submission, tracking, chat, and the delegated
 * click actions (copy / dismiss / theme / closedby) — stays off so a click selects instead of acting.
 */
const EDIT_SKIP = new Set<ChunkName>(["on", "form", "track", "chat", "actions", "lightbox"]);

const NAMES = Object.keys(CHUNK_SELECTORS) as ChunkName[];

/**
 * Wires the page: five inline behaviours through one delegated listener per event type, lazy chunks
 * for the rest (requested once, the first time their attribute is seen), and a MutationObserver
 * for nodes added later. A second call on the same document is a no-op. Returns a function that detaches everything.
 */
export function start(doc: Document = document, config: RuntimeConfig = readConfig(doc)): () => void {
  const root = doc.documentElement;
  if (root.hasAttribute("data-runtime")) return () => {};
  root.setAttribute("data-runtime", "");
  const win = doc.defaultView;
  if (win) hub(win);
  const mounted = new Map<ChunkName, WeakSet<Element>>();
  const ready = new Map<ChunkName, Promise<ChunkModule | null>>();

  const needs = (name: ChunkName) =>
    name !== "invokers" || !win || !("commandForElement" in win.HTMLButtonElement.prototype);

  const editing = () => root.hasAttribute("data-ph-edit");

  function chunk(name: ChunkName): Promise<ChunkModule | null> {
    let p = ready.get(name);
    if (!p) {
      p = loadChunk(name, config.chunkBase).then(
        async (m) => (await m.init?.(doc, config), m),
        () => {
          // A failed chunk must not leave content hidden by the animate stylesheet.
          if (name === "animate") doc.querySelectorAll("[data-animate]").forEach((el) => el.setAttribute("data-animated", ""));
          return null;
        },
      );
      ready.set(name, p);
    }
    return p;
  }

  function scan(node: ParentNode) {
    dismissScan(node, win);
    for (const name of NAMES) {
      if (!needs(name) || (EDIT_SKIP.has(name) && editing())) continue;
      const sel = CHUNK_SELECTORS[name];
      const els = [...node.querySelectorAll(sel)];
      if ((node as Element).matches?.(sel)) els.push(node as Element);
      if (!els.length) continue;
      chunk(name).then((m) => {
        if (!m?.mount) return;
        const seen = mounted.get(name) ?? mounted.set(name, new WeakSet()).get(name)!;
        for (const el of els) if (!seen.has(el)) (seen.add(el), m.mount(el, config));
      });
    }
  }

  const ac = new AbortController();
  const { signal } = ac;
  doc.addEventListener(
    "click",
    (e) => {
      if (editing()) return;
      copyClick(e);
      dismissClick(e);
      themeClick(e);
      closedbyClick(e as MouseEvent);
    },
    { signal },
  );
  prefetchOnIntent(doc, signal, editing);
  doc.addEventListener("change", autosubmitChange, { signal });
  if (!editing()) {
    captureAttribution(doc);
    doc.addEventListener("submit", attributionSubmit, { capture: true, signal });
  }
  doc.addEventListener("input", autosubmitInput, { signal });
  let mo: MutationObserver | undefined;

  const run = () => {
    scan(doc);
    if (win?.MutationObserver) {
      mo = new win.MutationObserver((ms) => {
        for (const m of ms) m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element));
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
    }
  };
  doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", run, { once: true, signal }) : run();
  return () => {
    ac.abort();
    mo?.disconnect();
    root.removeAttribute("data-runtime");
  };
}
