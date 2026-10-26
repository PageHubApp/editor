/**
 * The cards of one server-decided condition group (the `{% if … %}` forms): the all / any switch
 * and a ConditionCard per condition. Shared by the Conditions section and an action's "only fire
 * when" gate, so both edit Liquid conditions the same way.
 *
 *   <ServerGroupCards id="server" group={parseServer(markup)!} keys={names} onChange={(g) => write(serializeServer(g))} />
 */
import { ConditionCard, LogicSwitch } from "./ConditionFields";
import type { Group } from "./conditionModel";

export function ServerGroupCards({ id, group, keys, onChange }: { id: string; group: Group; keys: readonly string[]; onChange(g: Group): void }) {
  return (
    <>
      {group.conds.length > 1 && <LogicSwitch id={id} value={group.logic} onChange={(logic) => onChange({ ...group, logic })} />}
      {group.conds.map((c, i) => (
        <ConditionCard
          key={`${i}:${c.type}`}
          id={`${id}-${i}`}
          cond={c}
          keys={keys}
          onChange={(n) => onChange({ ...group, conds: group.conds.map((x, j) => (j === i ? n : x)) })}
          onRemove={() => onChange({ ...group, conds: group.conds.filter((_, j) => j !== i) })}
        />
      ))}
    </>
  );
}
