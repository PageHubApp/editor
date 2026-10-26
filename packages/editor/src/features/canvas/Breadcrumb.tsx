// The panel's selection heading; ancestry comes from node handles.
/**
 * The default `Breadcrumb` slot — the selection heading (an h-10 row under the tabs): the element's
 * name (bold; click to rename — each keystroke writes `data-edit-name`; Enter, Esc or blur exits),
 * its type in muted text, and the ▾ ancestors menu (`AncestorsMenu`, ≥ 2 crumbs). Right-click on
 * the name opens the canvas context menu for that element. With nothing selected the row is empty.
 * While the components editor is open the row is the `ComponentSelector` instead.
 */
import { useState, type MouseEvent } from "react";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { tooltip } from "../../primitives/tooltip";
import { AncestorsMenu, crumbsOf, stripPrefix } from "./AncestorsMenu";
import { activePartial, boardOf } from "../board/boardState";
import { ComponentSelector } from "../board/ComponentSelector";
import { nodeName } from "../../state/nodeName";

/** A handle's label — the shared friendly name (`data-edit-name` → element insert label → tag). */
export const crumbName = nodeName;

/** `partials/hero.liquid` → `hero`. */
const partialLabel = (path: string) => path.replace(/^.*\/|\.liquid$/g, "");

/** Return to the page from the inspector's "Edit partial" view (board closed). */
function BackToPage({ name }: { name: string }) {
  const run = useRunCommand();
  return (
    <button type="button" data-crumb-back="" className="btn btn-ghost btn-xs max-w-[140px] gap-1 truncate" {...tooltip("Back to page")} onClick={() => run("component.closePartial")}>
      <span aria-hidden="true">←</span>
      <span className="truncate">{name}</span>
    </button>
  );
}

export function Breadcrumb() {
  const board = useEditorState((s) => boardOf(s).open);
  const partial = useEditorState((s) => (boardOf(s).open ? null : activePartial(s)));
  if (board) {
    return (
      <nav data-slot="Breadcrumb" aria-label="Components" className="flex h-10 min-w-0 items-center px-3">
        <ComponentSelector className="w-full" />
      </nav>
    );
  }
  return <NodeBreadcrumb partial={partial} />;
}

function NodeBreadcrumb({ partial }: { partial: string | null }) {
  const store = useEditorStore();
  const run = useRunCommand();
  const primary = useEditorState((s) => (s.selection.primary?.alive ? s.selection.primary : null));
  useEditorState((s) => s.files); // names follow edits
  const [renaming, setRenaming] = useState(false);

  // Nothing selected: an empty bar (same height), except while editing a partial, where the back
  // control is the only way out of the partial view.
  if (!primary) {
    return (
      <nav data-slot="Breadcrumb" aria-label="Selection" className="flex h-10 min-w-0 items-center gap-1 px-3 text-xs">
        {partial && <BackToPage name={partialLabel(partial)} />}
      </nav>
    );
  }
  const crumbs = crumbsOf(primary);
  const name = stripPrefix(nodeName(primary), crumbs.length > 1 ? nodeName(crumbs[crumbs.length - 2]!) : null);
  const type = primary.tag.toLowerCase() === name.toLowerCase() ? "" : primary.tag;
  const context = (e: MouseEvent) => {
    e.preventDefault();
    store.select(primary);
    run("contextMenu.open", { x: e.clientX, y: e.clientY });
  };

  return (
    <nav data-slot="Breadcrumb" aria-label="Selection" className="flex h-10 min-w-0 items-center gap-2 px-3 text-xs">
      {partial && <BackToPage name={partialLabel(partial)} />}
      {renaming && primary.kind === "element" ? (
        <input
          autoFocus
          data-crumb-rename=""
          aria-label="Layer name"
          className="input input-xs min-w-0 flex-1"
          defaultValue={nodeName(primary)}
          onChange={(e) => run("attr.set", { name: "data-edit-name", value: e.target.value.trim() || null, at: primary })}
          onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setRenaming(false)}
          onBlur={() => setRenaming(false)}
        />
      ) : (
        <button type="button" data-crumb-current="" className="min-w-0 truncate text-left text-sm font-semibold" {...tooltip("Rename", "bottom")} onClick={() => setRenaming(true)} onContextMenu={context}>
          {name}
        </button>
      )}
      {!renaming && type && (
        <span data-crumb-type="" className="text-base-content/50 shrink-0 truncate">
          {type}
        </span>
      )}
      <AncestorsMenu node={primary} />
    </nav>
  );
}
