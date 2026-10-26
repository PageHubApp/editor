/**
 * The breadcrumb row while the components editor is open: a picker whose trigger shows the
 * component being worked on (else "Components", or "No Components"), and the count. The menu
 * searches the partials ("Search components..."), starts with "Create component", and picking
 * a row isolates that partial (`component.edit`).
 */
import { useEditorState, useEditorStore } from "../../react/bindings";
import { SearchableMenuPopover, type SearchableMenuItem } from "../../primitives/SearchableMenuPopover";
import { activePartial, boardNames } from "./boardState";
import { BoardIcon } from "./boardIcons";

const NEW = "__new";
const nameOf = (path: string | null) => (path ? path.replace(/^.*\/|\.liquid$/g, "") : null);

export function ComponentSelector({ className = "" }: { className?: string }) {
  const store = useEditorStore();
  const names = useEditorState(boardNames, (a, b) => a.join() === b.join());
  const current = nameOf(useEditorState(activePartial));
  const items: SearchableMenuItem<string>[] = [
    { id: NEW, label: "Create component", keywords: ["new", "add"] },
    ...names.map((n) => ({ id: n, label: n, hint: "Component", data: `partials/${n}.liquid` })),
  ];
  return (
    <div data-component-selector="" className={`flex min-w-0 items-center ${className}`}>
      <SearchableMenuPopover<string>
        triggerClassName="hover:bg-base-200 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        triggerAriaLabel="Component selector"
        placement="bottom-start"
        panelWidthClass="w-72"
        searchPlaceholder="Search components..."
        emptyMessage="No components"
        items={items}
        onSelect={(item) => (item.id === NEW ? store.run("component.new") : store.run("component.edit", { path: item.data! }))}
        trigger={
          <>
            <BoardIcon name={current ? "boxModel" : "gridAdd"} className="size-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">{current ?? (names.length ? "Components" : "No Components")}</span>
            <span className="text-base-content/60 shrink-0 font-mono text-[10px]">{names.length}</span>
            <BoardIcon name="chevronDown" className="size-3.5 shrink-0" />
          </>
        }
      />
    </div>
  );
}
