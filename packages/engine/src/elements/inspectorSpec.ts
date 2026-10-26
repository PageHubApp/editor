/**
 * What the inspector shows for an element type: the inspector kind it stands for,
 * its component-tab section titles, and the hide keys it never shows. Lives on the element definition (`inspector: { … }`), so a host's element
 * brings its own rules.
 *
 *   defineElement({ name: "html.image", …, inspector: { type: "image", hide: TYPE_HIDE.image } })
 *   inspectorSpecOf(handle.element, handle.tag)   // { type: "image", hide: [...] }
 *
 * One definition covering several tags (`video, audio`) overrides per tag with `byTag`.
 */

/** A hide key names a section or a property the inspector leaves out for an element type. */
export type HideKey =
  | "bgColor" | "background" | "pattern" | "border" | "shadow" | "radius" | "opacity" | "cursor" | "accessibility"
  | "alignment" | "size" | "textColor" | "font" | "hoverClick" | "animations" | "modifiers" | "effectsClass"
  | "importExport" | "ringOutline";

export interface InspectorSpec {
  /** Inspector kind ("text", "image", "container" …): rows listed for it (and `*`) show. */
  type?: string;
  /** Component-tab section titles, in order. */
  sections?: readonly string[];
  hide?: readonly HideKey[];
  /** Child markup the Items section adds (the markup a new child gets). No Items section without it. */
  items?: string;
  /** Per-tag overrides for a definition matching several tags. */
  byTag?: Readonly<Record<string, Omit<InspectorSpec, "byTag">>>;
}

/** The hide keys each element type never shows, keyed by type. */
export const TYPE_HIDE: Readonly<Record<string, readonly HideKey[]>> = {
  text: ["bgColor", "background", "pattern", "border", "shadow", "radius", "opacity", "cursor", "accessibility", "alignment", "size"],
  image: ["textColor", "bgColor", "background", "pattern", "font", "opacity"],
  video: ["textColor", "bgColor", "background", "pattern", "font", "opacity", "hoverClick"],
  button: ["opacity"],
  link: ["opacity"],
  icon: ["opacity"],
  form: ["font", "opacity", "cursor", "hoverClick", "animations"],
  "form-control": ["shadow", "radius", "opacity", "font", "pattern", "hoverClick", "animations"],
  background: ["shadow", "border", "opacity", "radius", "hoverClick", "animations"],
  map: ["textColor", "bgColor", "pattern", "font", "hoverClick"],
  embed: ["textColor", "bgColor", "background", "pattern", "font", "border", "opacity", "hoverClick"],
  audio: ["textColor", "bgColor", "background", "pattern", "font", "border", "opacity", "hoverClick"],
  "map-pin": ["textColor", "bgColor", "background", "pattern", "font", "shadow", "opacity", "border", "radius", "animations", "hoverClick"],
  "map-path": ["textColor", "bgColor", "background", "pattern", "font", "shadow", "opacity", "border", "radius", "animations", "hoverClick"],
};

/** The component-tab section titles each element type shows, keyed by type. */
export const TYPE_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  container: ["Container Role"],
  form: ["Form", "Conversion tracking"],
  text: ["Edit HTML"],
  video: ["Playback", "Accessibility"],
  map: ["Location", "Details", "Map Settings", "Center Position", "Accessibility"],
};

/** The spec a type gets by default: its hide list and component sections. */
export function typeSpec(type: string, extra: Omit<InspectorSpec, "type"> = {}): InspectorSpec {
  return { type, ...(TYPE_HIDE[type] ? { hide: TYPE_HIDE[type] } : {}), ...(TYPE_SECTIONS[type] ? { sections: TYPE_SECTIONS[type] } : {}), ...extra };
}

/** The resolved spec for an element definition and the node's tag; `{}` for `"auto"` or a lazy panel. */
export function inspectorSpecOf(def: { inspector?: unknown }, tag?: string): InspectorSpec {
  const i = def.inspector;
  if (!i || typeof i !== "object") return {};
  const { byTag, ...base } = i as InspectorSpec;
  const over = tag ? byTag?.[tag.toLowerCase()] : undefined;
  return over ? { ...base, ...over } : base;
}
