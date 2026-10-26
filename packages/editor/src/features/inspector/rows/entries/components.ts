import { ar, at, nt, rt, ss, tw } from "../build";
import type { PropEntry } from "../types";

const C = "component";

/** Component tab: the settings only one kind of thing has. */
export const componentEntries: PropEntry[] = [
  // ── Text / Button / Link ──
  nt("text", "text button link heading", C, "The words. Rich text for Text, plain for Button / Link.", "the element's inner text / inline markup (`<strong>`, `<em>`, `<span class>`), Liquid output allowed", "text()"),
  nt("tagName", "text form-control", C, "Which tag: h1-h6, p, span, blockquote, label ...", "the element's tag name", 'tagName(["h1","h2","h3","h4","h5","h6","p","span","div","blockquote","label","small","li"])'),
  nt("richText", "text", C, "Inline-only vs full rich-text profile.", "implied by the tag: `span` / heading = inline marks only, `div` / `p` blocks = full; no stored value", 'tagName(["span","p","div"])'),
  rt("textFitMode", "text", C, "Shrink the text to fit one line or the box.", "`data-fit-text=\"oneline|multiline|box|boxoneline\"`", 'attr("data-fit-text", t.enum(["oneline","multiline","box","boxoneline"]))', { runtime: "fit-text" }),
  at("icon", "button link", C, "Icon beside the label.", "an inline `{{ 'tb/TbPhone' | icon }}` SVG before / after the text, inside the same `<a>` / `<button>`", "text() (the Liquid `icon` filter output)", { aliases: ["icon.value", "icon.position"] }),
  nt("buttonType", "button link", C, "Link, button, or submit button.", "the tag: `<a>` for a link, `<button type=\"button\">` / `<button type=\"submit\">` otherwise", "tagName([\"a\",\"button\"]) + attr(\"type\", t.enum([\"button\",\"submit\"]))"),
  nt("standalone-icon.value", "icon", C, "Which icon.", "`{{ 'tb/TbPhone' | icon }}` (an inline SVG); media-library SVGs as `<img>`", 'arg("icon", t.string()) -- filter input', { aliases: ["value"] }),
  tw("standalone-icon.color", "icon", C, "Icon colour (SVG uses currentColor).", "text-color"),
  tw("standalone-icon.size", "icon", C, "Icon size.", "size"),

  // ── Image ──
  at("image.src", "image", C, "The picture.", "`<img src=\"{{ photo | image_url: width: 800 }}\">` or `{{ photo | image_tag }}`", 'attr("src", t.string())', { aliases: ["image.type"] }),
  at("alt", "image", C, "Alt text.", "`alt` attribute", 'attr("alt", t.string())'),
  at("title", "image audio video embed map", "properties", "Title (accessible name / tooltip) of the media.", "`title` attribute (iframe / video / audio / img)", 'attr("title", t.string())'),
  at("fetchPriority", "image", C, "Load priority.", "`fetchpriority` attribute", 'attr("fetchpriority", t.enum(["high","low","auto"]))'),
  at("loading", "image", C, "Lazy or eager load.", "`loading` attribute", 'attr("loading", t.enum(["lazy","eager"]))'),
  at("sizes", "image", C, "Responsive image sizes.", "`sizes` attribute (`image_tag` fills `srcset`)", 'attr("sizes", t.string())'),
  tw("objectFit", "image video", C, "How the picture fills its box.", "object-fit"),
  tw("objectPosition", "image video", C, "Focal point.", "object-position"),

  // ── Video / Audio ──
  nt("provider", "video", C, "Where the video is from: file, YouTube, Vimeo ...", "native `<video src>` for files; `<iframe src=\"https://www.youtube-nocookie.com/embed/...\">` for hosted", 'tagName(["video","iframe"])'),
  at("videoId", "video embed", C, "Video id / media id.", "`src` of the `<video>` / iframe built from the id (`{{ id | file_url }}`)", 'attr("src", t.string())'),
  at("autoPlay", "video audio", C, "Start playing.", "`autoplay` attribute", 'attr("autoplay", t.boolean())'),
  at("controls", "video audio", C, "Show player controls.", "`controls` attribute", 'attr("controls", t.boolean())'),
  at("loop", "video audio", C, "Loop.", "`loop` attribute", 'attr("loop", t.boolean())'),
  at("muted", "video", C, "Start muted.", "`muted` attribute", 'attr("muted", t.boolean())'),
  at("playsInline", "video", C, "Play inline on phones.", "`playsinline` attribute", 'attr("playsinline", t.boolean())'),
  at("preload", "video", C, "Preload mode.", "`preload` attribute", 'attr("preload", t.enum(["none","metadata","auto"]))'),
  at("src", "audio", C, "The audio file.", "`src` attribute", 'attr("src", t.string())'),

  // ── Embed ──
  nt("service", "embed", C, "Embed provider: YouTube, Vimeo, Maps, custom code.", "an `<iframe src>` for the service, or raw HTML for custom", 'attr("src", t.string())'),
  at("url", "embed", C, "Embed address.", "iframe `src`", 'attr("src", t.string())'),
  ss("code", "embed", C, "Custom HTML snippet.", "raw HTML in the element; as a section setting `{ \"type\": \"html\" }` when the snippet is an editable input", 'text()'),
  ss("headCode", "embed", C, "Snippet added to the page head.", "`{% schema %}` setting of type `html`, output inside `<head>` by the layout (`{{ settings.head_code }}`)", "setting `head_code` (html)"),
  ss("footCode", "embed", C, "Snippet added before `</body>`.", "setting of type `html`, output at the end of the layout body", "setting `foot_code` (html)"),

  // ── Map ──
  ar("map.lat", "map", C, "Centre latitude.", "`{% map lat: 33.8 %}`", 'arg("lat", t.number())', { aliases: ["lat"] }),
  ar("map.lng", "map", C, "Centre longitude.", "`{% map lng: -118.3 %}`", 'arg("lng", t.number())', { aliases: ["lng"] }),
  ar("zoom", "map", C, "Zoom level.", "`{% map zoom: 14 %}`", 'arg("zoom", t.number())'),
  ar("map.type", "map", C, "Interactive, static image or decorative background.", "`{% map mode: 'static' %}` (new argument)", 'arg("mode", t.enum(["interactive","static","background"]))'),
  ar("tileStyle", "map", C, "Tile style.", "`{% map tiles: 'osm' %}` (new argument)", 'arg("tiles", t.enum(["osm"]))'),
  ar("map.grayscale", "map", C, "Grey-toned tiles.", "`{% map grayscale: true %}` (new argument)", 'arg("grayscale", t.boolean())'),
  ar("map.title", "map", C, "Accessible map name.", "`{% map title: 'Our shop' %}` (new argument) -> `aria-label`", 'arg("title", t.string())'),
  at("map-pin.lat", "map-pin", C, "Pin latitude.", "`data-lat` on the pin child", 'attr("data-lat", t.number())'),
  at("map-pin.lng", "map-pin", C, "Pin longitude.", "`data-lng` on the pin child", 'attr("data-lng", t.number())'),
  nt("map-pin.title", "map-pin", C, "Pin popup title.", "the pin child's heading text", "text()"),
  nt("map-pin.description", "map-pin", C, "Pin popup text.", "the pin child's body text", "text()", { aliases: ["description"] }),
  at("map-path.path", "map-path", C, "Route points, one `lat,lng` per line.", "`data-path` on the route child", 'attr("data-path", t.string())', { aliases: ["path"] }),
  at("map-path.color", "map-path", C, "Route colour.", "`data-color` on the route child", 'attr("data-color", t.string())'),
  at("weight", "map-path", C, "Route line width.", "`data-weight`", 'attr("data-weight", t.number())'),
  at("map-path.opacity", "map-path", C, "Route opacity.", "`data-opacity`", 'attr("data-opacity", t.number())'),
  at("dashed", "map-path", C, "Dashed line.", "`data-dashed`", 'attr("data-dashed", t.boolean())'),
  nt("map-path.label", "map-path", C, "Caption halfway along the line.", "the route child's text", "text()", { aliases: ["label"] }),
  nt("map-path.title", "map-path", C, "Accessible route name.", "`aria-label` on the route child", 'attr("aria-label", t.string())'),

  // ── Form ── (standalone core: a plain HTML `<form>`. Submission features — inbox / collection /
  // webhook / mailto / success — are host-injected and drive the `{% form %}` liquid tag instead.)
  at("formName", "form", C, "Form name.", "`name` attribute on the `<form>`", 'attr("name", t.string())'),
  at("form.action", "form", C, "Where the form submits (URL).", "`action` attribute on the `<form>`", 'attr("action", t.string())'),
  at("method", "form", C, "GET or POST.", "`method` attribute", 'attr("method", t.enum(["get","post"]))'),
  at("form.enctype", "form", C, "How the form data is encoded on submit.", "`enctype` attribute", 'attr("enctype", t.enum(["application/x-www-form-urlencoded","multipart/form-data","text/plain"]))'),
  at("form.target", "form", C, "Where the response opens (`_self`, `_blank`, a frame name).", "`target` attribute", 'attr("target", t.string())'),
  at("form.autocomplete", "form", C, "Browser autofill for the whole form.", "`autocomplete` attribute", 'attr("autocomplete", t.enum(["on","off"]))'),
  at("form.novalidate", "form", C, "Skip the browser's built-in validation.", "`novalidate` attribute", 'attr("novalidate", t.boolean())'),
  rt("view", "form", C, "Which state is being edited: form, sending, sent.", "the `[data-form-state=\"sending|sent|error\"]` child blocks (existing form enhance)", 'attr("data-form-state", t.enum(["sending","sent","error"]))', { aliases: ["formSettings"] }),

  // ── FormElement ──
  at("name", "form-control", C, "Field name.", "`name` attribute", 'attr("name", t.string())'),
  at("placeholder", "form-control", C, "Placeholder text.", "`placeholder` attribute", 'attr("placeholder", t.string())'),
  at("form-control.type", "form-control", C, "Input type: text, email, number, select, textarea, checkbox, radio ...", "tag + `type` attribute", 'attr("type", t.enum(["text","email","number","search","tel","url","password","checkbox","radio"])) + tagName(["input","select","textarea"])'),
  nt("options", "form-control", C, "Select / radio options.", "child `<option value>` elements", "text()"),
  at("required", "form-control", C, "Must be filled.", "`required`", 'attr("required", t.boolean())'),
  at("disabled", "form-control", C, "Disabled field.", "`disabled`", 'attr("disabled", t.boolean())'),
  at("readOnly", "form-control", C, "Read-only field.", "`readonly`", 'attr("readonly", t.boolean())'),
  at("defaultChecked", "form-control", C, "Pre-checked.", "`checked`", 'attr("checked", t.boolean())'),
  at("defaultValue", "form-control", C, "Initial value.", "`value` (or text inside `<textarea>`)", 'attr("value", t.string())', { aliases: ["form-control.value"] }),
  at("rows", "form-control", C, "Textarea rows.", "`rows`", 'attr("rows", t.number())'),
  at("cols", "form-control", C, "Textarea columns.", "`cols`", 'attr("cols", t.number())'),
  at("min", "form-control", C, "Minimum number / date.", "`min`", 'attr("min", t.string())'),
  at("max", "form-control", C, "Maximum number / date.", "`max`", 'attr("max", t.string())'),
  at("step", "form-control", C, "Number step.", "`step`", 'attr("step", t.string())'),
  at("pattern", "form-control", C, "Validation pattern.", "`pattern` attribute (on form fields; the background pattern is `bgPattern`)", 'attr("pattern", t.string())'),
  at("autoComplete", "form-control", C, "Browser autofill hint.", "`autocomplete`", 'attr("autocomplete", t.string())'),
  at("errorMessage", "form-control", C, "Text shown when the field is invalid.", "`data-error` text shown by CSS `:user-invalid` + sibling `<span>`; native message via `title`/`setCustomValidity` avoided", 'attr("data-error", t.string())'),
  nt("form-control.label", "form-control", C, "Label text.", "a `<label for>` (or wrapping `<label>`) element", "text()"),
  at("invalid", "form-control", C, "Show the invalid look in the editor.", "CSS `:user-invalid` state; no stored value (editor preview via `data-edit-preview`)", 'attr("data-edit-preview", t.string())'),
];
