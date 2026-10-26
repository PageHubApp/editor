# OSS restructure and cleanup plan

Status: **plan** (2026-10-21). No code has changed. This plan turns `pagehub-editor` into a clean,
open-source-ready monorepo. Rules: pagehub.dev `CLAUDE.md` (R3, no barrels except package entries,
600 LOC hard cap / ~300 target, no legacy fallbacks, plans are specs).

Baseline, measured 2026-10-21 on the uncommitted tree. Every pass must end at these numbers or better:

| Gate | Command | Baseline |
|---|---|---|
| engine | `npx tsx --test "packages/engine/test/**/*.test.ts"` | 325 pass, 0 fail |
| site-runtime | `npx tsx --test "packages/site-runtime/test/**/*.test.ts"` | 179 pass, 0 fail |
| editor | `npx tsx --test "packages/editor/test/**/*.test.ts" "packages/editor/test/**/*.test.tsx"` | 589 pass, 0 fail, 2 skipped |
| examples | `npx tsx --test "examples/*/example.test.ts"` | 27 pass, 0 fail |
| converted sites | `node scripts/validate-sites.mjs --quiet` | 28 sites, 0 errors |

No `tsc` / `pnpm typecheck` locally (Will's rule). The type check runs in CI only (Pass 11).

---

## 1. What's wrong today (the short version)

1. **The editor package can't run outside this repo's dev server.** It hard-codes the dev server's
   URLs and file conventions: `/__site.css?site=` (`packages/editor/src/ui/canvas/canvasContext.ts:78`),
   `/__fonts` (`:100`), `/__runtime.js` (`ui/canvas/frameDom.ts:106`), `/~view` (`ui/topbar/PageSelector.tsx:72`),
   `location.search` `?site=` (`canvasContext.ts:78`), and `data.json`, `icons.json`, `site.json.imageBase`
   (`canvasContext.ts:53-64, 126`). PageHub can't embed it, and neither can anyone else.
2. **The editor ships no stylesheet.** The chrome CSS lives in `app/styles.css`, has a drifted copy in
   `scripts/parity/demo/styles.css`, and a third, bare version in `examples/_shared/styles.css`. So the
   examples look different from the app.
3. **There are three dev servers and two file APIs.** `app/sitePlugin.mjs` (Vite, a hand-rolled sha1
   file API at `/api/file`), `examples/_shared/serve.ts` (esbuild, engine `fsStorage` at `/__api/*`), and
   `scripts/parity/demo/serve.mjs` (esbuild, memory). `app/httpStorage.ts` and `examples/_shared/main.tsx:19`
   are two `httpStorage` clients for those two protocols.
4. **The public API is "everything".** `packages/engine/src/index.ts` exports about 450 names from one
   entry, and `packages/editor/src/index.ts` exports about 400. Roughly 300 more exported symbols are
   only used inside their own file (list in §4.4). The plan's `./runtime` subpath (BUILD-PLAN §Packages)
   was never made.
5. **PageHub's own code and names sit in the open-source core.** The Mongo-reading parity sweep, the Craft
   converter diff, `window.PageHub`, `/api/stripe/storefront-checkout`, `ph-*` and `data-ph-*` names,
   `x-pagehub-*` schema keys, inspector rows keyed by Craft prop names, and internal docs (HANDOFF with
   budget and people notes, `/Users/admin/...` paths).

---

## 2. Target layout

```
/
├─ packages/                      published (MIT)
│  ├─ engine/        @pagehub/engine        headless: parse, patch, state, rules, kits, render
│  ├─ editor/        @pagehub/editor        React UI (slots, canvas, panels) + styles.css
│  ├─ site-runtime/  @pagehub/site-runtime  the published-page script + its CSS
│  ├─ dev-server/    @pagehub/dev-server    NEW: local file API, local site host, preview, Vite plugin
│  └─ cli/           pagehub-editor (bin)          NEW home of cli/: `open`, `check`, `lint`
├─ apps/
│  └─ playground/    private: the dev / demo app (from app/ + scripts/parity/demo/)
├─ examples/         sites + example.test.ts only (one private workspace package)
├─ tools/
│  └─ visual-regression/          from scripts/parity/*.mjs + docs/s3-parity-states.json
├─ scripts/          repo-only: rename-brand.mjs, check-file-size.mjs, check-names.mjs, check-api.mjs
└─ docs/             public docs only (architecture, format, embedding, plugins, roadmap, decisions)
```

Removed from this repo: `app/`, `cli/` (top level), `sites/`, `parity-report.*`, `scripts/parity-sweep.mjs`,
`scripts/converter/`, `scripts/inventory/`, the internal docs (§3.6).

`pnpm-workspace.yaml` becomes `packages/*`, `apps/*`, `examples`, `tools/*`.

The npm scope stays `@pagehub` (from `brand.json`) until Will picks a name. Then
`scripts/rename-brand.mjs` renames everything in one pass.

### 2.1 Package boundaries and dependencies

```
site-runtime  ←  engine  ←  editor
     ↑             ↑    ↖
     └── dev-server ─────── cli
                    ↖
                     apps/playground, examples, tools/visual-regression
```

- `engine` has no DOM and no React. It runs in Node, workers and browsers.
- `editor` depends on `engine` and React (a peer dependency). It never calls `fetch` itself. Everything
  that comes off a server goes through host adapters (§2.3).
- `site-runtime` depends on nothing in this repo. `engine` imports only its two `head/*` strings.
- `dev-server` is Node-only. It's the one place that knows about folders, Vite, Tailwind compilation and
  Google Fonts downloads.

### 2.2 Public API per package

Every name that isn't listed here is internal. Pass 11 adds `scripts/check-api.mjs`, which snapshots each
entry's export names to `packages/*/api.txt` and fails on any unreviewed change.

**`@pagehub/engine`**

| Subpath | Exports | From (today) |
|---|---|---|
| `.` | parse (`parseSource`, `buildTree`, `pathAtOffset`, node types), patch ops (`ops`, `insert`…`setTagArgument`, `readTagArguments`, `EditError`), edit attributes (`EDIT_ATTRIBUTES`, `validateEditAttribute`, `stripEditAttributes`), `lint`, `createParserEnvironment`, state (`EditorState`, `Transaction`, `ChangeSet`, `Store`, `createStore`, handles), extensions (`Facet`, `defineFacet`, `Prec`, `definePlugin`, the core facets), `t`/`Schema`, `defineElement` + bindings, `defineCommand` / `contributes` / keymap helpers, `history`/`undo`/`redo`, rules (`defineRule`, `runRules`, `applyFixes`, `coreRules`), normalize hooks, content mode, storage (`defineStorage`, `memoryStorage`, `unifiedDiff`), identity (`normalize`, `persistedIdentity`, `sessionIdentity`), `createEditor` + `Editor`, import (`importHtml`, `importSite`, `templateToPage`), `variableCatalogue`. | `src/index.ts:1-157` minus the render half |
| `./render` | `createRenderer`, `createRendererFromConfiguration`, `RenderTimeoutError`, `defineTag`, `defineFilter`, `defineDataSource`, `renderPage`, `stripForPublish`, `stampAriaCurrent`, `headSnippets`, `injectIntoHead`, `builtinTags`, `builtinFilters`, `BUILTIN_TAGS`, `BUILTIN_FILTER_DEFS`, `tagsFacet`, `filtersFacet`, `createFormTag`, `createSectionTag`, schema helpers (`readSchema`…), `escapeHtml`, `attrString`, `HostProviders`, **new:** `pageReads`, `classesInMarkup`, `matchRoute`, `collectSources`, `ENGINE_VERSION` | `src/index.ts:86-98, 131-139` |
| `./kits` | `htmlKit`, `liquidKit`, `tailwindKit` and their public commands, args types, `TAILWIND_GROUPS`, `patternCss`, `themeBreakpoints` | `src/index.ts:159-195` |
| `./host` | everything a host plugs in, in one place: `mediaFacet` + `memoryMediaStore`, `iconCatalogueFacet`, `fontCatalogueFacet` + `defaultFontCatalogue`, `themeColorsFacet`, **moved from editor:** `blockSourceFacet`, `themePresetsFacet`, `fontPairingsFacet` | `src/media/*`, editor `connectors/add/addPanelState.ts`, `connectors/theme/presetsFacet.ts` |
| `./canvas` | `renderCanvas`, `instrumentFile(s)`, `EDIT_SRC_ATTR`, `handleForSrc`, `splitThemeFonts`, `fontHeadTags`, **new:** `parseFontFaces` | `src/canvas/*` |
| `./fs` | `fsStorage` | unchanged |
| `./worker` | `createWorkerRenderer`, `createWorkerHost` | unchanged (top-level await stays out of `.`) |
| `./testing` | `createTestEditor`, `RuleTester`, `CommandTester`, `ElementTester` | unchanged |

Internal: `edit/whitespace`, `editor/saveQueue`, `editor/diagnostics`, `elements/selector`, `liquid/engine`
(`createEngine` stays internal: never create a liquidjs instance outside the renderer, HANDOFF trap 7),
`rules/traverse|util|registry`, `runtime/filters/*` internals, `kits/html/dnd/*` internals.

**`@pagehub/editor`**

| Subpath | Exports |
|---|---|
| `.` | `Editor`, `mountEditor`, `EditorProps`, `EditorEvent`, `editorKit`, `ComponentsMap`, `SlotName`, `SlotProps` + each slot's props type, `DEFAULT_COMPONENTS`, `Slot`, `useSlot`, hooks (`useEditorStore`, `useEditorState`, `useRunCommand`, `useUi`), **new:** `CanvasHost`, `CanvasRender` |
| `./components` | the default slot components, for wrapping or re-composing: `TopBar`, `PageSelector`, `Sidebar`, `Inspector`, `InspectorSectionView`, `LayersPanel`, `AddPanel`, `Viewport`, `Board`, `MediaManager` (connector), `ThemePanel`, `ModifiersPanel`, `CommandPalette`, `ContextMenu`, `CodeMirrorView`, `DiffPreview`, `SaveBanner`, `SaveStatus`, `EmptyState`, `ColorPicker`, `IconPicker`, `FontPicker` |
| `./primitives` | the building blocks a host needs to make a panel look native (PageHub's Stripe picker, AI panel): `Modal`, `ConfirmDialog`, `useConfirm`, `Drawer`, `FloatingPanel`, `AnchoredPopover`, `Chip`, `PopoverChip`, `ToolbarItem`, `ToolbarSection`, `ToolbarDropdown`, `ToolbarSegmentedControl`, `MenuSurface`, `Skeleton`, `Spinner`, `InlineError`, `Icon`, `tooltip`, `zIndex` |
| `./styles.css` | the chrome stylesheet, **scoped** to `[data-editor-scope]` (including Tailwind preflight), so embedding it in a dashboard never restyles the host page |

Internal: every `*Field`, `*Kit` other than `editorKit`, every command constant, canvas geometry, dnd, the
board layout, property rows, rich-text session, theme model. Tests import those from their files directly.

**`@pagehub/site-runtime`**

| Subpath | Exports |
|---|---|
| `.` | `start`, `readConfig`, `RuntimeConfig`, `CartAdapter`, `Cart`, `TrackAdapter`, **new:** `RUNTIME_SELECTOR`, `needsRuntime(html)` (replaces the stale `RUNTIME_ATTRIBUTES`) |
| `./head/theme`, `./head/dismiss` | the inline head snippets (unchanged) |
| `./assets/*` | built files: `runtime.js`, `chunks/*.js`, `kit.css`, `animate.css`, `manifest.json` (`{ version, files }`, version = content hash) |
| `./bundle` | Node-only: `bundleInline()`, the one-file runtime the canvas and previews load (moved from `app/render.mjs:67`) |

`setChunkLoader` / `loadChunk` / `CHUNK_SELECTORS` become internal.

**`@pagehub/dev-server`** (new)

| Subpath | Exports |
|---|---|
| `.` | `editorDevServer(options)` (the Vite plugin, from `app/sitePlugin.mjs`), `createFileApi({ root })` (a framework-free `node:http` handler over engine `fsStorage`), `renderPreview({ dir, path })`, `compileSiteCss(dir)`, `localizeFonts(urls, { display, cacheDir })`, `jsonDataSources(data)`, `localHost(dir)` (the `image_url` / `file_url` / `icon` providers) |
| `./client` | `httpStorage({ base, site })`, `devCanvasHost({ base, site })` (the browser side) |

**`pagehub-editor` (cli)**: `bin` only. Commands: `open [dir]` (the default), `check [dir…]` (parse, lint
and render every page, JSON report, exit 1 on errors), `lint [dir]`. `import` comes later (BUILD-PLAN S4.1).

### 2.3 Host adapters (the seams that make the editor embeddable)

| Adapter | Shape | Dev fill (`dev-server/client`) | PageHub fill (Part 2) |
|---|---|---|---|
| `storage` (exists) | `StorageSpec` + **new optional** `writeBatch(writes, { baseVersions })` | `httpStorage` over `createFileApi` | one `Page.sourceDraft` manifest update per save |
| `canvasHost` (**new**, `EditorProps.canvasHost`) | `{ siteCss(state): Promise<string>; fonts(urls): Promise<LocalFonts \| null>; runtimeUrl: string \| null; previewUrl(route): string \| null; host: HostProviders; data(): Promise<Record<string, unknown>> }` | `/__site.css`, `/__fonts`, `/__runtime.js`, `/~view/<site>`, `data.json`, `icons.json` | compile endpoint, `/api/v1/sites/[id]/fonts`, `/_ph/rt/<v>/runtime.js`, `/view/<id>`, `render-data` |
| `canvasRender` (exists) | `(state, path) => Promise<string>` | default | `createWorkerRenderer` |
| `./host` facets | media, icons, fonts, colours, blocks, presets | memory | Media library, icon registry, block catalogue |

With no `canvasHost`, the canvas renders with no site CSS, the remote font `<link>`s, no runtime, and no
"open in new tab" button. Nothing falls back to a hard-coded URL.

### 2.4 Where the PageHub-specific code goes

Nothing in `packages/*` may name PageHub, Craft, Stripe endpoints or `ph-`. The CI guard comes in Pass 9.

| Today | Goes to | Why |
|---|---|---|
| `scripts/parity-sweep.mjs` (reads Mongo, imports pagehub.dev code) | `pagehub.dev/scripts/converter/parity-sweep.mjs` | PageHub's migration gate |
| `scripts/converter/diff.mts`, `scripts/converter/parity.mjs` (read `/tmp/conv-site.json` from `run-site.mts`) | `pagehub.dev/scripts/converter/` | Craft → HTML parity |
| `scripts/validate-sites.mjs` content checks `data-ph-map`, `raw-craft-fallback`, `visible-report-comment` | `pagehub.dev/scripts/converter/validate-sites.mjs`, a wrapper over the OSS `check()` | converter-specific; parse/render checks stay generic |
| `scripts/inventory/classify-chrome.mjs`, `docs/s3-chrome-files.tsv` | delete (the port is done; it stays in history) | SDK port tooling |
| `app/site-tailwind.css` (the `@pagehub/daisyui-spatial` tokens) | `pagehub.dev/scripts/converter/site-tailwind.css`. `run-site.mts` writes it into each bundle as `<site>/tailwind.css` | PageHub design system. The OSS convention is a site-local `tailwind.css` |
| `sites/` (28 converted **customer** sites) | `pagehub.dev/.html-first/sites/` (gitignored there). `run-site.mts:230` default changes; both repos read `SITES_ROOT` | customer content must never sit in the OSS working tree |
| `packages/editor/src/property-map/` migration data (`does`, `how`, `home`, `escalate`, `aliases`, Craft component lists, `renderMarkdown`) and `docs/s3-property-map.md` | `pagehub.dev/docs/strategy/html-first-property-map.md` + its generator in pagehub.dev | migration bookkeeping; the inspector keeps only the row data |
| `docs/HANDOFF.md`, `docs/BUILD-PLAN.md`, `docs/parity-audit.md`, `docs/parity-gaps.md`, `docs/s3-*.md`, `docs/s3-parity-states.json` (moves to tools), `packages/editor/PORTED.md` (table) | `pagehub.dev/docs/strategy/html-first-editor/` | internal process, people and budget notes, private paths |
| `site-runtime` defaults: `window.PageHub` (`src/hub.ts:9`), `/api/stripe/storefront-checkout` (`chunks/cart.ts:136`, `config.ts:8`), `pageId` (`config.ts:11`), `ph-cart` key (`chunks/cart.ts:97-103`), `ph:chat` (`chunks/chat.ts:15`) | neutral defaults in OSS; PageHub sets `cart.api`, `cart.key`, the chat event in `runtime-config` | runtime must be host-neutral |

Required pagehub.dev edits (each needs Will's OK, because that repo has other live sessions):
`run-site.mts:230` (default sites root), `run-site.mts:363` (imports `../../../pagehub-editor/scripts/validate-sites.mjs`,
which becomes `@pagehub/cli`'s `check()`), plus the new files above.

---

## 3. Move, split, merge and delete list

Paths are relative to the repo root. "→ ✗" means delete.

### 3.1 Root

| From | To | Note |
|---|---|---|
| `app/dist/` | ✗ | build output (gitignored already) |
| `parity-report.json`, `parity-report.md` | ✗; add `parity-report.*` to `.gitignore` | names customer sites |
| `vite.config.mjs` | `apps/playground/vite.config.mjs` | the app owns its config |
| `package.json` `scripts.demo`, `scripts.pagehub-editor` | ✗ | `demo` is replaced by the playground; the CLI gets a real `bin` |
| `package.json` `pixelmatch: ^8.0.0`, `pngjs: ^7.0.0` | pinned exact; moved to `tools/visual-regression/package.json` | everything else is pinned |
| `package.json` `react`, `react-dom`, `@vitejs/*`, `@tailwindcss/*`, `vite` | `apps/playground/package.json` / `packages/dev-server/package.json` | root keeps only repo tooling (tsx, typescript, @types/node) |
| `tsconfig.json` (editor-only include) | `tsconfig.json` with `references` to every package; jsx moves to `packages/editor/tsconfig.json` | one solution file for CI `tsc -b` |
| `.gitignore` | add `parity-report.*`, `tools/visual-regression/.out/`, `apps/playground/dist/`, `packages/*/dist/`; drop `/sites/` after Pass 7 | |

### 3.2 `app/` → `apps/playground/` and `packages/dev-server/`

| From | To |
|---|---|
| `app/main.tsx` | `apps/playground/src/main.tsx` (imports `@pagehub/editor` and `@pagehub/dev-server/client` by package name) |
| `app/index.html` | `apps/playground/index.html` |
| `app/sample.ts`, `app/localStorage.ts` | `apps/playground/src/sample/{sample.ts,localSampleStorage.ts}` |
| `app/devLatency.ts` | `apps/playground/src/dev/knobs.ts` (§3.7) |
| `app/vite-env.d.ts` | `apps/playground/src/vite-env.d.ts` |
| `app/styles.css` | `packages/editor/styles.css` (scoped, §2.2). The playground imports it |
| `app/httpStorage.ts` + `examples/_shared/main.tsx:19-33` | `packages/dev-server/src/client/httpStorage.ts`: one client, one protocol |
| `app/sitePlugin.mjs` (319) | split: `packages/dev-server/src/vitePlugin.ts` (watch + websocket + routing, ~120), `fileApi.ts` (over `fsStorage`, ~60; replaces the sha1 versions at `:38`), `sites.ts` (list / resolve / labels, ~80), `siteCss.ts` (~40), `devKnobs.ts` (opt-in, `:91-109`) |
| `app/render.mjs` (248) | `packages/dev-server/src/preview.ts` (uses engine `renderPage` + `matchRoute` + `jsonDataSources`, not `renderer.render`, closing html-first-publish §0 row 4), `localHost.ts` (`makeHost`, `:124`), `loadEngine` ✗ (packages resolve through the `source` condition), `buildRuntimeBundle` → `packages/site-runtime/src/bundle.ts` |
| `app/fonts.mjs` | `packages/dev-server/src/fonts.ts`; the `FACE` regex parser (`:20`, `:40-53`) → engine `canvas/fontLinks.ts` `parseFontFaces` (PageHub's `ensureSiteFonts` reuses it) |
| `app/site-tailwind.css` | PageHub side (§2.4). The OSS default base is `@import "tailwindcss"; @plugin "daisyui";` |
| `app/README.md` | `apps/playground/README.md` + `packages/dev-server/README.md` |

### 3.3 `cli/`, `examples/`, `scripts/`

| From | To |
|---|---|
| `cli/bin.mjs` | `packages/cli/src/bin.ts` with `"bin": { "pagehub-editor": "dist/bin.js" }`. `open` serves the **prebuilt** playground bundle + `createFileApi` over `node:http` (BUILD-PLAN S4.1); Vite is for contributors only |
| `cli/README.md` | `packages/cli/README.md` |
| `examples/_shared/serve.ts`, `examples/_shared/main.tsx`, `index.html`, `styles.css`, `defaultConfig.ts` | ✗; `pnpm example <name>` runs `pagehub-editor open examples/<name>/site --config examples/<name>/editor.config.ts` |
| `examples/_shared/headless.ts`, `types.ts` | `examples/_shared/` (kept; they're test helpers) |
| `examples/imported-zip/input/site.zip` + `input/site/` | keep one: the zip is built by `make-zip.ts`, so delete `site.zip` and gitignore it |
| `scripts/parity/{parity,compare,shoot-new,lib}.mjs` | `tools/visual-regression/src/` |
| `docs/s3-parity-states.json` | `tools/visual-regression/states.json` |
| `scripts/parity/demo/{fixture,liquidFixture,mediaFixture,demoData,themePresets}.ts` | `apps/playground/src/fixtures/` (`?fixture=<name>`) |
| `scripts/parity/demo/{main.tsx,build.mjs,serve.mjs,index.html,styles.css}` | ✗ (the playground replaces them; `serve.mjs:10` also collides with :5050) |
| `scripts/parity/demo/{inspect,verifyWrite,shot}.mjs` | `tools/visual-regression/src/probes/` (drive the playground) |
| `scripts/parity-sweep.mjs`, `scripts/converter/*`, `scripts/inventory/*` | PageHub / ✗ (§2.4) |
| `scripts/validate-sites.mjs` | generic part → `packages/cli/src/check.ts`; PageHub part → pagehub.dev (§2.4). `PH_SITES_DIR` (`:16`) and `SITES_ROOT` merge into `SITES_ROOT` |
| `scripts/rename-brand.mjs` | stays; extended with `--check` for `ph-` / `pagehub` in `packages/*/src` (Pass 9) |
| `packages/engine/scripts/gen-patterns.mjs` | stays |

### 3.4 Files over 600 LOC, and the split for each

| File | LOC | Split |
|---|---|---|
| `packages/editor/src/connectors/inspector/controls/elementControls.tsx` | 697 | `features/inspector/controls/element/`: `ButtonTypeControl.tsx` (`:66-116`), `TextValueControl.tsx` (`:117-147`), `IconValueControl.tsx` (`:148-207`), `VideoProviderControl.tsx` + `videoProviders.ts` (`:208-287`), `EmbedCodeControl.tsx` (`:288-301`), `FormElementControls.tsx` (tag / options / label, `:302-575`) + `formMarkup.ts`, `MapControls.tsx` (`:576-659`), `index`-free registry `elementControls.ts` (`elementControlFor`, `ElementControlRow`, `useLiveTag`, `:31-65`, `:660-697`). Also replace `escAttr` / `escText` (`:359-360`) with engine `escapeHtml` / `attrString`, and the `OPTION_RE` / `ICON_FILTER_RE` regex parsing (`:148`, `:417`) with engine `parseSource` + handles |
| `packages/site-runtime/test/runtime-new.test.ts` | 603 | by chunk: `test/chunks/{show,overflow,carousel,scroll-effect,fit-text,on,state}.test.ts`; also drop the "-new" name |
| `scripts/parity-sweep.mjs` | 546 | moves to PageHub; split there into `waivers.mjs`, `extract.mjs`, `old.mjs`, `report.mjs` |

Over the ~300 target (extract when touched; no dedicated pass):
`ui/inspector/controlSpecs.tsx` 438 (move the `*_OPTS` lists to `controlOptions.ts`),
`engine/src/editor/createEditor.ts` 410 (save / conflict → `editor/save.ts`),
`engine/src/edit/ops.ts` 389 (tag arguments → `edit/tagArguments.ts`),
`site-runtime/src/chunks/cart.ts` 332 (default adapter → `chunks/cart/localAdapter.ts`),
`connectors/inspector/LayoutPresetControl.tsx` 331, `engine/src/schema/t.ts` 330,
`connectors/theme/themeModel.ts` 305; tests `primitives.test.tsx` 472, `canvas-viewport.test.tsx` 438,
`controls.test.tsx` 350, `inspector-shell.test.tsx` 349.

### 3.5 Duplicates to consolidate (R3)

| Duplicate | Copies | One home |
|---|---|---|
| HTML / attribute escaping | `engine/src/runtime/escape.ts:4`, `engine/src/edit/ops.ts:228` (`escapeText`), `engine/src/canvas/fontLinks.ts:25`, `editor/.../componentRowControls.tsx:26`, `editor/.../elementControls.tsx:359-360`, `app/render.mjs:26` | `engine/src/runtime/escape.ts` (`escapeHtml`, `escapeAttr`, `escapeText`) |
| Image placeholder + host providers | `app/render.mjs:23,124-134` and `editor/src/ui/canvas/canvasContext.ts:31,53-64` | `dev-server/src/localHost.ts` (the editor gets them from `canvasHost.host`) |
| JSON-file readers | `canvasContext.ts:36` `readJson`, `app/render.mjs:110` `parseJson`, `scripts/parity-sweep.mjs:321` | `dev-server/src/sites.ts` |
| `httpStorage` | `app/httpStorage.ts`, `examples/_shared/main.tsx:19` | `dev-server/src/client/httpStorage.ts` |
| File API server | `app/sitePlugin.mjs:285-307` (sha1), `examples/_shared/serve.ts:70-79` (fsStorage) | `dev-server/src/fileApi.ts` over `fsStorage` |
| Editor chrome CSS | `app/styles.css`, `scripts/parity/demo/styles.css` (drifted), `examples/_shared/styles.css` | `packages/editor/styles.css` |
| Built-in Liquid object names | `engine/src/runtime/renderPage.ts:74` `BUILTIN_OBJECTS`, `engine/src/runtime/defineDataSource.ts:27` `RESERVED`, `editor/src/connectors/liquid/completions.ts:9` `SITE_OBJECTS` (also hard-codes PageHub's `products`, `cart`, `customer`) | `engine/src/runtime/objects.ts` `BUILTIN_OBJECTS` + `RESERVED_NAMES`; completions = built-ins ∪ registered `dataSourcesFacet` globals |
| `DataSourceDef` (two types, same name) | `engine/src/runtime/renderPage.ts:51`, `engine/src/runtime/defineDataSource.ts:19` (exported as `DefinedDataSource`, `index.ts:135`) | one `DataSourceDef` in `defineDataSource.ts`; `renderPage` takes it |
| `Path` type | `engine/src/state/changes.ts:10`, `engine/src/runtime/renderPage.ts:22` | `changes.ts` |
| Runtime attribute list | `site-runtime/src/index.ts:13` `RUNTIME_ATTRIBUTES` (10 names, stale) vs `src/chunks.ts:12` `CHUNK_SELECTORS` (19 chunks) + `src/core/*` | `RUNTIME_SELECTOR` derived from `CHUNK_SELECTORS` + core attributes, `needsRuntime(html)`; the README test already derives the same list (`test/readme.test.ts:12`) |
| Slot name list | `editor/src/components.ts:80-110` `SlotProps` and `:115-120` `SLOT_NAMES` (`satisfies` checks members, not completeness) | `SLOT_NAMES = Object.keys(DEFAULT_COMPONENTS)`, typed as `SlotName[]` |
| Drawer panel list | `editor/src/Editor.tsx:128-135` `DRAWER_META` + `isDrawerPanel`, and `chromeState.ts` `ChromePanel` | `isDrawerPanel = (p) => p in DRAWER_META` |
| `clamp` | `ui/dnd/geometry.ts:65`, `ui/media/crop/cropMath.ts:122`, `ui/overlays/useWindowFrame.ts:80` | `editor/src/primitives/math.ts` |
| `slugify` | `engine/.../componentCommands.ts:50`, `editor/.../savedModifiers.ts:30` | engine `slugify` |
| Host catalogue facets in two packages | engine `media/*` vs editor `blockSourceFacet`, `themePresetsFacet`, `fontPairingsFacet` | engine `./host` (§2.2) |
| Three dev servers | `app/sitePlugin.mjs`, `examples/_shared/serve.ts`, `scripts/parity/demo/serve.mjs` | `dev-server` (+ the playground) |
| Sites-root env names | `SITES_ROOT` (`app/sitePlugin.mjs:121`), `PH_SITES_DIR` (`scripts/validate-sites.mjs:16`, `run-site.mts:230`) | `SITES_ROOT` |

### 3.6 Dead code and leftovers

| What | Where | Action |
|---|---|---|
| Old `serve.mjs` / `build.mjs` | `app/serve.mjs`, `app/build.mjs` (deleted, uncommitted) | commit the delete (Pass 0) |
| Stale comment naming `serve.mjs` | `app/site-tailwind.css:4` | moves with the file (§2.4); fix the text |
| Unused `pending()` helper + its stale header | `editor/src/ui/shell/defaults.tsx:3-6, 38-43` | ✗ |
| ~300 exported symbols used only in their own file | full list from `node scratch/unused.mjs` (§4.4 method) | drop `export`; tests that need one import it from its file |
| Demo bundle and screenshots | `scripts/parity/.out/` | moves to `tools/visual-regression/.out/` (gitignored) |
| `site.zip` committed beside its source | `examples/imported-zip/input/site.zip` | generated by `make-zip.ts`; gitignore |
| Round-named tests | `editor/test/{add-panel,canvas,layers}-leftovers.test.tsx`, `site-runtime/test/runtime-new.test.ts` | rename by feature; fix or delete the 2 `FIXME(round10)` skips (`add-panel-leftovers.test.tsx:143,156`) |
| Outdated status text | `README.md:16-19` ("planned (S2/S3/S4)"), `packages/editor/README.md` ("Not built yet"), `packages/engine/README.md` ("seed") | rewritten in Pass 12 |

### 3.7 Dev-only knobs

| Knob | Today | Target |
|---|---|---|
| `?slow=`, `?fail=` | `app/devLatency.ts:7-21` (monkey-patches `window.fetch`) + `app/sitePlugin.mjs:91-109` (server side, also `SLOW_MS` / `FAIL` env) | `apps/playground/src/dev/knobs.ts` + `dev-server` option `devKnobs: true`, **off by default**; the CLI never enables it |
| `?demo=media` | `app/devLatency.ts:45-66` | `apps/playground/src/fixtures/media.ts`, chosen by `?fixture=media` (one fixture switch, shared with the visual-regression states) |
| `slowCanvasRender` | `app/devLatency.ts:28-38`, imports the editor's internal `ui/canvas/canvasContext.ts` | `apps/playground/src/dev/knobs.ts`, wraps the public `defaultCanvasRender` |
| `?sample=1` | `app/main.tsx:25` | stays (playground only) |
| `?role=client|viewer` | `examples/_shared/main.tsx:45` | playground option `?role=` |
| `window.__ph` test handle | `scripts/parity/demo/main.tsx` | `apps/playground/src/dev/testHandle.ts`, only with `?fixture=` |

### 3.8 `packages/editor` feature-folder restructure

Why: the code is split by where it was ported from (`ui/` = the look, `connectors/` = the wiring). A
feature spans two trees, and `chromeState.ts` (panels, drawer, zoom) sits in `ui/keyboard/`.

Rule: every file keeps its basename and moves into the target folder, with the subfolders inside it kept.
The two basename clashes are renamed. One codemod (`scripts/codemod/move-editor.mjs`, deleted after the
pass) moves the files and rewrites the imports from a mapping table.

| From | To |
|---|---|
| `ui/add/*` + `connectors/add/*` | `src/features/add/` |
| `ui/board/*` + `connectors/board/*` | `src/features/board/` |
| `ui/canvas/*` | `src/features/canvas/` |
| `ui/code/*` | `src/features/code/` |
| `ui/content/*` | `src/features/content-mode/` |
| `ui/diff/*` | `src/features/diff/` |
| `ui/dnd/*` | `src/features/dnd/` |
| `ui/empty/*` | `src/features/empty-state/` |
| `ui/inspector/*` + `connectors/inspector/**` + `connectors/propertyBinding.ts` + `property-map/{inspectorRows,build,types,runtime}.ts` + `property-map/entries/*` | `src/features/inspector/` (`rows/` holds the row data, minus the migration fields of §2.4) |
| `ui/keyboard/{domKeymap,platform,context}.ts` | `src/features/keyboard/` |
| `ui/keyboard/chromeState.ts` | `src/shell/chromeState.ts` |
| `ui/layers/*` + `connectors/layers/*` | `src/features/layers/` |
| `ui/liquid/*` + `connectors/liquid/*` | `src/features/liquid/` |
| `ui/media/**` + `connectors/media/*` | `src/features/media/` |
| `ui/menus/*` | `src/features/menus/` |
| `ui/modifiers/*` + `connectors/modifiers/*` | `src/features/modifiers/` |
| `ui/palette/*` | `src/features/palette/` |
| `ui/pickers/*` + `connectors/pickers/*` | `src/features/pickers/` |
| `ui/richtext/*` + `connectors/richtext/*` | `src/features/richtext/` |
| `ui/save/*` | `src/features/save/` |
| `ui/theme/*` + `connectors/theme/*` | `src/features/theme/` |
| `ui/toolbar/**` + `connectors/toolbar/**` | `src/features/toolbar/`; clashes: `ui/toolbar/ToolbarItem.tsx` → `ToolbarItemView.tsx`, `ui/toolbar/breakpoint-chip/BreakpointChip.tsx` → `BreakpointChipView.tsx` (the exported names already end in `View`) |
| `ui/topbar/*` | `src/features/topbar/` |
| `ui/shell/*` | `src/shell/` |
| `ui/primitives/*` + `ui/overlays/*` | `src/primitives/` |
| `react/*` + `embed/*` | `src/react/` |
| `connectors/nodeName.ts` | `src/state/nodeName.ts` |
| `state/*`, `Editor.tsx`, `components.ts`, `index.ts` | unchanged |
| `property-map/propertyMap.ts` (`renderMarkdown`, `HOMES`, `escalated`) | PageHub (§2.4) |

New public entries: `src/components.entry.ts` → `./components`, `src/primitives.entry.ts` → `./primitives`.
These are package entry points (`exports` subpaths), so they're allowed re-export files.

---

## 4. Quality issues found

### 4.1 Leaky abstractions

- `editor/src/ui/canvas/canvasContext.ts:75-85`: `siteCssText` is a **module-level** cache. Two editors on
  one page (or two sites in one tab) share one site's CSS. It moves into `canvasHost`, per editor.
- `canvasContext.ts:78`, `:100`, `frameDom.ts:106`, `PageSelector.tsx:72`: dev-server URLs (§1, item 1).
- `frameDom.ts:115-118`: the canvas re-enters the runtime through the `__phRuntimeStart` global, which only
  the dev bundle sets (`app/render.mjs:81`). A production runtime (`runtime.ts` → `start()`) wouldn't
  re-run on each frame write. Fix: `site-runtime` registers `globalThis.__siteRuntime = { start }` in
  every build, and the canvas reads that.
- `Editor.tsx:97,100`, `ui/shell/Sidebar.tsx:87`, `ui/canvas/CanvasFrame.tsx:217`, `ui/content/contentRole.ts:11`:
  `(editor as { role?: string }).role`. `<Editor editor>` is typed `Store`, but `createEditor` returns
  `Editor`, which has `role`. Type the prop as the engine's `Editor`.
- `canvasContext.ts:126`: `(store as Store & { data?: … }).data`. Same cause.
- `components.ts:14`: slot types import `DetailKind` from `ui/keyboard/chromeState.ts`. Shell state in a
  keyboard folder (fixed by §3.8).
- `ui/shell/defaults.tsx:63-66`: the `MediaManager` slot defaults to `null` ("no media manager in the open-source
  core"), but the core ships a working `connectors/media/MediaManager.tsx`, and every host re-adds it
  (`app/main.tsx:180`). The default should be the connector; it renders an empty state when no
  `mediaFacet` is registered.
- `DiffPreview` default slot: both hosts hide it (`app/main.tsx:180`, `examples/_shared/main.tsx:52`,
  "squeezes the editor"). The default must not break the layout. Mount it in the right drawer, or default it to `null`.
- `engine/src/elements/inspectorSpec.ts:31-61`: `TYPE_HIDE` / `TYPE_SECTIONS` are keyed by Craft component
  types (`FormElement`, `Background`, `MapPoint`) with "Today's `disable` lists (`components/*/*.craft.tsx`)".
  Rename to neutral element kinds (`text`, `image`, `form-control`, `map-pin`…) and drop the Craft references.
- `editor/src/property-map/entries/*`: inspector rows are keyed by Craft prop names (`typographyPreset`, scope
  `"Text Button Link"`). The keys become neutral row ids, and the Craft mapping moves to PageHub (§2.4).
- `editor/src/ui/add/ComponentsTab.tsx:27-29`: a hard-coded category list that includes "Stripe". Categories
  come from the block source.
- `engine/src/runtime/renderPage.ts:178`: `renderPage` can't pass `timeoutMs`, though `RenderCall` supports it
  (`createRenderer.ts`). The publish build needs `timeoutMs: 2000` (html-first-publish §2 step 1).
- `engine/src/runtime/pageHtml.ts:83`: `nonce="${nonce}"` isn't escaped. Use `escapeAttr`.
- `app/main.tsx:9`, `app/devLatency.ts:6`, `examples/_shared/main.tsx:12-13`, `examples/_shared/serve.ts:20`,
  `scripts/converter/diff.mts:8`, `scripts/parity/demo/main.tsx:9`: hosts import `../packages/*/src/*.ts` by
  path, so nothing proves the public API. After Pass 3, everything imports by package name, and a guard
  fails on `../packages/` outside `packages/`.

### 4.2 Naming that will embarrass in public

| Name | Where | Neutral |
|---|---|---|
| `data-ph-editor-scope` (48 uses), `data-ph-portal`, `data-ph-*` chrome attributes (`live`, `edge`, `drag-copy`, `role`, `rotate`, `popover`, `panel`, `right-drawer`, `floating-panel`, `chip-popover`, `bp-chip`, `prop-key`, `was-hidden`) | editor + `app/styles.css` | `data-editor-*` |
| `ph-*` chrome classes (`ph-select-*`, `ph-anim-preview`, `ph-modal-*`, `ph-panel`, `ph-palette-list`, `ph-rotate-cursor`, `ph-rt-chip`, `ph-richtext-css`), `--ph-editor-accent` | editor | `editor-*`, `--editor-accent` |
| `pagehub-editor` class, `pagehub-canvas-chrome` id, `--pagehub-outline-halo`, `data-pagehub-canvas-chrome`, TipTap extension `pagehubRichTextKeys` | `Editor.tsx:98`, `canvasCss.ts:7-36`, `RichTextLayer.tsx:203,208`, `richtext/session.ts:84` | `editor`, `editor-canvas-chrome`, `--editor-outline-halo`, `richTextKeys` |
| `data-ph-edit` (canvas mode on the published runtime), `data-ph-runtime` | `site-runtime/src/core.ts:36`, `overlays.ts:13`, `chunks/show.ts:4`, `frameDom.ts:117,119` | `data-editing` on `<html>` (outside the reserved `data-edit-*` namespace, which is stripped on publish) |
| `x-pagehub-liquid-expression`, `x-pagehub-handle` | `engine/src/schema/t.ts:297,301` | `x-liquid-expression`, `x-handle` |
| `window.PageHub` + `PageHub.on(name, fn)` in UI copy | `site-runtime/src/hub.ts:6-9`, `chunks/on.ts:7,24`, `editor/.../HandlersEditor.tsx:4,84,88`, `HandlerPicker.tsx:5`, `actionSpecs.ts:108`, `property-map/runtime.ts:48` | **Will's call** (needs the name): proposal `window.siteRuntime.on` |
| Kit classes **written into site source**: `ph-mod-*`, `ph-loop-*`, `ph-pattern-*`, `ph-marquee(-reverse)`, `ph-map-step-badge`, `ph-theme`, `ph-dismiss` | engine `kits/tailwind/{groups,phClasses}.ts`, `site-runtime/src/{kit,animate}.css`, editor modifier / animation presets, the PageHub converter | **Will's call before converter step a1**: a template author's names freeze at release (CONTRIBUTING), and 247 sites get written once. Proposal `kit-` (`kit-mod-grow`, `kit-loop-spin`, `kit-pattern-waves-1`, `kit-marquee`) |
| `ph:site` / `ph:reload` websocket events, `ph:chat` DOM event | `app/sitePlugin.mjs:16-17`, `chunks/chat.ts:15` | `site:changed`, `site:reload`, `site:chat` |
| `pagehubSites` plugin, `"pagehub-sites"` | `app/sitePlugin.mjs:119,162` | `editorDevServer` |
| `pagehub-editor-monorepo` | `package.json:2` | from `brand.json` |
| Test files named after rounds | §3.6 | by feature |

`scripts/rename-brand.mjs` only rewrites package names and display strings. Pass 9 adds
`scripts/check-names.mjs` (CI): it fails on `/\bph[-:_]|data-ph-|pagehub/i` in `packages/*/src`, outside the
allowlist of `brand.json` reads.

### 4.3 API and slot oddities

- The `MediaManager` slot takes `chromeless` (`components.ts:53-54`), a framing detail of the drawer. The drawer
  should frame any slot, so drop the prop and let the drawer own the frame.
- `InspectorDetail` (`components.ts:74-77`) is a slot whose `kind` decides which of 5 editors renders. Hosts
  can't replace one editor without replacing all five. Split it into slots per kind, or a facet `detailEditorsFacet`.
- `rightDockOffset` (`Editor.tsx:56`) is a pixel number for host sidebars. That's fine, but document it in the embedding guide, not only in `docs/right-drawer.md`.
- `ComponentsMap` makes every slot required (`components.ts:113`), so `DEFAULT_COMPONENTS` must list
  every one. That's correct, but `resolveComponents` (`:122`) throws on unknown keys while TypeScript already
  rejects them. Keep the runtime check (JS hosts) and say so in the doc comment.
- `engine` `.` mixes the editor core and the renderer. A server render (`/api/site-render`) imports
  `createEditor`'s module graph. The `./render` subpath fixes the surface; `sideEffects: false` keeps
  bundles small.
- The `site-runtime` `index.ts` comment says "this entry is the API; the script a page loads is built from
  `runtime.ts`", but nothing ships the built script as a package export (`files: ["src","LICENSE"]`).

### 4.4 How the dead-export list was made

`node <scratch>/unused.mjs .`: for every `export` in `packages/*/src` (excluding `index.ts`), count the
other files in `packages`, `app`, `examples`, `scripts` and `cli` that mention the name. 668 have no
non-test use. 309 of those aren't re-exported from any package entry either, so they're only used in their
own file. Biggest clusters: `editor/ui/canvas` 40, `engine/kits/html` 28, `editor/ui/dnd` 23,
`editor/ui/inspector` 16, `editor/ui/keyboard` 14, `editor/connectors/board` 14. Pass 5 commits the script
as `scripts/check-api.mjs --unused`.

---

## 5. OSS hygiene

| Item | Today | Target |
|---|---|---|
| `LICENSE` | MIT, "Copyright (c) 2026-present PageHub" in the root and each package | keep. `packages/editor/LICENSE` adds the ported SDK notice "Copyright (c) 2024-present PageHub" (`PORTED.md:3`). Pattern Monster's `LICENSE.md` / `NOTICE.md` stay with `patternData.ts` |
| `NOTICE` | none | root `NOTICE`: third-party data (Pattern Monster MIT, Google Fonts catalogue names), the ported SDK code |
| Per-package `package.json` | `version 0.0.0`, `exports` → `src/*.ts`, `files: ["src","LICENSE"]`, no `repository` / `homepage` / `keywords` / `engines` / `types` | `version 0.1.0-alpha.0`; `exports` with a `source` condition → `src`, `types` → `dist/*.d.ts`, `import` → `dist/*.js`; `files: ["dist","src","README.md","LICENSE"]`; `repository.directory`, `homepage`, `bugs`, `keywords`, `engines.node ">=22"`, `sideEffects` (engine / editor `false`, site-runtime `["./src/runtime.ts","./dist/runtime.js"]`), `publishConfig.access public`; `dev-server` / `cli` / `apps` / `tools` declare what they import (pnpm doesn't hoist) |
| Dev resolution | Vite alias for the engine only (`vite.config.mjs:15`); editor by relative path | `resolve.conditions: ["source"]` in Vite, `tsx --conditions=source` in test scripts. No aliases |
| READMEs | stale (§3.6) | one per package: what it is, install, a 10-line usage example, its exports table (§2.2), link to the docs |
| `CONTRIBUTING.md` | DCO, 600-line rule, frozen names | + repo layout, the gate commands, how to run the playground, "one implementation" (R3), the names guard |
| `CODE_OF_CONDUCT.md` | none | Contributor Covenant 2.1, by reference + a contact |
| `SECURITY.md` | none | private report address, supported versions, scope (renderer sandbox, `checkContentOnly`, CLI bind address and path traversal, sanitizer) |
| Examples story | 4 sites + a separate server | `pnpm example <name>` opens each with the CLI; `apps/playground` = `liquid-store` in memory storage with "Show diff" (BUILD-PLAN S5.4); README "Try it" section |
| Tests | root `pnpm test` skips examples; packages have no `test` script | `"test"` per package (`tsx --conditions=source --test "test/**/*.test.ts*"`), examples as a workspace package with its own `test`, root `test` = `pnpm -r test` |
| CI | `ci.yml`: Node 24, `brand:check`, `pnpm test`, DCO on PRs | matrix Node 22 + 24: install (frozen), `pnpm -r test`, `node scripts/check-file-size.mjs` (fail > 600 LOC in `packages/*/src`), `check-names.mjs`, `check-api.mjs`, `pnpm -r build`, `tsc -b` (CI only), `publint` + `@arethetypeswrong/cli` on each package, license allowlist (MIT / ISC / BSD / Apache-2.0), gitleaks, DCO. Release: changesets + `publish.yml` with npm OIDC |

### 5.1 Secrets, private paths and customer data

Scanned 2026-10-21 (working tree + every commit, `git log --all -p`):

- **No secrets found** (patterns: `sk_live|sk_test|pk_live`, `AKIA…`, `mongodb://`, private keys, `ghp_`, `R2_SECRET`, `CLOUDFLARE_TOKEN`).
- **Customer data:** `sites/` (28 converted customer sites) was **never committed** (gitignored), and
  `parity-report.*` is untracked. The only site id in history is Moss & Fern (`docs/parity-gaps.md`),
  PageHub's own test store. Both still leave the working tree (§2.4) so a `git add -A` can't publish them.
- **Private paths in tracked files:** `/Users/admin/...` in `docs/HANDOFF.md`, `docs/parity-audit.md`,
  `docs/parity-gaps.md`; `pagehub.dev/...` source paths in `app/styles.css:15,23,75,107,116,139`,
  `scripts/parity/demo/styles.css:60,92`, `scripts/converter/*`, `scripts/parity-sweep.mjs`,
  `packages/editor/test/richtext.test.tsx`. All move or get reworded (Passes 2, 5).
- **History needs care before a public push:**
  - all 269 commits carry the personal address `gcphost@gmail.com`;
  - 48 commits have no `Signed-off-by` line (CONTRIBUTING requires one; CI checks PRs only);
  - commit `76f140c` removed accidentally committed `node_modules` symlinks;
  - internal docs (HANDOFF: people, budgets, "who Will is") and `/Users/admin` paths live in old commits.
  - **Recommendation (Will's call):** publish from a fresh root commit (`git checkout --orphan public`
    after Pass 12, one signed-off "Initial public release" commit under a project address), and keep this
    history private. Rewriting with `git filter-repo` is the alternative; it's more work for the same result.

---

## 6. Execution order

Each pass ends with all five gates green (top of this doc) and one or more commits on `main`
(`git commit -s`). No pushes. Sizes: **S** ≤ 15 files, **M** 15–60, **L** 60+ (mostly mechanical).

| # | Pass | Size | Depends on | Parallel with | Owns (no one else edits these during the pass) |
|---|---|---|---|---|---|
| 0 | **Baseline and commit the day's work.** Run the gates, then commit today's 86-file diff in logical commits (app → Vite; editor canvas / inspector / loading states; engine text filters; site-runtime cart / form / map / state). Add `parity-report.*` to `.gitignore`, delete `app/dist/`, fix `app/site-tailwind.css:4` | S | — | — | whole tree |
| 1 | **Repo hygiene.** `CODE_OF_CONDUCT.md`, `SECURITY.md`, `NOTICE`, `packages/editor/LICENSE` notice, per-package `test` scripts, root `test` = `pnpm -r test`, examples as a workspace package with `test`, pin `pixelmatch` / `pngjs`, CI matrix (tests only for now) | S | 0 | 2 | root `*.md`, `.github/`, `package.json` files, `pnpm-workspace.yaml` |
| 2 | **Move PageHub's code out.** `scripts/parity-sweep.mjs`, `scripts/converter/*`, `scripts/inventory/*`, `docs/{HANDOFF,BUILD-PLAN,parity-audit,parity-gaps,s3-*}.md`, the `PORTED.md` table → pagehub.dev destinations (§2.4); delete them here. Write `docs/roadmap.md` + `docs/decisions.md` (the public subset of BUILD-PLAN's decisions). `validate-sites.mjs` stays (it's a gate) until Pass 7 | S | 0, **Will's OK for pagehub.dev commits** | 1 | `scripts/` (except `validate-sites.mjs`), `docs/` |
| 3 | **Engine surface.** Subpaths `./render`, `./kits`, `./host`, `./canvas` (§2.2); move the editor's three host facets into `./host`; one `DataSourceDef`, one `Path`; `runtime/objects.ts` (built-in names); escape helpers (§3.5); `nonce` escaping; `x-pagehub-*` keys; neutral `inspectorSpec` kinds; `renderPage({ timeoutMs })`. Rewrite engine and editor imports | M | 0 | — (touches `engine/src/index.ts` and editor imports) | `packages/engine/**`, editor import lines |
| 4 | **Editor feature folders** (§3.8), by codemod. Pure moves and import rewrites, no logic change | L | 3 | 8 | `packages/editor/**` |
| 5 | **Editor API and adapters.** Shrink `index.ts` to §2.2; add `./components` and `./primitives` entries; `packages/editor/styles.css` (scoped; delete the two copies); `CanvasHost` (remove every `/__*`, `/~view`, `location.search`, `data.json`, `icons.json`, `imageBase` from the editor; a guard test greps for them); type `editor` as the engine `Editor` (no `role` casts); `SLOT_NAMES` derived; `DiffPreview` / `MediaManager` defaults; drop `pending()`; un-export the own-file-only symbols; split `InspectorDetail` | L | 4 | — | `packages/editor/**`, `app/main.tsx`, `examples/_shared/main.tsx` |
| 6 | **Split oversize files.** `elementControls.tsx` (§3.4, with the engine-parse rewrite), `runtime-new.test.ts`, rename the "leftovers" tests, fix or delete the 2 skipped tests | M | 5 | 7, 10 | `packages/editor/src/features/inspector/controls/**`, `packages/editor/test/*leftovers*`, `packages/site-runtime/test/**` |
| 7 | **`dev-server`, `cli`, `apps/playground`.** Build the new packages from `app/*` and `cli/` (§3.2, §3.3); file API over `fsStorage`; preview through `renderPage` + `matchRoute` + `jsonDataSources`; site-local `tailwind.css`; delete `examples/_shared/serve.ts` and the parity demo; fence the dev knobs (§3.7); `cli check` replaces the generic half of `validate-sites.mjs`. The gate becomes `node packages/cli/dist/bin.js check $SITES_ROOT/*` plus PageHub's wrapper. Move `sites/` out (§2.4). `tools/visual-regression` drives the playground | L | 5, 8, `matchRoute` seam from 10 | 6, 10 | `packages/dev-server/**`, `packages/cli/**`, `apps/**`, `tools/**`, `examples/_shared/**`, `app/`, `cli/`, `scripts/validate-sites.mjs`, `scripts/parity/**` |
| 8 | **site-runtime packaging and neutral defaults.** `RUNTIME_SELECTOR` / `needsRuntime` (delete `RUNTIME_ATTRIBUTES`); build → `dist/` with `manifest.json` (content-hash version) and `./assets/*` exports; `./bundle` (`bundleInline`, from `app/render.mjs:67`); `globalThis.__siteRuntime` re-entry in every build; cart: no PageHub default endpoint, `cart.key` replaces `pageId` namespacing; `ph:chat` → configurable `chat.event`. Kit class names wait for Pass 9 | M | 0 | 4 | `packages/site-runtime/**` (except kit CSS class names) |
| 9 | **Neutral naming sweep** (§4.2): chrome `data-ph-*` / `ph-*` / `pagehub-*`, `data-ph-edit` → `data-editing`, websocket event names, plugin name; the runtime global and the kit prefix **once Will picks them**; `scripts/check-names.mjs` in CI | M | 5, 7, 8; Will's two names | — (touches every package) | whole tree |
| 10 | **Integration APIs** (§7): engine `pageReads`, `classesInMarkup`, `matchRoute`, `collectSources`, `ENGINE_VERSION`, `parseFontFaces`, fallback-face support in `fontHeadTags`; `StorageSpec.writeBatch` + `StorageError` codes; runtime prefetch-on-hover. **Seam first:** commit `engine/src/runtime/matchRoute.ts` (signature + implementation moved from `app/render.mjs:149`) before Passes 6 and 7 start | M | 3 | 6, 7 | `packages/engine/src/{runtime,storage,canvas}/**` (new files + `renderPage.ts`, `defineStorage.ts`, `fontLinks.ts`), `packages/site-runtime/src/core.ts` (prefetch only, after Pass 8) |
| 11 | **Build and publish readiness.** esbuild → `dist/` per package, `.d.ts` in CI (`tsc -b --emitDeclarationOnly`), `exports` with the `source` condition, `files`, `publint`, `attw`, `check-file-size.mjs`, `check-api.mjs` + `api.txt` snapshots, changesets, `publish.yml`, the full CI matrix (§5) | M | 9, 10 | 12 | `packages/*/package.json`, `packages/*/scripts/build.*`, `scripts/check-*.mjs`, `.github/` |
| 12 | **Docs.** Package READMEs, `docs/{architecture,format,embedding,plugins,security}.md`, the root README "Try it", `right-drawer.md` folded into `embedding.md`. Then the fresh public root commit (§5.1), on Will's go-ahead | M | 9 | 11 | `README.md`, `packages/*/README.md`, `docs/**` |

Parallel groups (disjoint file ownership): **{1, 2}** → **3** → **{4, 8}** → **5** → **{6, 7, 10}**
(with the `matchRoute` seam committed first) → **9** → **{11, 12}**.

Rough size: 13 passes, about 4 L, 6 M, 3 S. The L passes are mostly mechanical (codemods, moves).

Per-pass verification beyond the gates:

- **Pass 3, 5:** `npx tsx -e 'import("./packages/engine/src/index.ts").then(m=>console.log(Object.keys(m).length))'`
  (and per subpath) matches the §2.2 table. Grep each exported type name in its source file first (HANDOFF trap 3: type-only
  exports of missing names pass every test).
- **Pass 5:** `grep -rnE '__site|__fonts|__runtime|~view|location\.search|data\.json|icons\.json' packages/editor/src` returns nothing.
- **Pass 7:** `pnpm --filter playground dev` serves on 127.0.0.1:5050 (never start or stop Will's running
  server; ask first), and `pagehub-editor open examples/liquid-store/site --no-open` answers on another port. The 28 sites still `check` with 0 errors.
- **Pass 9:** `node scripts/check-names.mjs` exits 0.
- **Pass 11:** `npm pack --dry-run` per package lists only `dist`, `src`, `README.md`, `LICENSE`, `package.json`.

---

## 7. Integration readiness (html-first-publish.md §8 build order)

| Step | What PageHub builds | What this repo must provide | Pass |
|---|---|---|---|
| **a1** converter naming (`collections.<slug>`, `products`) | `dataSource.ts` `loopExpr`, `run-site.mts` data | Editor completions from registered data sources, not the hard-coded `SITE_OBJECTS` (`completions.ts:9`). **Kit class prefix and runtime global decided** (§4.2): they're written into every site at the same moment | 3, 9 |
| **b1** bucket + `site-edge` Worker | Worker, `resolveSiteRoute` | nothing | — |
| **b2** `proxy.ts` + `scripts/upload-site-runtime.mjs` | the upload script | `site-runtime` `dist/` + `manifest.json` `{ version (content hash), files }`, exported as `./assets/*`; `globalThis.__siteRuntime` re-entry in the production build | 8 |
| **b3** Vercel rewrite checks | — | nothing | — |
| **c1** engine: `pageReads()`, policy-free `PageRecord`, `classesInMarkup` in the engine | — | `engine/src/runtime/pageReads.ts` (`Liquid#globalVariableSegments` over `collectSources`, exported), `engine/src/runtime/classesInMarkup.ts` (ported from `pagehub.dev/packages/sdk/src/render/static/classesInMarkup.ts`), both on `./render`. `PageRecord` stays as it is (`renderPage.ts:25`) | 10 |
| **c2** `renderSitePage`, `buildSiteRelease`, `ensureSiteFonts`, `/api/site-render` | all of it | `./render` stable surface; `renderPage({ timeoutMs })`; `needsRuntime(html)` (step 7 of §2 needs it; today's `RUNTIME_ATTRIBUTES` misses `data-map`, `data-state-*`, `data-carousel`, …, so those pages would ship without the runtime); `kit.css` / `animate.css` as package exports; `patternCss` on `./kits`; `parseFontFaces` (the `FACE` parser `ensureSiteFonts` needs) and fallback `@font-face` emission in `fontHeadTags` (`swap` + metric overrides, §4.3); `ENGINE_VERSION` for `SiteRelease.engineVersion` | 3, 8, 10 |
| **c3** `validate-sites` + `parity-sweep` through `renderPage` with production data sources | PageHub's wrappers + data sources | `cli check()` and dev-server preview render through `renderPage` (not `renderer.render`, `app/render.mjs:216`), with `jsonDataSources(data.json)` shaped exactly like production `defineDataSource` sources, and `matchRoute` for `:param` pages | 7, 10 |
| **c4** NUL bytes in `snapshotSite.ts` | PageHub only | nothing | — |
| **c5** end-to-end on test sites | — | nothing new | — |
| **d1** maintenance mode | PageHub only | the editor shows a host-supplied read-only banner: `role: "viewer"` exists; add a `notice` prop on `<Editor>` (or a `SaveBanner` state) so the dashboard can say why | 5 |
| **d2** new-editor save path (`files` branch of `save.js`, `409 site_format_changed`) | the PageHub storage adapter | `StorageSpec.writeBatch(writes, { baseVersions })`, optional, used by `Editor.save()` when present, so one save = one manifest write (save.js: one Page read, respond after the write); `StorageError` with `code` (`"conflict" \| "format_changed" \| "forbidden" \| "offline"`) so the editor shows the right banner instead of a generic failure | 10 |
| **e1–e2** rehearsal | PageHub only | the `cli check` exit code + JSON report are stable inputs to the gate | 7 |
| **f** the window | PageHub only | a tagged engine + runtime version pinned by the submodule | 11 |
| **P3** editor swap on the dashboard design route (html-first.md Part 2) | the dashboard host | `@pagehub/editor/styles.css` scoped (no preflight leak into the dashboard); `canvasHost` filled with the compile endpoint, `/api/v1/sites/[id]/fonts`, `/_ph/rt/<v>/runtime.js`, `/view/<id>`; `canvasRender` = `createWorkerRenderer` + `GET /api/v1/sites/[id]/render-data`; `MediaManager` slot, `./host` facets, `site.publish` command, top-bar host buttons, `rightDockOffset`, `identity: "persisted"`, `blockProvenance`, roles | 3, 5 |
| **P3b** emails | email profile | renderer `profile: "email"` (not built; later) | later |

---

## 8. Decisions for Will

**Decided 2026-10-21 (final):**

1. **Package scope:** `@pagehub/*`: `@pagehub/engine`, `@pagehub/editor`, `@pagehub/site-runtime`, `@pagehub/dev-server`, `@pagehub/cli`. Packages are not renamed in Pass 1; the rename lands with the naming sweep (Pass 9) via `rename-brand.mjs`.
2. **Kit class prefix:** keep `ph-`.
3. **Runtime global:** keep `PageHub`.
4. **Public history:** a fresh root commit using Will's GitHub noreply email, done at Pass 12.
5. **PageHub-only files:** move into pagehub.dev (Pass 2).
6. **Commits:** none until the code is right; passes leave the tree uncommitted for now.

**Was open (superseded by the above):**

1. **Project name and npm scope** (open since BUILD-PLAN D1). Everything here works with the placeholder, and `rename-brand.mjs` renames it.
2. **Kit class prefix** written into site source (proposal `kit-`). Needed before converter step a1.
3. **Runtime global** for `data-on` functions (proposal `window.siteRuntime`).
4. **Public history:** fresh root commit (recommended) or `filter-repo`, and which commit address to use.
5. **OK to commit the moved files in pagehub.dev** (Pass 2 and Pass 7), given its other live sessions.
