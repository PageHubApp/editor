/**
 * Where a double-click from the Add panel inserts, as one `element.insert` (one transaction,
 * one undo step, smart defaults included — the Automatic tile morphs to where it lands):
 *
 * - a component tile: relative to the selection (inside a selected empty container, else after
 *   it); with nothing selected, at the end of the page the canvas shows.
 * - a block card: at the pending "Add block above / below" position once; else at the end of
 *   the page (the selection's page when it is one, else the canvas page), through the drop rules.
 */
import type { Store } from "@pagehub/engine";
import type { InsertArgs } from "@pagehub/engine/kits";
import { canvasOf, canvasPage } from "../canvas/canvasState";
import { addPanelOf } from "./addPanelState";
import { type BlockItem, type BlockSource } from "@pagehub/engine/host";
import { resolveBlock } from "./blockDetail";

/** The page a block lands in: the selection's file when the canvas shows it as the page, else the canvas page. */
function targetPage(store: Store): string | null {
  const page = canvasPage(store.state);
  const sel = store.state.selection.primary;
  if (sel?.alive && sel.path === page) return sel.path;
  return page && !canvasOf(store.state).includes.includes(page) ? page : null;
}

function componentInsertArgs(store: Store, insert: InsertArgs): InsertArgs {
  const page = canvasPage(store.state);
  return store.state.selection.primary?.alive || !page ? insert : { ...insert, path: page };
}

export function insertComponent(store: Store, insert: InsertArgs): boolean {
  return store.run("element.insert", componentInsertArgs(store, insert));
}

function blockInsertArgs(store: Store, block: BlockItem): InsertArgs | null {
  const pending = addPanelOf(store.state).pending;
  const base = { snippet: block.source, block: block.slug };
  if (pending?.anchor.alive) return { ...base, to: pending.position === "above" ? { before: pending.anchor } : { after: pending.anchor } };
  const page = targetPage(store);
  return page ? { ...base, to: { file: page, where: "end" } } : null;
}

export function insertBlock(store: Store, block: BlockItem): boolean {
  if (block.source === undefined) return false;
  const args = blockInsertArgs(store, block);
  const ok = !!args && store.run("element.insert", args);
  if (ok && addPanelOf(store.state).pending) store.run("insert.set", { pending: null });
  return ok;
}

/** `insertBlock` for a block listed without its source: asks the host for it first (false when it can't). */
export async function insertBlockLazy(store: Store, source: BlockSource | null, block: BlockItem): Promise<boolean> {
  try {
    return insertBlock(store, await resolveBlock(source, block));
  } catch {
    return false;
  }
}
