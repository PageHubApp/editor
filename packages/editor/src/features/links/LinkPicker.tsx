/**
 * LinkPicker — the one place a link's target is chosen: the Action editor's Link action, the
 * rich-text link panel (⌘K) and content mode's link field all render it.
 *
 * Tabs: Page (the site's pages by name, Home first, plus an optional section `#id` on that
 * page) · Web address (`example.com` gets `https://`) · Email (`mailto:`) · Phone (`tel:`, spaces
 * and dashes dropped). Then "Open in a new tab" when the caller can write `target`. The body has a fixed height so switching tabs
 * doesn't move anything. The output is a plain `href` (`linkValue.ts` parses and builds it).
 *
 *   <LinkPicker idPrefix="action-link" href={href} newTab={blank} onChange={setHref} onNewTabChange={setBlank} />
 *
 * A text tab emits on every keystroke; switching to a tab whose field is empty emits nothing, so
 * the stored href never goes blank by looking at another tab. The picker re-reads `href` only
 * when it changes from outside (undo, another editor), never from its own emits.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditorState } from "../../react/bindings";
import { useCanvasHost } from "../canvas/canvasHost";
import { canvasPage } from "../canvas/canvasState";
import { Icon } from "../../primitives/icons";
import { ToolbarSegmentedControl } from "../toolbar/primitives/ToolbarSegmentedControl";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { linkablePages, type LinkablePage } from "../topbar/pages";
import { anchorIds, buildHref, parseHref, type LinkKind, type LinkValue } from "./linkValue";

export interface LinkPickerProps {
  /** The current href (`""` = none yet). */
  href: string;
  newTab?: boolean;
  onChange(href: string): void;
  /** Shows "Open in a new tab" (left out where only `href` may change, e.g. content mode). */
  onNewTabChange?(newTab: boolean): void;
  /** Prefix for the field ids (`<prefix>-web` → `#input-<prefix>-web`). */
  idPrefix: string;
  /** Enter in a field (the rich-text panel applies on it). */
  onSubmit?(): void;
  /** Under the new-tab line (the Action editor's advanced `rel`). */
  footer?: ReactNode;
}

const KINDS: { value: LinkKind; label: string }[] = [
  { value: "page", label: "Page" },
  { value: "web", label: "Website" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const TEXT_FIELD: Record<Exclude<LinkKind, "page">, { label: string; placeholder: string; type: "text" | "email" }> = {
  web: { label: "Web address", placeholder: "example.com", type: "text" },
  email: { label: "Email address", placeholder: "name@example.com", type: "email" },
  phone: { label: "Phone number", placeholder: "+1 555 123 4567", type: "text" },
};

type Drafts = Record<Exclude<LinkKind, "page">, string>;

function initial(href: string, routes: readonly string[]): { kind: LinkKind; page: LinkValue; drafts: Drafts } {
  const v = parseHref(href, routes);
  const drafts: Drafts = { web: "", email: "", phone: "" };
  if (v.kind !== "page") drafts[v.kind] = v.value;
  return { kind: v.kind, page: v.kind === "page" ? v : { kind: "page", value: "" }, drafts };
}

export function LinkPicker({ href, newTab, onChange, onNewTabChange, idPrefix, onSubmit, footer }: LinkPickerProps) {
  const host = useCanvasHost();
  const files = useEditorState((s) => s.files);
  const current = useEditorState(canvasPage);
  const pages = useMemo(() => linkablePages(files.keys(), host?.pages?.()), [files, host]);
  const routes = pages.map((p) => p.route);

  const [state, setState] = useState(() => initial(href, routes));
  // bumps when `href` is re-read from outside, so the uncontrolled text fields remount with it
  const [epoch, setEpoch] = useState(0);
  const emitted = useRef(href);
  useEffect(() => {
    if (href === emitted.current) return;
    emitted.current = href;
    setState(initial(href, routes));
    setEpoch((n) => n + 1);
    // routes are read with the href; a page list change alone doesn't reset what's being typed
  }, [href]);

  const emit = (next: string) => {
    emitted.current = next;
    onChange(next);
  };
  const pickKind = (kind: LinkKind) => {
    setState((s) => ({ ...s, kind }));
    const next = kind === "page" ? buildHref(state.page) : buildHref({ kind, value: state.drafts[kind] });
    if (next && next !== emitted.current) emit(next);
  };
  const setPage = (page: LinkValue) => {
    setState((s) => ({ ...s, page }));
    emit(buildHref(page));
  };
  const setDraft = (kind: Exclude<LinkKind, "page">, value: string) => {
    setState((s) => ({ ...s, drafts: { ...s.drafts, [kind]: value } }));
    emit(buildHref({ kind, value }));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox") {
      e.preventDefault();
      onSubmit();
    }
  };

  const { kind } = state;
  return (
    <div data-link-picker="" className="flex flex-col gap-2" onKeyDown={onKey}>
      <ToolbarSegmentedControl<LinkKind> dense aria-label="Link to" value={kind} onChange={pickKind} options={KINDS} trackColor="bg-base-200" inactiveColor="text-base-content/60 hover:text-base-content" />
      <div data-link-body={kind} className="flex h-52 min-h-0 flex-col gap-2">
        {kind === "page" ? (
          <PageTab pages={pages} value={state.page} files={files} current={current} onChange={setPage} idPrefix={idPrefix} />
        ) : (
          <>
            <ToolbarItemView key={`${kind}:${epoch}`} labelHide label={TEXT_FIELD[kind].label} inputId={`${idPrefix}-${kind}`} type={TEXT_FIELD[kind].type} placeholder={TEXT_FIELD[kind].placeholder} value={state.drafts[kind]} onChange={(v) => setDraft(kind, String(v ?? ""))} />
            {kind === "web" && <p className="text-base-content/50 px-1 text-[11px]">A full address like https://example.com, or a path like /shop.</p>}
          </>
        )}
      </div>
      {onNewTabChange && (
        <label className="text-base-content/70 flex cursor-pointer items-center gap-2 px-1 text-xs">
          <input type="checkbox" data-link-new-tab="" className="accent-primary" checked={!!newTab} onChange={(e) => onNewTabChange(e.target.checked)} />
          Open in a new tab
        </label>
      )}
      {footer}
    </div>
  );
}

interface PageTabProps {
  pages: readonly LinkablePage[];
  value: LinkValue;
  files: ReadonlyMap<string, string>;
  current: string | null;
  onChange(page: LinkValue): void;
  idPrefix: string;
}

/** Search + the page list (by name, route small) + the optional section on the chosen page. */
function PageTab({ pages, value, files, current, onChange, idPrefix }: PageTabProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? pages.filter((p) => p.name.toLowerCase().includes(q) || p.route.toLowerCase().includes(q)) : pages;
  // a bare `#anchor` points at the page on the canvas
  const chosen = value.value ? pages.find((p) => p.route === value.value) : pages.find((p) => p.path === current);
  const ids = value.value || value.anchor ? anchorIds(chosen ? files.get(chosen.path) : undefined) : [];
  if (value.anchor && !ids.includes(value.anchor)) ids.unshift(value.anchor);
  return (
    <>
      <div className="border-base-300 bg-base-100 flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2">
        <Icon name="search" className="text-base-content/50 size-3.5 shrink-0" />
        <input type="search" data-link-search="" aria-label="Search pages" placeholder="Choose a page" value={query} onChange={(e) => setQuery(e.target.value)} className="input-plain min-w-0 flex-1 text-xs" autoComplete="off" />
      </div>
      <div role="listbox" aria-label="Pages" className="scrollbar min-h-0 flex-1 overflow-y-auto">
        {shown.map((p) => {
          const selected = value.value === p.route;
          return (
            <button key={p.path} type="button" role="option" aria-selected={selected} data-link-page={p.route} onClick={() => onChange({ kind: "page", value: p.route })} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${selected ? "bg-base-200 text-base-content font-medium" : "text-base-content/80 hover:bg-base-200/60 hover:text-base-content"}`}>
              <Icon name={p.route === "/" ? "home" : "file-text"} className="size-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
              <span className="text-base-content/50 max-w-[45%] shrink-0 truncate text-[10px]">{p.route}</span>
              <Icon name="check" className={`text-primary size-3.5 shrink-0 ${selected ? "" : "invisible"}`} />
            </button>
          );
        })}
        {!shown.length && <div className="text-base-content/60 px-2 py-4 text-center text-xs">{q ? "No pages found" : "No pages to link to"}</div>}
      </div>
      {ids.length > 0 && (
        <ToolbarItemView key={`${value.value}#${value.anchor ?? ""}`} label="Section" inputId={`${idPrefix}-section`} type="select" value={value.anchor ?? ""} valueLabels={ids} formatLabel={(v) => `#${v}`} onChange={(v) => onChange({ kind: "page", value: value.value, ...(v ? { anchor: String(v) } : {}) })} />
      )}
    </>
  );
}
