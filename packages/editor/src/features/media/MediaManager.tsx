/**
 * The default `MediaManager` slot: the host's media store (the `media` facet) behind the media
 * manager window. With an `onPick` it is the picker ("Select Media"); without, the manager.
 *
 *   <Slot name="MediaManager" open onClose={close} onPick={(id) => setImage(id)} />
 */
import { mediaFacet } from "@pagehub/engine/host";
import type { MediaManagerProps } from "../../components";
import { useEditorState } from "../../react/bindings";
import { MediaManagerView } from "./MediaManagerView";
import { useMediaLibrary } from "./useMediaLibrary";


export function MediaManager({ open, onClose, onPick, kindFilter, sources, chromeless }: MediaManagerProps) {
  const store = useEditorState((s) => s.facet(mediaFacet));
  const lib = useMediaLibrary(open ? store : null);
  return (
    <MediaManagerView
      open={open}
      onClose={onClose}
      onPick={onPick}
      kindFilter={kindFilter}
      sources={sources}
      chromeless={chromeless}
      items={lib.items}
      folders={lib.folders}
      loading={lib.loading}
      uploading={lib.uploading}
      error={lib.error}
      onRetry={lib.reload}
      unavailable={!store}
      actions={{ ...lib, upload: (files, folder) => lib.upload(files, folder) }}
    />
  );
}
