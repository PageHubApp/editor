import { MediaInput } from "../../../media/MediaInput";
import { PanelNote } from "../../../liquid/LiquidFields";
import { ToolbarItemView } from "../../../toolbar/ToolbarItemView";
import { useAttrs } from "../../useAttrs";
import { useLiveTag, type ElementControlProps } from "./elementControlShared";
import { buildVideoSrc, uploadedIdFromSrc, videoIdFromSrc, videoProviderFromSrc, type VideoProvider } from "./videoProviders";

const HOSTED_ID: readonly VideoProvider[] = ["youtube", "vimeo", "dailymotion", "wistia"];

/** What to paste, per provider (the old editor's instructions, for the HTML-first source forms). */
const HELP: Partial<Record<VideoProvider, string>> = {
  uploaded: "Pick a video from your media library. Uploaded videos are public: anyone with the link can watch them.",
  file: "Paste a direct file URL ending in .mp4, .webm or .mov. It plays in a native video player, so Autoplay, Loop and Muted work.",
  youtube: "The id from the video's address, e.g. dQw4w9WgXcQ from youtube.com/watch?v=dQw4w9WgXcQ.",
  vimeo: "The id from the video's address, e.g. 123456789 from vimeo.com/123456789.",
  dailymotion: "The id from the video's address, e.g. x8abcde from dailymotion.com/video/x8abcde.",
  wistia: "The id from your Wistia embed code or video address.",
  facebook: "The full Facebook video embed address.",
  twitch: "The full Twitch embed address.",
  embed: "The embed address (the iframe's src).",
};

/** A picked media value (an id, or an expression / URL) → the `src` to write. */
const srcOf = (v: string) => (!v ? "" : v.includes("{{") || /^(https?:|\/|data:)/.test(v) ? v : buildVideoSrc("uploaded", v));

/**
 * The Video source row, matching the old `VideoMainTab` for the provider the Provider row chose:
 * an uploaded video picks from the media library (video filter), a YouTube / Vimeo / Dailymotion /
 * Wistia video takes its id, and a direct file or other embed takes its address. The Provider row
 * (`VideoProviderControl`) switches between them; this writes `src` in each one's source form.
 */
export function VideoSourceControl({ handle }: ElementControlProps) {
  const { read, write } = useAttrs(handle);
  const tag = useLiveTag(handle);
  const src = read("src") ?? "";
  const provider = videoProviderFromSrc(tag, src);
  const hostedId = HOSTED_ID.includes(provider);
  return (
    <div data-video-source={provider} className="flex min-w-0 flex-col gap-1">
      {provider === "uploaded" ? (
        <MediaInput label="Video" kindFilter="video" value={uploadedIdFromSrc(src)} onChange={(v) => write("src", srcOf(v) || buildVideoSrc("uploaded", ""))} />
      ) : (
        <ToolbarItemView
          key={src}
          type="text"
          label={hostedId ? "Video ID" : "Video URL"}
          inputId="video-source"
          placeholder={hostedId ? "Enter video ID" : "https://…"}
          value={hostedId ? videoIdFromSrc(src) : src}
          onChange={(v) => write("src", (hostedId ? buildVideoSrc(provider, v.trim()) : v.trim()) || null)}
        />
      )}
      {HELP[provider] && <PanelNote>{HELP[provider]}</PanelNote>}
    </div>
  );
}

