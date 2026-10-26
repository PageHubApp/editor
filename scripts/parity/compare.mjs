/**
 * Compare the new editor's parity shots against a baseline folder.
 *
 *   node scripts/parity/compare.mjs [--new dir] [--baseline dir] [--only id,id] [--update] [--allow-missing]
 *
 * For every (state × width × theme) of docs/s3-parity-states.json that is not `pending`: crop both
 * PNGs to the panel's bounding box (recorded by shoot-new.mjs beside each shot), run pixelmatch
 * (threshold 0.1) and report the share of differing pixels. Above `maxDiffRatio` (0.5 %) is a
 * failure unless the state carries a `waiver`. A shot with no baseline is reported as MISSING
 * BASELINE (exit 1, or 0 with --allow-missing) — never skipped silently. A state that was not shot
 * is NOT SHOT (exit 1). `--update` copies the new shots over the baseline (the first run, or an
 * accepted change) and exits 0. Diff images land in <new>/../diff/.
 */
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OUT, ROOT, list, loadStates, parseArgs, shotName } from "./lib.mjs";

const exists = (p) => readFile(p).then(() => true, () => false);
const readPng = async (p) => PNG.sync.read(await readFile(p));

function crop(png, box) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(png.width - x, Math.ceil(box.x + box.width) - x);
  const h = Math.min(png.height - y, Math.ceil(box.y + box.height) - y);
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
}

const pct = (r) => (r * 100).toFixed(3) + " %";
const rel = (p) => p.replace(ROOT, "");

async function main() {
  const args = parseArgs(process.argv.slice(2), { new: "", baseline: "", only: "", update: "bool", "allow-missing": "bool" });
  const newDir = resolve(args.new || OUT + "new") + "/";
  const baseDir = resolve(args.baseline || OUT + "baseline") + "/";
  const diffDir = resolve(newDir, "../diff") + "/";
  const matrix = await loadStates(list(args.only));
  const { threshold = 0.1, maxDiffRatio = 0.005 } = matrix;

  const rows = { ok: [], waived: [], over: [], missing: [], notShot: [], seeded: [], size: [], pending: [] };
  await mkdir(baseDir, { recursive: true });
  await mkdir(diffDir, { recursive: true });
  const expected = new Set();

  for (const state of matrix.states) {
    if (state.pending) {
      rows.pending.push(`${state.id}: ${state.pending}`);
      continue;
    }
    for (const width of state.widths ?? matrix.widths) {
      for (const theme of state.themes ?? matrix.themes) {
        const name = shotName(state.id, Number(width), theme);
        expected.add(name);
        const cand = newDir + name;
        const base = baseDir + name;
        if (!(await exists(cand + ".png")) || !(await exists(cand + ".json"))) {
          rows.notShot.push(name);
          continue;
        }
        if (args.update) {
          await copyFile(cand + ".png", base + ".png");
          await copyFile(cand + ".json", base + ".json");
          rows.seeded.push(name);
          continue;
        }
        if (!(await exists(base + ".png"))) {
          rows.missing.push(name);
          continue;
        }
        const { box } = JSON.parse(await readFile(cand + ".json", "utf8"));
        if (!box || box.width < 1 || box.height < 1) {
          rows.notShot.push(`${name} (panel has no box)`);
          continue;
        }
        const a = crop(await readPng(base + ".png"), box);
        const b = crop(await readPng(cand + ".png"), box);
        if (a.width !== b.width || a.height !== b.height) {
          rows.size.push(`${name}: baseline crop ${a.width}x${a.height}, new ${b.width}x${b.height}`);
          continue;
        }
        const diff = new PNG({ width: a.width, height: a.height });
        const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
        const ratio = n / (a.width * a.height);
        if (n > 0) await writeFile(diffDir + name + ".png", PNG.sync.write(diff));
        const line = `${name}: ${pct(ratio)} (${n} px of ${a.width}x${a.height})`;
        if (ratio <= maxDiffRatio) rows.ok.push(line);
        else if (state.waiver) rows.waived.push(`${line} — waived: ${state.waiver}`);
        else rows.over.push(line);
      }
    }
  }

  const orphans = args.only ? [] : (await readdir(baseDir).catch(() => [])).filter((f) => f.endsWith(".png") && !expected.has(f.slice(0, -4)));
  const show = (title, items) => items.length && console.log(`${title} (${items.length}):\n  ` + items.join("\n  "));
  show("SEEDED baseline from the new shots", rows.seeded);
  show("OVER the threshold", rows.over);
  show("SIZE MISMATCH", rows.size);
  show("MISSING BASELINE (no old-editor / seeded shot to compare against)", rows.missing);
  show("NOT SHOT (run shoot-new first, or its steps failed)", rows.notShot);
  show("waived", rows.waived);
  show("pending (new editor can't render yet)", rows.pending);
  show("orphan baselines (no state registers them)", orphans);
  const diffs = rows.over.length + rows.size.length;
  const holes = rows.missing.length + rows.notShot.length;
  console.log(`\nparity: ${rows.ok.length} ok, ${diffs} over threshold, ${rows.waived.length} waived, ${rows.missing.length} missing baseline, ${rows.notShot.length} not shot, ${rows.pending.length} pending states, baseline ${rel(baseDir)}`);
  process.exitCode = args.update ? (rows.notShot.length ? 1 : 0) : diffs || rows.notShot.length || (holes && !args["allow-missing"]) ? 1 : 0;
}

await main();
