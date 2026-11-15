/**
 * The picked picture as a preview card: the image itself (150px, `object-contain` on `bg-base-200`), its file
 * name and pixel size, and Replace / Remove. Clicking the picture also opens the picker. Empty: a dashed
 * "Choose an image" box. Every state (empty, loading, loaded, a linked value) is the same height, so nothing
 * moves when the item resolves. Presentational: `MediaInput` resolves the item and owns the picker.
 *
 *   <MediaCard value="m1" url="https://…/m1.png" name="hero.png" dims="1200 × 800 px" onOpen={open} onRemove={clear} />
 */
import type { ReactNode } from "react";
import { Icon } from "../../primitives/icons";

interface MediaCardProps {
  value: string;
  url: string | null;
  name?: string;
  /** Pixel size ("1200 × 800 px"), when the library item has dimensions. */
  dims?: string;
  /** A linked value (`{{ company.logo }}`) as its chip, shown instead of a file name. */
  bound?: ReactNode;
  onOpen(): void;
  onRemove(): void;
}

const HEIGHT = "h-[196px]"; // preview 150px + the name row

export function MediaCard({ value, url, name, dims, bound, onOpen, onRemove }: MediaCardProps) {
  if (!value)
    return (
      <button
        type="button"
        data-media-card="empty"
        onClick={onOpen}
        className={`${HEIGHT} border-base-300 text-base-content/60 hover:border-base-content/40 hover:text-base-content flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs transition-colors`}
      >
        <Icon name="photo" className="size-5" />
        Choose an image
      </button>
    );
  return (
    <div data-media-card="" className={`${HEIGHT} border-base-300 bg-base-100 flex w-full flex-col overflow-hidden rounded-lg border`}>
      <button type="button" data-media-card-preview="" aria-label="Change image" onClick={onOpen} className="bg-base-200 flex h-[150px] w-full shrink-0 items-center justify-center">
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <Icon name="photo" className="text-base-content/40 size-6" />}
      </button>
      <div className="border-base-300 flex min-h-0 flex-1 items-center gap-1 border-t px-2">
        <div className="min-w-0 flex-1">
          {bound ?? (
            <div data-media-card-name="" className="text-base-content truncate text-xs">
              {name ?? value}
            </div>
          )}
          {dims && <div className="text-base-content/60 text-[11px]">{dims}</div>}
        </div>
        <button type="button" onClick={onOpen} className="btn btn-ghost btn-xs">
          Replace
        </button>
        <button type="button" onClick={onRemove} className="btn btn-ghost btn-xs">
          Remove
        </button>
      </div>
    </div>
  );
}
