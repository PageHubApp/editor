import { splitArgs, type BuiltinFilter } from "./types";

export const image_url: BuiltinFilter = {
  name: "image_url",
  returns: "url",
  host: "imageUrl",
  describe: "A media id as a CDN URL: {{ section.settings.photo | image_url: width: 1600 }}. Options: width, height, crop, format.",
  run(v, args, ctx) {
    if (typeof v !== "string" || !v) return "";
    const { kv } = splitArgs(args);
    const num = (x: unknown) => (x == null || x === "" ? undefined : Number(x));
    return ctx.host.imageUrl!(v, { width: num(kv.width), height: num(kv.height), crop: kv.crop as string | undefined, format: kv.format as string | undefined });
  },
};

export const file_url: BuiltinFilter = {
  name: "file_url",
  returns: "url",
  host: "fileUrl",
  describe: "A site file as a URL: {{ 'menu.pdf' | file_url }}.",
  run: (v, _a, ctx) => (typeof v === "string" && v ? ctx.host.fileUrl!(v) : ""),
};

/** A site JS file name as written (`app.js`, `vendor/x.js` is not one: files live flat under `assets/`). */
export const ASSET_NAME = /^[a-z0-9][a-z0-9_.-]*\.js$/i;

export const asset_url: BuiltinFilter = {
  name: "asset_url",
  returns: "url",
  describe: "A site JS file (assets/<name>.js) as a URL: <script src=\"{{ 'app.js' | asset_url }}\" defer></script>. Served from the site's release, versioned by its content.",
  run: (v, _a, ctx) => {
    if (typeof v !== "string" || !ASSET_NAME.test(v) || v.includes("..")) return "";
    return ctx.host.assetUrl ? ctx.host.assetUrl(v) : `/assets/${v}`;
  },
};

export const icon: BuiltinFilter = {
  name: "icon",
  returns: "html",
  host: "icon",
  describe: "Inline SVG for an icon ref: {{ 'tb/TbPhone' | icon | raw }}. Unknown refs render nothing.",
  run: (v, _a, ctx) => (typeof v === "string" && v ? (ctx.host.icon!(v) ?? "") : ""),
};
