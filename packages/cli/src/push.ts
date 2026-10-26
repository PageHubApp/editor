/**
 * `pagehub push [dir]`: send what you changed to the site's draft.
 *
 *   1. compare the folder with the server (one listing): a file changed on both sides stops the push before anything is sent
 *   2. one atomic batch (`POST …/files`, `baseVersions` per file) for edited, added and deleted files; it goes through
 *      the server's own lint, sanitizer, lock check and maintenance freeze, and any refusal is printed as `file:line:col`
 *      A new `pages/*.liquid` file travels in that batch with `pages: [{ path, name }]`: its page record (the route is read
 *      from the path) is created by the same write
 *   3. a deleted page file deletes the page through `DELETE …/source-pages/<id>`
 *
 * It never publishes. `--dry-run` sends nothing: it prints the plan and runs the local lint.
 */
import { lint } from "@pagehub/engine";
import { resolve } from "node:path";
import type { Client, FileChange, SaveResult } from "./remote/client";
import { compare, hasChanges, lineDelta, plural, type Comparison } from "./remote/compare";
import { hashText, lineOfOffset, MAX_SOURCE_FILE_BYTES } from "./remote/paths";
import { pageInputFromPath, type PageInput } from "./remote/pageFromPath";
import { baseAt, saveBase, saveTheirs, dropBase, clearTheirs, requireState, theirsPath, writeAt, writeState, type SyncState } from "./remote/state";
import { mergeCommand } from "./pull";

export interface PushOptions {
  client: Client;
  dir: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export interface PushResult {
  /** 0: pushed (or nothing to push). 1: refused, conflicted or failed. */
  exitCode: 0 | 1;
  pushed: string[];
  deleted: string[];
  pagesCreated: string[];
  pagesDeleted: string[];
}

export interface Plan {
  changes: FileChange[];
  baseVersions: Record<string, string | null>;
  newPages: Array<{ input: PageInput; text: string }>;
  deletePages: Array<{ file: string; pageId: string }>;
  /** Reasons the plan can't be sent. */
  problems: string[];
}

const isPageFile = (path: string) => path.startsWith("pages/");

/** What a folder's local changes turn into. Pure: reads nothing from the network. */
export function buildPlan(state: SyncState, cmp: Comparison): Plan {
  const plan: Plan = { changes: [], baseVersions: {}, newPages: [], deletePages: [], problems: [] };
  const converged = new Set(cmp.converged);

  for (const path of cmp.local.modified) {
    if (converged.has(path)) continue;
    plan.changes.push({ path, text: cmp.texts[path]! });
    plan.baseVersions[path] = state.files[path]!.version;
  }
  for (const path of cmp.local.added) {
    if (converged.has(path)) continue;
    const text = cmp.texts[path]!;
    if (!isPageFile(path)) {
      plan.changes.push({ path, text });
      plan.baseVersions[path] = null;
      continue;
    }
    const input = pageInputFromPath(path);
    if ("error" in input) plan.problems.push(input.error);
    else if (input.slug === "" && state.pages.length) plan.problems.push(`${path}: the site already has a home page; this file would be a second one.`);
    else {
      // The page's file travels in the batch; its record is created by the same write.
      plan.newPages.push({ input, text });
      plan.changes.push({ path, text });
      plan.baseVersions[path] = null;
    }
  }
  for (const path of cmp.local.deleted) {
    if (converged.has(path)) continue;
    const row = isPageFile(path) ? state.pages.find((p) => p.file === path) : undefined;
    if (row?.isHomePage) plan.problems.push(`${path}: the home page can't be deleted. Restore the file (\`pagehub pull --force\`) or move the home page in the dashboard first.`);
    else if (row) plan.deletePages.push({ file: path, pageId: row.pageId });
    else {
      plan.changes.push({ path, delete: true });
      plan.baseVersions[path] = state.files[path]!.version;
    }
  }
  for (const change of plan.changes) {
    if ("text" in change && Buffer.byteLength(change.text) > MAX_SOURCE_FILE_BYTES) plan.problems.push(`${change.path}: over the ${MAX_SOURCE_FILE_BYTES / 1024 / 1024} MB file limit.`);
  }
  return plan;
}

/** Split a batch into requests the server takes: at most `maxCount` changes and about `maxBytes` of text each (the route caps a body at 4 MB). */
export function chunkChanges(changes: readonly FileChange[], { maxCount = 500, maxBytes = 3_500_000 } = {}): FileChange[][] {
  const chunks: FileChange[][] = [];
  let current: FileChange[] = [];
  let size = 0;
  for (const change of changes) {
    const bytes = ("text" in change ? Buffer.byteLength(change.text) : 0) + change.path.length + 64;
    if (current.length && (current.length >= maxCount || size + bytes > maxBytes)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(change);
    size += bytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** `file:line:col` of an issue whose range is an offset into the file's text. */
export function locate(path: string, text: string | undefined, offset: number | undefined): string {
  if (text === undefined || offset === undefined) return path;
  const lineStart = offset > 0 ? text.lastIndexOf("\n", offset - 1) + 1 : 0;
  return `${path}:${lineOfOffset(text, offset)}:${offset - lineStart + 1}`;
}

/** The first `file[:line]` a refusal's message names, so a lock or content refusal is clickable too. */
const MESSAGE_LOCATION = /(?:^|[\s(])((?:pages|partials|sections|assets|locales|emails)\/[A-Za-z0-9\-_/[\].]+\.(?:liquid|json|js)|theme\.css|site\.json)(?::(\d+))?/;

export async function push({ client, dir: dirArg, dryRun = false, log = console.log, error = console.error }: PushOptions): Promise<PushResult> {
  const dir = resolve(dirArg);
  const state = requireState(dir);
  const result: PushResult = { exitCode: 0, pushed: [], deleted: [], pagesCreated: [], pagesDeleted: [] };
  const fail = (): PushResult => ((result.exitCode = 1), result);

  const listing = await client.listFiles(state.siteId);
  const cmp = compare(dir, state, listing);
  for (const path of cmp.misnamed) error(`skipped ${path}: not a path a site may hold (pages/, partials/ and sections/ files are lowercase letters, digits, - and _ ending in .liquid; assets/ ends in .js)`);

  if (cmp.conflicts.length) {
    await reportConflicts(client, state, dir, cmp, error);
    error(`\nNothing was pushed. Merge ${plural(cmp.conflicts.length, "file")} with the command${cmp.conflicts.length === 1 ? "" : "s"} above, run \`pagehub pull --rebase\`, then push again.`);
    return fail();
  }

  const plan = buildPlan(state, cmp);
  const nothing = !plan.changes.length && !plan.deletePages.length;
  if (plan.newPages.length && !dryRun && !(await client.supportsBulk(state.siteId))) {
    plan.problems.push(`${plan.newPages.map((p) => p.input.file).join(", ")}: this PageHub server can't create pages from files yet. Update it, or add the page in the dashboard and \`pagehub pull\`.`);
  }
  for (const p of plan.problems) error(`error: ${p}`);
  if (plan.problems.length) {
    error("\nNothing was pushed.");
    return fail();
  }

  // Edits both sides made to the same text: just record them as synced.
  const files = { ...state.files };
  for (const path of cmp.converged) {
    if (path in listing.versions) {
      files[path] = { version: listing.versions[path]!, localHash: hashText(cmp.texts[path]!) };
      saveBase(dir, path, cmp.texts[path]!);
    } else {
      delete files[path];
      dropBase(dir, path);
    }
  }

  if (nothing) {
    if (cmp.converged.length) writeState(dir, { ...state, files });
    log(hasChanges(cmp.local) ? "Nothing to send: your changes already match the server." : "Nothing to push: no local changes.");
    return result;
  }

  if (dryRun) return dryRunReport(state, dir, plan, log, error, result);

  // 1. the batch
  const chunks = chunkChanges(plan.changes);
  if (chunks.length > 1) log(`${plural(plan.changes.length, "change")} won't fit one request: sending ${chunks.length} requests. Each is atomic; the push as a whole is not.`);
  let landed = 0;
  const reformatted: string[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const base = Object.fromEntries(chunk.map((c) => [c.path, plan.baseVersions[c.path] ?? null]));
    const inChunk = new Set(chunk.map((c) => c.path));
    const pages = plan.newPages.filter((p) => inChunk.has(p.input.file)).map((p) => ({ path: p.input.file, name: p.input.name }));
    const saved = await client.saveBatch(state.siteId, chunk, base, pages);
    if (saved.kind !== "ok") {
      if (saved.kind === "conflict") await reportRaceConflicts(dir, saved.conflicts, cmp.texts, state, error);
      else reportRefusal(saved, cmp.texts, error);
      writeState(dir, { ...state, files });
      if (landed) error(`\n${landed} of ${chunks.length} requests had already landed; run \`pagehub status\` to see what is left.`);
      else error("\nNothing was pushed.");
      return fail();
    }
    landed++;
    for (const change of chunk) {
      if ("delete" in change) {
        delete files[change.path];
        dropBase(dir, change.path);
        clearTheirs(dir, change.path);
        result.deleted.push(change.path);
      } else {
        const version = saved.versions[change.path] ?? hashText(change.text);
        files[change.path] = { version, localHash: hashText(change.text) };
        saveBase(dir, change.path, change.text);
        clearTheirs(dir, change.path);
        result.pushed.push(change.path);
        if (version !== hashText(change.text)) reformatted.push(change.path);
      }
    }
    for (const page of saved.pages) result.pagesCreated.push(`${page.file} → ${page.url}`);
    for (const note of saved.advisories) log(`note: ${note}`);
    writeState(dir, { ...state, files });
    if (chunks.length > 1) log(`request ${i + 1}/${chunks.length} landed`);
  }

  // 2. deleted pages (each independent: one refusal doesn't stop the others)
  let failed = false;
  for (const { file, pageId } of plan.deletePages) {
    const deleted = await client.deletePage(state.siteId, pageId);
    if (deleted.kind === "ok") {
      delete files[file];
      dropBase(dir, file);
      result.pagesDeleted.push(file);
    } else {
      failed = true;
      reportRefusal(deleted.kind === "conflict" ? { kind: "rejected", status: 409, message: `${file} changed on the server; pull before deleting it.` } : deleted, {}, error, file);
    }
    writeState(dir, { ...state, files });
  }

  // The server stores a file's text after its own cleanup (sanitizer, nesting repair, formatting). Take its copy
  // back so the folder and the site stay identical and the next pull has nothing to explain.
  if (reformatted.length) {
    const back = await client.readFiles(state.siteId, reformatted);
    for (const path of reformatted) {
      const remote = back[path]!;
      writeAt(dir, path, remote.text);
      saveBase(dir, path, remote.text);
      files[path] = { version: remote.version, localHash: hashText(remote.text) };
    }
    log(`the server tidied ${plural(reformatted.length, "file")} on save and your copy was updated to match: ${reformatted.join(", ")}`);
  }

  const [after, pages] = await Promise.all([client.listFiles(state.siteId), client.listPages(state.siteId)]);
  writeState(dir, { ...state, files, pages, siteVersion: after.version, syncedAt: new Date().toISOString() });

  log(`pushed ${plural(result.pushed.length, "file")}, deleted ${plural(result.deleted.length + result.pagesDeleted.length, "file")}${result.pagesCreated.length ? `, created ${plural(result.pagesCreated.length, "page")} (${result.pagesCreated.join(", ")})` : ""}`);
  log(`Staged in the draft, not live. Preview: ${client.baseUrl}/view/${state.siteId}`);
  return failed ? fail() : result;
}

function dryRunReport(state: SyncState, dir: string, plan: Plan, log: (l: string) => void, error: (l: string) => void, result: PushResult): PushResult {
  log(`dry run for ${state.siteId} (${state.baseUrl}); nothing is sent`);
  const newPageFiles = new Set(plan.newPages.map((p) => p.input.file));
  for (const change of plan.changes) {
    if (newPageFiles.has(change.path)) continue;
    if ("delete" in change) log(`  delete  ${change.path}`);
    else if (plan.baseVersions[change.path] === null) log(`  add     ${change.path}  (${plural(change.text.split("\n").length, "line")})`);
    else {
      const { added, removed } = lineDelta(baseAt(dir, change.path) ?? "", change.text);
      log(`  edit    ${change.path}  (+${added} -${removed} lines)`);
    }
  }
  for (const { input } of plan.newPages) log(`  page    ${input.file}  → ${input.slug ? "/" + [input.slug, input.pathPattern].filter(Boolean).join("/") : "/"}  "${input.name}"`);
  for (const { file } of plan.deletePages) log(`  delete page  ${file}`);

  // The local lint is the engine's rules; the server also runs the sanitizer and lock check, so a real push can still refuse.
  let issues = 0;
  const texts = plan.changes.flatMap((c) => ("text" in c ? [[c.path, c.text] as const] : []));
  for (const [path, text] of texts) {
    if (!path.endsWith(".liquid")) continue;
    for (const issue of lint(text)) {
      issues++;
      error(`${locate(path, text, issue.range.start)}  ${issue.rule}  ${issue.message}`);
    }
  }
  if (issues) {
    error(`\n${plural(issues, "lint issue")}: the server would refuse these.`);
    result.exitCode = 1;
  } else log("local lint: clean (the server also runs its sanitizer and lock check on a real push)");
  return result;
}

/** A write the server refused: lint with `file:line:col`, a lock or content refusal, the freeze, anything else. */
function reportRefusal(r: Exclude<SaveResult, { kind: "ok" } | { kind: "conflict" }>, texts: Record<string, string>, error: (l: string) => void, fallbackPath?: string): void {
  if (r.kind === "lint") {
    const path = r.path || fallbackPath || "";
    if (!r.issues.length) error(`${path}  lint  ${r.message}`);
    for (const issue of r.issues) error(`${locate(path, texts[path], issue.range?.start)}  ${issue.rule ?? "lint"}  ${issue.message}`);
    error(`\nThe server refused ${path || "a file"} (lint). Fix the lines above and push again.`);
  } else if (r.kind === "maintenance") {
    error(`PageHub is in maintenance and writes are paused: ${r.message}\nNothing was changed. Try again later.`);
  } else {
    const named = r.path ?? MESSAGE_LOCATION.exec(r.message)?.[1] ?? fallbackPath;
    const line = MESSAGE_LOCATION.exec(r.message)?.[2];
    error(`${named ? `${named}${line ? `:${line}` : ""}  ` : ""}refused (${r.status}): ${r.message}`);
  }
}

/** Files that changed on the server since the pull: say how, and leave the server's copy for the merge. */
async function reportConflicts(client: Client, state: SyncState, dir: string, cmp: Comparison, error: (l: string) => void): Promise<void> {
  const fetchable = cmp.conflicts.filter((p) => cmp.remote.added.includes(p) || cmp.remote.modified.includes(p));
  const theirs = fetchable.length ? await client.readFiles(state.siteId, fetchable) : {};
  const conflicts = cmp.conflicts.map((path) => ({ path, theirs: theirs[path]?.text ?? "", version: theirs[path]?.version ?? "" }));
  await reportRaceConflicts(dir, conflicts, cmp.texts, state, error);
}

async function reportRaceConflicts(dir: string, conflicts: Array<{ path: string; theirs: string; version: string }>, texts: Record<string, string>, state: SyncState, error: (l: string) => void): Promise<void> {
  error(`version conflict: ${plural(conflicts.length, "file")} changed on the server since you pulled`);
  for (const c of conflicts) {
    const was = state.files[c.path]?.version;
    const base = baseAt(dir, c.path) ?? "";
    if (!c.version) {
      error(`  ${c.path}  deleted on the server${c.path in texts ? " (you also changed it)" : ""}`);
      continue;
    }
    saveTheirs(dir, c.path, c.theirs);
    const d = lineDelta(base, c.theirs);
    const mine = c.path in texts ? lineDelta(base, texts[c.path]!) : null;
    error(`  ${c.path}  server: v${c.version.slice(0, 8)} (+${d.added} -${d.removed} lines since your pull${was ? ` at v${was.slice(0, 8)}` : ""})${mine ? `, yours: +${mine.added} -${mine.removed}` : ""}`);
    error(`    server copy  ${theirsPath(c.path)}`);
    error(`    merge        ${mergeCommand(c.path)}`);
  }
  error("\nWho changed it: Site history in the dashboard lists each save with its author.");
}
