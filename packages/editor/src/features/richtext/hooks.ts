/**
 * What a host plugs into the rich-text toolbar. Both are facets, so a plugin supplies them with
 * `typographyPresetsFacet.of([...])` / `includeInChatFacet.of(fn)`; with none provided the font
 * panel has no presets row and the text menu has no "Include in chat" row.
 */
import { defineFacet, type NodeHandle } from "@pagehub/engine";

/** A named text style: the classes it writes on the selection (`font-heading text-3xl`) and the family to load for it. */
interface TypographyPreset {
  name: string;
  className: string;
  fontFamily?: string;
}

export const typographyPresetsFacet = defineFacet<readonly TypographyPreset[], readonly TypographyPreset[]>({ id: "typographyPresets", combine: (values) => values.flat() });

/** The selected text and its leaf, handed to the host's AI chat. */
export interface ChatSelection {
  text: string;
  handle: NodeHandle;
}
type IncludeInChat = (selection: ChatSelection) => void;

export const includeInChatFacet = defineFacet<IncludeInChat, IncludeInChat | null>({ id: "includeInChat", combine: (values) => values.at(-1) ?? null });
