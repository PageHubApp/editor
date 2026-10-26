/**
 * The inspector's small looks: `ActionRow`, the empty state, the linked-instance bar and the
 * dark-variant toggle. Each takes plain props and callbacks; the connector decides what runs.
 *
 *   <InspectorEmptyState mode="page" blocks reusable onAddBlocks={…} onAddComponents={…} />
 *   <LinkedInstanceBar name="header" actions={[{ id: "edit", title: "Edit Linked Instance", … }]} />
 *   <DarkVariantToggle on={dark} onToggle={flip} />
 */
import type { ReactNode } from "react";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { AutoHideScrollbar } from "../../primitives/AutoHideScrollbar";
import { InspectorIcon, type InspectorIconName } from "./inspectorIcons";

const ROW = { default: "hover:bg-base-200", primary: "hover:bg-primary/10", destructive: "bg-error/5 hover:bg-error/10" };
const ROW_ICON = { default: "text-base-content/50 group-hover:text-primary", primary: "text-primary", destructive: "text-error" };

interface ActionRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  variant?: keyof typeof ROW;
  disabled?: boolean;
  onClick(): void;
}

function ActionRow({ icon, title, description, variant = "default", disabled, onClick }: ActionRowProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-action-row={title} className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors active:scale-[0.99] disabled:opacity-50 ${ROW[variant]}`}>
      <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center transition-colors ${ROW_ICON[variant]}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base-content text-sm font-medium">{title}</h3>
        <p className="text-base-content/60 text-[11px] leading-snug break-words whitespace-normal">{description}</p>
      </div>
    </button>
  );
}

const glyph = (name: InspectorIconName) => <InspectorIcon name={name} className="size-6" />;

interface InspectorEmptyStateProps {
  /** `canvas` = the component editor. */
  mode: "page" | "canvas";
  blocks: boolean;
  reusable: boolean;
  hasComponents: boolean;
  aiCard?: ReactNode;
  closable: boolean;
  onAddBlocks(): void;
  onAddComponents(): void;
  onNewReusable(): void;
  onClose(): void;
}

export function InspectorEmptyState(p: InspectorEmptyStateProps) {
  return (
    <AutoHideScrollbar data-inspector-empty={p.mode} className="z-20 flex min-h-0 w-full flex-1 flex-col bg-transparent p-4 pr-2 pb-2 text-center">
      <div className={`flex min-h-0 flex-1 flex-col items-center gap-6 ${p.mode === "page" ? "justify-start pt-6" : "justify-center"}`}>
        {p.mode === "page" && (
          <div data-empty-prompt="" className="flex w-full max-w-md flex-col items-center gap-1.5 px-3 pb-1">
            <Icon name="click" className="text-base-content/40 size-7" />
            <h3 className="text-base-content text-sm font-medium">Select an element to edit</h3>
            <p className="text-base-content/60 text-[11px] leading-snug">Click anything on the page, or pick it in Layers. Or add something new:</p>
          </div>
        )}
        {p.mode === "page" && (
          <div className="flex w-full max-w-md flex-col gap-1 text-sm">
            {p.blocks && <ActionRow icon={glyph("blocks")} title="Add Blocks" description="Like heroes, CTAs, cards, and more…" onClick={p.onAddBlocks} />}
            <ActionRow icon={<Icon name="plus" className="size-6" />} title="Add Components" description="Like buttons, images, and text..." onClick={p.onAddComponents} />
            {p.reusable && <ActionRow icon={glyph("box-model")} title="Reusable components" description="Save a layout once, drop it on every page…" onClick={p.onNewReusable} />}
            {p.aiCard}
          </div>
        )}
        {p.mode === "canvas" && !p.hasComponents && p.reusable && (
          <div className="flex w-full max-w-md flex-col gap-1 text-sm">
            <ActionRow icon={glyph("box-model")} title="New reusable component" description="Starts a blank layout you can save and reuse on any page." onClick={p.onNewReusable} />
          </div>
        )}
        {p.mode === "canvas" && p.hasComponents && (
          <div className="flex w-full max-w-md flex-col gap-1 text-sm">
            <ActionRow icon={<Icon name="click" className="size-6" />} title="Select something to edit" description="Pick from the dropdown or click an element on the canvas." onClick={p.onAddComponents} />
          </div>
        )}
      </div>
      {p.closable && (
        <button type="button" onClick={p.onClose} className="text-base-content/50 hover:text-base-content/80 shrink-0 border-0 bg-transparent py-2 text-xs transition-colors hover:underline">
          close sidebar
        </button>
      )}
    </AutoHideScrollbar>
  );
}

export interface LinkedAction {
  id: string;
  title: string;
  description: string;
  icon: InspectorIconName;
  variant?: ActionRowProps["variant"];
  disabled?: boolean;
  run(): void;
}

export function LinkedInstanceBar({ name, actions }: { name: string; actions: readonly LinkedAction[] }) {
  return (
    <div data-linked-instance={name} className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3 px-3 py-1">
        <div className="text-primary flex size-8 shrink-0 items-center justify-center">
          <InspectorIcon name="link" className="size-5" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-base-content/60 text-[11px]">Linked instance of</span>
          <span className="text-base-content text-sm font-medium">{name}</span>
        </div>
      </div>
      <div className="bg-base-300 h-px" />
      <div className="flex flex-col gap-1">
        {actions.map((a) => (
          <ActionRow key={a.id} icon={<InspectorIcon name={a.icon} className="size-5" />} title={a.title} description={a.description} variant={a.variant} disabled={a.disabled} onClick={a.run} />
        ))}
      </div>
    </div>
  );
}

export function DarkVariantToggle({ on, onToggle }: { on: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      data-dark-toggle=""
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Dark variant scope on" : "Dark variant scope off"}
      {...tooltip(on ? "Editing dark: variants" : "Edit dark: variants", "top")}
      data-tooltip-offset={10}
      className={`flex shrink-0 cursor-pointer items-center justify-center rounded p-1 transition-[color,transform] active:scale-90 ${on ? "bg-violet-600/20 text-violet-800 ring-1 ring-violet-500/30 dark:text-violet-200" : "text-base-content/60 hover:bg-base-200 hover:text-base-content"}`}
    >
      <InspectorIcon name="moon" className={`size-4 ${on ? "" : "opacity-50"}`} />
    </button>
  );
}
