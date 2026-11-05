/**
 * The markup the Add panel's "Collection list" tile inserts: a section with the collection's name and a responsive
 * card grid looping over `collections.<slug>`, each card showing the first photo, the title (first text field), a
 * short text and a number (a price when one is named so), plus an `{% else %}` message for an empty collection.
 *
 *   collectionListMarkup({ slug: "team", name: "Team", fields: [...], count: 3 })
 */
import { escapeHtml } from "@pagehub/engine/render";
import type { CollectionFieldInfo, CollectionInfo } from "@pagehub/engine/host";

/** `item.<key>`, or `item['<key>']` for a key Liquid can't read with a dot. */
export const itemRef = (key: string) => (/^[A-Za-z_]\w*$/.test(key) ? `item.${key}` : `item['${key.replace(/'/g, "")}']`);

/** The fields a card shows, picked by kind. */
export function cardFields(fields: readonly CollectionFieldInfo[]): { image?: string; title?: string; text?: string; number?: string } {
  const of = (...kinds: string[]) => fields.filter((f) => kinds.includes(f.kind));
  const image = of("image", "media")[0];
  const texts = of("text");
  const title = texts[0];
  const text = texts.find((f) => f !== title && /desc|summary|bio|excerpt|about|intro/i.test(`${f.key} ${f.label}`)) ?? of("richText")[0] ?? texts.find((f) => f !== title);
  const numbers = of("number");
  const number = numbers.find((f) => /price|cost|amount/i.test(`${f.key} ${f.label}`)) ?? numbers[0];
  return { image: image?.key, title: title?.key, text: text?.key, number: number?.key };
}

/** Text a visitor sees, safe in markup and never read as Liquid. */
const visible = (s: string) => escapeHtml(s.replace(/[{}%]/g, ""));

export function collectionListMarkup(c: CollectionInfo): string {
  const f = cardFields(c.fields);
  const rich = f.text && c.fields.find((x) => x.key === f.text)?.kind === "richText";
  const lines: string[] = [];
  if (f.image) {
    const alt = f.title ? `{{ ${itemRef(f.title)} }}` : "";
    lines.push(`        {% if ${itemRef(f.image)} != blank %}<img class="w-full aspect-[4/3] object-cover" src="{{ ${itemRef(f.image)} | image_url: width: 600 }}" alt="${alt}" loading="lazy">{% endif %}`);
  }
  const body: string[] = [];
  if (f.title) body.push(`          <h3 class="font-heading text-lg font-semibold">{{ ${itemRef(f.title)} }}</h3>`);
  if (f.text) body.push(`          <p class="text-base-content/70 text-sm line-clamp-3">{{ ${itemRef(f.text)}${rich ? " | strip_html" : ""} | truncate: 140 }}</p>`);
  if (f.number) body.push(`          <p class="font-semibold">{{ ${itemRef(f.number)} }}</p>`);
  if (body.length) lines.push(`        <div class="flex flex-col gap-space-2xs p-space-sm">`, ...body, `        </div>`);
  return [
    `<section class="w-full bg-base-100 text-base-content py-space-lg px-container-x">`,
    `  <div class="max-w-page mx-auto w-full">`,
    `    <h2 class="font-heading text-2xl sm:text-3xl font-bold">${visible(c.name)}</h2>`,
    `    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm mt-space-xl">`,
    `      {% for item in collections.${c.slug} %}`,
    `      <article class="flex flex-col bg-base-200 text-base-content rounded-box overflow-hidden">`,
    ...lines,
    `      </article>`,
    `      {% else %}`,
    `      <p class="col-span-full text-base-content/70">Nothing here yet. Check back soon.</p>`,
    `      {% endfor %}`,
    `    </div>`,
    `  </div>`,
    `</section>`,
  ].join("\n");
}
