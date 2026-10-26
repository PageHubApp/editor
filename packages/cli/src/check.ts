/**
 * `pagehub-editor check [dir…]`: for each site folder, (1) parse every .liquid / .html with the editor's parser,
 * (2) render every page in `pages.json` through the engine the way production does (`renderPage` + data sources
 * built from `data.json`, see dev-server `renderSitePage`), (3) cheap content checks on the rendered HTML.
 * Exit 1 if any error. A host adds its own content checks through `extraChecks` (`[type, regex]` pairs).
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import * as core from "@pagehub/engine";
import * as render from "@pagehub/engine/render";
import * as canvas from "@pagehub/engine/canvas";
import * as host from "@pagehub/engine/host";
import * as fs from "@pagehub/engine/fs";
import * as runtime from "@pagehub/site-runtime";
import { loadSiteFiles, mergeEngine, renderSitePage, type DevEngine } from "@pagehub/dev-server";

export type ExtraCheck = readonly [type: string, pattern: RegExp];

export interface CheckError {
  type: string;
  file: string;
  line: number | null;
  message: string;
}

export interface SiteReport {
  id: string;
  name: string;
  pages: number;
  rendered: number;
  files: number;
  errors: CheckError[];
  /** Fixed on read, not failures: invalid HTML nesting a browser reads fine (`repairNesting`). */
  warnings?: CheckError[];
}

const engine: DevEngine = mergeEngine(render, canvas, host, fs, runtime);
/** The parser that knows the engine's block tags (`{% map %}`, `{% form %}`, `{% paginate %}`…): a plain strict parse reads each as a stray tag. */
const parserEnv = render.createRenderer({ files: () => undefined }).parserEnvironment;

function walk(dir: string, base = dir, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else if (/\.(liquid|html)$/.test(e)) acc.push(relative(base, p));
  }
  return acc;
}

const lineOf = (text: string, idx: number) => text.slice(0, idx).split("\n").length;
const clip = (s: string, n = 140) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Each content check: [type, regex over rendered output with comments / style / script blanked]. */
export const CONTENT_CHECKS: ExtraCheck[] = [
  ["object-object", /\[object Object\]/g],
  ["img-no-src", /<img\b(?![^>]*\sdata-state-src=)(?![^>]*\ssrc=["'][^"']+["'])[^>]*>/gi],
  ["empty-icon-span", /<span\b[^>]*aria-hidden="true"[^>]*>\s*<\/span>/g],
];

// Blank out HTML comments + <style>/<script> bodies (same length, so line numbers stay true).
const blank = (s: string) => s.replace(/<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, " "));

export async function checkSite(siteDir: string, id = basename(siteDir), { extraChecks = [] }: { extraChecks?: readonly ExtraCheck[] } = {}): Promise<SiteReport> {
  const errors: CheckError[] = [];
  const warnings: CheckError[] = [];
  const add = (type: string, file: string, line: number | null | undefined, message: string) => errors.push({ type, file, line: line ?? null, message: clip(message, 200) });
  const siteFiles = loadSiteFiles(siteDir);
  const { read, pages } = siteFiles;

  // 1. parse
  const files = walk(siteDir);
  for (const f of files) {
    try {
      core.parseSource(read(f) ?? "", "strict", { env: parserEnv });
    } catch (e: any) {
      // Invalid nesting is repaired wherever text enters the pipeline (render, write, editor open): a warning here.
      const fixes = core.repairNesting(read(f) ?? "").fixes;
      if (fixes.length) {
        warnings.push({ type: "nesting-repaired", file: f, line: fixes[0]!.line, message: clip(core.describeNestingFixes(f, fixes), 200) });
        continue;
      }
      const loc = e.loc?.start || e.location?.start;
      add("parse", f, loc?.line ?? e.line, e.message);
    }
  }

  // 2. render + 3. content
  let rendered = 0;
  for (const page of pages) {
    const file = page.path;
    if (!file) continue;
    if (read(file) === undefined) {
      add("render-missing-file", file, null, `page ${page.url} → file not found`);
      continue;
    }
    // a detail page (`/services/:slug`) renders at a sample capture, unless data.json's preview params give one
    const route = String(page.url || "/");
    const params: Record<string, string> = {};
    for (const m of route.matchAll(/:([A-Za-z0-9_]+)/g)) params[m[1]!] = siteFiles.data.request?.params?.[m[1]!] ?? "sample";
    const path = route.replace(/:([A-Za-z0-9_]+)/g, (_m, k: string) => params[k]!);
    let html: string;
    try {
      html = await renderSitePage(engine, siteFiles, page, { path, params });
      rendered++;
    } catch (e: any) {
      const msg = String(e.message || e);
      const m = msg.match(/line:?\s*(\d+)/i);
      const inFile = msg.match(/file:\s*([^\s,]+)/i);
      const kind = /ENOENT|not found|Failed to lookup|partial/i.test(msg) ? "render-missing-partial"
        : /undefined filter|filter/i.test(msg) && /undefined|not found/i.test(msg) ? "render-undefined-filter"
        : /expected|syntax|unexpected|illegal|unbalanced/i.test(msg) ? "render-syntax" : "render-other";
      add(kind, inFile?.[1] || file, m ? +m[1]! : null, `[${page.url}] ${msg.split("\n")[0]}`);
      continue;
    }
    const scan = blank(html);
    for (const [type, rx] of [...CONTENT_CHECKS, ...extraChecks]) {
      for (const hit of scan.matchAll(rx)) add(type, file, lineOf(html, hit.index!), `[${page.url}] ${clip(html.slice(hit.index!, hit.index! + 120), 100)}`);
    }
  }
  return { id, name: siteFiles.site.name || siteFiles.data.site?.name || "", pages: pages.length, rendered, files: files.length, errors, warnings };
}

export interface CheckRun {
  results: SiteReport[];
  total: number;
}

/** Check each folder and print the report. `json`: also write `{ total, sites, byType }` to that file. */
export async function runCheck({ dirs, extraChecks = [], quiet = false, json }: { dirs: string[]; extraChecks?: readonly ExtraCheck[]; quiet?: boolean; json?: string }): Promise<CheckRun> {
  const results: SiteReport[] = [];
  for (const dir of dirs) {
    const abs = resolve(dir);
    if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) {
      console.error(`no such site: ${dir}`);
      results.push({ id: basename(abs), name: "", pages: 0, rendered: 0, files: 0, errors: [{ type: "missing-site", file: dir, line: null, message: "no such folder" }] });
      continue;
    }
    const r = await checkSite(abs, basename(abs), { extraChecks });
    results.push(r);
    if (quiet) continue;
    console.log(`\n${r.id}  ${r.name}  (${r.rendered}/${r.pages} pages rendered, ${r.files} files) — ${r.errors.length} error(s)`);
    const seen = new Set<string>();
    for (const w of r.warnings ?? []) console.log(`  warning ${w.type.padEnd(16)} ${w.file}${w.line ? ":" + w.line : ""}  ${w.message}`);
    for (const e of r.errors) {
      const k = `${e.type}|${e.file}|${e.line}|${e.message}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`  ${e.type.padEnd(24)} ${e.file}${e.line ? ":" + e.line : ""}  ${e.message}`);
    }
  }
  console.log("\n" + "site".padEnd(32) + "id".padEnd(24) + "errors");
  for (const r of results) console.log(clip(r.name || "(unnamed)", 30).padEnd(32) + r.id.padEnd(24) + r.errors.length);
  const total = results.reduce((n, r) => n + r.errors.length, 0);
  console.log(`\n${results.length} sites, ${total} errors`);
  if (json) {
    const byType: Record<string, unknown[]> = {};
    for (const r of results) for (const e of r.errors) (byType[e.type] ??= []).push({ site: r.id, ...e });
    writeFileSync(resolve(json), JSON.stringify({ total, sites: results, byType }, null, 2));
    console.log(`report → ${resolve(json)}`);
  }
  return { results, total };
}
