/**
 * Drive the running demo's real controls and confirm they WRITE to the source model. Runs the
 * same commands the inspector controls run (`liquid.setArg`, `attr.set`) and reports the node's
 * args/attrs after each write. Never opens a visible window.
 *   node scripts/parity/demo/verifyWrite.mjs
 */
import { chromium } from "playwright";
const port = Number(process.env.PORT) || 5095;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`http://localhost:${port}/?fixture=media`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ph && window.__ph.editor, { timeout: 15000 });

const result = await page.evaluate(() => {
  const e = window.__ph.editor;
  const sel1 = (s) => e.find("index.liquid", s)[0];
  const out = {};

  // Map block: tileStyle + grayscale args (ArgField → liquid.setArg).
  const mapH = sel1("[data-lat]").parent();
  e.select(mapH);
  e.run("liquid.setArg", { name: "tiles", value: '"osm"' });
  e.run("liquid.setArg", { name: "grayscale", value: "true" });
  e.run("liquid.setArg", { name: "zoom", value: "16" });
  out.mapArgs = Object.fromEntries(e.find("index.liquid", "[data-lat]")[0].parent().args().map((a) => [a.name, a.source]));

  // MapPoint: data-lat attr (AttrField → attr.set).
  const pin = sel1("[data-lat]");
  e.select(pin);
  e.run("attr.set", { name: "data-lat", value: "40.7128", at: pin });
  out.pinLat = e.find("index.liquid", "[data-lat]")[0].attr("data-lat");

  // MapPath: data-color + data-weight + data-dashed (AttrField).
  const path = sel1("[data-path]");
  e.select(path);
  e.run("attr.set", { name: "data-color", value: "#2563eb", at: path });
  e.run("attr.set", { name: "data-weight", value: "8", at: path });
  const p2 = e.find("index.liquid", "[data-path]")[0];
  out.pathColor = p2.attr("data-color");
  out.pathWeight = p2.attr("data-weight");

  return out;
});
console.log(JSON.stringify({ result, errs }, null, 2));
await browser.close();
