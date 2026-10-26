/**
 * Where the component board keeps its layout: one site file, `.editor/board.json` — each
 * partial's card position and size (keyed by partial name) and the board's labels / titles.
 *
 *   { "cards": { "header": { "x": 0, "y": 32, "w": 480 } }, "notes": [{ "id": "n1", "kind": "title", "text": "Nav", "x": 0, "y": -56 }] }
 *
 * Why a file: the layout is shared (everyone editing the site sees the same board, as
 * `custom.canvasPos` was), saved and versioned with the site, and undoable like any edit — but
 * it isn't markup, so partials stay clean (`{% render %}` output never sees it) and nothing
 * renders or lints it. The JSON escapes `<` and the `{` of `{{` / `{%`, so the text stays inert
 * if anything ever reads the file as Liquid. A missing or unreadable file is an empty board.
 */
import type { CommandContext, Files, Path } from "@pagehub/engine";

export const BOARD_FILE: Path = ".editor/board.json";

/** Default card width / height (the slot size), minimum size, gaps. */
export const SLOT_W = 480;
const SLOT_H = 360;
export const MIN_W = 200;
export const MIN_H = 80;
const ARRANGE_GAP = 32;
/** Room above a card for its grip handle. */
const HANDLE_RESERVE = 32;
const NOTE_LANE = 56;
const NOTE_STEP = 220;

export interface CardBox {
  x: number;
  y: number;
  /** Absent: the default width / the content's height. */
  w?: number;
  h?: number;
}

export interface BoardNote {
  id: string;
  kind: "label" | "title";
  text: string;
  x: number;
  y: number;
}

export interface BoardLayout {
  cards: Readonly<Record<string, CardBox>>;
  notes: readonly BoardNote[];
}

const EMPTY_BOARD: BoardLayout = { cards: {}, notes: [] };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The layout in `files` (invalid entries dropped). */
export function readBoard(files: Files): BoardLayout {
  const text = files.get(BOARD_FILE);
  if (!text?.trim()) return EMPTY_BOARD;
  let raw: { cards?: Record<string, Partial<CardBox>>; notes?: Partial<BoardNote>[] };
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_BOARD;
  }
  const cards: Record<string, CardBox> = {};
  for (const [name, c] of Object.entries(raw.cards ?? {})) {
    if (!c || !num(c.x) || !num(c.y)) continue;
    cards[name] = { x: c.x, y: c.y, ...(num(c.w) && c.w >= MIN_W ? { w: c.w } : {}), ...(num(c.h) && c.h >= MIN_H ? { h: c.h } : {}) };
  }
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter(
    (n): n is BoardNote => !!n && typeof n.id === "string" && (n.kind === "label" || n.kind === "title") && typeof n.text === "string" && num(n.x) && num(n.y),
  );
  return { cards, notes };
}

export function serializeBoard(b: BoardLayout): string {
  return `${JSON.stringify(b, null, 2).replace(/</g, "\\u003c").replace(/\{(?=[{%])/g, "\\u007b")}\n`;
}

/** Write `next` into this transaction as one minimal splice of the board file. */
export function writeBoard(ctx: CommandContext, next: BoardLayout): boolean {
  const old = ctx.state.files.get(BOARD_FILE) ?? "";
  const text = serializeBoard(next);
  if (text === old) return false;
  let p = 0;
  while (p < old.length && p < text.length && old[p] === text[p]) p++;
  let q = 0;
  while (q < old.length - p && q < text.length - p && old[old.length - 1 - q] === text[text.length - 1 - q]) q++;
  ctx.tr.replace({ path: BOARD_FILE, from: p, to: old.length - q }, text.slice(p, text.length - q));
  return true;
}

/** A card's box: stored, else the next slot in a row (index-based). */
export function cardBox(b: BoardLayout, name: string, index: number): CardBox {
  return b.cards[name] ?? { x: index * (SLOT_W + ARRANGE_GAP), y: HANDLE_RESERVE };
}

/**
 * Every card in a row (`row`) or column, 32px apart, from (0, 0); labels and titles move into a
 * lane above the row, or left of the column. `sizes` are the measured card sizes.
 */
export function arrangeBoard(b: BoardLayout, names: readonly string[], axis: "row" | "column", sizes: Readonly<Record<string, { w: number; h: number }>> = {}): BoardLayout {
  const cards: Record<string, CardBox> = { ...b.cards };
  let cursor = 0;
  for (const name of names) {
    const c = b.cards[name];
    const w = c?.w ?? sizes[name]?.w ?? SLOT_W;
    const h = c?.h ?? sizes[name]?.h ?? SLOT_H;
    cards[name] = { ...c, x: axis === "row" ? cursor : 0, y: axis === "row" ? HANDLE_RESERVE : cursor };
    cursor += (axis === "row" ? w : h + HANDLE_RESERVE) + ARRANGE_GAP;
  }
  const notes = b.notes.map((n, i) => (axis === "row" ? { ...n, x: i * NOTE_STEP, y: -NOTE_LANE } : { ...n, x: -NOTE_STEP, y: i * 60 }));
  return { cards, notes };
}
