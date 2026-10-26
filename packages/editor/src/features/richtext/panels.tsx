/**
 * The inline toolbar's panels (actions are TipTap marks and editor commands). Link: Page
 * (default) or URL; Enter or Insert / Update applies,
 * with an empty selection it inserts the link text first; Remove for an existing link. More:
 * strike, superscript, subscript, clear formatting, Insert variable, insert output, delete
 * element. Colours: theme tokens; Clear unsets. (Font is `FontPanel`, Insert variable `VariablePanel`.)
 */
import { useState, type KeyboardEvent } from "react";
import { isSafeExpression } from "@pagehub/engine";
import { COLOR_TOKENS, NODE } from "./schema";
import type { RichTextSession } from "./session";
import { Icon } from "../../primitives/icons";
import { TOOL_BUTTON, ToolButton, keepFocus } from "./toolbarParts";
import { listPageFiles, pageRoute, pagesRoot } from "../topbar/pages";

interface PanelProps {
  session: RichTextSession;
  onClose(): void;
}

const INPUT = "border-base-300 bg-base-100 text-base-content rounded-md border px-2 py-1 text-sm focus:outline-none";
const TAB = "rounded-md px-2 py-1 text-xs font-medium";

/** The site's pages as link targets (`index.liquid` → `/`, `about.liquid` → `/about`; under `pages/` for a hosted site). */
function pageLinks(files: Iterable<string>): { path: string; href: string }[] {
  const all = [...files];
  const root = pagesRoot(all);
  return listPageFiles(all).map((path) => ({ path, href: pageRoute(path, root) }));
}

export function LinkPanel({ session, onClose }: PanelProps) {
  const ed = session.editor;
  const existing = ed.getAttributes("link") as { href?: string | null; target?: string | null };
  const pages = pageLinks(session.store.state.files.keys());
  const isPage = !existing.href || pages.some((p) => p.href === existing.href);
  const [mode, setMode] = useState<"page" | "url">(isPage ? "page" : "url");
  const [href, setHref] = useState(existing.href ?? (mode === "page" ? (pages[0]?.href ?? "/") : ""));
  const [blank, setBlank] = useState(existing.target === "_blank");

  const apply = () => {
    if (!href.trim()) return;
    const attrs = { href: href.trim(), target: blank ? "_blank" : null, rel: null, src: null };
    const chain = ed.chain().focus();
    if (ed.state.selection.empty && !ed.isActive("link")) chain.insertContent({ type: "text", text: href.trim(), marks: [{ type: "link", attrs }] }).run();
    else chain.extendMarkRange("link").setMark("link", attrs).run();
    onClose();
  };
  const remove = () => {
    ed.chain().focus().extendMarkRange("link").unsetMark("link").run();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => void (e.key === "Enter" && (e.preventDefault(), apply()));

  return (
    <div data-rt-panel="link" className="flex w-72 flex-col gap-2 p-2">
      <div className="flex gap-1">
        {(["page", "url"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} className={`${TAB} ${mode === m ? "bg-base-200 text-base-content" : "text-base-content/60"}`} onClick={() => setMode(m)}>
            {m === "page" ? "Page" : "URL"}
          </button>
        ))}
      </div>
      {mode === "page" ? (
        <div role="listbox" aria-label="Page" className="flex max-h-40 flex-col overflow-y-auto">
          {pages.map((p) => (
            <button key={p.path} type="button" role="option" aria-selected={href === p.href} className={`${TAB} text-left ${href === p.href ? "bg-base-200" : ""}`} onClick={() => setHref(p.href)}>
              {p.href}
            </button>
          ))}
        </div>
      ) : (
        <input aria-label="URL" className={INPUT} placeholder="https://" value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={onKey} autoFocus />
      )}
      <label className="text-base-content/60 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} /> Open in a new tab
      </label>
      <div className="flex justify-end gap-1">
        {existing.href && (
          <button type="button" className={`${TOOL_BUTTON} text-error`} onMouseDown={keepFocus} onClick={remove}>
            Remove
          </button>
        )}
        <button type="button" className={TOOL_BUTTON} onMouseDown={keepFocus} onClick={onClose}>
          Close
        </button>
        <button type="button" className={`${TOOL_BUTTON} bg-primary text-primary-content hover:bg-primary/90`} onMouseDown={keepFocus} onClick={apply}>
          {existing.href ? "Update" : "Insert"}
        </button>
      </div>
    </div>
  );
}

export function MorePanel({ session, onClose, openPanel }: PanelProps & { openPanel(panel: "variable"): void }) {
  const ed = session.editor;
  const [expr, setExpr] = useState("");
  const toggle = (mark: string) => () => ed.chain().focus().toggleMark(mark, { src: null }).run();
  const insertOutput = () => {
    if (!isSafeExpression(expr)) return;
    ed.chain().focus().insertContent({ type: NODE.output, attrs: { source: `{{ ${expr.trim()} }}` } }).run();
    setExpr("");
    onClose();
  };
  const remove = () => {
    session.flush(true);
    session.store.run("element.remove", undefined);
  };
  return (
    <div data-rt-panel="more" className="flex flex-col gap-1 p-1">
      <div className="flex flex-row items-center">
        <ToolButton icon="strike" label="Strikethrough" active={ed.isActive("strike")} onClick={toggle("strike")} />
        <ToolButton icon="superscript" label="Superscript" active={ed.isActive("superscript")} onClick={toggle("superscript")} />
        <ToolButton icon="subscript" label="Subscript" active={ed.isActive("subscript")} onClick={toggle("subscript")} />
        <ToolButton icon="clear-formatting" label="Clear formatting" onClick={() => ed.chain().focus().unsetAllMarks().run()} />
        <ToolButton icon="braces" label="Insert variable" onClick={() => openPanel("variable")} />
        <ToolButton icon="trash" label="Delete" onClick={remove} />
        <ToolButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div className="flex items-center gap-1 px-1 pb-1">
        <Icon name="braces" className="text-base-content/60 size-4" />
        <input aria-label="Insert output" className={`${INPUT} flex-1`} placeholder="product.title" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => void (e.key === "Enter" && (e.preventDefault(), insertOutput()))} />
      </div>
    </div>
  );
}

export function TokenPanel({ session, mark, onClose }: PanelProps & { mark: "textColor" | "highlight" }) {
  const ed = session.editor;
  const current = ed.getAttributes(mark).token as string | undefined;
  const prefix = mark === "textColor" ? "text" : "bg";
  return (
    <div data-rt-panel={mark} className="flex flex-col gap-2 p-1">
      <div className="grid grid-cols-5 gap-1">
        {COLOR_TOKENS.map((token) => (
          <button key={token} type="button" aria-label={`${prefix}-${token}`} aria-pressed={current === token} className={`size-6 rounded border-2 ${current === token ? "border-primary" : "border-base-300"}`} style={{ backgroundColor: `var(--color-${token})` }} onMouseDown={keepFocus} onClick={() => ed.chain().focus().setMark(mark, { token, tag: "span", src: null }).run()} />
        ))}
      </div>
      <button
        type="button"
        className={TOOL_BUTTON}
        onMouseDown={keepFocus}
        onClick={() => {
          ed.chain().focus().unsetMark(mark).run();
          onClose();
        }}
      >
        Clear
      </button>
    </div>
  );
}
