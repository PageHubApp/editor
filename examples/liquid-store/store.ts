/**
 * The plug-in points of the store demo, each with an in-memory implementation:
 *
 *   data sources   `products`, `collections`, `product` (a JSON catalog; `product` reads the route's `:handle`)
 *   host providers `image_url` (media id → /assets/<id>.svg) and `icon` (a few inline SVGs)
 *   form handler   `{% form 'contact' %}` validates and logs
 *   settings       `product` / `collection` section settings resolve to catalog rows
 *   media          an in-browser library holding the catalog's pictures
 *   routes         `/products/:handle` is served by `product.liquid`
 *
 * Everything is plain JSON in and out: that is what crosses into the sandboxed renderer.
 */
import {
  type Extension,
} from "@pagehub/engine";
import {
  defineDataSource,
  type DefinedDataSource,
  type FormHandler,
  type HostProviders,
  type JsonValue,
} from "@pagehub/engine/render";
import {
  memoryMediaStore,
  mediaFacet,
  type MediaItem,
} from "@pagehub/engine/host";

export interface Product {
  id: number;
  handle: string;
  title: string;
  category: string;
  price: number;
  compare_at_price?: number;
  image: string;
  description: string;
  available: boolean;
}
export interface Catalog {
  site: { name: string; currency: string; email: string };
  products: Product[];
  collections: Array<{ handle: string; title: string; product_handles: string[] }>;
}

/** Page file for a request path: exact files first, then the one parameterised route. */
export const ROUTES: ReadonlyArray<{ pattern: string; file: string }> = [
  { pattern: "/", file: "index.liquid" },
  { pattern: "/products", file: "products.liquid" },
  { pattern: "/products/:handle", file: "product.liquid" },
  { pattern: "/cart", file: "cart.liquid" },
  { pattern: "/contact", file: "contact.liquid" },
];

export function matchRoute(path: string): { file: string; params: Record<string, string> } | null {
  for (const { pattern, file } of ROUTES) {
    const names: string[] = [];
    const re = new RegExp("^" + pattern.replace(/:([a-z_]+)/g, (_, n: string) => (names.push(n), "([^/]+)")) + "/?$");
    const m = re.exec(path);
    if (m) return { file, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)])) };
  }
  return null;
}

export const parseCatalog = (text: string): Catalog => JSON.parse(text) as Catalog;

const collectionsOf = (c: Catalog) =>
  Object.fromEntries(
    c.collections.map((col) => [
      col.handle,
      { handle: col.handle, title: col.title, products: col.product_handles.map((h) => c.products.find((p) => p.handle === h)).filter(Boolean) },
    ]),
  ) as unknown as JsonValue;

export function dataSources(c: Catalog): DefinedDataSource[] {
  return [
    defineDataSource({ name: "products", liquid: { global: "products", lazy: true }, query: async () => c.products as unknown as JsonValue }),
    defineDataSource({ name: "collections", liquid: { global: "collections", lazy: true }, query: async () => collectionsOf(c) }),
    defineDataSource({
      name: "product",
      liquid: { global: "product", lazy: true },
      // the preview (editor) shows the first product when no route supplied a handle
      query: async (q, ctx) => (c.products.find((p) => p.handle === q.request.params?.handle) ?? (ctx.mode === "editor" ? c.products[0] : null) ?? null) as unknown as JsonValue,
    }),
  ];
}

/** What the canvas renders with: the data sources' rows, plus `site` and the request. */
export function canvasData(c: Catalog): Record<string, JsonValue> {
  return {
    site: c.site,
    products: c.products as unknown as JsonValue,
    collections: collectionsOf(c),
    product: c.products[0] as unknown as JsonValue,
    request: { path: "/products", query: {}, params: {} },
  };
}

const ICONS: Record<string, string> = {
  "tb/TbShoppingCart": `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M17 17H6V3H4"/><path d="m6 5 14 1-1 7H6"/></svg>`,
  "tb/TbLeaf": `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21c.5-4.5 2.5-8 7-10"/><path d="M9 18c6.218 0 10.5-3.288 11-12V4h-4.014c-9 0-11.986 4-12 9 0 1 0 3 2 5z"/></svg>`,
};

export const host: HostProviders = {
  imageUrl: (id) => `/assets/${id}.svg`,
  icon: (ref) => ICONS[ref],
};

export const submissions: Array<{ name: string; values: Record<string, string> }> = [];

/** Validates the contact form and records it (the demo's "mail server"). */
export const formHandler: FormHandler = ({ name, values }) => {
  const errors = [];
  if (!values.name?.trim()) errors.push({ field: "name", message: "Please tell us your name." });
  if (!/^\S+@\S+\.\S+$/.test(values.email ?? "")) errors.push({ field: "email", message: "That email address does not look right." });
  if (errors.length) return { ok: false, errors };
  submissions.push({ name, values });
  console.log(`[form ${name}]`, values);
  return { ok: true };
};

export const resolveSetting = (c: Catalog) => (type: string, handle: string): JsonValue => {
  if (type === "product") return (c.products.find((p) => p.handle === handle) ?? null) as unknown as JsonValue;
  if (type === "collection") return ((collectionsOf(c) as Record<string, JsonValue>)[handle] ?? null) as JsonValue;
  return null;
};

/** The in-browser media library: the catalog's pictures, ids as `{{ id | image_url }}` takes them. */
export function mediaLibrary(c: Catalog): Extension {
  const items: MediaItem[] = [...c.products.map((p) => [p.image, p.title] as const), ["hero", "Plants on a shelf"] as const].map(([id, name]) => ({
    id,
    name,
    contentType: "image/svg+xml",
    size: 1200,
    folder: null,
    url: `/assets/${id}.svg`,
    alt: name,
    createdAt: 0,
  }));
  return mediaFacet.of(memoryMediaStore({ items }));
}
