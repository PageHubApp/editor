import { useRunCommand } from "../../../../react/bindings";
import { ToolbarItemView } from "../../../toolbar/ToolbarItemView";
import { handleKey, useLeafInner, type ElementControlProps } from "./elementControlShared";
import { buildLeafInner, parseLeafInner } from "./IconValueControl";

/**
 * Button / Link **Text** — the label for a button or link, without its icon (the Icon control owns that; an icon-only
 * button reads as empty). Writing the label rebuilds the inner around the icon's own markup, so the icon, its wrapper
 * span and its attributes survive every edit. Writes the element's inner source through
 * `text.setInner` (the element's `text()` binding). `button` / `a` are text leaves even when empty,
 * so the write always applies.
 */
export function TextValueControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const leaf = parseLeafInner(useLeafInner(handle));
  return (
    <ToolbarItemView
      // uncontrolled field: key by handle identity so it keeps focus across edits, resets per element
      key={handleKey(handle)}
      label="Text"
      inputId="component-text"
      type="text"
      value={leaf.text}
      onChange={(v) => run("text.setInner", { target: handle, source: buildLeafInner(leaf.source, leaf.position, v) })}
    />
  );
}

