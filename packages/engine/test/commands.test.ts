import { test } from "node:test";
import assert from "node:assert/strict";
import { defineCommand } from "../src/commands/defineCommand.ts";
import { contributes } from "../src/commands/contributes.ts";
import { evaluateWhen, parseWhen } from "../src/commands/when.ts";
import { normalizeKey } from "../src/commands/keys.ts";
import { keyLabel } from "../src/commands/keymap.ts";
import { Configuration, Prec } from "../src/extensions/extension.ts";
import { StateEffect, StateField, effectsOf } from "../src/state/state.ts";
import { createStore } from "../src/state/store.ts";
import { CommandTester } from "../src/testing/commandTester.ts";
import { t } from "../src/schema/t.ts";

const P = "index.liquid";
const PAGE = `<main>\n  <section class="hero">\n    <h1>Hi</h1>\n  </section>\n</main>\n`;

// ── test commands shaped like the kit's ─────────────
const duplicate = defineCommand({
  id: "element.duplicate",
  title: "Duplicate",
  run({ selection, tr, dispatch, ui }) {
    const h = selection.primary;
    if (!h || ui.textEditing) return false;
    dispatch?.(tr.insert({ after: h }, h.text()));
    return true;
  },
});

/** The system clipboard stand-in: read live on every call, never cached. */
const clipboard = { text: "", marker: false };
const copy = defineCommand({
  id: "element.copy",
  title: "Copy",
  run({ selection, ui, dispatch }) {
    if (!selection.primary || ui.textEditing) return false;
    if (dispatch) Object.assign(clipboard, { text: selection.primary.text(), marker: true });
    return true;
  },
});
const paste = defineCommand({
  id: "element.paste",
  title: "Paste",
  run({ selection, tr, dispatch, ui }) {
    if (!selection.primary || ui.textEditing || !clipboard.marker) return false;
    dispatch?.(tr.insert({ after: selection.primary }, clipboard.text));
    return true;
  },
});

const zoomBy = StateEffect.define<number>();
const zoom = StateField.define({ create: () => 1, update: (z: number, tr) => effectsOf(tr, zoomBy).reduce((a, d) => a + d, z) });
const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4, 10];
const zoomIn = defineCommand({
  id: "canvas.zoomIn",
  title: "Zoom in",
  run({ state, tr, dispatch }) {
    const next = ZOOM_PRESETS.find((p) => p > state.field(zoom));
    if (next === undefined) return false;
    dispatch?.(tr.effect(zoomBy, next - state.field(zoom)));
    return true;
  },
});
let paletteOpen = false;
const togglePalette = defineCommand({
  id: "palette.toggle",
  title: "Command palette",
  run: ({ dispatch }) => ((dispatch && (paletteOpen = !paletteOpen)), true),
});

const keys = contributes({
  keybindings: [
    { command: "element.duplicate", key: "mod+d", when: "selection && !textEditing" },
    { command: "element.copy", key: "mod+c", when: "selection" },
    { command: "element.paste", key: "mod+v", when: "!mediaManagerOpen" },
    { command: "canvas.zoomIn", key: "mod+=" },
    { command: "palette.toggle", key: "mod+k", when: "!textEditing || paletteOpen" },
  ],
});
const all = [duplicate, copy, paste, zoom, zoomIn, togglePalette, keys];
const fakeEvent = (key: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = { ctrlKey: true }) => {
  const e = { key, ...mods, prevented: 0, stopped: 0, preventDefault() { e.prevented++; }, stopPropagation() { e.stopped++; } };
  return e;
};

test("commands: can() never dispatches; run() dispatches once (CommandTester)", () => {
  CommandTester.run(duplicate, [
    { files: { [P]: PAGE }, select: "h1", output: PAGE.replace("<h1>Hi</h1>\n", "<h1>Hi</h1>\n    <h1>Hi</h1>\n") },
    { files: { [P]: PAGE }, output: false },
    { files: { [P]: PAGE }, select: "h1", ui: { textEditing: true }, output: false },
  ]);
  const withArgs = defineCommand({ id: "x.set", title: "Set", args: t.object({ at: t.handle(), cls: t.string() }), run: ({ tr, dispatch }, a) => (dispatch?.(tr.setAttr(a.at as never, "class", a.cls)), true) });
  CommandTester.run(withArgs, [
    { files: { [P]: PAGE }, args: (s: ReturnType<typeof createStore>) => ({ at: s.find(P, "h1")[0], cls: "big" }), output: PAGE.replace("<h1>", `<h1 class="big">`) },
    { files: { [P]: PAGE }, args: { cls: "big" }, output: false },
  ]);
});

test("keymap: a binding whose command can't run passes through (no preventDefault)", () => {
  const s = createStore({ files: { [P]: PAGE }, extensions: all });
  const e = fakeEvent("d");
  assert.deepEqual(s.press(e), { handled: false });
  assert.equal(e.prevented + e.stopped, 0);
  s.select(s.find(P, "h1"));
  const e2 = fakeEvent("d");
  assert.deepEqual(s.press(e2), { handled: true, command: "element.duplicate" });
  assert.equal(e2.prevented, 1);
  assert.equal(e2.stopped, 1);
  assert.equal(s.find(P, "h1").length, 2);
  assert.equal(s.press("mod+d", { ui: { textEditing: true } }).handled, false, "inside a text surface the key passes through");
  assert.equal(keyLabel(s, "element.duplicate"), "mod+d");
});

test("when: grammar table", () => {
  const ctx = { selection: true, textEditing: false, focus: "canvas", role: "client", count: 2, paletteOpen: false };
  const table: Array<[string, boolean]> = [
    ["selection", true],
    ["!selection", false],
    ["selection && !textEditing", true],
    ["textEditing || paletteOpen", false],
    ["!textEditing || paletteOpen", true],
    ["focus == 'canvas'", true],
    ['focus != "panel"', true],
    ["role == 'client' && (textEditing || selection)", true],
    ["!(selection && focus == 'canvas')", false],
    ["count == 2", true],
    ["missing", false],
    ["!missing && true", true],
    ["", true],
  ];
  for (const [expr, want] of table) assert.equal(evaluateWhen(expr, ctx), want, expr);
  for (const bad of ["a &&", "(a", "a b", "== a", "a = b"]) assert.throws(() => parseWhen(bad), /when/i, bad);
});

test("keymap: a tie (same key, same precedence, overlapping when) is a config error; Prec resolves it", () => {
  const a = contributes({ keybindings: [{ command: "a", key: "mod+s" }] });
  const b = contributes({ keybindings: [{ command: "b", key: "ctrl+s".replace("ctrl", "mod"), when: "paletteOpen" }] });
  assert.throws(() => Configuration.resolve([a, b]), /bound twice.*a \(.*b \(/);
  assert.doesNotThrow(() => Configuration.resolve([a, Prec.high(b)]));
  assert.doesNotThrow(() => Configuration.resolve([contributes({ keybindings: [{ command: "a", key: "mod+s", when: "selection" }, { command: "b", key: "mod+s", when: "!selection" }] })]));
  assert.equal(normalizeKey("Shift+Mod+D"), "mod+shift+d");
  assert.equal(normalizeKey("cmd+up", "mac"), "mod+arrowup");
});

test("fix table: copy / paste / duplicate / zoom pass through when they can't run", () => {
  const s = createStore({ files: { [P]: PAGE }, extensions: all });
  Object.assign(clipboard, { text: "", marker: false });
  for (const k of ["mod+c", "mod+v", "mod+d"]) assert.equal(s.press(k).handled, false, `${k} with nothing selected → native`);
  s.select(s.find(P, "h1"));
  for (const k of ["mod+c", "mod+d"]) assert.equal(s.press(k, { ui: { textEditing: true } }).handled, false, `${k} in text → native`);
  for (let i = 0; i < 3; i++) assert.equal(s.press("mod+=").handled, true);
  assert.equal(s.state.field(zoom), 10);
  assert.equal(s.press("mod+=").handled, false, "zoom in at the preset max passes through");
});

test("fix table: ⌘K closes the palette from its own input; ⌘V passes to the media manager", () => {
  const s = createStore({ files: { [P]: PAGE }, extensions: all });
  paletteOpen = false;
  assert.equal(s.press("mod+k").handled, true);
  assert.equal(paletteOpen, true);
  assert.equal(s.press("mod+k", { ui: { textEditing: true, paletteOpen: true } }).handled, true, "closes from the palette input");
  assert.equal(paletteOpen, false);
  assert.equal(s.press("mod+k", { ui: { textEditing: true } }).handled, false, "other text surfaces keep ⌘K");
  s.select(s.find(P, "h1"));
  Object.assign(clipboard, { text: "<p>x</p>", marker: true });
  assert.equal(s.press("mod+v", { ui: { mediaManagerOpen: true } }).handled, false, "media manager's paste listener runs");
  assert.equal(s.press("mod+v").handled, true);
});

test("fix table: paste works after copy without a selection change", () => {
  const s = createStore({ files: { [P]: PAGE }, extensions: all });
  Object.assign(clipboard, { text: "", marker: false });
  s.select(s.find(P, "h1"));
  assert.equal(s.press("mod+v").handled, false, "nothing copied yet");
  assert.equal(s.press("mod+c").handled, true);
  assert.equal(s.press("mod+v").handled, true, "clipboard state is read live");
  assert.equal(s.press("mod+v").handled, true, "and again");
  assert.equal(s.find(P, "h1").length, 3);
});
