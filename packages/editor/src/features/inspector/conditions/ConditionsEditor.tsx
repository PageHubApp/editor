/**
 * The Conditions section: "Show only when…" as condition groups, written in the forms the source
 * converter emits (see `conditionModel`):
 *
 * - When the page renders — one all / any group of url-param, signed-in customer, company,
 *   current-item, connector and form-field conditions → the `{% if %}` around the element.
 * - Live in the browser — state and local-storage conditions, all / any groups joined by OR →
 *   `data-state-show`.
 * - Device — phone only / desktop only → `md:hidden` / `max-md:hidden`.
 *
 * The parts AND together. An expression the builder can't show (brackets, mixed and / or, a
 * filter) stays editable as text. Every change is one undo step.
 *
 *   <ConditionsEditor handle={h} />
 *   <ConditionsEditor handle={h} browserOnly />   // the State section's visibility row
 */
import { useState } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState } from "../../../react/bindings";
import { AddBranchButton, ExpressionField, PanelNote } from "../../liquid/LiquidFields";
import { useCompletions } from "../../liquid/BlockPanels";
import { markupOf, wrapperOf } from "../../liquid/markup";
import { useCommit } from "../../liquid/useCommit";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";
import { ServerGroupCards } from "./ServerGroupCards";
import { DEVICE_CLASS, PLACE_OF, SERVER_TYPES, deviceOf, parseServer, parseShow, serializeServer, serializeShow, type Cond, type CondType, type Device, type Group } from "./conditionModel";
import { BROWSER_TYPES, NewCondition, StateGroupsEditor } from "./StateGroupsEditor";
import { useStateKeys } from "./stateKeys";


const ALL_TYPES: CondType[] = [...SERVER_TYPES, ...BROWSER_TYPES, "device"];

function PartTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-base-content text-[11px] font-semibold">{title}</span>
      <span className="text-base-content/55 text-[10px] leading-snug">{hint}</span>
    </div>
  );
}

/** `browserOnly`: just the `data-state-show` part (the State section's visibility row). */
export function ConditionsEditor({ handle, browserOnly = false }: { handle: NodeHandle; browserOnly?: boolean }) {
  const commit = useCommit();
  const names = useCompletions(handle);
  const stateKeys = useStateKeys();
  const wrapper = useEditorState((s) => (s.files.get(handle.path), wrapperOf(handle, ["if", "unless"])));
  const markup = useEditorState((s) => (wrapper ? markupOf(s.files.get(wrapper.path) ?? "", wrapper) : ""));
  const show = useEditorState(() => (handle.alive && handle.kind === "element" ? (handle.attr("data-state-show") ?? "") : ""));
  const device = useEditorState(() => (handle.alive && handle.kind === "element" ? deviceOf(handle.classes()) : "all"));
  const [adding, setAdding] = useState(false);

  const server: Group | null = wrapper ? (wrapper.tag === "if" ? parseServer(markup) : null) : { logic: "all", conds: [] };
  const browser = parseShow(show);
  const keysFor = (t: CondType) => (PLACE_OF[t] === "browser" ? stateKeys : names);

  const writeServer = (g: Group) => {
    const next = serializeServer(g);
    if (!next) return wrapper ? commit("liquid.unwrap", { at: wrapper }) : false;
    return wrapper ? commit("liquid.setMarkup", { markup: next, at: wrapper }) : commit("liquid.wrapIf", { condition: next, at: handle });
  };
  const writeShow = (gs: Group[]) => commit("attr.set", { name: "data-state-show", value: serializeShow(gs) || null, at: handle });
  const writeDevice = (d: Device) => {
    for (const [k, cls] of Object.entries(DEVICE_CLASS)) if (k !== d && handle.classes().includes(cls)) commit("classes.remove", { token: cls, at: handle });
    if (d !== "all" && !handle.classes().includes(DEVICE_CLASS[d])) commit("classes.add", { token: DEVICE_CLASS[d], at: handle });
  };
  const add = (c: Cond) => {
    const place = PLACE_OF[c.type];
    if (place === "device") writeDevice(c.value === "desktop" ? "desktop" : "mobile");
    else if (place === "server" && server) writeServer({ ...server, conds: [...server.conds, c] });
    else if (place === "browser" && browser) writeShow(browser.length ? browser.map((g, i) => (i === browser.length - 1 ? { ...g, conds: [...g.conds, c] } : g)) : [{ logic: "all", conds: [c] }]);
    setAdding(false);
  };

  const hasServer = !!wrapper && !browserOnly;
  const hasBrowser = show !== "";
  const hasDevice = device !== "all" && !browserOnly;
  const addable = browserOnly ? BROWSER_TYPES : ALL_TYPES.filter((t) => (t === "device" ? device === "all" : PLACE_OF[t] === "server" ? !!server : !!browser));

  return (
    <div data-conditions-editor="" className="flex min-w-0 flex-col gap-3">
      {!hasServer && !hasBrowser && !hasDevice && <PanelNote>{browserOnly ? "Not tied to state. Add a state condition to show it only while that state holds." : "The element always shows. Add a condition to show it only when it holds."}</PanelNote>}

      {hasServer && (
        <section data-condition-part="server" className="flex flex-col gap-1.5">
          <PartTitle title="When the page renders" hint={`Decided on the server: {% ${wrapper!.tag} %} around the element.`} />
          {server ? (
            <>
              <ServerGroupCards id="server" group={server} keys={names} onChange={writeServer} />
            </>
          ) : (
            <>
              <ExpressionField id="show-when" label={wrapper!.tag === "unless" ? "Hide when" : "Show when"} value={markup} completions={names} onCommit={(v) => commit("liquid.setMarkup", { markup: v, at: wrapper! })} />
              <PanelNote>This expression has parts the builder can't show (brackets, mixed and / or, filters), so it's edited as Liquid.</PanelNote>
              <button type="button" onClick={() => commit("liquid.unwrap", { at: wrapper! })} className="text-error self-start text-[11px] hover:underline">
                Remove condition
              </button>
            </>
          )}
        </section>
      )}

      {hasBrowser && (
        <section data-condition-part="browser" className="flex flex-col gap-1.5">
          <PartTitle title="Live in the browser" hint="Re-checked whenever state changes: data-state-show." />
          {browser ? (
            <StateGroupsEditor id="show" groups={browser} onChange={writeShow} keys={stateKeys} />
          ) : (
            <ExpressionField id="state-show" label="Show while" value={show} completions={stateKeys} onCommit={(v) => commit("attr.set", { name: "data-state-show", value: v || null, at: handle })} />
          )}
        </section>
      )}

      {hasDevice && (
        <section data-condition-part="device" className="flex flex-col gap-1.5">
          <PartTitle title="Device" hint={`Hidden by width: ${DEVICE_CLASS[device as "mobile" | "desktop"]}.`} />
          <ToolbarItemView type="radio" inputId="condition-device" label="Show on" value={device} onChange={(v) => writeDevice(v as Device)} options={[{ value: "mobile", label: "Phone" }, { value: "desktop", label: "Desktop" }, { value: "all", label: "Both" }]} />
        </section>
      )}

      {adding ? <NewCondition types={addable} keysFor={keysFor} onAdd={add} onCancel={() => setAdding(false)} /> : <AddBranchButton onClick={() => setAdding(true)}>Add condition</AddBranchButton>}
    </div>
  );
}
