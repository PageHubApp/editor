/**
 * Headless inspector probe for the running demo. Selects a node (by CSS-ish selector, or by a
 * child selector + `^` to climb to its parent), activates the component tab, and dumps the
 * inspector's component type + rendered rows (label, control kind, note?). Optional screenshot.
 *   node scripts/parity/demo/inspect.mjs "<selector>" [out.png] [fixture=media] [tab=component]
 * A selector ending in "^" climbs to the matched node's parent (to reach a {% map %} block from a pin).
 * Never opens a visible window.
 */
import { chromium } from "playwright";

const raw = process.argv[2];
const out = process.argv[3];
const fixture = process.argv[4] || "media";
const tab = process.argv[5] || "component";
const port = Number(process.env.PORT) || 5095;
if (!raw) throw new Error("usage: inspect.mjs <selector> [out.png] [fixture] [tab]");
const climb = raw.endsWith("^");
const selector = climb ? raw.slice(0, -1).trim() : raw;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`http://localhost:${port}/?fixture=${fixture}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ph && window.__ph.editor, { timeout: 15000 });
const info = await page.evaluate(({ sel, climb, tab }) => {
  const e = window.__ph.editor;
  let h = e.find("index.liquid", sel)[0];
  if (!h) return { error: `no node matches ${sel}` };
  if (climb) h = h.parent();
  if (!h) return { error: `no parent of ${sel}` };
  e.select(h);
  e.run("ui.set", { inspectorTab: tab });
  return { tag: h.tag, kind: h.kind, elementName: h.element?.name, type: h.element?.inspectorFor?.(h.tag)?.type };
}, { sel: selector, climb, tab });
await page.waitForTimeout(400);
// Expand every collapsed accordion section so its rows mount.
for (let i = 0; i < 4; i++) {
  const clicked = await page.evaluate(() => {
    let n = 0;
    for (const b of document.querySelectorAll('[data-section] [aria-expanded="false"], [aria-expanded="false"][data-section]')) {
      b.click();
      n++;
    }
    return n;
  });
  await page.waitForTimeout(150);
  if (!clicked) break;
}
await page.waitForTimeout(300);
const rows = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("[data-row]")) {
    const id = el.getAttribute("data-row");
    const isNote = !!el.querySelector("[data-row-structure]");
    const isPopover = el.hasAttribute("data-row-popover");
    const controls = [...el.querySelectorAll("input,select,textarea")].map((c) => c.tagName.toLowerCase() + (c.type ? `[${c.type}]` : "")).join(",");
    out.push({ id, note: isNote, popover: isPopover, controls });
  }
  // section headers present
  const sections = [...document.querySelectorAll("[data-section],[data-inspector-section]")].map((s) => s.getAttribute("data-section") || s.getAttribute("data-inspector-section"));
  return { rows: out, sections };
});
console.log(JSON.stringify({ selector: raw, info, ...rows, errs }, null, 2));
if (out) await page.screenshot({ path: out });
await browser.close();
