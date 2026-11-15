/**
 * A link's `href` as the link picker shows it, and back. The stored form is always a plain
 * `href` (+ `target` / `rel`); this only decides which tab of the picker it opens on and what the
 * field shows.
 *
 *   parseHref("mailto:hi@x.com")            // { kind: "email", value: "hi@x.com" }
 *   parseHref("/about#team", ["/", "/about"]) // { kind: "page", value: "/about", anchor: "team" }
 *   buildHref({ kind: "web", value: "example.com" }) // "https://example.com"
 *   buildHref({ kind: "phone", value: "+1 555-123 4567" }) // "tel:+15551234567"
 *
 * Pure, no React.
 */

export type LinkKind = "page" | "web" | "email" | "phone";

export interface LinkValue {
  kind: LinkKind;
  /** Page: its route (`""` = this page, for a bare `#anchor`). Web / email / phone: the text the field shows. */
  value: string;
  /** Page only: the `#id` on that page, without the `#`. */
  anchor?: string;
}

/** The `rel` a new-tab link gets. */
export const NEW_TAB_REL = "noopener noreferrer";
const NEW_TAB_TOKENS = NEW_TAB_REL.split(" ");

const LIQUID = /\{\{|\{%/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A bare domain (`example.com`, `www.example.com/path`): no spaces, a dot inside the host. */
const BARE_DOMAIN = /^[^\s/?#@:]+\.[a-z]{2,}(?:[/?#:].*)?$/i;

/**
 * Read an existing href. `knownRoutes` (the site's linkable page routes) decides whether a
 * `/path` is a page; a path that is not one of them opens as a web address so it stays visible.
 * Liquid (`{{ … }}`) is always a web address, shown as-is.
 */
export function parseHref(href: string | null | undefined, knownRoutes?: readonly string[]): LinkValue {
  const raw = (href ?? "").trim();
  if (!raw) return { kind: "page", value: "" };
  if (LIQUID.test(raw)) return { kind: "web", value: raw };
  if (/^mailto:/i.test(raw)) return { kind: "email", value: decodeSafe(raw.slice(7)) };
  if (/^tel:/i.test(raw)) return { kind: "phone", value: raw.slice(4) };
  if (raw.startsWith("#")) return { kind: "page", value: "", anchor: raw.slice(1) };
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const hash = raw.indexOf("#");
    const route = normalizeRoute(hash === -1 ? raw : raw.slice(0, hash));
    const anchor = hash === -1 ? undefined : raw.slice(hash + 1);
    if (!knownRoutes || knownRoutes.includes(route)) return { kind: "page", value: route, ...(anchor ? { anchor } : {}) };
  }
  return { kind: "web", value: raw };
}

/** The href for a picker value; `""` when there is nothing to link to yet. */
export function buildHref(link: LinkValue): string {
  const value = link.value.trim();
  switch (link.kind) {
    case "page": {
      const anchor = link.anchor?.trim();
      if (!value) return anchor ? `#${anchor}` : "";
      return anchor ? `${value}#${anchor}` : value;
    }
    case "email": {
      const address = value.replace(/^mailto:/i, "").trim();
      return address ? `mailto:${address}` : "";
    }
    case "phone": {
      const number = value.replace(/^tel:/i, "").replace(/[\s\-().]/g, "");
      return number ? `tel:${number}` : "";
    }
    case "web":
      return webAddress(value);
  }
}

/** `example.com` → `https://example.com`; anything with a scheme, a path, an anchor or Liquid as typed. */
export function webAddress(value: string): string {
  const v = value.trim();
  if (!v || LIQUID.test(v) || SCHEME.test(v) || v.startsWith("/") || v.startsWith("#") || v.startsWith("?")) return v;
  return BARE_DOMAIN.test(v) ? `https://${v}` : v;
}

/** The `rel` after turning "open in a new tab" on or off: adds / drops `noopener noreferrer`, keeps the rest. `null` = no rel. */
export function relForNewTab(rel: string | null | undefined, newTab: boolean): string | null {
  const tokens = (rel ?? "").split(/\s+/).filter((t) => t && !NEW_TAB_TOKENS.includes(t.toLowerCase()));
  const next = newTab ? [...tokens, ...NEW_TAB_TOKENS] : tokens;
  return next.length ? next.join(" ") : null;
}

/** The element ids on a page file's markup (`id="team"`), in order, without Liquid-built ones. */
export function anchorIds(source: string | undefined): string[] {
  if (!source) return [];
  const ids: string[] = [];
  for (const m of source.matchAll(/\sid\s*=\s*["']([A-Za-z][\w:.-]*)["']/g)) if (!ids.includes(m[1]!)) ids.push(m[1]!);
  return ids;
}

function normalizeRoute(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
