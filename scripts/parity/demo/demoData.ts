/**
 * Sample host data for the parity demo so the Add → Blocks, Media and Icon pickers are
 * actually exercisable: a small block library, a handful of media items in two folders, and a
 * tiny Tabler icon set. All in-memory (`memoryMediaStore` / `memoryIconCatalogue`), seeded into
 * the demo's extensions in `main.tsx` via `blockSourceFacet` / `mediaFacet` / `iconCatalogueFacet`.
 */
import type { BlockItem, BlockSource } from "../../../packages/engine/src/host.ts";
import type { MediaFolder, MediaItem } from "@pagehub/engine/host";

/** A library block the Add → Blocks panel offers. `category` ids match the built-in wireframes. */
const BLOCKS: readonly BlockItem[] = [
  {
    slug: "hero-split",
    name: "Split hero",
    category: "hero",
    styles: ["organic"],
    description: "Headline + copy beside an image.",
    source: `<section class="grid gap-6 p-8 md:grid-cols-2 md:p-12" data-edit-name="Hero">
  <div class="flex flex-col justify-center gap-4">
    <h1 class="text-4xl font-bold">Grow something slow</h1>
    <p class="text-base-content/70">Hand-potted plants, shipped with care.</p>
    <button type="button" class="btn btn-primary w-fit px-6 py-2">Shop now</button>
  </div>
  <img src="https://placehold.co/560x360/a7c4a0/1a2e1a?text=Hero" alt="Plants" class="rounded-box w-full">
</section>`,
    preview: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px"><div><div style="height:10px;width:80%;background:#2f513a;border-radius:3px;margin-bottom:6px"></div><div style="height:6px;width:60%;background:#9bb79b;border-radius:3px"></div></div><div style="background:#a7c4a0;border-radius:6px"></div></div>`,
  },
  {
    slug: "hero-centered",
    name: "Centered hero",
    category: "hero",
    styles: ["organic", "minimal"],
    source: `<section class="flex flex-col items-center gap-4 p-12 text-center" data-edit-name="Hero">
  <h1 class="text-5xl font-bold">Quiet, green, alive</h1>
  <p class="max-w-xl text-base-content/70">A small-batch nursery for rooms that could use a little calm.</p>
  <button type="button" class="btn btn-primary px-6 py-2">Browse the shelf</button>
</section>`,
  },
  {
    slug: "feature-trio",
    name: "Feature trio",
    category: "features",
    styles: ["organic"],
    description: "Three icon + title + copy columns.",
    source: `<section class="grid gap-6 p-8 md:grid-cols-3 md:p-12" data-edit-name="Features">
  <div class="flex flex-col gap-2"><h3 class="text-lg font-semibold">Potted by hand</h3><p class="text-base-content/70">Every plant repotted before it ships.</p></div>
  <div class="flex flex-col gap-2"><h3 class="text-lg font-semibold">Shipped safe</h3><p class="text-base-content/70">Boxed to survive the trip.</p></div>
  <div class="flex flex-col gap-2"><h3 class="text-lg font-semibold">30-day promise</h3><p class="text-base-content/70">It thrives or we replace it.</p></div>
</section>`,
    preview: `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px">${"<div><div style='height:8px;width:70%;background:#2f513a;border-radius:3px;margin-bottom:5px'></div><div style='height:5px;background:#9bb79b;border-radius:3px'></div></div>".repeat(3)}</div>`,
  },
  {
    slug: "cta-band",
    name: "Call-to-action band",
    category: "cta",
    styles: ["organic", "bold"],
    source: `<section class="flex flex-col items-center gap-4 bg-primary p-12 text-center text-primary-content" data-edit-name="CTA">
  <h2 class="text-3xl font-bold">Ready to start?</h2>
  <button type="button" class="btn px-6 py-2">Get your first plant</button>
</section>`,
  },
  {
    slug: "pricing-two",
    name: "Two-tier pricing",
    category: "pricing",
    styles: ["minimal"],
    source: `<section class="grid gap-6 p-8 md:grid-cols-2 md:p-12" data-edit-name="Pricing">
  <div class="rounded-box border p-6"><h3 class="text-xl font-semibold">Starter</h3><p class="text-3xl font-bold">$0</p></div>
  <div class="rounded-box border p-6"><h3 class="text-xl font-semibold">Pro</h3><p class="text-3xl font-bold">$12</p></div>
</section>`,
  },
  {
    slug: "testimonial-quote",
    name: "Testimonial quote",
    category: "testimonials",
    styles: ["organic"],
    source: `<section class="flex flex-col items-center gap-3 p-12 text-center" data-edit-name="Testimonial">
  <blockquote class="max-w-xl text-2xl">"Best houseplants I've ever ordered online."</blockquote>
  <p class="text-base-content/70">— Dana, repeat customer</p>
</section>`,
  },
  {
    slug: "my-saved-hero",
    name: "My saved hero",
    category: "my-blocks",
    saved: true,
    source: `<section class="flex flex-col gap-3 p-10" data-edit-name="Saved hero">
  <h1 class="text-4xl font-bold">Your own block</h1>
  <p class="text-base-content/70">Saved blocks show up first.</p>
</section>`,
  },
];

/** The host's block library the Add panel reads through `blockSourceFacet`. */
export const DEMO_BLOCKS: BlockSource = {
  blocks: () => BLOCKS,
  categoryNames: { hero: "Hero", features: "Features", cta: "Call to action", pricing: "Pricing", testimonials: "Testimonials", "my-blocks": "My blocks" },
  siteStyle: "organic",
};

const img = (id: string, name: string, folder: string | null, w: number, h: number): MediaItem => ({
  id,
  name,
  contentType: "image/png",
  size: w * h,
  folder,
  url: `https://placehold.co/${w}x${h}/a7c4a0/1a2e1a?text=${encodeURIComponent(name)}`,
  width: w,
  height: h,
  alt: name,
  createdAt: Date.now() - Number(id.slice(1)) * 86_400_000,
});

/** Media library seed: images across two folders plus a stray PDF and video. */
export const DEMO_MEDIA_FOLDERS: readonly MediaFolder[] = [
  { id: "f-hero", name: "Hero shots", parent: null },
  { id: "f-products", name: "Products", parent: null },
];

export const DEMO_MEDIA_ITEMS: readonly MediaItem[] = [
  img("m1", "fern-shelf.png", "f-hero", 640, 400),
  img("m2", "monstera.png", "f-products", 480, 480),
  img("m3", "pothos.png", "f-products", 480, 480),
  img("m4", "calathea.png", "f-products", 480, 480),
  img("m5", "storefront.png", "f-hero", 800, 420),
  img("m6", "unfiled-leaf.png", null, 400, 400),
  { id: "m7", name: "care-guide.pdf", contentType: "application/pdf", size: 240_000, folder: null, url: "https://example.com/care-guide.pdf", createdAt: Date.now() - 7 * 86_400_000 },
  { id: "m8", name: "watering.mp4", contentType: "video/mp4", size: 3_200_000, folder: "f-products", url: "https://example.com/watering.mp4", createdAt: Date.now() - 2 * 86_400_000 },
];

/**
 * A tiny Tabler icon set for the icon picker. Refs are `tb/<Name>` — the same string the
 * `| icon` filter takes. SVGs are minimal single-path marks (currentColor) so the picker renders.
 */
const path = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const DEMO_ICONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  tb: {
    TbPhone: path(`<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />`),
    TbMail: path(`<rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />`),
    TbMapPin: path(`<path d="M18 11c0 5-6 10-6 10s-6-5-6-10a6 6 0 0 1 12 0" /><circle cx="12" cy="11" r="2" />`),
    TbStar: path(`<path d="M12 3l2.5 6 6.5.5-5 4.3 1.6 6.4L12 17l-5.6 3.2L8 13.8l-5-4.3L9.5 9z" />`),
    TbHeart: path(`<path d="M12 20s-7-4.5-9.5-9A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9" />`),
    TbShoppingCart: path(`<circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M2 3h2l2 12h12l2-8H6" />`),
    TbLeaf: path(`<path d="M5 19c7 0 14-5 14-14 0 0-11-2-14 6-1.5 4 0 8 0 8" /><path d="M5 19c3-6 7-8 10-9" />`),
    TbSun: path(`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />`),
    TbCheck: path(`<path d="m5 12 5 5L20 7" />`),
    TbArrowRight: path(`<path d="M5 12h14M13 6l6 6-6 6" />`),
  },
};

/** Icons shown in the picker's "Common" section. */
export const DEMO_ICON_COMMON: readonly string[] = ["tb/TbLeaf", "tb/TbStar", "tb/TbHeart", "tb/TbArrowRight", "tb/TbCheck"];
