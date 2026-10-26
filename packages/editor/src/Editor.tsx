/**
 * `<Editor>`: the visual editor over a core instance (`createEditor` / `createTestEditor`, with
 * `editorKit()` in its extensions). Every piece is a slot in `components` (see components.ts).
 *
 *   <Editor editor={editor} components={{ LayersPanel: null }} />
 *   const { unmount } = mountEditor(document.getElementById("app")!, { editor });
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRenderStatus } from "./features/canvas/renderStatus";
import { createRoot } from "react-dom/client";
import type { AutosaveOptions, Editor as Core, Store } from "@pagehub/engine";
import { ComponentsProvider, Slot, useSlot, type ComponentsMap } from "./components";
import { useEditorState, useRunCommand } from "./react/bindings";
import { chromeOf, type ChromePanel, type DetailKind } from "./shell/chromeState";
import { boardOf } from "./features/board/boardState";
import { useEditorEvents, type EditorEvent } from "./react/events";
import { useOpenEditor, type OpenOptions } from "./react/useOpenEditor";
import { roleComponents } from "./features/content-mode/contentRole";
import { PortalTarget } from "./primitives/portal";
import { Drawer } from "./primitives/Drawer";
import { EditorStoreProvider } from "./react/bindings";
import { uiField } from "./state/uiState";
import { PlatformProvider, type Platform } from "./features/keyboard/platform";
import { useKeymap } from "./features/keyboard/domKeymap";
import { useUnsavedWarning } from "./features/save/useUnsavedWarning";
import { useAutosave } from "./features/save/useAutosave";
import { TooltipSurface } from "./primitives/TooltipSurface";
import { CanvasRenderContext, type CanvasRender } from "./features/canvas/canvasContext";
import { CanvasHostContext, type CanvasHost } from "./features/canvas/canvasHost";
import { EditorSkeleton } from "./shell/EditorSkeleton";
import { ErrorBoundary } from "./primitives/ErrorBoundary";
import { CanvasStyleBridge } from "./features/theme/CanvasStyleBridge";
import { ChromeThemeProvider, useChromeTheme, type ChromeTheme } from "./react/useChromeTheme";

export interface EditorProps extends Partial<Omit<OpenOptions, "storage">> {
  /** The core instance. Its configuration must include `editorKit()`. Or pass `storage` (+ `extensions`, `role`, `data`) and `<Editor>` opens one. */
  editor?: Store;
  storage?: OpenOptions["storage"];
  /** The core opened from `storage`. */
  onReady?(editor: Core): void;
  /** `saved`, `conflict`, `selection`, `diff`. */
  onEvent?(event: EditorEvent): void;
  /** Called once the main canvas has painted its first page (or failed to): a host holding its own loading ghost over the editor lifts it here. */
  onPainted?(): void;
  /** Replace (component) or hide (`null`) any slot. */
  components?: Partial<ComponentsMap>;
  className?: string;
  /**
   * The chrome's colour scheme. An explicit theme always wins: this prop, else the nearest `data-theme` of the host
   * wrapper; the OS scheme is used only when the host gives neither.
   */
  theme?: ChromeTheme;
  /** Pin ⌘ vs Ctrl; detected from the browser when omitted. */
  platform?: Platform;
  /**
   * Save dirty files shortly after edits stop (about 1.5 s idle, at most every 10 s while typing), and when the
   * person leaves. `true` for the defaults or an options object; off by default (⌘S and the host save).
   */
  autosave?: boolean | AutosaveOptions;
  /** false while the host hides the editor: no key is handled (default true). */
  active?: boolean;
  /** How the canvas renders a page (live data, a worker); default: the core's tags and filters over `editor.data`. */
  canvasRender?: CanvasRender;
  /**
   * What the canvas needs from the host: the site's compiled CSS, self-hosted fonts, the runtime module, the
   * "open in a new tab" URL, filter providers and sample data. Members left out are not done (no site CSS, remote
   * font links, no runtime, no preview link); nothing falls back to a built-in URL.
   */
  canvasHost?: CanvasHost;
  /**
   * px of host-rendered sidebars pinned to the editor's right edge. The editor reserves this
   * space on the right of its main row (as right padding), so the canvas never runs under the
   * host's sidebars AND the slide-out drawer (Theme / Media / Modifiers) docks inboard of them —
   * they sit side-by-side, not overlapping. Default 0 = the drawer is flush to the editor's edge.
   * See `docs/right-drawer.md`.
   */
  rightDockOffset?: number;
}

/** `<Editor>`: over a given core (`editor`) or one it opens from `storage`. */
export function Editor(props: EditorProps) {
  if (props.editor) return <EditorView {...props} editor={props.editor} />;
  if (!props.storage) throw new Error("<Editor>: pass `editor` or `storage`");
  return <StorageEditor {...props} storage={props.storage} />;
}

/** Opens the core from `storage`; while the files arrive the shell shows as skeletons at once (never a blank frame between the host's ghost and the editor), and an open failure is an inline error with Retry. */
function StorageEditor(props: EditorProps & { storage: OpenOptions["storage"] }) {
  return (
    <ErrorBoundary fallback={(error, retry) => <EditorSkeleton className={props.className} error={{ message: `Could not open the site: ${error.message}`, retry }} />}>
      <OpeningEditor {...props} />
    </ErrorBoundary>
  );
}

function OpeningEditor({ storage, extensions, role, data, identity, blockProvenance, onReady, ...rest }: EditorProps & { storage: OpenOptions["storage"] }) {
  const editor = useOpenEditor({ storage, extensions, role, data, identity, blockProvenance }, onReady);
  if (editor) return <EditorView {...rest} editor={editor} />;
  return <EditorSkeleton className={rest.className} />;
}

function EditorView({ editor, components, className = "", theme, platform, active = true, canvasRender, canvasHost, onEvent, onPainted, rightDockOffset = 0, autosave }: EditorProps & { editor: Store }) {
  if (!editor.state.hasField(uiField)) throw new Error("<Editor>: add editorKit() to the editor's extensions");
  const [scope, setScope] = useState<HTMLElement | null>(null);
  const chromeTheme = useChromeTheme(scope, theme);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useKeymap(editor, { platform, active, scope });
  useEditorEvents(editor, onEvent);
  const settled = useRenderStatus(editor).settled;
  useEffect(() => void (settled && onPainted?.()), [settled, onPainted]);
  useAutosave(editor, autosave, active);
  useUnsavedWarning(editor, active);
  const map = useMemo(() => roleComponents(editor, components), [editor, components]);
  return (
    <EditorStoreProvider store={editor}>
      <PlatformProvider value={platform ?? null}>
        <ComponentsProvider value={map}>
          <CanvasRenderContext.Provider value={canvasRender ?? null}>
            <CanvasHostContext.Provider value={canvasHost ?? null}>
            <PortalTarget value={portal}>
            <ChromeThemeProvider value={chromeTheme}>
              {/* `display: contents` scopes the keymap to this editor and the overlays portalled beside it */}
              <div ref={setScope} style={{ display: "contents" }} data-ph-editor-scope="" data-theme={chromeTheme} data-role={(editor as { role?: string }).role}>
                <div className={`pagehub-editor bg-base-100 text-base-content relative flex h-full min-h-0 w-full flex-col overflow-hidden ${className}`} data-base>
                  <Slot name="SaveBanner" />
                  {(editor as { role?: string }).role !== "viewer" && <Slot name="TopBar" />}
                  {/* `paddingRight` reserves the host's right sidebars so neither the canvas nor
                      the drawer runs under them; the drawer then docks at the inboard edge. */}
                  <div className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden" style={rightDockOffset ? { paddingRight: rightDockOffset } : undefined}>
                    <Slot name="Sidebar" />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <CanvasColumn />
                    </div>
                    <RightDrawer />
                  </div>
                  <Slot name="ContextMenu" />
                  <Slot name="CommandPalette" />
                  <Slot name="DiffPreview" />
                  <CanvasStyleBridge />
                  <TooltipSurface />
                </div>
                <div ref={setPortal} data-ph-portal="" />
              </div>
            </ChromeThemeProvider>
            </PortalTarget>
            </CanvasHostContext.Provider>
          </CanvasRenderContext.Provider>
        </ComponentsProvider>
      </PlatformProvider>
    </EditorStoreProvider>
  );
}

/** The big full-height panels (`chromeOf(state).panel`, set by the `panel.*` commands) render in
 * the one right slide-out drawer, one at a time. */
const DRAWER_META = {
  theme: { title: "Theme", width: 360, scrollable: true },
  modifiers: { title: "Modifiers", width: 360, scrollable: true },
  media: { title: "Media Manager", width: 640, scrollable: false },
  scripts: { title: "Scripts", width: 560, scrollable: true },
} as const satisfies Partial<Record<ChromePanel, { title: string; width: number; scrollable: boolean }>>;

type DrawerPanel = keyof typeof DRAWER_META;
const isDrawerPanel = (p: unknown): p is DrawerPanel => typeof p === "string" && Object.hasOwn(DRAWER_META, p);

/** The complex inspector editors that take over the drawer (`chromeOf(state).detail`). */
const DETAIL_META = {
  conditions: { title: "Show only when…", width: 420 },
  dataSource: { title: "Repeat for each…", width: 420 },
  html: { title: "Edit HTML", width: 560 },
  action: { title: "Action", width: 420 },
  handlers: { title: "Event handlers", width: 420 },
} as const satisfies Record<DetailKind, { title: string; width: number }>;

/**
 * The right slide-out drawer region. `media` mounts the standalone media manager (the window the
 * `MediaInput` picker also opens, here with no `onPick` so it's the manager, and `chromeless` so
 * the drawer — not the picker's floating panel — frames it); its close runs the same `panel.media`
 * toggle. `theme` edits the site palette / radius / spacing / fonts, `modifiers` applies
 * style-modifier presets to the selection. `layers` mounts itself inside the Sidebar, so it's not
 * here. The active panel's body keeps rendering through the slide-out, then unmounts on `onExited`.
 */
function RightDrawer() {
  const run = useRunCommand();
  const panel = useEditorState((s) => chromeOf(s).panel);
  const detail = useEditorState((s) => chromeOf(s).detail);
  // The `media` panel only exists when a host injects a MediaManager; without it the panel would
  // slide open empty, so treat it as inactive (the drawer never opens for media).
  const hasMedia = useSlot("MediaManager");
  // A complex inspector editor (conditions / data binding / Edit HTML) takes the drawer over any
  // panel — the commands keep them mutually exclusive, so `detail` wins when both somehow read set.
  const active = detail ? null : isDrawerPanel(panel) && (panel !== "media" || hasMedia) ? panel : null;
  // Keep the last panel's width/title through the slide-out so the empty panel keeps its size as it
  // collapses; the body (its slot) unmounts at once on close, matching the "closed = gone" contract.
  const last = useRef<DrawerPanel>("theme");
  if (active) last.current = active;
  const lastDetail = useRef<DetailKind>("conditions");
  if (detail) lastDetail.current = detail;
  const dMeta = DETAIL_META[detail ?? lastDetail.current];
  const meta = DRAWER_META[active ?? last.current];
  const open = active !== null || detail !== null;
  const close = () => void (detail ? run("inspector.detailClose") : active ? run(`panel.${active}`) : undefined);
  return (
    <Drawer open={open} onClose={close} title={detail ? dMeta.title : active ? meta.title : ""} width={detail ? dMeta.width : meta.width} scrollable={detail ? false : meta.scrollable}>
      {detail ? (
        <Slot name="InspectorDetail" kind={detail} open onClose={close} />
      ) : (
        <>
          {active === "theme" && <Slot name="ThemePanel" open onClose={close} />}
          {active === "media" && <Slot name="MediaManager" open chromeless onClose={close} />}
          {active === "modifiers" && <Slot name="ModifiersPanel" open onClose={close} />}
          {active === "scripts" && <Slot name="ScriptsPanel" open onClose={close} />}
        </>
      )}
    </Drawer>
  );
}

/** The canvas column: the component board while the components editor is open (and its slot is present), else the page canvas. */
function CanvasColumn() {
  const boardOpen = useEditorState((s) => boardOf(s).open);
  const hasBoard = useSlot("ComponentBoard");
  return boardOpen && hasBoard ? <Slot name="ComponentBoard" /> : <Slot name="Canvas" />;
}

/** Mount `<Editor>` into an element without writing React yourself (pass `editor` or `storage`). */
export function mountEditor(el: HTMLElement, props: EditorProps): { unmount(): void } {
  const root = createRoot(el);
  root.render(<Editor {...props} />);
  return { unmount: () => root.unmount() };
}
