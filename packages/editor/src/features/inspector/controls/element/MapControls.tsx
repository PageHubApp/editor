import { NodeTypes, elementName, parseSource, type LiquidHtmlNode } from "@pagehub/engine";
import { escapeMarkupText } from "@pagehub/engine/render";
import { useRunCommand } from "../../../../react/bindings";
import { ToolbarItemView } from "../../../toolbar/ToolbarItemView";
import { handleKey, plainText, textOfElement, textOfNodes, useLeafInner, type ElementControlProps } from "./elementControlShared";

// ─── MapPoint / MapPath text controls ────────────────────────────────────────
// A pin / route child of a `{% map %}` carries its data in attributes (`data-lat` / `data-path` …,
// already real attribute fields) and its copy in its inner text. These controls edit that text.

/** The pin's inner, split into its leading heading (title) and the rest (description). */
export function parseMapPoint(inner: string): { title: string; description: string } {
  const t = inner.trim();
  let nodes: LiquidHtmlNode[];
  try {
    nodes = parseSource(t, "tolerant").children;
  } catch {
    return { title: "", description: "" };
  }
  const [head, ...rest] = nodes;
  if (head && head.type === NodeTypes.HtmlElement && /^(strong|b|h[1-6])$/i.test(elementName(head))) {
    return { title: textOfElement(t, head).trim(), description: textOfNodes(t, rest, head.position.end).trim() };
  }
  return { title: "", description: textOfNodes(t, nodes).trim() };
}

function buildMapPoint(title: string, description: string): string {
  const head = title ? `<strong>${escapeMarkupText(title)}</strong>` : "";
  if (head && description) return `${head} ${escapeMarkupText(description)}`;
  return head || escapeMarkupText(description);
}


/** MapPoint **Title** — the pin's popup heading (a leading `<strong>` inside the pin's text). */
export function MapPointTitleControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const { title, description } = parseMapPoint(useLeafInner(handle));
  return (
    <ToolbarItemView
      key={handleKey(handle)}
      label="Title"
      inputId="mappoint-title"
      type="text"
      value={title}
      placeholder="Location name"
      onChange={(v) => run("text.setInner", { target: handle, source: buildMapPoint(v, description) })}
    />
  );
}

/** MapPoint **Description** — the pin's popup body (the pin text after its heading). */
export function MapPointDescriptionControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const { title, description } = parseMapPoint(useLeafInner(handle));
  return (
    <ToolbarItemView
      key={handleKey(handle)}
      label="Description"
      inputId="mappoint-description"
      type="text"
      value={description}
      placeholder="Brief description"
      onChange={(v) => run("text.setInner", { target: handle, source: buildMapPoint(title, v) })}
    />
  );
}

/** MapPath **Label** — the route caption drawn halfway along the line (the route child's text). */
export function MapPathLabelControl({ handle }: ElementControlProps) {
  const run = useRunCommand();
  const inner = useLeafInner(handle);
  return (
    <ToolbarItemView
      key={handleKey(handle)}
      label="Label"
      inputId="mappath-label"
      type="text"
      value={plainText(inner)}
      placeholder="Enter here"
      onChange={(v) => run("text.setInner", { target: handle, source: escapeMarkupText(v) })}
    />
  );
}
