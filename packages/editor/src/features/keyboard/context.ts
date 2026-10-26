/**
 * What a `when` expression sees: the host's UI context, the chrome field's flags and
 * `selection`. One place builds it, so keys, menus and the palette agree.
 */
import { evaluateWhen, whenContext, type Store } from "@pagehub/engine";
import { chromeOf, chromeUi } from "../../shell/chromeState";

function whenContextOf(editor: Store, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const ui = { ...editor.ui, ...chromeUi(chromeOf(editor.state)) };
  return { ...whenContext({ state: editor.state, ui, registry: editor.registry, dispatch: (tr) => editor.dispatch(tr) }), ...extra };
}

export const passesWhen = (editor: Store, when: string | undefined): boolean => evaluateWhen(when, whenContextOf(editor));
