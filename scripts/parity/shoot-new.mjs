/**
 * Screenshot the new editor's registered parity states (docs/s3-parity-states.json), headless.
 *
 *   node scripts/parity/shoot-new.mjs [--out dir] [--only id,id] [--widths 390,1280] [--themes light,dark] [--no-build]
 *
 * Steps (state.steps): `select` (source selector), `run` (+`args`, a command), `click` / `dblclick` /
 * `hover` / `type`+`text` / `waitFor` (Playwright selectors; `frame` scopes them to the canvas
 * iframe), `press` (a key chord), `drag` {from, to, release}, `eval` (JS in the demo page), `wait`.
 *
 * Writes `<state>__<width>__<theme>.png` plus a `.json` sidecar (the panel's bounding box, the
 * selector) into --out (default scripts/parity/.out/new, gitignored). Headless Chromium only: no
 * window ever opens. A state with `pending` is skipped and listed; a state whose steps throw is
 * listed as failed and the run exits 1.
 */
import { chromium } from "playwright";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OUT, ROOT, list, loadStates, parseArgs, serve, shotName } from "./lib.mjs";

async function runStep(page, step) {
  const scope = step.frame ? page.frameLocator(step.frame) : page;
  if ("select" in step) await page.evaluate((sel) => window.__ph.select(sel), step.select);
  else if ("run" in step) {
    const ok = await page.evaluate(([id, args]) => window.__ph.run(id, args), [step.run, step.args]);
    if (ok === false) throw new Error(`command ${step.run} did not run`);
  } else if ("click" in step) await scope.locator(step.click).first().click({ timeout: 2500, force: !!step.frame, button: step.button ?? "left" });
  else if ("dblclick" in step) await scope.locator(step.dblclick).first().dblclick({ timeout: 2500, force: !!step.frame });
  else if ("eval" in step) await page.evaluate(step.eval);
  else if ("drag" in step) {
    const from = await scope.locator(step.drag.from).first().boundingBox();
    const to = await scope.locator(step.drag.to).first().boundingBox();
    if (!from || !to) throw new Error("drag: no box");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    if (step.drag.release) await page.mouse.up();
  } else if ("hover" in step) await scope.locator(step.hover).first().hover({ timeout: 2500, force: !!step.frame });
  else if ("press" in step) await page.keyboard.press(step.press);
  else if ("type" in step) await scope.locator(step.type).first().fill(step.text, { timeout: 2500 });
  else if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("waitFor" in step) await scope.locator(step.waitFor).first().waitFor({ timeout: 2500 });
  else throw new Error(`unknown step ${JSON.stringify(step)}`);
  await page.waitForTimeout(step.settle ?? 60);
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { out: "", only: "", widths: "", themes: "", "no-build": "bool" });
  const out = args.out ? resolve(args.out) : OUT + "new/";
  const matrix = await loadStates(list(args.only));
  const widths = (list(args.widths) ?? matrix.widths).map(Number);
  const themes = list(args.themes) ?? matrix.themes;
  if (!args["no-build"]) await import("./demo/build.mjs");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const demo = await serve(OUT + "demo/");
  const browser = await chromium.launch({ headless: true });
  const pending = [];
  const failed = [];
  let shots = 0;
  try {
    for (const state of matrix.states) {
      if (state.pending) {
        pending.push(`${state.id}: ${state.pending}`);
        continue;
      }
      for (const width of state.widths ?? widths) {
        for (const theme of state.themes ?? themes) {
          const name = shotName(state.id, width, theme);
          const ctx = await browser.newContext({ viewport: { width, height: matrix.height }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce" });
          const page = await ctx.newPage();
          try {
            const query = new URLSearchParams({ theme, ...(state.empty ? { empty: "1" } : {}) });
            await page.goto(demo.url + "?" + query);
            await page.waitForFunction(() => window.__ph?.editor, null, { timeout: 15000 });
            await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
            await page.waitForTimeout(150);
            for (const step of state.steps ?? []) await runStep(page, step);
            await page.waitForTimeout(100);
            const panel = page.locator(state.panel).first();
            await panel.waitFor({ state: "visible", timeout: 4000 });
            const box = await panel.boundingBox();
            await page.screenshot({ path: out + name + ".png" });
            await writeFile(out + name + ".json", JSON.stringify({ selector: state.panel, box }, null, 2) + "\n");
            shots++;
          } catch (err) {
            failed.push(`${name}: ${String(err.message).split("\n")[0]}`);
            await page.screenshot({ path: out + name + ".FAILED.png" }).catch(() => {});
          } finally {
            await ctx.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    await demo.close();
  }
  console.log(`shot ${shots} image(s) into ${out.replace(ROOT, "")}`);
  if (pending.length) console.log(`pending (${pending.length}, skipped):\n  ` + pending.join("\n  "));
  if (failed.length) {
    console.log(`FAILED (${failed.length}):\n  ` + failed.join("\n  "));
    process.exitCode = 1;
  }
}

await main();
