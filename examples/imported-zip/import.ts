/**
 * Import a zipped HTML site into the editor's shape:
 *
 *   npx tsx examples/imported-zip/import.ts [path/to/site.zip]      (default: input/site.zip)
 *
 * unzip → `importSite` (per page: Liquid-looking text made inert, strict-parse cleanup, the page's own
 * scripts kept and listed; across pages: the repeated `<header>` / `<footer>` lifted to
 * `partials/`) → write the result to `site/`, ready for `serve.ts`. Prints the report.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { importSite, type ImportSiteReport } from "@pagehub/engine";
import { unzip } from "./zip.ts";

const TEXT = /\.(html?|css|js|json|svg|txt|md)$/i;

/** The zip's text files as path → text, with a single wrapping folder (`site/…`) removed. Binary files are returned separately. */
export function readZip(zip: Uint8Array): { text: Record<string, string>; binary: Record<string, Buffer> } {
  const entries = unzip(zip);
  const names = Object.keys(entries);
  const top = names.every((n) => n.includes("/")) && new Set(names.map((n) => n.split("/")[0])).size === 1 ? names[0]!.split("/")[0] + "/" : "";
  const text: Record<string, string> = {};
  const binary: Record<string, Buffer> = {};
  for (const [name, data] of Object.entries(entries)) {
    const path = name.slice(top.length);
    if (TEXT.test(path)) text[path] = data.toString("utf8");
    else binary[path] = data;
  }
  return { text, binary };
}

export function importZip(zip: Uint8Array): { files: Record<string, string>; binary: Record<string, Buffer>; report: ImportSiteReport } {
  const { text, binary } = readZip(zip);
  const { files, report } = importSite(text);
  return { files, binary, report };
}

export function summarize(report: ImportSiteReport): string[] {
  const lines: string[] = [];
  for (const [page, r] of Object.entries(report.pages)) {
    const bits = [
      r.normalised ? `rewritten by the HTML parser once (${r.firstError ?? "not well-formed"})` : "parsed as written",
      `${r.escapes.textRaw + r.escapes.textInline + r.escapes.attrs + r.escapes.comments} Liquid-looking spot(s) made literal`,
      `${r.sanitized.length} sanitizer fix(es)${r.sanitized.length ? ": " + [...new Set(r.sanitized.map((s) => s.rule))].join(", ") : ""}`,
      `${r.scripts.length} script(s) kept${r.scripts.length ? ": " + r.scripts.join(", ") : ""}`,
      r.remaining.length ? `${r.remaining.length} error(s) left` : "lints clean",
    ];
    lines.push(`${page}: ${bits.join("; ")}`);
  }
  for (const [partial, pages] of Object.entries(report.lifted)) lines.push(`${partial}: lifted from ${pages.length} pages (${pages.join(", ")})`);
  if (report.passthrough.length) lines.push(`copied untouched: ${report.passthrough.join(", ")}`);
  return lines;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const zipPath = process.argv[2] ?? new URL("./input/site.zip", import.meta.url).pathname;
  const { files, binary, report } = importZip(readFileSync(zipPath));
  const out = new URL("./site", import.meta.url).pathname;
  rmSync(out, { recursive: true, force: true });
  for (const [path, body] of [...Object.entries(files), ...Object.entries(binary)]) {
    const target = join(out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  console.log(summarize(report).join("\n"));
  console.log(`\nwrote ${Object.keys(files).length + Object.keys(binary).length} files to ${out}\nnow: npx tsx examples/_shared/serve.ts examples/imported-zip`);
}
