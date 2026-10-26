/**
 * `pnpm parity`: shoot the new editor, then compare against the baseline folder. Flags pass through
 * (`--update` seeds / refreshes the baseline, `--only id,id`, `--baseline dir`, `--allow-missing`).
 * Exit 1 when either half fails.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const argv = process.argv.slice(2);
const pick = (names) => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)/.exec(argv[i]);
    if (!m || !names.includes(m[1])) continue;
    out.push(argv[i]);
    if (!argv[i].includes("=") && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[++i]);
  }
  return out;
};
const run = (file, flags) => spawnSync(process.execPath, [here(file), ...flags], { stdio: "inherit" }).status ?? 1;

const shot = run("shoot-new.mjs", pick(["only", "widths", "themes", "no-build"]));
const compared = run("compare.mjs", pick(["only", "baseline", "update", "allow-missing"]));
process.exitCode = shot || compared ? 1 : 0;
