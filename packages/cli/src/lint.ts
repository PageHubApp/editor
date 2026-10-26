/** `pagehub-editor lint [dir]`: the editor-safety rules over every .liquid / .html file in a folder. Returns the issue count. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { lint } from "@pagehub/engine";

function walk(dir: string, base = dir, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else if (/\.(liquid|html)$/.test(e)) acc.push(relative(base, p));
  }
  return acc;
}

export function lintFolder(dir: string): number {
  let count = 0;
  for (const file of walk(dir)) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const issue of lint(source)) {
      count++;
      const line = source.slice(0, issue.range.start).split("\n").length;
      console.log(`${file}:${line}  ${issue.rule}  ${issue.message}`);
    }
  }
  console.log(`\n${count} issue(s)`);
  return count;
}
