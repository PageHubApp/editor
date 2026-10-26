# @pagehub/editor

The embeddable visual editor for HTML and Liquid. It edits the source **in place**: every change is a minimal splice, so the rest of the file stays byte for byte as it was.

It runs on the headless core in [`@pagehub/engine`](../engine) (source text, transactions, commands). Every piece of its UI is a named slot you can replace or hide.

## Install

```bash
pnpm add @pagehub/editor @pagehub/engine react react-dom
```

React 19 is a peer dependency. Import the stylesheet from a Tailwind v4 entry file, because it ships as Tailwind + DaisyUI source:

```css
@import "@pagehub/editor/styles.css";
```

It's scoped to the editor and adds no global reset, so it never restyles your page.

## Use it

```tsx
import { Editor } from "@pagehub/editor";

<div style={{ height: "100vh" }}>
  <Editor storage={storage} canvasHost={canvasHost} />
</div>;
```

`storage` is a [storage adapter](../../docs/storage.md) (`memoryStorage`, `fsStorage`, or your own). Without React:

```ts
import { mountEditor } from "@pagehub/editor";

const { unmount } = mountEditor(document.getElementById("editor")!, { storage, canvasHost });
```

Replace or hide any part of the UI through `components`:

```tsx
import { MediaManager } from "@pagehub/editor/components";

<Editor storage={storage} components={{ MediaManager, LayersPanel: null }} />;
```

The [embedding guide](../../docs/embedding.md) covers every prop, the canvas host, the slot list, the right-hand drawer, save errors and events.

## Entry points

| Import | What |
|---|---|
| `@pagehub/editor` | `Editor`, `mountEditor`, `editorKit`, the components map (`DEFAULT_COMPONENTS`, `Slot`, `useSlot` and the slot prop types), the hooks `useEditorStore`, `useEditorState`, `useRunCommand` and `useUi`, and the types `CanvasHost`, `CanvasRender`, `EditorEvent`. `defaultCanvasRender` is the canvas's default renderer. |
| `@pagehub/editor/components` | The default slot components (`TopBar`, `Inspector`, `LayersPanel`, `MediaManager`, `ThemePanel`, `CodeMirrorView`, `EditorSkeleton` and more), for wrapping or recomposing |
| `@pagehub/editor/primitives` | Building blocks for new panels: `Modal`, `ConfirmDialog` / `useConfirm`, `Drawer`, `FloatingPanel`, `AnchoredPopover`, `Chip`, toolbar controls, `MenuSurface`, `Skeleton`, `Spinner`, `InlineError`, `Icon`, `tooltip` |
| `@pagehub/editor/styles.css` | The chrome stylesheet (Tailwind v4 + DaisyUI source) |

Everything else is internal.

## What's in the editor

- **Canvas.** The real page in an isolated frame, with desktop and mobile views, click to select, inline text editing, drag and drop.
- **Inspector.** Classes (Tailwind, with breakpoints, dark mode and hover states), attributes, text, links, images, Liquid conditions and loops, and section settings from `{% schema %}`.
- **Layers, add panel and component board.**
- **Code view** with HTML, CSS, JavaScript and Liquid highlighting, completions and lint.
- **Theme, media and modifiers panels,** which open in a right-hand drawer.
- **Content mode** (`role: "client"`) limits a person to text and images.
- **Save safety.** Conflicts, maintenance windows, network failures and format changes each get their own message; see [Save errors](../../docs/embedding.md#save-errors).
