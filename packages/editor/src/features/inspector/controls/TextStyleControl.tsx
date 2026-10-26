/**
 * The "Text style" row: a dropdown of the site's text styles (Heading, Body, Accent … from the
 * theme, plus host presets) with "Local styles" for none. Picking one writes the style's class
 * tokens, each through its own class group (`classes.set`), so a `font-heading` replaces any other
 * family and the whole pick is one undo step per token; "Local styles" clears the tokens of the
 * active style.
 *
 *   <TextStyleControl label="Text style" />
 */
import { groupTest, splitClass } from "@pagehub/engine";
import { classGroupsFacet } from "@pagehub/engine/kits";
import { useEditorState, useInspectedClass, useRunCommand } from "../../../react/bindings";
import { useUi } from "../../../react/useUi";
import { writeScopes } from "../../../state/uiState";
import { typographyPresetsFacet } from "../../richtext/hooks";
import { activeTextStyle, typographyPresets } from "../../theme/typographyPresets";
import { THEME_FILE } from "../../theme/themeModel";
import { ToolbarItemView } from "../../toolbar/ToolbarItemView";

export function TextStyleControl({ label }: { label: string }) {
  const { handle, classes } = useInspectedClass();
  const css = useEditorState((s) => s.files.get(THEME_FILE));
  const host = useEditorState((s) => s.facet(typographyPresetsFacet));
  const groups = useEditorState((s) => s.facet(classGroupsFacet));
  const ui = useUi((u) => u);
  const run = useRunCommand();
  if (!handle) return null;
  const styles = typographyPresets(css, host);
  const active = activeTextStyle(styles, classes);

  const write = (className: string, on: boolean) => {
    for (const token of className.split(/\s+/).filter(Boolean)) {
      const base = splitClass(token)[1];
      const group = [...groups.values()].find((g) => groupTest(g)(base));
      if (group) void run("classes.set", { group: group.id, token: on ? token : null, scopes: writeScopes(ui), at: handle });
    }
  };
  const pick = (name: string) => {
    if (active) write(active.className, false);
    const next = styles.find((s) => s.name === name);
    if (next) write(next.className, true);
  };

  return (
    <ToolbarItemView
      key={active?.name ?? ""}
      type="select"
      label={label}
      inputId="typographyPreset"
      value={active?.name ?? ""}
      valueLabels={styles.map((s) => s.name)}
      placeholder="Local styles"
      onChange={pick}
    />
  );
}
