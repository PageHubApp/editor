/**
 * The `image_url` / `file_url` / `icon` providers for a site on disk. Browser-safe (no Node imports): the editor
 * canvas builds them from the open files, a preview from the folder, and both get the same answers.
 *
 * A media id resolves against the site's own CDN base (`site.json` `imageBase` / `imageVariant`); with none there is
 * nothing to point at, and `emptyImage` is what an `<img>` gets (the canvas passes "" and paints its own placeholder,
 * a chrome-free preview passes the engine's `PLACEHOLDER_IMAGE`). Icons come from the bundle's `icons.json`.
 */
export interface LocalHostSources {
  site: { imageBase?: string; imageVariant?: string };
  icons: Record<string, string>;
}

export interface LocalHost {
  imageUrl(id: string): string;
  fileUrl(name: string): string;
  icon(ref: string): string;
}

export const isAbsoluteUrl = (s: string) => /^(https?:|data:|blob:|\/)/.test(s);

export function localHost({ site, icons }: LocalHostSources, { emptyImage = "" }: { emptyImage?: string } = {}): LocalHost {
  return {
    imageUrl: (id) => {
      if (isAbsoluteUrl(id)) return id;
      return id.trim() && site.imageBase ? `${site.imageBase}/${id}/${site.imageVariant || "public"}` : emptyImage;
    },
    fileUrl: (name) => (isAbsoluteUrl(name) ? name : "#"),
    icon: (ref) => icons[ref] ?? "",
  };
}
