/**
 * Headless screenshot of the running demo (`pnpm demo`). Never opens a visible window.
 *   node scripts/parity/demo/shot.mjs <out.png> [theme=light] [width=1280]
 * Port follows $PORT (default 5050, the demo's own default).
 */
import { chromium } from "playwright";

const out = process.argv[2];
if (!out) throw new Error("usage: shot.mjs <out.png> [theme] [width]");
const theme = process.argv[3] || "light";
const width = Number(process.argv[4]) || 1280;
const port = Number(process.env.PORT) || 5050;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${port}/?theme=${theme}`, { waitUntil: "networkidle" });
try {
  await page.waitForFunction(() => window.__ph && window.__ph.editor, { timeout: 15000 });
} catch {
  /* the editor may not expose __ph; the delay below still lets it paint */
}
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log("wrote", out);
await browser.close();
