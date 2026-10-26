/**
 * The sidebar's header: an `Edit | Layers | Add` segmented control. Edit shows the breadcrumb and
 * the selected element's settings (or the empty state), Layers the page tree, Add the insert
 * drawer. The active tab is owned by `Sidebar` (Add reflects `addPanelOf().open`, so opening the
 * Add drawer from anywhere lights the tab).
 */
import { ToolbarSegmentedControl } from "../features/toolbar/primitives/ToolbarSegmentedControl";
import { Icon, type IconName } from "../primitives/icons";
import { TOOLTIP_ID } from "../primitives/tooltip";

export type SidebarTab = "edit" | "layers" | "add";

const TABS: { value: SidebarTab; icon: IconName; label: string; tooltip: string }[] = [
  { value: "edit", icon: "adjustments", label: "Edit", tooltip: "Settings for the selected element" },
  { value: "layers", icon: "layout-grid", label: "Layers", tooltip: "Every element on the page" },
  { value: "add", icon: "plus", label: "Add", tooltip: "Add blocks and components" },
];

export function SidebarTabs({ value, onChange }: { value: SidebarTab; onChange: (tab: SidebarTab) => void }) {
  return (
    <div data-sidebar-tabs="" className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
      <ToolbarSegmentedControl<SidebarTab>
        aria-label="Editor panel"
        className="min-w-0 flex-1"
        trackColor="bg-base-200"
        inactiveColor="text-base-content/60 hover:text-base-content"
        tooltipId={TOOLTIP_ID}
        value={value}
        onChange={onChange}
        options={TABS.map((t) => ({
          value: t.value,
          tooltip: t.tooltip,
          ariaLabel: t.label,
          label: (
            <span className="flex items-center gap-1.5">
              <Icon name={t.icon} className="size-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </span>
          ),
        }))}
      />
    </div>
  );
}
