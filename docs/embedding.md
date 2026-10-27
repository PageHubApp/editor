# Embedding the editor

`@pagehub/editor` is a React component. You give it a [storage adapter](storage.md) for your files and a **canvas host** for the things around them (your stylesheet, fonts, a preview link), and it does the rest. It never fetches or hard-codes a URL itself.

## Install

```bash
pnpm add @pagehub/editor @pagehub/engine react react-dom
```

React 19 is a peer dependency. Runnable examples (plain HTML, Vite + React, Next.js) are in [PageHubApp/demos](https://github.com/PageHubApp/demos).

## Styles

The editor ships its chrome stylesheet as Tailwind v4 + DaisyUI source, so your build compiles it. Import it from a Tailwind entry file:

```css
/* app.css */
@import "@pagehub/editor/styles.css";
```

Everything is scoped to the editor (`[data-ph-editor-scope]`, which `<Editor>` puts around its UI and its overlays), and there's no global reset. Embedding it never restyles your page. If your own markup needs Tailwind's global base, import `tailwindcss/preflight.css` yourself.

## Mount it

In React:

```tsx
import { Editor } from "@pagehub/editor";

export function Page() {
  return (
    <div style={{ height: "100vh" }}>
      <Editor storage={storage} canvasHost={canvasHost} onEvent={onEvent} />
    </div>
  );
}
```

Without writing React:

```ts
import { mountEditor } from "@pagehub/editor";

const { unmount } = mountEditor(document.getElementById("editor")!, { storage, canvasHost });
```

The editor fills its parent, so give the parent a height. While the files load, it shows a skeleton. If the storage can't be opened, it shows an inline error with **Retry**.

### Props

| Prop | What it does |
|---|---|
| `storage` | A [storage adapter](storage.md). `<Editor>` opens the site from it. |
| `editor` | Instead of `storage`: an editing core you opened yourself with `createEditor`. Its extensions must include `editorKit()`. |
| `extensions` | The kits and plugins for the site. Default: `htmlKit()`, `tailwindKit()`, `liquidKit()`. See [extending](extending.md). |
| `role` | `"owner"` (default), `"editor"`, `"client"` (content mode: text and images only, no structure changes) or `"viewer"` (read-only). |
| `data` | Sample data for data-bound pages in the canvas. |
| `identity` | `"session"` (default) or `"persisted"` (`data-edit-id` stored in the files). |
| `canvasHost` | What the canvas needs from you. See below. |
| `canvasRender` | Replace how the canvas renders a page (for example in a worker). Default: the engine's tags and filters over the editor's data. |
| `components` | Replace or hide any piece of the UI. See below. |
| `onEvent` | Receives `saved`, `conflict`, `selection`, `diff` and `change` events. |
| `onReady` | Called with the core once it's open. |
| `rightDockOffset` | Pixels of your own sidebars on the editor's right edge. See below. |
| `platform` | Pin the shortcut key to `"mac"` or `"other"`. Detected by default. |
| `active` | `false` while you hide the editor, so it handles no keys. |
| `className` | Class for the root element. |

## The canvas host

The canvas shows the page as visitors see it, so it needs things only you know. Each member is optional, and a member you leave out is simply not done.

| Member | Used for | If left out |
|---|---|---|
| `siteCss(state)` | The site's compiled stylesheet, inlined into every canvas frame. Kept per editor and refreshed in the background. | The page paints with only its own `<head>`. |
| `fonts(urls)` | Self-hosted copies of the theme's web fonts (`{ css, preload }`, or `null`). | The remote font `<link>` tags. |
| `runtimeUrl` | The [site runtime](site-runtime.md) module, booted in each frame in edit mode. | No runtime in the canvas. |
| `previewUrl(route)` | The "Open in new tab" link on the page pill. | No link. |
| `host` | `image_url`, `file_url` and `icon` filter providers. | URLs pass through, and an image id paints a placeholder. |
| `data()` | Sample or connector data, merged under `editor.data`. | None. |

```ts
import type { CanvasHost } from "@pagehub/editor";

const canvasHost: CanvasHost = {
  siteCss: async () => (await fetch("/site.css")).text(),
  runtimeUrl: "/assets/runtime.js",
  previewUrl: (route) => `/preview${route}`,
  host: { imageUrl: (id, { width }) => `https://cdn.example.com/${id}?w=${width}` },
};
```

`devCanvasHost` in `@pagehub/dev-server/client` is a complete implementation over the dev server's endpoints.

## Replace parts of the UI

Every visible piece is a named slot. Replace one with your own component, or hide it with `null`:

```tsx
<Editor storage={storage} components={{ TopBar: MyTopBar, LayersPanel: null }} />
```

The slots are `TopBar`, `PageSelector`, `BreakpointSwitcher`, `SaveStatus`, `Sidebar`, `AddPanel`, `LayersPanel`, `Inspector`, `InspectorSection`, `Breadcrumb`, `Canvas`, `ComponentBoard`, `CanvasOverlays`, `NodeTools`, `InlineTextToolbar`, `ContextMenu`, `CommandPalette`, `MediaManager`, `ThemePanel`, `ModifiersPanel`, `InspectorDetail`, `ColorPicker`, `IconPicker`, `FontPicker`, `CodeView`, `DiffPreview`, `SaveBanner` and `EmptyState`. The props each receives are exported as types (`SlotProps`, `MediaManagerProps`, `PanelProps` and so on).

- `@pagehub/editor/components` exports the default components, so you can wrap one instead of rewriting it.
- `@pagehub/editor/primitives` exports the building blocks for new panels: `Modal`, `Drawer`, `FloatingPanel`, `AnchoredPopover`, `Chip`, `PopoverChip`, the toolbar controls, `MenuSurface`, `Skeleton`, `Spinner`, `InlineError`, `Icon` and `tooltip`.
- Inside a slot, `useEditorStore`, `useEditorState`, `useRunCommand` and `useUi` read and drive the editor.

**Media is yours to provide.** `MediaManager` is `null` by default, so the Media panel and the image picker stay inert until you pass one. The editor exports the standard manager from `@pagehub/editor/components`:

```tsx
import { MediaManager } from "@pagehub/editor/components";

<Editor storage={storage} components={{ MediaManager }} />
```

The manager reads its library from the `mediaFacet` in `@pagehub/engine/host`. Other catalogues you can supply there: icons, fonts, theme colors, blocks, theme presets and font pairings.

## The right-hand drawer

The big panels (**Theme**, **Media**, **Modifiers**) and the inspector's larger editors (**Show only when**, **Repeat for each**, **Edit HTML**, **Action**, **Event handlers**) open in one drawer docked to the editor's right edge, one at a time. It pushes the canvas aside instead of covering it, and **Esc** closes it.

If your app has sidebars on the same edge, tell the editor how wide they are:

```tsx
<Editor storage={storage} rightDockOffset={320} />
```

The editor reserves that many pixels on its right as padding, so the canvas never runs under your sidebars and the drawer opens just inboard of them. The default is `0`. Change the number whenever your sidebars open, close or resize.

```
┌──────────────────────────────── editor ─────────────────────────────────┐
│ top bar                                                                  │
├──────────┬──────────────────────────────┬───────────┬────────────────────┤
│ sidebar  │ canvas (shrinks)             │ drawer    │ rightDockOffset    │
│          │                              │           │ (your sidebars)    │
└──────────┴──────────────────────────────┴───────────┴────────────────────┘
```

## Save errors

When the storage throws a [`StorageError`](storage.md#errors), the save banner and the top bar's save icon say what happened, using the error's `code`:

- `maintenance` is **editing paused**, not a failure. It shows an amber status (with the storage's `detail` text if it gave one), keeps the draft in the editor and offers **Try again**. It clears itself on the next successful save.
- `network` says the server can't be reached, with **Try again**.
- `format_changed` says the site was upgraded and the page must be reloaded.
- `forbidden`, `not-found`, `too-large` and `conflict` each say what happened. Only errors where trying again can help show **Try again**.

If your storage has `writeBatch`, a save is one call, so a conflict on any file saves none of them. The conflict banner (**Reload theirs** / **Keep mine**) lists the stale files.

## Events

```tsx
<Editor
  storage={storage}
  onEvent={(event) => {
    if (event.type === "saved") console.log("wrote", event.written);
    if (event.type === "change") markDirty(event.dirty); // unsaved paths, after 500 ms of quiet
  }}
/>
```

| `type` | Fields | When |
|---|---|---|
| `change` | `dirty` | The text changed and went quiet. `dirty` is what a save would write. |
| `saved` | `written` | A save wrote files. |
| `conflict` | `path`, `theirs`, `version` | A file collided with a newer version. |
| `selection` | `handles`, `primary` | The selection changed. |
| `diff` | `files` | Every change, with the pending diff per file. |
