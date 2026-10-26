/**
 * `{% map %}` output: `<div data-map="<JSON>">` holding `<address data-pin="lat,lng">` pins and
 * `<span data-route="lat,lng; lat,lng [dashed] [color x] [weight n]">label</span>` routes.
 * Without JS the children are a readable list. With JS they are hidden and a Leaflet map takes
 * their place. Leaflet loads from `cfg.map.leaflet` (or unpkg) only once the map nears the viewport.
 */
import type { RuntimeConfig } from "../config";
import { LEAFLET } from "../leaflet";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** `{% map tiles: 'osm' %}` names the default OpenStreetMap tiles; any other value is a tile URL template. */
const TILE_PRESETS: Record<string, string> = { osm: TILES };
const ATTRIBUTION = "&copy; OpenStreetMap contributors";

type LatLng = [number, number];
/** The slice of Leaflet this file uses. */
interface Leaflet {
  map(el: HTMLElement, o?: object): LMap;
  tileLayer(url: string, o?: object): { addTo(m: LMap): unknown };
  marker(p: LatLng, o?: object): { addTo(m: LMap): { bindPopup(c: HTMLElement): unknown } };
  polyline(p: LatLng[], o?: object): { addTo(m: LMap): unknown };
  circleMarker(p: LatLng, o?: object): { addTo(m: LMap): { bindTooltip(content: string, o?: object): unknown } };
  tooltip(o?: object): { setLatLng(p: LatLng): { setContent(s: string): { addTo(m: LMap): unknown } } };
  latLngBounds(p: LatLng[]): unknown;
  Icon: { Default: { imagePath?: string } };
}
interface LMap {
  setView(c: LatLng, z: number): unknown;
  fitBounds(b: unknown, o?: object): unknown;
  scrollWheelZoom: { enable(): void };
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\s*(${NUM})\s*,\s*(${NUM})\s*(.*)$`);
const inRange = (p: LatLng) => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

export function parsePin(value: string): LatLng | null {
  const m = PAIR.exec(value);
  const p: LatLng | null = m ? [Number(m[1]), Number(m[2])] : null;
  return p && !m![3] && inRange(p) ? p : null;
}

export interface Route {
  points: LatLng[];
  dashed: boolean;
  color?: string;
  weight?: number;
  opacity?: number;
  /** Step badges: the third field of a `data-path` line (`lat,lng,1`), by point index. Only set when a line has one. */
  labels?: (string | undefined)[];
}
export function parseRoute(value: string): Route | null {
  const points: LatLng[] = [];
  let rest = "";
  for (const part of value.split(";")) {
    const m = PAIR.exec(part);
    if (!m) return null;
    const p: LatLng = [Number(m[1]), Number(m[2])];
    if (!inRange(p)) return null;
    points.push(p);
    rest += " " + m[3];
  }
  if (points.length < 2) return null;
  const route: Route = { points, dashed: false };
  const words = rest.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "dashed") route.dashed = true;
    else if (words[i] === "color" && words[i + 1]) route.color = words[++i];
    else if (words[i] === "weight" && Number(words[i + 1]) > 0) route.weight = Number(words[++i]);
  }
  return route;
}

/** The point halfway along the path's length. */
function midpoint(points: LatLng[]): LatLng {
  const len = (a: LatLng, b: LatLng) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let half = points.slice(1).reduce((n, p, i) => n + len(points[i]!, p), 0) / 2;
  for (let i = 1; i < points.length; i++) {
    const d = len(points[i - 1]!, points[i]!);
    if (half <= d) {
      const f = d ? half / d : 0;
      return [points[i - 1]![0] + (points[i]![0] - points[i - 1]![0]) * f, points[i - 1]![1] + (points[i]![1] - points[i - 1]![1]) * f];
    }
    half -= d;
  }
  return points.at(-1)!;
}

/** A pin from either the compound `data-pin="lat,lng"` or the separate `data-lat`/`data-lng`. */
export function readPoint(el: Element): LatLng | null {
  const lat = el.getAttribute("data-lat");
  const lng = el.getAttribute("data-lng");
  if (lat !== null && lng !== null) {
    const p: LatLng = [Number(lat), Number(lng)];
    return Number.isFinite(p[0]) && Number.isFinite(p[1]) && inRange(p) ? p : null;
  }
  return parsePin(el.getAttribute("data-pin") ?? "");
}

/** A route from either the compound `data-route` or `data-path` + `data-color`/`-weight`/`-opacity`/`-dashed`. */
export function readRoute(el: Element): Route | null {
  const path = el.getAttribute("data-path");
  if (path === null) return parseRoute(el.getAttribute("data-route") ?? "");
  const points: LatLng[] = [];
  const labels: (string | undefined)[] = [];
  for (const part of path.split(/[\n;]/)) {
    const s = part.trim();
    if (!s) continue;
    const m = PAIR.exec(s);
    // A line is `lat,lng` with an optional `,label` third field (a step badge drawn at that waypoint).
    if (!m || (m[3] && !m[3].startsWith(","))) return null;
    const p: LatLng = [Number(m[1]), Number(m[2])];
    if (!inRange(p)) return null;
    points.push(p);
    labels.push(m[3]?.slice(1).trim() || undefined);
  }
  if (points.length < 2) return null;
  const color = el.getAttribute("data-color");
  const weight = Number(el.getAttribute("data-weight"));
  const opacity = Number(el.getAttribute("data-opacity"));
  const dashedAttr = el.getAttribute("data-dashed");
  const route: Route = { points, dashed: dashedAttr !== null && dashedAttr !== "false" };
  if (labels.some(Boolean)) route.labels = labels;
  if (color) route.color = color;
  if (weight > 0) route.weight = weight;
  if (el.getAttribute("data-opacity") !== null && Number.isFinite(opacity)) route.opacity = opacity;
  return route;
}

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** First `<strong>` or heading is the popup title; the rest of the text is the description. */
export function pinContent(el: Element): { title: string; description: string } {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  const head = clone.querySelector("strong, h1, h2, h3, h4, h5, h6");
  const title = head ? text(head) : "";
  head?.remove();
  return { title, description: text(clone) };
}

let leaflet: Promise<Leaflet> | undefined;
function loadLeaflet(doc: Document, cfg: RuntimeConfig): Promise<Leaflet> {
  const src = cfg.map?.leaflet;
  const win = doc.defaultView as (Window & { L?: Leaflet }) | null;
  if (src?.lib) return Promise.resolve(src.lib as Leaflet);
  if (win?.L) return Promise.resolve(win.L);
  return (leaflet ??= fetchLeaflet(doc, cfg, win).catch((e) => ((leaflet = undefined), Promise.reject(e))));
}

function fetchLeaflet(doc: Document, cfg: RuntimeConfig, win: (Window & { L?: Leaflet }) | null): Promise<Leaflet> {
  const src = cfg.map?.leaflet;
  const cssHref = src?.css ?? LEAFLET.css;
  // Leaflet finds its pin images by reading its stylesheet off a probe element. If the script runs before the
  // stylesheet applies, it builds a broken path (`…/distmarker-icon.png`) and every pin is a broken image. So wait
  // for both, and name the folder outright: `images/` beside the stylesheet.
  const css = new Promise<void>((resolve) => {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    link.onload = link.onerror = () => resolve();
    doc.head.append(link);
  });
  const js = new Promise<Leaflet>((resolve, reject) => {
    const script = doc.createElement("script");
    if (cfg.nonce) script.nonce = cfg.nonce;
    script.src = src?.js ?? LEAFLET.js;
    script.onload = () => (win?.L ? resolve(win.L) : reject(new Error("Leaflet did not load")));
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    doc.head.append(script);
  });
  return Promise.all([js, css]).then(([L]) => {
    L.Icon.Default.imagePath ??= new URL("images/", new URL(cssHref, doc.baseURI)).href;
    return L;
  });
}

/** A step badge is a bare number on its circle: drop Leaflet's tooltip box and arrow. */
function badgeStyle(doc: Document) {
  if (doc.getElementById("ph-map-step-badge")) return;
  const style = doc.createElement("style");
  style.id = "ph-map-step-badge";
  style.textContent = ".ph-map-step-badge{background:transparent;border:0;box-shadow:none;color:#fff;font:700 11px/1 system-ui,sans-serif;padding:0}.ph-map-step-badge::before{display:none}";
  doc.head.append(style);
}

function build(L: Leaflet, el: HTMLElement, cfg: RuntimeConfig, conf: Record<string, unknown>) {
  const doc = el.ownerDocument;
  const pins = [...el.querySelectorAll("[data-pin], [data-lat]")].flatMap((p) => {
    const at = readPoint(p);
    return at ? [{ at, ...pinContent(p) }] : [];
  });
  const routes = [...el.querySelectorAll("[data-route], [data-path]")].flatMap((r) => {
    const route = readRoute(r);
    return route ? [{ route, label: text(r) }] : [];
  });
  const source = doc.createElement("div");
  source.hidden = true;
  source.append(...el.childNodes);
  const canvas = doc.createElement("div");
  canvas.setAttribute("role", "region");
  canvas.setAttribute("aria-label", "Map");
  // The container owns the size (h-*, aspect-*, absolute inset-0, ...): the canvas fills it. Only a
  // container that collapsed to nothing (no author height) gets a default so the map is visible.
  el.append(source);
  const view = doc.defaultView;
  if (el.offsetHeight < 50) el.style.minHeight = "24rem";
  if (view && view.getComputedStyle(el).position === "static") el.style.position = "relative";
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  el.append(canvas);

  const center: LatLng = [Number(conf.lat), Number(conf.lng)];
  const map = L.map(canvas, { scrollWheelZoom: false });
  const tiles = (typeof conf.tiles === "string" && TILE_PRESETS[conf.tiles]) || String(conf.tiles ?? cfg.map?.tiles ?? TILES);
  L.tileLayer(tiles, { attribution: String(conf.attribution ?? cfg.map?.attribution ?? ATTRIBUTION), maxZoom: 19 }).addTo(map);
  // Grey-toned tiles ({% map grayscale: true %}) — filter the tile pane only, so markers stay in colour.
  if (conf.grayscale) {
    const pane = canvas.querySelector<HTMLElement>(".leaflet-tile-pane");
    if (pane) pane.style.filter = "grayscale(1)";
  }
  for (const p of pins) {
    const popup = doc.createElement("div");
    if (p.title) popup.append(Object.assign(doc.createElement("strong"), { textContent: p.title }));
    if (p.title && p.description) popup.append(doc.createElement("br"));
    if (p.description) popup.append(doc.createTextNode(p.description));
    L.marker(p.at, { title: p.title || undefined }).addTo(map).bindPopup(popup);
  }
  if (routes.some((r) => r.route.labels)) badgeStyle(doc);
  for (const { route, label } of routes) {
    L.polyline(route.points, { color: route.color ?? "#2563eb", weight: route.weight ?? 4, ...(route.opacity !== undefined ? { opacity: route.opacity } : {}), dashArray: route.dashed ? "8 8" : undefined }).addTo(map);
    if (label) L.tooltip({ permanent: true, direction: "center", opacity: 0.9 }).setLatLng(midpoint(route.points)).setContent(label).addTo(map);
    route.labels?.forEach((badge, i) => {
      if (!badge) return;
      L.circleMarker(route.points[i]!, { radius: 11, color: "#fff", weight: 2, fillColor: route.color ?? "#2563eb", fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(badge, { permanent: true, direction: "center", className: "ph-map-step-badge" });
    });
  }
  const all = [...pins.map((p) => p.at), ...routes.flatMap((r) => r.route.points)];
  if (conf.zoom == null && all.length) map.fitBounds(L.latLngBounds([center, ...all]), { padding: [24, 24], maxZoom: 16 });
  else map.setView(center, Number(conf.zoom ?? 13));
  canvas.addEventListener("click", () => map.scrollWheelZoom.enable(), { once: true });
}

export function mount(el: Element, cfg: RuntimeConfig) {
  const host = el as HTMLElement;
  let conf: Record<string, unknown>;
  try {
    conf = JSON.parse(host.getAttribute("data-map") || "");
  } catch {
    return;
  }
  if (!Number.isFinite(Number(conf.lat)) || !Number.isFinite(Number(conf.lng)) || !inRange([Number(conf.lat), Number(conf.lng)])) return;
  const start = () => loadLeaflet(host.ownerDocument, cfg).then((L) => build(L, host, cfg, conf), () => {});
  const IO = host.ownerDocument.defaultView?.IntersectionObserver;
  if (!IO) return void start();
  const io = new IO((entries) => {
    if (entries.some((e) => e.isIntersecting)) (io.disconnect(), void start());
  }, { rootMargin: "300px" });
  io.observe(host);
}
