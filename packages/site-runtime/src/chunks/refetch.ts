import { get, keys, set, subscribe } from "../state-store";

/**
 * `data-refetch="category,page,facet.*"` marks a listing whose rows the server renders from the URL (a storefront
 * grid). When one of those `url:` state keys changes (a filter chip's `data-state-set="url:category:tees"`, a search
 * box's `data-state-bind="url:q"`, a pager's `data-state-step="url:page:1"`), the URL is updated and the same page is
 * fetched with it; every `[data-refetch]` region is swapped in place by `id`, so the page never reloads and the browser
 * history isn't spammed. `facet.*` stands for every `url:facet.<key>` selection.
 *
 * `data-state-seed="key=value;…"` (on the listing, rendered with its rows) writes the totals pagination reads
 * (`{{state.<key>}}`) when the region appears, and again after each swap.
 */
const regions = new Set<Element>();
let last = "";
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: AbortController | null = null;
let watching = false;

const isEdit = (el: Element) => el.ownerDocument.documentElement.hasAttribute("data-ph-edit");

/** The URL params the live regions follow. */
function params(): string[] {
  const out = new Set<string>();
  for (const el of regions) {
    if (!el.isConnected) {
      regions.delete(el);
      continue;
    }
    for (const p of (el.getAttribute("data-refetch") || "").split(",").map((s) => s.trim()).filter(Boolean)) {
      if (p !== "facet.*") out.add(p);
      else for (const k of keys()) if (k.startsWith("url:facet.")) out.add(k.slice(4));
    }
  }
  return [...out].sort();
}

const snapshot = () => params().map((p) => `${p}=${get("url:" + p) ?? ""}`).join("&");

function seed(el: Element) {
  for (const pair of (el.getAttribute("data-state-seed") || "").split(";")) {
    const at = pair.indexOf("=");
    if (at > 0) set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

async function refetch(doc: Document) {
  const win = doc.defaultView!;
  const url = new URL(win.location.href);
  for (const p of params()) {
    const v = get("url:" + p);
    v ? url.searchParams.set(p, v) : url.searchParams.delete(p);
  }
  win.history.replaceState(win.history.state, "", url);
  inflight?.abort();
  const ctrl = (inflight = new AbortController());
  try {
    const res = await fetch(url.href, { headers: { accept: "text/html" }, credentials: "same-origin", signal: ctrl.signal });
    if (!res.ok || ctrl.signal.aborted) return;
    const next = new DOMParser().parseFromString(await res.text(), "text/html");
    if (ctrl.signal.aborted) return;
    for (const el of [...doc.querySelectorAll("[data-refetch][id]")]) {
      const fresh = next.getElementById(el.id);
      if (fresh) el.replaceWith(doc.importNode(fresh, true)); // the core mounts the new nodes, which seeds them
    }
  } catch {
    /* aborted by a newer change, or offline: the rows on screen stay */
  }
}

export function mount(el: Element) {
  if (isEdit(el)) return seed(el);
  // Registered (and the snapshot taken) before the seed writes, so the seed itself never reads as a change.
  regions.add(el);
  last = snapshot();
  seed(el);
  if (watching) return;
  watching = true;
  const doc = el.ownerDocument;
  subscribe(() => {
    const now = snapshot();
    if (now === last) return;
    last = now;
    if (!regions.size) return; // every listing left the page: nothing to refetch
    clearTimeout(timer);
    timer = setTimeout(() => void refetch(doc), 150);
  });
}
