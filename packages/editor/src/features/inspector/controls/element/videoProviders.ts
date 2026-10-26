/** Video provider model: which tag / embed URL each provider uses, and the reverse parse from a `src`. */
export type VideoProvider = "uploaded" | "file" | "youtube" | "vimeo" | "dailymotion" | "wistia" | "facebook" | "twitch" | "embed";

export const VIDEO_PROVIDER_VALUES: readonly VideoProvider[] = ["uploaded", "file", "youtube", "vimeo", "dailymotion", "wistia", "facebook", "twitch", "embed"];
export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  uploaded: "Uploaded (media library)", file: "Direct URL", youtube: "YouTube", vimeo: "Vimeo", dailymotion: "Dailymotion", wistia: "Wistia", facebook: "Facebook", twitch: "Twitch", embed: "Other embed",
};
export const VIDEO_PROVIDER_TAG: Record<VideoProvider, "video" | "iframe"> = {
  uploaded: "video", file: "video", youtube: "iframe", vimeo: "iframe", dailymotion: "iframe", wistia: "iframe", facebook: "iframe", twitch: "iframe", embed: "iframe",
};
// Reverse of the embed-URL builder: host → provider + id.
const VIDEO_EMBED_PATTERNS: { p: VideoProvider; re: RegExp }[] = [
  { p: "youtube", re: /(?:youtube(?:-nocookie)?\.com|youtu\.be)\/(?:embed\/)?([^?&/]*)/ },
  { p: "vimeo", re: /player\.vimeo\.com\/video\/([^?&/]*)/ },
  { p: "dailymotion", re: /dailymotion\.com\/embed\/video\/([^?&/]*)/ },
  { p: "wistia", re: /wistia\.(?:net|com)\/embed\/iframe\/([^?&/]*)/ },
];

/** A library file as the source writes it: `{{ "<id>" | file_url }}` (the engine resolves the delivery URL). */
const UPLOADED = /^\{\{\s*["']([^"']*)["']\s*\|\s*file_url[^}]*\}\}$/;

export function videoProviderFromSrc(tag: string, src: string): VideoProvider {
  if (tag === "video") return UPLOADED.test(src.trim()) ? "uploaded" : "file";
  for (const { p, re } of VIDEO_EMBED_PATTERNS) if (re.test(src)) return p;
  return "embed";
}
/** The library id of an uploaded video src ("" for anything else). */
export const uploadedIdFromSrc = (src: string): string => UPLOADED.exec(src.trim())?.[1] ?? "";

export function videoIdFromSrc(src: string): string {
  for (const { re } of VIDEO_EMBED_PATTERNS) {
    const m = re.exec(src);
    if (m) return m[1]!;
  }
  // A bare id / token carries across providers; a full URL that isn't a known embed does not
  // (so switching a direct file URL to a hosted provider clears the id instead of nesting a URL).
  return /[:/{]/.test(src) ? "" : src;
}
/** The `src` for a provider and id. A provider with no id yet still gets its base address, so the choice is remembered. */
export function buildVideoSrc(p: VideoProvider, id: string): string {
  if (!id && !(p === "uploaded" || p === "youtube" || p === "vimeo" || p === "dailymotion" || p === "wistia")) return "";
  switch (p) {
    case "uploaded": return `{{ '${id.replace(/['"]/g, "")}' | file_url }}`; // single quotes: an attribute value can't hold a double quote
    case "youtube": return `https://www.youtube.com/embed/${id}`;
    case "vimeo": return `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`;
    case "dailymotion": return `https://www.dailymotion.com/embed/video/${id}`;
    case "wistia": return `https://fast.wistia.net/embed/iframe/${id}`;
    default: return id; // file / facebook / twitch / other-embed keep the raw URL
  }
}
