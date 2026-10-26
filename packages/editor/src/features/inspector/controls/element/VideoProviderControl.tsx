import { closeHistoryGroup } from "@pagehub/engine";
import { useEditorState, useEditorStore } from "../../../../react/bindings";
import { ToolbarItemView } from "../../../toolbar/ToolbarItemView";
import { useLiveTag, type ElementControlProps } from "./elementControlShared";
import { VIDEO_PROVIDER_LABEL, VIDEO_PROVIDER_TAG, VIDEO_PROVIDER_VALUES, buildVideoSrc, videoIdFromSrc, videoProviderFromSrc, type VideoProvider } from "./videoProviders";

/**
 * Video **Provider** select. The HTML-first model carries the source in the tag:
 * a file is a native `<video src>`, a hosted provider an `<iframe>` embed. Picking a hosted
 * provider converts the element to the embed form (`tr.setTagName` to `iframe`, which resolves it
 * as an Embed) and scaffolds that provider's embed URL from the current id; picking File converts
 * it back to `<video>`. The specific hosted provider is read back from the iframe `src` host.
 */
export function VideoProviderControl({ handle }: ElementControlProps) {
  const store = useEditorStore();
  const tag = useLiveTag(handle);
  const src = useEditorState((s) => {
    void s.files.get(handle.path);
    return handle.alive && handle.kind === "element" ? (handle.attr("src") ?? "") : "";
  });
  const value = videoProviderFromSrc(tag, src);
  const set = (next: VideoProvider) => {
    if (next === value || !handle.alive || handle.kind !== "element") return;
    const nextTag = VIDEO_PROVIDER_TAG[next];
    const nextSrc = buildVideoSrc(next, videoIdFromSrc(src));
    store.dispatch((tr) => {
      if (tag !== nextTag) tr.setTagName(handle, nextTag);
      tr.setAttr(handle, "src", nextSrc || null);
      return tr;
    });
    store.dispatch((tr) => tr.effect(closeHistoryGroup, null));
  };
  return (
    <ToolbarItemView
      label="Provider"
      inputId="video-provider"
      type="select"
      value={value}
      valueLabels={VIDEO_PROVIDER_VALUES}
      formatLabel={(v) => VIDEO_PROVIDER_LABEL[v as VideoProvider] ?? v}
      onChange={(v) => set(v as VideoProvider)}
    />
  );
}
