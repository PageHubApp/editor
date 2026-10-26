/**
 * The host's AI hook for the canvas: the id of the command that attaches an element to the AI
 * chat (`run(ctx, { at })`). Without it there is no AI, so no "Include in AI chat" row appears in
 * the context menu or on the delete strip. Hosts fill it with `aiChatFacet.of("host.aiInclude")`.
 */
import { defineFacet } from "@pagehub/engine";
import { useEditorState } from "../../react/bindings";

export const aiChatFacet = defineFacet<string, string | null>({ id: "aiChatCommand", combine: (values) => values.at(-1) ?? null });

/** The AI command id the host registered, or null (the delete strip and the menu read this). */
export const useAiChatCommand = (): string | null => useEditorState((s) => s.facet(aiChatFacet));
