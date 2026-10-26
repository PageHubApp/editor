# @pagehub/cli

Open a folder of `.html` and `.liquid` files in the editor, check that every page renders, and lint the source. It runs locally: no account, and nothing leaves your machine.

It also syncs a **hosted PageHub site** with a folder (`login`, `pull`, `status`, `push`), so a coding agent can edit the site with its own tools and git. See [Edit a hosted site from a folder](#edit-a-hosted-site-from-a-folder).

The command is `pagehub` (also installed as `pagehub-editor`).

## Use it

In this repository, from the root:

```bash
pnpm pagehub-editor open ./my-site            # open a site folder in the editor (the default command)
pnpm pagehub-editor open ./my-site/about.html # same; opens that file's folder
pnpm pagehub-editor check ./a ./b             # parse and render every page of each site; exit 1 on errors
pnpm pagehub-editor check                     # no folder: every site under $SITES_ROOT, else the current folder
pnpm pagehub-editor lint ./my-site            # the editor-safety rules over every .liquid and .html file
```

| Command | Options |
|---|---|
| `open [folder\|file]` | `--port <n>` (default 5050), `--host <h>`, `--no-open` |
| `check [folder...]` | `--json[=file]` writes the report (default `validate-report.json`). `--quiet` prints only the summary. |
| `lint [folder]` | |
| `login`, `logout`, `pull <siteId> [dir]`, `status [dir]`, `push [dir]` | `--base-url <url>`, `--key-stdin`, `--force`, `--rebase`, `--dry-run`; see below |

`open` starts the playground's Vite server over your folder. Edits save straight to the files, and changes made elsewhere on disk show up in the editor.

`check` renders each page the way production does (`renderPage`, with `data.json` as the data sources and a `/things/:slug` page at `/things/sample`) and scans the output for `[object Object]`, an `<img>` with no `src`, and empty icon spans. It exits with 1 when it finds any, so it works in CI:

```bash
pnpm pagehub-editor check --quiet examples/plain-html/site examples/liquid-store/site
```

## Edit a hosted site from a folder

```bash
pagehub login                     # once: paste a ph_ API key (hidden prompt; --key-stdin reads it from stdin)
pagehub pull <siteId> my-site     # the site's files, in the server's layout
cd my-site                        # edit with Claude Code, Cursor, vim; commit to git if you like
pagehub check                     # render every page locally
pagehub status                    # what changed here and on the server
pagehub push --dry-run            # the plan and the local lint; nothing is sent
pagehub push                      # one atomic write to the draft
```

The folder uses the hosted layout: `site.json`, `theme.css`, `pages/*.liquid` (`index` is home, `[handle]` is a route capture),
`partials/`, `sections/`, `assets/*.js`. `pull` remembers each file's version in `.pagehub/` (git-ignored).

- **Pull never overwrites an edit.** A file you changed and the server changed is left alone; the server's copy goes to `.pagehub/theirs/<path>` and the merge command is printed. `pull --rebase` (after merging) keeps your files on the server's current versions; `pull --force` discards your edits.
- **Push is one atomic write** (`baseVersions` per file) through the server's lint, sanitizer and lock check. A refusal is printed as `file:line:col`. A new `pages/*.liquid` file creates its page; a deleted one deletes it. A file changed on the server since your pull stops the push before anything is sent.
- **Push never publishes.** It stages in the draft: look at `<server>/view/<siteId>`, then publish from the dashboard or the MCP `publish_site` tool.

The key comes from `PAGEHUB_API_KEY` or `login` (`~/.config/pagehub/credentials.json`, mode 0600); the server is `--base-url`, `PAGEHUB_API_BASE_URL`, or `https://pagehub.dev`. The key is never printed or written into the folder. Page names, SEO, access rules, media and collections are not files: edit them in the dashboard or with the MCP tools. Full guide: `docs/features/local-agent-workflow.md` in the PageHub app repository.

## Use `check` from code

`@pagehub/cli/check` exports what `check` is built from, for a host that wraps it:

```ts
import { runCheck, checkSite, CONTENT_CHECKS } from "@pagehub/cli/check";
// or from "@pagehub/cli", which also exports lintFolder

const { total } = await runCheck({
  dirs: ["./site"],
  extraChecks: [["todo", /TODO/]], // [type, regex] pairs run over the rendered HTML
});
```

`total` is the number of problems found.
