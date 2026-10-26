/**
 * An editing profile: what one kind of document lets its author do. A site page needs none (every tool is on). An
 * email (`emailKit()` in `@pagehub/engine/kits`) is a 600px document of a few elements, so its profile locks the
 * canvas width and narrows the Add panel to what the email renderer can send.
 *
 * Several contributions merge: scalar fields from the last one win, `tiles` are concatenated.
 */
import { defineFacet } from "../extensions/extension";

/** One Add-panel tile a profile offers: a snippet inserted as written. */
export interface ProfileTile {
  key: string;
  label: string;
  /** A glyph name the editor knows (`click`, `minus`, `layout-grid`, …); unknown names show a box. */
  icon: string;
  /** The Add panel's category title (`Layout`, `Text`, `Email`, …). */
  category: string;
  description?: string;
  /** The HTML + Liquid inserted. */
  snippet: string;
}

export interface EditorProfile {
  /** `email`, … (shown nowhere; for hosts and tests). */
  name: string;
  /** The canvas is exactly this many px wide; the breakpoint views and the width handles are off. */
  canvasWidth?: number;
  /** Element names (`html.text`, …) whose Add tiles show. Absent: every element with an insert entry. */
  elements?: readonly string[];
  /** False: no toolbox presets, no Automatic tile and no reusable components in the Add panel. */
  toolbox?: boolean;
  /** Extra Add tiles. */
  tiles?: readonly ProfileTile[];
}

export const profileFacet = defineFacet<EditorProfile, EditorProfile | null>({
  id: "profile",
  combine: (values) =>
    values.length
      ? values.reduce<EditorProfile>((all, p) => ({ ...all, ...p, tiles: [...(all.tiles ?? []), ...(p.tiles ?? [])] }), { name: "" })
      : null,
});
