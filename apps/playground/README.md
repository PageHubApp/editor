# Playground

The editor as a real web app over your own files, for developing the editor and trying it out. Private (not published).

```sh
pnpm dev                          # Vite on http://127.0.0.1:5050, the sites in SITES_ROOT (picker in the top bar)
SITE_DIR=./my-site pnpm dev       # open that folder; its parent becomes the sites root
SITES_ROOT=~/sites pnpm dev       # a different folder of sites
pnpm build                        # production bundle into apps/playground/dist
pnpm pagehub-editor open ./my-site   # the same server for a one-off folder (opens the browser)
```

Set `SITES_ROOT` once in `.env.local` at the repo root (gitignored; `.env` works too) and plain `pnpm dev` picks it up.
Without it the sites root is `apps/playground/sites/` (gitignored). `vite.config.mjs` loads the file with Vite's
`loadEnv`, so a variable on the command line still wins. One dev server per port (`strictPort`): if 5050 is taken,
that server is yours; use it.

How it fits together:

- **Vite serves the app** (`vite.config.mjs`): `index.html` → `src/main.tsx`, React Fast Refresh, the editor's own CSS
  (`@pagehub/editor/styles.css`) through `@tailwindcss/vite`. Workspace packages resolve to their sources.
- **`@pagehub/dev-server` adds everything site-related** (the file API, per-site CSS, fonts, runtime,
  `/~view/<site>/…`). See its README.
- `src/main.tsx` runs the editor over the site the server resolves (`/api/info`), through `httpStorage` and
  `devCanvasHost` from `@pagehub/dev-server/client`. Add `?sample=1`, or open it with no server, for the built-in
  sample kept in localStorage (`src/sample/`).
- `src/dataSources.ts` registers the Liquid globals sites render with, for expression autocomplete.

## Dev knobs (dev server only)

Locally everything answers instantly. To see what a slow or failing network looks like, add params to the editor URL
(or set `SLOW_MS` / `FAIL` when starting the dev server). They live in `src/dev/knobs.ts`, which `main.tsx` loads only
under `import.meta.env.DEV`, and the server honours them only because `vite.config.mjs` passes `devKnobs: true`; a
production build and the CLI contain neither.

- `?slow=1500`: adds that many ms to `/api/info`, `/api/files`, `/api/file`, `/api/batch`, `/__site.css`, `/__fonts`,
  and to each canvas render.
- `?fail=css,files`: those endpoints answer 500 (`info`, `files`, `file`, `css`, `fonts`).
- `?fixture=media`: gives the editor a media library (the playground has none), which `slow` delays and `fail=media` breaks.

Loading UI only appears after 150 ms (`useDelayedFlag`), so instant loads never flash a skeleton.
