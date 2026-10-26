#!/usr/bin/env node
/**
 * pagehub / pagehub-editor: open a site folder in the editor, check it, lint it, and sync a hosted site with a folder
 * (login, pull, push, status).
 */
import { createSites } from "@pagehub/dev-server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCheck } from "./check";
import { lintFolder } from "./lint";
import { login, logout } from "./login";
import { openEditor } from "./open";
import { pull } from "./pull";
import { push } from "./push";
import { createClient } from "./remote/client";
import { resolveRemote } from "./remote/config";
import { readState } from "./remote/state";
import { status } from "./status";

const HELP = `Usage: pagehub [command] [options]

Local:
  open [folder|file]   open a site folder (or one .html/.liquid file's folder) in the editor (default)
  check [folder…]      parse and render every page of each site; exit 1 on errors
                       (no folder: every site under $SITES_ROOT, else the current folder)
  lint [folder]        the editor-safety rules over every .liquid/.html file; exit 1 on issues

Hosted site (edit it as a folder with your own tools and git):
  login                save an API key (hidden prompt; --key-stdin reads it from stdin)
  logout               remove the saved key
  pull <siteId> [dir]  write the site's files into dir (default ./<siteId>); run it again in a folder to update it
  status [dir]         what changed here and on the server since the last sync
  push [dir]           send your changes to the site's draft in one atomic write; never publishes

Hosted options (all read PAGEHUB_API_KEY, and PAGEHUB_API_BASE_URL, default https://pagehub.dev):
  --base-url <url>   the server (a pulled folder remembers the one it came from)
  --dry-run          push: print the plan and run the local lint; send nothing
  --force            pull: take the server's text for every file that differs, discarding your edits
  --rebase           pull: keep your files and treat them as based on the server's current versions (after a merge)

open options:
  --port <n>     port (default 5050)
  --host <h>     host (default 127.0.0.1)
  --no-open      do not open the browser

check options:
  --json[=file]  also write the report (default validate-report.json)
  --quiet        only the summary

  -h, --help     this text
`;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const has = (name: string) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};

if (has("-h") || has("--help")) {
  console.log(HELP);
  process.exit(0);
}

/** No folders given: every site under `SITES_ROOT` when it is set, else the current folder. */
async function sitesFromEnv(): Promise<string[]> {
  const root = process.env.SITES_ROOT;
  return root ? (await createSites({ sitesRoot: root }).listSites()).map((s) => s.path) : ["."];
}

const COMMANDS = ["open", "check", "lint", "login", "logout", "pull", "push", "status"];
const command = COMMANDS.includes(args[0] ?? "") ? args.shift()! : "open";

/** The client for a folder: its pulled server, unless `--base-url` says otherwise. */
const clientFor = (dir: string, baseUrl?: string) => createClient(resolveRemote({ baseUrl: baseUrl ?? readState(dir)?.baseUrl }));

try {
  if (command === "login") {
    const baseUrl = flag("--base-url");
    await login({ baseUrl, keyStdin: has("--key-stdin") });
  } else if (command === "logout") {
    logout();
  } else if (command === "pull") {
    const baseUrl = flag("--base-url");
    const force = has("--force");
    const rebase = has("--rebase");
    // `pull` inside a pulled folder, `pull <dir>` for one, or `pull <siteId> [dir]` for a new one.
    const first = args[0];
    const inFolder = !first || (existsSync(resolve(first)) && readState(resolve(first)));
    const dir = inFolder ? (first ?? ".") : (args[1] ?? first!);
    const siteId = inFolder ? readState(resolve(dir))?.siteId : first;
    if (!siteId) throw new Error("Usage: pagehub pull <siteId> [dir]  (or run it inside a folder that was pulled before)");
    const result = await pull({ client: clientFor(dir, baseUrl), siteId, dir, force, rebase });
    process.exit(result.conflicts.length ? 1 : 0);
  } else if (command === "push") {
    const baseUrl = flag("--base-url");
    const dryRun = has("--dry-run");
    const dir = args[0] ?? ".";
    const { exitCode } = await push({ client: clientFor(dir, baseUrl), dir, dryRun });
    process.exit(exitCode);
  } else if (command === "status") {
    const baseUrl = flag("--base-url");
    const dir = args[0] ?? ".";
    const cmp = await status({ client: clientFor(dir, baseUrl), dir });
    process.exit(cmp.conflicts.length ? 1 : 0);
  } else if (command === "check") {
    const jsonArg = args.find((a) => a.startsWith("--json"));
    const quiet = has("--quiet");
    if (jsonArg) args.splice(args.indexOf(jsonArg), 1);
    const dirs = args.length ? args : await sitesFromEnv();
    const { total } = await runCheck({ dirs, quiet, json: jsonArg ? (jsonArg.includes("=") ? jsonArg.split("=")[1] : "validate-report.json") : undefined });
    process.exit(total ? 1 : 0);
  } else if (command === "lint") {
    process.exit(lintFolder(args[0] ?? ".") ? 1 : 0);
  } else {
    const port = flag("--port");
    const host = flag("--host");
    const open = !has("--no-open");
    await openEditor({ target: args[0], port: port ? Number(port) : undefined, host, open });
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
