import type { Home, NewRuntimeAttr, PropEntry, Tab } from "./types";

/** Section id -> [tab, title], from today's `sectionDefs.ts` (plus the site / ui pseudo-tabs). */
export const SECTIONS: Record<string, [Tab, string]> = {
  component: ["component", "Component"],
  "data-source": ["component", "Data source"],
  modifiers: ["layout", "Modifiers"],
  "preset-items": ["layout", "Items"],
  alignment: ["layout", "Layout"],
  size: ["layout", "Size"],
  typography: ["design", "Text"],
  background: ["design", "Background"],
  "image-settings": ["design", "Image Settings"],
  hover: ["design", "Hover"],
  styles: ["design", "Styles"],
  effects: ["design", "Effects"],
  action: ["interactions", "Action"],
  handlers: ["interactions", "Handlers"],
  conditions: ["interactions", "Conditions"],
  stateBindings: ["interactions", "State"],
  properties: ["advanced", "Attributes"],
  "custom-css": ["advanced", "Classes"],
  "ai-context": ["advanced", "AI Context"],
  "import-export": ["advanced", "Import / Export"],
  permissions: ["advanced", "Permissions"],
  "design-system": ["site", "Design system / site settings"],
  ui: ["ui", "Inspector UI ids (not document props)"],
};

/** Group ids `TAILWIND_GROUPS` ships today (packages/engine/src/kits/tailwind/groups.ts). */
const EXISTING_TAILWIND_GROUPS: ReadonlySet<string> = new Set([
  "display", "position", "flex-direction", "justify-content", "align-items", "grid-cols", "gap",
  "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml",
  "width", "height", "max-width", "text-size", "text-align", "text-color", "font-weight",
  "bg-color", "rounded", "shadow", "opacity", "z-index", "border-width", "border-color",
]);

const comps = (c: string) => c.split(" ").filter(Boolean);
const tabOf = (section: string): Tab => {
  const s = SECTIONS[section];
  if (!s) throw new Error(`unknown section ${section}`);
  return s[0];
};

interface Opts {
  aliases?: string[];
  variant?: string;
  runtime?: string;
}

const base = (key: string, c: string, section: string, does: string, home: Home, how: string, binding: string, o: Opts = {}): PropEntry => ({
  key, components: comps(c), tab: tabOf(section), section, does, home, how, binding,
  ...(o.aliases ? { aliases: o.aliases } : {}),
  ...(o.variant ? { variant: o.variant } : {}),
  ...(o.runtime ? { runtime: o.runtime } : {}),
});

/** Tailwind class in one group. `how` defaults to the group name. */
export const tw = (key: string, c: string, section: string, does: string, group: string, o: Opts & { how?: string; binding?: string } = {}): PropEntry => ({
  ...base(key, c, section, does, "tailwind-class", o.how ?? `${o.variant ? o.variant + ": " : ""}\`${group}\` class group`,
    o.binding ?? `cls(${JSON.stringify(group)})${o.variant ? ` @variant ${JSON.stringify(o.variant)}` : ""}`, o),
  group,
  ...(EXISTING_TAILWIND_GROUPS.has(group) ? {} : { newGroup: true }),
});

/** HTML attribute. */
export const at = (key: string, c: string, section: string, does: string, how: string, binding: string, o: Opts = {}): PropEntry =>
  base(key, c, section, does, "html-attribute", how, binding, o);

/** Liquid tag argument / expression. */
export const ar = (key: string, c: string, section: string, does: string, how: string, binding: string, o: Opts = {}): PropEntry =>
  base(key, c, section, does, "liquid-arg", how, binding, o);

/** Native element or platform feature. */
export const nt = (key: string, c: string, section: string, does: string, how: string, binding: string, o: Opts = {}): PropEntry =>
  base(key, c, section, does, "native", how, binding, o);

/** Site-runtime attribute. `runtime` names a `NEW_RUNTIME` id; omit when the attribute exists already. */
export const rt = (key: string, c: string, section: string, does: string, how: string, binding: string, o: Opts = {}): PropEntry =>
  base(key, c, section, does, "site-runtime", how, binding, o);

/** `{% schema %}` setting. */
export const ss = (key: string, c: string, section: string, does: string, how: string, binding: string, o: Opts = {}): PropEntry =>
  base(key, c, section, does, "schema-setting", how, binding, o);

/** No workable form. */
export const esc = (key: string, c: string, section: string, does: string, reason: string, o: Opts = {}): PropEntry => ({
  ...base(key, c, section, does, "escalate", "none yet", "-", o),
  reason,
});

export type { NewRuntimeAttr };
