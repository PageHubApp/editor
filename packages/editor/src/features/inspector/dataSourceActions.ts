/**
 * The markup the Data source panel's "Filter from the URL" and "Add pagination" actions insert,
 * in the forms the storefront converter writes (see `utils/importers/storefront` in the app):
 *
 *   - a URL filter: `{% if request.query.category and request.query.category != '' %}
 *       {% assign rows = rows | where: 'categories', request.query.category %}{% endif %}`
 *     keeps the rows whose field equals the `?category=` value, and every row when there is none
 *     (the HTML-first twin of the old `stateInputs`);
 *   - a filter form: a GET `<form data-autosubmit>` whose control is named for that parameter, so
 *     picking a value reloads the page with `?category=…`;
 *   - pagination: `{% paginate rows by 12 %}…{% endpaginate %}` around the loop, with Prev / Next
 *     links from the `paginate` object (the twin of `publishStateKeys`: `paginate.pages`,
 *     `paginate.current_page`, `paginate.items`).
 *
 *   urlFilterMarkup("rows", "categories", "category")
 */

export const PARAM = /^[A-Za-z_]\w*$/;
export const FIELD = /^[A-Za-z_][\w.]*$/;

/** The one-line `{% if %}` that narrows `v` by `?param=`. */
export const urlFilterMarkup = (v: string, field: string, param: string): string =>
  `{% if request.query.${param} and request.query.${param} != '' %}{% assign ${v} = ${v} | where: '${field}', request.query.${param} %}{% endif %}`;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const liquidStr = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The distinct values of `field` over sample rows (array fields flatten), in first-seen order. */
export function distinctValues(rows: readonly unknown[], field: string, max = 24): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    let v: unknown = r;
    for (const k of field.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
    for (const x of Array.isArray(v) ? v : [v]) if (typeof x === "string" && x.trim() && out.size < max) out.add(x.trim());
  }
  return [...out];
}

const FORM = "flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm w-full";
const SELECT = "select select-bordered bg-base-200 text-base-content rounded-box min-h-12 w-full sm:w-64";
const INPUT = "input input-bordered bg-base-200 text-base-content rounded-box min-h-12 w-full sm:w-64";

/** A GET filter form for `param`: a dropdown of `options` ("All" first) or, with none, a text box. */
export function filterFormMarkup(param: string, label: string, options: readonly string[]): string {
  const control = options.length
    ? `<select name="${param}" aria-label="${esc(label)}" class="${SELECT}">
    <option value="">All</option>
    ${options.map((o) => `{% if request.query.${param} == '${liquidStr(o)}' %}<option value="${esc(o)}" selected>${esc(o)}</option>{% else %}<option value="${esc(o)}">${esc(o)}</option>{% endif %}`).join("\n    ")}
  </select>`
    : `<input type="search" name="${param}" value="{{ request.query.${param} | escape }}" placeholder="${esc(label)}" aria-label="${esc(label)}" class="${INPUT}">`;
  return `<form method="get" data-autosubmit class="${FORM}">
  ${control}
</form>
`;
}

const NAV = "col-span-full flex flex-row items-center justify-center gap-space-md w-full";
const PREV = "btn btn-outline rounded-box px-space-md py-space-xs min-h-12 border-base-content/20 text-base-content";
const NEXT = "btn btn-primary rounded-box px-space-md py-space-xs min-h-12";

/** Prev / page count / Next, read from the enclosing `{% paginate %}`'s `paginate` object. */
export const paginationNav = (): string => `<nav class="${NAV}" aria-label="Pages">
  {% if paginate.previous %}<a href="{{ paginate.previous.url }}" class="${PREV}">{{ 'tb/TbChevronLeft' | icon }} Prev</a>{% endif %}
  <span class="font-mono text-sm text-base-content/70">Page {{ paginate.current_page }} of {{ paginate.pages }}</span>
  {% if paginate.next %}<a href="{{ paginate.next.url }}" class="${NEXT}">Next {{ 'tb/TbChevronRight' | icon }}</a>{% endif %}
</nav>`;

/** The open and close text that wrap the `{% for %}` loop: it paged by `size` over `list`, the nav after it. */
export const paginatedMarkup = (list: string, size: number): [open: string, close: string] => [`{% paginate ${list} by ${size} %}\n`, `\n${paginationNav()}\n{% endpaginate %}`];
