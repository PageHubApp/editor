/**
 * The default `TopBar` slot: the editor's top row, laid out as a browser-style header — three groups.
 *
 * - Left: the edit/history actions (Undo, Redo). A host that registers a back / exit command
 *   lands here too, at the left edge, like the editor's back-to-dashboard arrow.
 * - Centre: a wide rounded "address" pill (the surface the editor draws its page URL on) holding
 *   a status dot, the `PageSelector` (page switcher + open-in-new, filling the pill like a browser
 *   address bar) and the `SaveStatus` indicator. On desktop the pill is offset to begin at the
 *   canvas edge, past the 360px side panel, matching the editor.
 * - Right: the view / share actions — the `BreakpointSwitcher` device picker, Preview, More, then
 *   the filled Publish pill (the last only when a host registers `site.publish`).
 *
 * Insert lives in the Add panel and Save is the pill's status, so neither is a top-bar button
 * (same as the editor; both stay on their shortcuts). The Components-editor toggle is a More →
 * Tools row, not a top-bar button. A button whose command can't run is disabled; Undo / Redo hide
 * while text is being edited. The More drawer opens below the row.
 */
import { Fragment, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { commandsFacet, keyLabel, menusFacet, type MenuItem, type ToolbarItem } from "@pagehub/engine";
import { Slot } from "../../components";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { useResolvedChromeTheme } from "../../react/useChromeTheme";
import { tooltip } from "../../primitives/tooltip";
import { Icon, type IconName } from "../../primitives/icons";
import { chromeOf, TOPBAR_SLOT } from "../../shell/chromeState";
import { passesWhen } from "../keyboard/context";
import { formatShortcut, usePlatform } from "../keyboard/platform";
import { richTextOf } from "../richtext/richTextState";
import { MoreMenu } from "./MoreMenu";

const ICONS: Readonly<Record<string, IconName>> = { "history.redo": "redo", "history.undo": "undo", "site.publish": "upload", "nav.back": "arrow-left", "editor.exit": "arrow-left" };
const HISTORY = new Set(["history.undo", "history.redo"]);
/** Commands that sit in the right (view / share) cluster; everything else goes left. */
const RIGHT = new Set(["preview.toggle", "menu.more", "site.publish"]);
/**
 * Not top-bar buttons: the component-board toggle is a More → Tools row; Insert lives in the Add
 * panel; Save is the address pill's status indicator (`SaveStatus`), not a button. All stay on
 * their shortcuts — the editor header shows none of them either.
 */
const HIDDEN = new Set(["component.toggleEditor", "insert.toggle", "file.save"]);
/** Visual order within each cluster, left → right (independent of the contribution order). */
const CLUSTER_ORDER: Readonly<Record<string, number>> = {
  // left
  "nav.back": 0,
  "editor.exit": 0,
  "history.undo": 10,
  "history.redo": 20,
  // right (the device switcher is rendered ahead of these)
  "preview.toggle": 10,
  "menu.more": 20,
  "site.publish": 30,
};

const clusterOrder = (m: MenuItem, i: number) => CLUSTER_ORDER[m.command] ?? 100 + i;

/** Elements of a host's own header the bar's groups render into instead of the bar's own row. */
export interface TopBarTargets {
  /** The history / back group (Undo, Redo); omit when the host draws its own. */
  nav?: HTMLElement | null;
  /** Inside the host's address pill: the page switcher and the save indicator. */
  address?: HTMLElement | null;
  /** The view / share group: device switcher, Preview, More. */
  controls?: HTMLElement | null;
}

/** `into` set: no header of its own; each group portals into its target (nothing until the target exists). */
export function TopBar({ into }: { into?: TopBarTargets } = {}) {
  const editor = useEditorStore();
  const theme = useResolvedChromeTheme();
  const platform = usePlatform();
  useEditorState((s) => s); // enabled flags follow the document
  const preview = useEditorState((s) => chromeOf(s).preview);
  const drawer = useEditorState((s) => chromeOf(s).drawer);
  const typing = useEditorState((s) => !!richTextOf(s).editing);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const commands = editor.state.facet(commandsFacet);
  const items = (editor.state.facet(menusFacet)[TOPBAR_SLOT] ?? [])
    .filter((m) => commands.has(m.command) && !HIDDEN.has(m.command) && passesWhen(editor, m.when) && !(typing && HISTORY.has(m.command)));
  const sorted = (inRight: boolean) =>
    items
      .filter((m) => RIGHT.has(m.command) === inRight)
      .map((m, i) => ({ m, o: clusterOrder(m, i) }))
      .sort((a, b) => a.o - b.o)
      .map((x) => x.m);

  const renderItem = (m: MenuItem) => {
    const title = m.command === "preview.toggle" ? (preview ? "Exit preview" : "Preview") : commands.get(m.command)!.title;
    const shortcut = keyLabel(editor, m.command, platform);
    const label = shortcut ? `${title} (${formatShortcut(shortcut, platform)})` : title;
    const publish = m.command === "site.publish";
    const icon =
      m.command === "menu.more" ? (
        <Icon name="settings" className="size-[18px]" />
      ) : m.command === "preview.toggle" ? (
        <Icon name={preview ? "code" : "eye"} className="size-[18px]" />
      ) : publish ? (
        <Icon name="upload" className="size-4" />
      ) : (
        // Host-registered commands supply their own icon (ToolbarItem.icon); fall back to the
        // known-command map, then a generic glyph. Lets a host plug in AI / history / domain buttons.
        <Icon name={((m as ToolbarItem).icon as IconName | undefined) ?? ICONS[m.command] ?? "box"} className="size-[18px]" />
      );
    return (
      <button
        type="button"
        key={m.command}
        ref={m.command === "menu.more" ? moreBtn : undefined}
        data-topbar-item={m.command}
        aria-label={title}
        aria-pressed={m.command === "preview.toggle" ? preview : m.command === "menu.more" ? drawer === "more" : undefined}
        disabled={!editor.can(m.command)}
        className={
          publish
            ? "bg-base-content text-base-100 hover:bg-base-content/90 ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:opacity-40"
            : "text-base-content/70 hover:bg-base-200 hover:text-base-content inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-35"
        }
        onClick={(e) => {
          e.stopPropagation();
          editor.run(m.command);
        }}
        {...tooltip(publish ? "Publish" : label, "bottom")}
        data-tooltip-offset={10}
      >
        {icon}
        {publish && <span>Publish</span>}
      </button>
    );
  };

  if (into) {
    const right = (
      <>
        <Slot name="BreakpointSwitcher" />
        {sorted(true).map((m) => (
          <Fragment key={m.command}>{renderItem(m)}</Fragment>
        ))}
        {drawer === "more" && <MoreMenu anchor={moreBtn} />}
      </>
    );
    // The targets sit in the host's header, outside the editor's scope, so each group carries the scope itself:
    // the editor's utilities and chrome tokens are scoped to `[data-ph-editor-scope]` and would not reach it.
    const scoped = (children: ReactNode) => (
      <div data-ph-editor-scope="" data-theme={theme} style={{ display: "contents" }}>
        {children}
      </div>
    );
    return (
      <>
        {into.nav ? createPortal(scoped(sorted(false).map(renderItem)), into.nav) : null}
        {into.address
          ? createPortal(
              scoped(
                <>
                  <Slot name="PageSelector" />
                  <Slot name="SaveStatus" />
                </>,
              ),
              into.address,
            )
          : null}
        {into.controls ? createPortal(scoped(right), into.controls) : null}
      </>
    );
  }

  return (
    <div data-slot="TopBar" className="relative">
      <header role="banner" className="border-base-300 bg-base-100 text-base-content pointer-events-auto relative z-50 flex items-center gap-2 border-b px-2.5 py-2">
        {/* Left: back (host) + history. On desktop the group spans the side panel so the pill
            begins at the canvas edge, matching the editor's offset address bar. */}
        <div className="flex shrink-0 items-center gap-0.5 lg:w-[calc(360px-0.5rem)]">
          {sorted(false).map(renderItem)}
        </div>
        {/* Centre: the address pill — status dot, page switcher (fills it), save status. */}
        <div className="flex min-w-40 flex-1 items-center">
          <div className="bg-base-content/[0.05] hover:bg-base-content/[0.07] has-[[data-page-trigger][aria-expanded=true]]:bg-base-content/[0.1] has-[[data-page-trigger]:focus-visible]:ring-primary/60 flex h-9 w-full min-w-0 items-center gap-2 rounded-full py-0 pr-1.5 pl-3.5 transition-colors has-[[data-page-trigger]:focus-visible]:ring-2">
            <span aria-hidden className="bg-base-content/25 size-2 shrink-0 rounded-full" />
            <Slot name="PageSelector" />
            <Slot name="SaveStatus" />
          </div>
        </div>
        {/* Right: device, preview, more, Publish. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Slot name="BreakpointSwitcher" />
          {sorted(true).map((m) => (
            <Fragment key={m.command}>{renderItem(m)}</Fragment>
          ))}
        </div>
      </header>
      {drawer === "more" && <MoreMenu anchor={moreBtn} />}
    </div>
  );
}
