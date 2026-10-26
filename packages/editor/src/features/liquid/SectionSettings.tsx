/**
 * Section settings: one input per `{% schema %}` setting of the section a
 * `{% section 'name', … %}` tag renders (`sections/<name>.liquid`). Each change is one
 * `liquid.setArg` on the tag — the only edit a client makes to a section — and clearing a
 * field removes its argument, so the schema default applies again.
 *
 *   {% section 'hero', headline: "Smog checks in 15 minutes", show_badge: true %}
 */
import { liquidString, type NodeHandle } from "@pagehub/engine";
import { readSchema, type SchemaSetting } from "@pagehub/engine/render";
import { useEditorState } from "../../react/bindings";
import { ExpressionField, PanelNote } from "./LiquidFields";
import { ToolbarItemView } from "../toolbar/ToolbarItemView";
import { parseNamed } from "./markup";
import { useMarkup } from "./BlockPanels";
import { useCommitAt } from "./useCommit";

type InputSetting = Extract<SchemaSetting, { id: string }>;

const MULTILINE = new Set(["textarea", "richtext", "html", "inline_richtext", "liquid"]);
const NUMBER = new Set(["number", "range"]);

/** The literal a setting value is written as; null when the text can't be one. */
function settingLiteral(setting: InputSetting, value: string): string | null {
  if (value === "") return "";
  if (setting.type === "checkbox") return value === "true" || value === "false" ? value : null;
  if (NUMBER.has(setting.type)) {
    const n = Number(value);
    if (!/^-?\d+(\.\d+)?$/.test(value.trim()) || !Number.isFinite(n)) return null;
    if ((setting.min !== undefined && n < setting.min) || (setting.max !== undefined && n > setting.max)) return null;
    return value.trim();
  }
  try {
    return liquidString(value);
  } catch {
    return null;
  }
}

const shown = (source: string | undefined): string => {
  if (source === undefined) return "";
  const s = source.trim();
  return /^(['"]).*\1$/s.test(s) ? s.slice(1, -1) : s;
};

function SettingInput({ handle, setting, source }: { handle: NodeHandle; setting: InputSetting; source: string | undefined }) {
  const commit = useCommitAt(handle);
  const write = (v: string) => {
    const literal = settingLiteral(setting, v);
    return literal !== null && commit("liquid.setArg", { name: setting.id, value: literal });
  };
  const value = shown(source);
  const fallback = setting.default === undefined ? undefined : String(setting.default);
  const id = `setting-${setting.id}`;
  if (setting.type === "checkbox") {
    const on = (source === undefined ? fallback : value) === "true";
    return <ToolbarItemView key={String(on)} label={setting.label} inputId={id} type="toggle" on="on" value={on ? "on" : ""} onChange={(v) => write(v ? "true" : "false")} />;
  }
  if ((setting.type === "select" || setting.type === "radio") && setting.options?.length) {
    return (
      <ToolbarItemView key={value} label={setting.label} inputId={id} type="select" value={value || fallback || ""} onChange={(v) => write(v)}>
        {setting.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </ToolbarItemView>
    );
  }
  return <ExpressionField id={id} label={setting.label} value={value} placeholder={fallback ?? setting.placeholder} multiline={MULTILINE.has(setting.type)} mono={false} onCommit={write} />;
}

export function SectionSettingsPanel({ handle }: { handle: NodeHandle }) {
  const name = parseNamed(useMarkup(handle))?.name ?? "";
  const file = useEditorState((s) => s.files.get(`sections/${name}.liquid`));
  const args = useEditorState(() => Object.fromEntries(handle.alive ? handle.args().map((a) => [a.name, a.source]) : []), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const { schema, errors } = file === undefined ? { schema: null, errors: [`sections/${name}.liquid not found`] } : readSchema(file);
  if (!schema) return <PanelNote>{errors[0] ?? "This section has no {% schema %}, so it has no settings."}</PanelNote>;
  const settings = schema.settings ?? [];
  if (!settings.length) return <PanelNote>{schema.name} has no settings.</PanelNote>;
  return (
    <div className="flex flex-col gap-1.5" data-liquid-panel="section" data-section-settings={name}>
      {settings.map((s, i) =>
        "id" in s && typeof s.id === "string" ? (
          <div key={s.id} data-setting={s.id} className="flex flex-col gap-0.5">
            <SettingInput handle={handle} setting={s as InputSetting} source={args[s.id]} />
            {(s as InputSetting).info && <PanelNote>{(s as InputSetting).info}</PanelNote>}
          </div>
        ) : s.type === "header" ? (
          <h4 key={i} className="text-base-content mt-1 text-xs font-semibold">
            {s.content}
          </h4>
        ) : (
          <PanelNote key={i}>{(s as { content: string }).content}</PanelNote>
        ),
      )}
    </div>
  );
}
