/**
 * Which sections and rows the inspector shows for one element. Pure: the element is described
 * by an `ElementView` (type, hidden keys, a has-value test), so the rules are tested without React.
 *
 * - A row is eligible when its entry lists the element's type (or `*`), its hide key and its
 *   section's hide key aren't hidden, and its `showWhen` holds (inset: positioned; Data source:
 *   set; Items: the element has an items template and isn't the root).
 * - Visible = pinned, or has a value, or added this session. Order: value / pinned rows by
 *   `sortOrder`, then session-added rows in click order. (Fixed: no stored `toolbarOrder` that
 *   one component counted and the other ignored.)
 * - "+" candidates = eligible, not pinned, no value, not added yet.
 * - A section is hidden when its hide key is hidden or no row is eligible.
 * - Search runs over the same eligible rows the panel renders (fixed: no search-only rows, and
 *   hidden rows stay hidden); it matches label, id, keywords and section title.
 */
import { SECTION_HIDE, INLINE_SECTIONS, componentSectionRows, inspectorRows, sectionTitle, type RowDef } from "./rows/inspectorRows";
import { SEARCH_ONLY_SECTIONS } from "./layout";

export interface ElementView {
  /** Property-map component type; undefined = only `*` rows. */
  type?: string;
  hidden: ReadonlySet<string>;
  /** The element's tag (rows with `whenTag`). */
  tag?: string;
  hasValue(row: RowDef): boolean;
  positioned: boolean;
  /** The element has an Items template (preset `addChild`) and isn't the page root. */
  items: boolean;
  /** Component-tab section titles (element definition `inspector.sections`). */
  componentTitles: readonly string[];
}

interface SectionModel {
  id: string;
  title: string;
  /** Eligible rows, by sortOrder. */
  rows: RowDef[];
  visible: RowDef[];
  candidates: RowDef[];
  hidden: boolean;
  /** One inline custom input: body always rendered, no "+". */
  inline: boolean;
  /** The section's only row is a popover: header only, a click opens it. */
  popoverOnly: RowDef | null;
}

export function rowEligible(row: RowDef, el: ElementView): boolean {
  // Data source rows show once the element repeats (it sits in a `{% for %}`), whatever its type
  if (row.section === "data-source") return el.hasValue(row);
  const c = row.entry.components;
  if (!c.includes("*") && !(el.type && c.includes(el.type))) return false;
  if (row.hideKey && el.hidden.has(row.hideKey)) return false;
  if (row.whenPositioned && !el.positioned) return false;
  if (row.whenTag && el.tag !== row.whenTag) return false;
  if (row.section === "preset-items" && !el.items) return false;
  return true;
}

const isComponent = (id: string) => id === "component" || id.startsWith("component:");

function rowsOf(id: string, el: ElementView): readonly RowDef[] {
  return isComponent(id) ? componentSectionRows(id, el.componentTitles) : inspectorRows().filter((r) => r.section === id);
}

/** Component-tab sections are the element's own panel: every row shows, no "+". */
export function sectionModel(id: string, el: ElementView, added: readonly string[] = []): SectionModel {
  const sectionHidden = !!SECTION_HIDE[id] && el.hidden.has(SECTION_HIDE[id]!);
  const rows = sectionHidden ? [] : rowsOf(id, el).filter((r) => rowEligible(r, el));
  const inline = INLINE_SECTIONS.has(id) || isComponent(id);
  const shown = rows.filter((r) => (inline || r.pinned || r.defaultShown || el.hasValue(r)) && !added.includes(r.id));
  const extra = added.map((rid) => rows.find((r) => r.id === rid)).filter((r): r is RowDef => !!r);
  return {
    id,
    title: id.startsWith("component:") ? id.slice(10) : sectionTitle(id),
    rows,
    visible: [...shown, ...extra],
    candidates: inline ? [] : rows.filter((r) => !r.pinned && !r.defaultShown && !el.hasValue(r) && !added.includes(r.id)),
    hidden: rows.length === 0,
    inline,
    popoverOnly: rows.length === 1 && rows[0]!.popover ? rows[0]! : null,
  };
}

/** Lower-case search over label, id, keywords and section title. */
export function rowMatches(row: RowDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [row.label, row.id, sectionTitle(row.section), ...row.keywords].some((s) => s.toLowerCase().includes(q));
}

/** Search results grouped by section (in the given section order), over eligible rows only. */
export function searchSections(sectionIds: readonly string[], el: ElementView, query: string): Array<{ id: string; title: string; rows: RowDef[] }> {
  return sectionIds
    .filter((id) => !SEARCH_ONLY_SECTIONS.has(id))
    .map((id) => ({ id, model: sectionModel(id, el) }))
    .map(({ id, model }) => ({ id, title: model.title, rows: model.rows.filter((r) => rowMatches(r, query)) }))
    .filter((s) => s.rows.length > 0);
}
