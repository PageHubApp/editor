import { resetDom, tick } from "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as map from "../src/chunks/map.ts";
import { CHUNK_SELECTORS } from "../src/chunks.ts";

const cfg = { chunkBase: "/c/" };
const win = window as any;

/** A Leaflet stand-in that records what it was asked to draw. */
function stubLeaflet() {
  const log: { maps: any[]; markers: any[]; lines: any[]; tips: any[]; tiles: any[]; badges: any[] } = { maps: [], markers: [], lines: [], tips: [], tiles: [], badges: [] };
  const L = {
    map: (el: HTMLElement, o: object) => {
      const m: any = { el, o, view: null, bounds: null, scrollWheelZoom: { enable: () => (m.wheel = true) } };
      m.setView = (c: number[], z: number) => (m.view = [c, z]);
      m.fitBounds = (b: unknown) => (m.bounds = b);
      log.maps.push(m);
      return m;
    },
    tileLayer: (url: string, o: object) => ({ addTo: () => log.tiles.push({ url, o }) }),
    marker: (at: number[], o: object) => ({ addTo: () => ({ bindPopup: (c: HTMLElement) => log.markers.push({ at, o, popup: c }) }) }),
    circleMarker: (at: number[], o: object) => ({ addTo: () => ({ bindTooltip: (s: string, t: object) => log.badges.push({ at, s, o, t }) }) }),
    polyline: (points: number[][], o: object) => ({ addTo: () => log.lines.push({ points, o }) }),
    tooltip: (o: object) => ({ setLatLng: (at: number[]) => ({ setContent: (s: string) => ({ addTo: () => log.tips.push({ at, s, o }) }) }) }),
    latLngBounds: (pts: number[][]) => pts,
    Icon: { Default: {} as { imagePath?: string } },
  };
  win.L = L;
  return log;
}
const conf = (o: object) => JSON.stringify(o).replace(/"/g, "&quot;");
const PAGE = (o: object = { lat: 33.8, lng: -118.3, zoom: 12 }) => `<div data-map="${conf(o)}">
  <address data-pin="33.81,-118.31"><strong>Shop</strong> 12 Main St<br>Open daily</address>
  <address data-pin="33.82,-118.32"><h3>Back lot</h3></address>
  <address data-pin="bad">skipped</address>
  <span data-route="33.80,-118.30; 33.81,-118.30; 33.81,-118.31 dashed color #f00 weight 6">Walk from the lot</span>
</div>`;

beforeEach(() => {
  delete win.IntersectionObserver;
  delete win.L;
});
afterEach(() => delete win.L);

describe("map parsing", () => {
  it("pins: lat,lng only, in range", () => {
    assert.deepEqual(map.parsePin("33.8,-118.3"), [33.8, -118.3]);
    assert.deepEqual(map.parsePin(" 1 , 2 "), [1, 2]);
    for (const bad of ["", "x", "1", "1,2,3", "91,0", "0,181", "1,2 dashed"]) assert.equal(map.parsePin(bad), null, bad);
  });
  it("routes: points, then dashed / color / weight", () => {
    assert.deepEqual(map.parseRoute("1,2; 3,4"), { points: [[1, 2], [3, 4]], dashed: false });
    assert.deepEqual(map.parseRoute("1,2; 3,4 dashed color red weight 3"), { points: [[1, 2], [3, 4]], dashed: true, color: "red", weight: 3 });
    assert.equal(map.parseRoute("1,2"), null);
    assert.equal(map.parseRoute("1,2; nope"), null);
    assert.equal(map.parseRoute("1,2; 99,4"), null);
  });
  it("pin text: first strong or heading is the title, the rest the description", () => {
    const d = document.createElement("div");
    d.innerHTML = "<address><strong> Shop </strong> 12 Main St<br>Open  daily</address><address>just text</address>";
    const [a, b] = d.querySelectorAll("address");
    assert.deepEqual(map.pinContent(a!), { title: "Shop", description: "12 Main St Open daily" });
    assert.deepEqual(map.pinContent(b!), { title: "", description: "just text" });
  });
});

describe("map separate-attribute convention (inspector-authored pins / routes)", () => {
  const pointEl = (attrs: string) => {
    const d = document.createElement("div");
    d.innerHTML = `<div ${attrs}></div>`;
    return d.firstElementChild!;
  };
  it("reads a pin from data-lat / data-lng, and still from data-pin", () => {
    assert.deepEqual(map.readPoint(pointEl('data-lat="34.05" data-lng="-118.25"')), [34.05, -118.25]);
    assert.deepEqual(map.readPoint(pointEl('data-pin="1,2"')), [1, 2]);
    assert.equal(map.readPoint(pointEl('data-lat="95" data-lng="0"')), null, "out of range");
    assert.equal(map.readPoint(pointEl('data-lat="x" data-lng="0"')), null, "not a number");
  });
  it("reads a route from data-path plus data-color / -weight / -opacity / -dashed, and still from data-route", () => {
    assert.deepEqual(map.readRoute(pointEl('data-path="1,2&#10;3,4" data-color="#f00" data-weight="6" data-opacity="0.5" data-dashed=""')), {
      points: [[1, 2], [3, 4]], dashed: true, color: "#f00", weight: 6, opacity: 0.5,
    });
    assert.deepEqual(map.readRoute(pointEl('data-path="1,2; 3,4"')), { points: [[1, 2], [3, 4]], dashed: false });
    assert.deepEqual(map.readRoute(pointEl('data-route="1,2; 3,4 dashed"')), { points: [[1, 2], [3, 4]], dashed: true });
    assert.equal((map.readRoute(pointEl('data-path="1,2&#10;3,4" data-dashed="false"')) as any).dashed, false);
    assert.equal(map.readRoute(pointEl('data-path="1,2"')), null, "needs 2+ points");
    assert.deepEqual(map.readRoute(pointEl('data-path="1,2,1&#10;3,4&#10;5,6,Turn left, then right"')), {
      points: [[1, 2], [3, 4], [5, 6]], dashed: false, labels: ["1", undefined, "Turn left, then right"],
    }, "a third field is a step badge");
    assert.equal(map.readRoute(pointEl('data-path="1,2 x&#10;3,4"')), null, "junk after the pair is still invalid");
    assert.equal(map.readRoute(pointEl('data-path="1,2&#10;99,4"')), null, "out of range");
  });
});

describe("map chunk", () => {
  it("is selected by [data-map]", () => assert.equal(CHUNK_SELECTORS.map, "[data-map]"));

  it("builds pins and routes authored in the separate-attribute convention", () => {
    resetDom(`<div data-map="${conf({ lat: 34.05, lng: -118.25, zoom: 13, grayscale: true })}">
      <div data-lat="34.05" data-lng="-118.25"><strong>Shop</strong> 12 Main St</div>
      <div data-path="34.05,-118.25&#10;34.06,-118.24" data-color="#2563eb" data-weight="5" data-dashed="" aria-label="Walk">Walk this way</div>
    </div>`);
    const log = stubLeaflet();
    map.mount(document.querySelector<HTMLElement>("[data-map]")!, cfg);
    return tick().then(() => {
      assert.equal(log.markers.length, 1);
      assert.deepEqual(log.markers[0].at, [34.05, -118.25]);
      assert.equal(log.markers[0].popup.querySelector("strong").textContent, "Shop");
      assert.equal(log.lines.length, 1);
      assert.deepEqual(log.lines[0].points, [[34.05, -118.25], [34.06, -118.24]]);
      assert.equal(log.lines[0].o.color, "#2563eb");
      assert.equal(log.lines[0].o.weight, 5);
      assert.equal(log.lines[0].o.dashArray, "8 8");
      assert.equal(log.tips[0].s, "Walk this way");
    });
  });

  it("builds the map from the config, pins and routes; children are kept hidden, not removed", () => {
    resetDom(PAGE());
    const log = stubLeaflet();
    const el = document.querySelector<HTMLElement>("[data-map]")!;
    map.mount(el, cfg);
    return tick().then(() => {
      const m = log.maps[0];
      assert.deepEqual(m.view, [[33.8, -118.3], 12]);
      assert.equal(log.tiles[0].url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
      assert.equal(log.markers.length, 2, "the bad pin is skipped");
      assert.deepEqual(log.markers[0].at, [33.81, -118.31]);
      assert.equal(log.markers[0].popup.querySelector("strong").textContent, "Shop");
      assert.equal(log.markers[0].popup.textContent, "Shop12 Main St Open daily");
      assert.equal(log.markers[1].popup.textContent, "Back lot");
      assert.equal(log.lines[0].points.length, 3);
      assert.deepEqual(log.lines[0].o, { color: "#f00", weight: 6, dashArray: "8 8" });
      assert.equal(log.tips[0].s, "Walk from the lot");
      assert.equal(m.el.getAttribute("aria-label"), "Map");
      const source = el.querySelector("[hidden]")!;
      assert.equal(source.querySelectorAll("address").length, 3, "the readable list stays in the DOM, hidden");
      assert.equal(el.querySelector("[data-pin]")!.closest("[hidden]"), source);
    });
  });

  it("draws a numbered step badge at a waypoint that has a third field", async () => {
    resetDom(`<div data-map="${conf({ lat: 1, lng: 2, zoom: 5 })}"><span data-path="1,2,1&#10;1.1,2.1&#10;1.2,2.2,2" data-color="#0a0"></span></div>`);
    const log = stubLeaflet();
    map.mount(document.querySelector("[data-map]")!, cfg);
    await tick();
    assert.equal(log.lines[0].points.length, 3);
    assert.deepEqual(log.badges.map((b) => [b.at, b.s]), [[[1, 2], "1"], [[1.2, 2.2], "2"]]);
    assert.equal(log.badges[0].t.className, "ph-map-step-badge");
    assert.equal(log.badges[0].o.fillColor, "#0a0");
  });

  it("fits the pins when the config has no zoom; wheel zoom starts off and a click enables it", async () => {
    resetDom(PAGE({ lat: 33.8, lng: -118.3 }));
    const log = stubLeaflet();
    map.mount(document.querySelector("[data-map]")!, cfg);
    await tick();
    const m = log.maps[0];
    assert.equal(m.view, null);
    assert.equal(m.bounds.length, 1 + 2 + 3);
    assert.equal(m.o.scrollWheelZoom, false);
    m.el.dispatchEvent(new Event("click"));
    assert.equal(m.wheel, true);
  });

  it("config tiles / attribution win over the host's, which win over the default", async () => {
    resetDom(PAGE({ lat: 1, lng: 2, zoom: 3, tiles: "https://t/{z}/{x}/{y}.png" }));
    const log = stubLeaflet();
    map.mount(document.querySelector("[data-map]")!, { ...cfg, map: { tiles: "https://host/{z}.png", attribution: "host" } });
    await tick();
    assert.equal(log.tiles[0].url, "https://t/{z}/{x}/{y}.png");
    assert.equal(log.tiles[0].o.attribution, "host");
  });

  it("tiles: 'osm' names the OpenStreetMap tiles, not a relative URL", async () => {
    resetDom(PAGE({ lat: 1, lng: 2, zoom: 3, tiles: "osm" }));
    const log = stubLeaflet();
    map.mount(document.querySelector("[data-map]")!, { ...cfg, map: { tiles: "https://host/{z}.png" } });
    await tick();
    assert.equal(log.tiles[0].url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("ignores a bad config: nothing loads, children stay visible", async () => {
    for (const attr of ["not json", conf({ lat: "x", lng: 1 }), conf({ lat: 95, lng: 1 }), ""]) {
      resetDom(`<div data-map="${attr}"><address data-pin="1,2">A</address></div>`);
      const log = stubLeaflet();
      map.mount(document.querySelector("[data-map]")!, cfg);
      await tick();
      assert.equal(log.maps.length, 0);
      assert.equal(document.querySelector("[hidden]"), null);
      assert.equal(document.head.querySelector("script"), null);
    }
  });

  it("uses the host's Leaflet when given, without touching the network", async () => {
    resetDom(PAGE());
    const log = stubLeaflet();
    const lib = win.L;
    delete win.L;
    map.mount(document.querySelector("[data-map]")!, { ...cfg, map: { leaflet: { lib } } });
    await tick();
    assert.equal(log.maps.length, 1);
    assert.equal(document.head.querySelector("script,link"), null);
  });

  it("loads Leaflet from the configured URLs (with the nonce) when it is not on the page", async () => {
    resetDom(PAGE());
    const log = stubLeaflet();
    const L = win.L;
    // Leaflet's script defines window.L: here, once a <script> is in the head (happy-dom fires its load event on append)
    Object.defineProperty(win, "L", { configurable: true, get: () => (document.head.querySelector("script") ? L : undefined) });
    map.mount(document.querySelector("[data-map]")!, { ...cfg, nonce: "n0nce", map: { leaflet: { js: "/vendor/leaflet.js", css: "/vendor/leaflet.css" } } });
    const script = document.head.querySelector("script")!;
    assert.equal(script.getAttribute("src"), "/vendor/leaflet.js");
    assert.equal(script.nonce || script.getAttribute("nonce"), "n0nce");
    const link = document.head.querySelector("link")!;
    assert.equal(link.getAttribute("href"), "/vendor/leaflet.css");
    await tick(5);
    assert.equal(log.maps.length, 1);
    // Pin images resolve beside the stylesheet, not from whatever Leaflet reads off a half-styled page.
    assert.equal(L.Icon.Default.imagePath, new URL("/vendor/images/", document.baseURI).href);
  });

  it("waits until the map is near the viewport when IntersectionObserver exists", async () => {
    resetDom(PAGE());
    const log = stubLeaflet();
    const obs: any[] = [];
    win.IntersectionObserver = class {
      constructor(public cb: (e: any[]) => void, public o: any) { obs.push(this); }
      observe() {}
      disconnect() {}
    };
    map.mount(document.querySelector("[data-map]")!, cfg);
    await tick();
    assert.equal(log.maps.length, 0);
    obs[0].cb([{ isIntersecting: false }]);
    await tick();
    assert.equal(log.maps.length, 0);
    obs[0].cb([{ isIntersecting: true }]);
    await tick();
    assert.equal(log.maps.length, 1);
    assert.ok(obs[0].o.rootMargin);
  });
});
