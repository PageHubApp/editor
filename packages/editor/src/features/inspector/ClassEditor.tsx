/**
 * The "Classes" section's editor. Composes the add-class search input, the breakpoint scope row +
 * chips (`ClassChips`), and the raw-class escape hatch (`children`), sharing one add-scope — the
 * layer a newly-typed bare class targets.
 *
 * Add routing: a token whose base the engine recognises as a class group
 * is written with `classes.set` at the chosen scope (so `flex` at MD becomes `md:flex` and
 * conflicts in that layer are resolved); a prefix the user typed (`md:`, `dark:hover:`) is honoured
 * over the scope; anything the engine doesn't know is appended to the `class` attribute verbatim.
 */
import { useState, type ReactNode } from "react";
import { groupTest, splitClass, type NodeHandle } from "@pagehub/engine";
import { BREAKPOINTS, classGroupsFacet, type Breakpoint, type Scope } from "@pagehub/engine/kits";
import { useEditorState, useRunCommand } from "../../react/bindings";
import { ClassChips } from "./ClassChips";
import { ClassSearchInput } from "./ClassSearchInput";
import { prefixFor, scopeFor, scopeLabel, type AddScope } from "./classScope";

const BPS: readonly string[] = BREAKPOINTS;

/** Reconstruct a write Scope from a class token's typed prefix (`md:dark:hover:` → {md, dark, hover}). */
function scopeFromPrefix(prefix: string): Scope {
  const segs = prefix.split(":").filter(Boolean);
  const breakpoint = segs.find((s) => BPS.includes(s)) as Breakpoint | undefined;
  const dark = segs.includes("dark") || undefined;
  const state = segs.find((s) => s !== "dark" && !BPS.includes(s));
  return { breakpoint, dark, state };
}

export function ClassEditor({ handle, children }: { handle: NodeHandle; children?: ReactNode }) {
  const run = useRunCommand();
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  const classes = useEditorState(() => (handle.alive && handle.kind === "element" ? handle.classes() : [])) as readonly string[];
  const [addScope, setAddScope] = useState<AddScope>("base");

  const add = (raw: string) => {
    for (const tok of raw.split(/\s+/).filter(Boolean)) {
      const [typedPrefix, base] = splitClass(tok);
      const scope = typedPrefix ? scopeFromPrefix(typedPrefix) : scopeFor(addScope);
      const group = [...groups.values()].find((g) => groupTest(g)(base));
      if (group) {
        run("classes.set", { group: group.id, token: base, scopes: [scope], at: handle });
      } else {
        run("classes.add", { token: (typedPrefix || prefixFor(addScope)) + base, at: handle });
      }
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-class-editor="">
      <ClassSearchInput present={classes} onAdd={add} scopeLabel={scopeLabel(addScope)} />
      <ClassChips handle={handle} addScope={addScope} onSelectScope={setAddScope} />
      {children}
    </div>
  );
}
