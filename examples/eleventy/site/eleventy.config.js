// Eleventy 3 (ESM). The editor works on `src/`; `pages` are the .liquid files, `partials/` and
// `layouts/` are named so the editor treats them as includes rather than pages.
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  return {
    dir: { input: "src", output: "_site", includes: "partials", layouts: "layouts", data: "_data" },
    templateFormats: ["liquid", "md"],
    markdownTemplateEngine: "liquid",
  };
}
