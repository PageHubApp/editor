import { WALL_CLOCK, wallClockInstant } from "../../liquid/wallClock";
import { attrString, escapeHtml } from "../escape";
import { safeUrl, splitArgs, type BuiltinFilter } from "./types";

const NAMED_DATE_FORMATS: Record<string, string> = {
  abbreviated_date: "%b %d, %Y",
  basic: "%m/%d/%Y",
  date: "%B %d, %Y",
  date_at_time: "%B %d, %Y at %I:%M %p",
  default: "%B %d, %Y",
  on_date: "on %B %d, %Y",
  month_day_year: "%B %d, %Y",
  year: "%Y",
};

/** https://shopify.dev/docs/api/liquid/filters/time_tag — `<time datetime="…">formatted</time>`. */
export const time_tag: BuiltinFilter = {
  name: "time_tag",
  returns: "html",
  describe: "A <time> element: {{ post.date | time_tag: '%B %d, %Y' }}, or a named format such as 'date'. Options: class, id, datetime.",
  run(v, args, ctx) {
    const { pos, kv } = splitArgs(args);
    if (v == null || v === "") return "";
    // A string without an offset is the site's wall-clock time, so it goes to the `date` filter as written (`new Date` would read it in the server's zone).
    const wall = typeof v === "string" ? WALL_CLOCK.exec(v.trim()) : null;
    const date = (wall ? wallClockInstant(v, 0) : null) ?? new Date(v as string | number | Date);
    if (Number.isNaN(date.getTime())) return "";
    const f = String(kv.format ?? pos[0] ?? "default");
    const format = NAMED_DATE_FORMATS[f] ?? f;
    const iso = String(kv.datetime ?? (wall ? `${wall[1]}${wall[2] ? `T${wall[2]}` : ""}` : date.toISOString().replace(/\.\d{3}Z$/, "Z")));
    return `<time${attrString({ datetime: iso, class: kv.class, id: kv.id })}>${escapeHtml(ctx.formatDate(wall ? v : date, format))}</time>`;
  },
};

/** https://shopify.dev/docs/api/liquid/filters/link_to */
export const link_to: BuiltinFilter = {
  name: "link_to",
  returns: "html",
  describe: "An <a> element: {{ 'Contact' | link_to: '/contact', title: 'Get in touch' }}. Options: title, class, id, target, rel.",
  run(v, args) {
    const { pos, kv } = splitArgs(args);
    const rel = kv.rel ?? (kv.target === "_blank" ? "noopener" : undefined);
    return `<a${attrString({ href: safeUrl(pos[0]), title: kv.title, class: kv.class, id: kv.id, target: kv.target, rel })}>${escapeHtml(v)}</a>`;
  },
};

const IMG_ATTRS = ["alt", "class", "id", "width", "height", "loading", "decoding", "sizes", "srcset", "fetchpriority", "style"];

/** https://shopify.dev/docs/api/liquid/filters/image_tag — takes a URL (usually from `image_url`). */
export const image_tag: BuiltinFilter = {
  name: "image_tag",
  returns: "html",
  describe: "An <img> element from a URL: {{ id | image_url: width: 800 | image_tag: alt: 'Shop front' }}. alt defaults to empty, loading to lazy.",
  run(v, args) {
    const src = safeUrl(v);
    if (!src) return "";
    const { kv } = splitArgs(args);
    const attrs: Record<string, unknown> = { src, alt: kv.alt ?? "", loading: "lazy" };
    for (const k of IMG_ATTRS) if (kv[k] !== undefined) attrs[k] = kv[k];
    return `<img${attrString(attrs)}>`;
  },
};

interface Link {
  url: string;
  title?: string;
  is_link?: boolean;
}

/** https://shopify.dev/docs/api/liquid/filters/default_pagination */
export const default_pagination: BuiltinFilter = {
  name: "default_pagination",
  returns: "html",
  describe: "Previous / numbered / next links from the paginate object. Options: previous, next (labels).",
  run(v, args) {
    const p = v as { parts?: Link[]; previous?: Link | null; next?: Link | null; current_page?: number } | null;
    if (!p || !Array.isArray(p.parts) || p.parts.length < 2) return "";
    const { kv } = splitArgs(args);
    const link = (l: Link, label: string) => `<a href="${escapeHtml(l.url)}" title="">${label}</a>`;
    const out: string[] = [];
    if (p.previous) out.push(`<span class="prev">${link(p.previous, kv.previous != null ? escapeHtml(kv.previous) : "&laquo; Previous")}</span>`);
    const last = p.parts.length;
    const cur = p.current_page ?? 1;
    let skipped = false;
    p.parts.forEach((part, i) => {
      const n = i + 1;
      if (n !== 1 && n !== last && Math.abs(n - cur) > 2) {
        if (!skipped) out.push(`<span class="deco">&hellip;</span>`);
        skipped = true;
        return;
      }
      skipped = false;
      out.push(part.is_link ? `<span class="page">${link(part, escapeHtml(part.title))}</span>` : `<span class="page current">${escapeHtml(part.title)}</span>`);
    });
    if (p.next) out.push(`<span class="next">${link(p.next, kv.next != null ? escapeHtml(kv.next) : "Next &raquo;")}</span>`);
    return out.join(" ");
  },
};

/** https://shopify.dev/docs/api/liquid/filters/default_errors — errors: strings, `{ message }`, or `{ field: message }`. */
export const default_errors: BuiltinFilter = {
  name: "default_errors",
  returns: "html",
  describe: "The standard error list for form.errors: <div class=\"errors\"><ul><li>…</li></ul></div>.",
  run(v) {
    const messages: string[] = [];
    const add = (e: unknown) => {
      const m = typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      if (m) messages.push(m);
    };
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") Object.values(v).forEach(add);
    if (!messages.length) return "";
    return `<div class="errors"><ul>${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul></div>`;
  },
};
