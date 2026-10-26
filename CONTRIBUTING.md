# Contributing

Thanks for helping. This guide covers setting up, running the checks, and sending a change.

## Set up

You need Node 22.18 or newer and [pnpm](https://pnpm.io) 9.

```bash
git clone <your fork>
cd pagehub-editor
pnpm install
echo "SITES_ROOT=$HOME/sites" > .env.local   # a folder whose subfolders are sites (optional)
pnpm dev                                      # the playground on http://127.0.0.1:5050
```

The repository is a pnpm workspace:

| Folder | What |
|---|---|
| `packages/engine` | Parse, edit, lint, render, storage. No UI. |
| `packages/editor` | The React editor |
| `packages/site-runtime` | The browser script for published pages |
| `packages/dev-server`, `packages/cli` | Local site host and the `pagehub-editor` command |
| `apps/playground` | The editor as a web app (`pnpm dev`) |
| `examples/` | Sites you can open in the editor, each with a test |

Read [docs/architecture.md](docs/architecture.md) first if you're new to the code.

## Run the tests

```bash
pnpm test                                    # every package and the examples
pnpm --filter @pagehub/engine test           # one package
npx tsx --conditions=pagehub-source --test packages/engine/test/lint.test.ts   # one file
```

The `pagehub-source` condition makes the packages resolve to `src` instead of a built `dist`; every `test` script sets it.

Tests use `node:test` through `tsx`. A package's `test` script is in its `package.json`. New behavior needs a test. Edit operations are tested for three things: the result reparses in strict mode, every byte outside the edited range is unchanged, and the structure changed as intended.

## Run the checks

Run these before you open a pull request. CI runs them too.

```bash
pnpm check:names     # keeps host-product names out of the source (see below)
pnpm brand:check     # the project name is the same everywhere it appears
pnpm check:sites     # parse and render every site under SITES_ROOT, or the current folder
pnpm check:size      # no source or test file over 600 lines
pnpm check:examples  # examples import the packages by name, never by path
pnpm build           # build every package to dist, with declarations
pnpm check:api       # the public exports match api.txt (node scripts/check-api.mjs --update after an intended change)
pnpm check:publish   # publint and are-the-types-wrong on each packed package
```

A change that affects a published package needs a changeset: `pnpm changeset`.

`check:names` fails on a host product's domains, endpoints and planning references. Write what the code does, and use `example.com` in tests and docs. The `ph-` class prefix, `data-ph-*` attributes, the `PageHub` global and the `@pagehub/*` package scope are this project's own names and stay.

## Code guidelines

- Keep files small: a hard cap of 600 lines, and aim for about 300. Past 300, look for something to extract, and reuse an existing helper before writing a new one.
- Names a template author writes (tags, filters, objects, runtime attributes) are frozen once released. Add new names; never change what an existing one means.
- No `title=""` tooltips and no browser `confirm()`, `alert()` or `prompt()` in the editor UI. Use the tooltip helper and `useConfirm()` from `@pagehub/editor/primitives`.

## Developer Certificate of Origin (DCO)

Every commit must be signed off. Signing off certifies the [Developer Certificate of Origin 1.1](https://developercertificate.org/): that you wrote the change, or otherwise have the right to submit it under the project's MIT license.

Add the sign-off with `-s`:

```bash
git commit -s -m "engine: keep indentation when moving a block"
```

That appends a line like:

```
Signed-off-by: Ada Lovelace <ada@example.com>
```

The name and email must be real and match the commit author. CI rejects pull requests that contain a commit without a `Signed-off-by` line. Forgot one? Use `git commit --amend -s` for the last commit, or `git rebase --signoff main` for a whole branch, then force-push your branch.

There is no CLA.

## Commit messages

Start with the area, then a short sentence in the imperative, with no trailing period:

```
engine: keep indentation when moving a block
editor: show the maintenance notice as a status, not an error
site-runtime: stop the carousel when the tab is hidden
docs: explain canvasHost.siteCss
```

Use the area names `engine`, `editor`, `site-runtime`, `dev-server`, `cli`, `playground`, `examples`, `docs` or `ci`. Put the why in the body when it isn't obvious from the change. Keep one change per commit.

## Pull requests

- Describe what changed and why, and how you checked it.
- Include a screenshot or short recording for a visible editor change.
- Keep the pull request focused. Unrelated cleanups go in their own.

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md) and don't open a public issue.

## Trademark

The code is MIT. The project name and logo are not covered by the license; a trademark policy will be published before the first release.
