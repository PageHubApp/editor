/**
 * The inline text toolbar (driven by a `RichTextSession`): the main row (Bold ⌘B, Italic ⌘I,
 * Underline ⌘U | Font | Link ⌘K |
 * text colour + highlight swatches | More) shows only while the text selection is non-empty;
 * an open panel replaces the row (Font, More, Link) or drops below it (colours). Buttons keep
 * the focus in the text (`mousedown` default prevented).
 */
import type { ReactNode, CSSProperties } from "react";
import type { Editor as TipTap } from "@tiptap/core";
import { tooltip } from "../../primitives/tooltip";
import { Icon } from "../../primitives/icons";
import { TOOL_BG, ToolButton, keepFocus } from "./toolbarParts";
import { LinkPanel, MorePanel, TokenPanel } from "./panels";
import { FontPanel } from "./FontPanel";
import { VariablePanel } from "./VariablePanel";
import type { RichTextPanel, RichTextSession } from "./session";

const SWATCH_INHERIT_BG: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, var(--color-base-300, #d4d4d8) 25%, transparent 25%, transparent 75%, var(--color-base-300, #d4d4d8) 75%), linear-gradient(45deg, var(--color-base-300, #d4d4d8) 25%, transparent 25%, transparent 75%, var(--color-base-300, #d4d4d8) 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 4px 4px",
};

function Swatch({ active, token, label, onClick, children }: { active: boolean; token?: string; label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onMouseDown={keepFocus} onClick={onClick} className={`relative size-6 cursor-pointer overflow-hidden rounded border-2 transition-colors ${active ? "border-primary" : "border-base-300"} ${token ? "" : "bg-base-200/60"}`} style={token ? { backgroundColor: `var(--color-${token})` } : undefined} {...tooltip(label, "top")} data-tooltip-offset={10}>
      {!token && <span className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]" style={SWATCH_INHERIT_BG} aria-hidden />}
      <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <span className="bg-base-100/90 text-base-content ring-base-300/50 flex size-[18px] items-center justify-center rounded-full shadow-sm ring-1">{children}</span>
      </span>
    </button>
  );
}

const Divider = () => <div className="bg-base-300 mx-1 h-5 w-px" />;

interface InlineToolbarProps {
  session: RichTextSession;
  panel: RichTextPanel | null;
  openPanel(panel?: RichTextPanel): void;
}

export function InlineToolbar({ session, panel, openPanel }: InlineToolbarProps) {
  const ed: TipTap = session.editor;
  const toggle = (mark: string) => () => ed.chain().focus().toggleMark(mark, { src: null }).run();
  const color = ed.getAttributes("textColor").token as string | undefined;
  const highlight = ed.getAttributes("highlight").token as string | undefined;
  const close = () => openPanel();

  if (panel === "font" || panel === "more" || panel === "link" || panel === "variable") {
    return (
      <div className={panel === "font" ? "border-base-300/50 bg-base-100 rounded-xl border shadow-xl" : TOOL_BG}>
        {panel === "font" ? <FontPanel session={session} onClose={close} /> : panel === "more" ? <MorePanel session={session} onClose={close} openPanel={openPanel} /> : panel === "variable" ? <VariablePanel session={session} onClose={close} /> : <LinkPanel session={session} onClose={close} />}
      </div>
    );
  }
  return (
    <div className="relative">
      {!ed.state.selection.empty && (
        <div data-rt-toolbar-row="" className={`${TOOL_BG} h-10 flex-row gap-0`}>
          <ToolButton icon="bold" label="Bold (⌘B)" active={ed.isActive("bold")} onClick={toggle("bold")} />
          <ToolButton icon="italic" label="Italic (⌘I)" active={ed.isActive("italic")} onClick={toggle("italic")} />
          <ToolButton icon="underline" label="Underline (⌘U)" active={ed.isActive("underline")} onClick={toggle("underline")} />
          <Divider />
          <ToolButton icon="font" label="Font" onClick={() => openPanel("font")} />
          <Divider />
          <ToolButton icon="link" label="Insert Link (⌘K)" tint={ed.isActive("link")} onClick={() => openPanel("link")} />
          <Divider />
          <div className="flex items-center gap-1 px-1">
            <Swatch active={panel === "textcolor"} token={color} label={color ? "Text color" : "Text color (inherited)"} onClick={() => openPanel("textcolor")}>
              <Icon name="text-color" className="size-3" />
            </Swatch>
            <Swatch active={panel === "bgcolor"} token={highlight} label={highlight ? "Highlight color" : "Highlight (none)"} onClick={() => openPanel("bgcolor")}>
              <Icon name="highlight" className="size-3" />
            </Swatch>
          </div>
          <Divider />
          <ToolButton icon="chevron-down" label="More" onClick={() => openPanel("more")} />
        </div>
      )}
      {/* the `{{` variable suggestion renders under the caret from RichTextLayer, not here under the toolbar */}
      {(panel === "textcolor" || panel === "bgcolor") && (
        <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2">
          <div className={`${TOOL_BG} w-fit`}>
            <TokenPanel session={session} mark={panel === "textcolor" ? "textColor" : "highlight"} onClose={close} />
          </div>
        </div>
      )}
    </div>
  );
}
