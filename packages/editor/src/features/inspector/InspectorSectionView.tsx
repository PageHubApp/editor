/**
 * The default `InspectorSection` slot: an inspector accordion (`ToolbarSection`) with the
 * section's breakpoint override dot, header actions (pin, "+"), the empty-section state
 * (dimmed header, a click opens "+") and the popover-only state (header only, pointer cursor).
 *
 *   <InspectorSectionView id="size" title="Size" props={["width"]} actions={…}>{rows}</InspectorSectionView>
 */
import type { InspectorSectionProps } from "../../components";
import { SectionOverrideDot } from "../toolbar/breakpoint-chip/SectionOverrideDot";
import { ToolbarSection } from "../toolbar/ToolbarSection";
import { InspectorIcon, type InspectorIconName } from "./inspectorIcons";

/** The leading glyph each section wears in its header. */
const SECTION_ICONS: Record<string, InspectorIconName> = {
  component: "file-text",
  "data-source": "category",
  action: "pointer",
  handlers: "code",
  conditions: "eye-search",
  stateBindings: "bolt",
  "preset-items": "category",
  modifiers: "stack",
  alignment: "layout-align-center",
  size: "arrows-maximize",
  typography: "typography",
  background: "photo",
  styles: "sparkles",
  hover: "hand-finger",
  effects: "bolt",
  properties: "settings2",
  "custom-css": "code",
  "ai-context": "wand",
  "import-export": "arrows-exchange",
  permissions: "lock",
};

export function InspectorSectionView({ id, title, props, children, actions, disabled, collapsible = true, onHeaderClick }: InspectorSectionProps) {
  const icon = id ? SECTION_ICONS[id] : undefined;
  return (
    <div data-slot="InspectorSection" data-section-id={id}>
      <ToolbarSection
        title={title}
        icon={icon ? <InspectorIcon name={icon} className="size-4" /> : undefined}
        overrideDot={props?.length ? <SectionOverrideDot props={props} /> : undefined}
        actions={actions}
        disabled={disabled}
        collapsible={collapsible}
        {...(collapsible ? {} : { defaultOpen: false, className: "cursor-pointer!" })}
        onHeaderClick={onHeaderClick}
      >
        {children}
      </ToolbarSection>
    </div>
  );
}
