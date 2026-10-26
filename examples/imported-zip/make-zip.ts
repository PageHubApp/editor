/** Rebuild `input/site.zip` from `input/site/` (the zip is committed; this is how it was made). */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipFiles } from "./zip.ts";

const dir = new URL("./input/site", import.meta.url).pathname;
const files: Record<string, Uint8Array> = {};
const walk = (d: string) => {
  for (const name of readdirSync(d).sort()) {
    const full = join(d, name);
    if (statSync(full).isDirectory()) walk(full);
    else files[relative(dir, full).split(sep).join("/")] = readFileSync(full);
  }
};
walk(dir);
const out = new URL("./input/site.zip", import.meta.url).pathname;
writeFileSync(out, zipFiles(files));
console.log(`wrote ${out}: ${Object.keys(files).length} files`);
