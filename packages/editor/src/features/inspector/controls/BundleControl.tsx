/**
 * BundleControl — the control for a property whose value is several class groups edited
 * together: border (width / style / colour), ring (width / colour / offset), shadow (size /
 * colour), transition (property / duration / easing / delay / will-change), transform (gpu /
 * scale / rotate / translate / skew / origin), filter & backdrop (blur / brightness / …), wrap
 * (text-wrap / white-space / overflow / word-break) and decoration (line / style / colour /
 * thickness / offset). A vertical stack of the same group-bound value / colour
 * fields the rest of the inspector uses — never a text box.
 *
 *   <BundleControl items={borderSpec.items} />
 *
 * Each item is one class group; it renders inline in the panel (border / ring / wrap / decoration)
 * or inside the row's popover body (shadow / transition / transform / filter / backdrop), since
 * `PropertyRow` already frames popover rows.
 */
import type { BundleItemSpec } from "../controlSpecs";
import { ShadowTiles } from "./ShadowTiles";
import { GroupColorRow, GroupValueRow } from "./groupFields";

export function BundleControl({ items }: { items: readonly BundleItemSpec[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-bundle-control="">
      {items.map((it) =>
        it.control === "tiles" ? (
          <ShadowTiles key={it.group} group={it.group} label={it.label} options={it.options ?? []} />
        ) : it.control === "color" ? (
          <GroupColorRow key={it.group} group={it.group} label={it.label} />
        ) : (
          <GroupValueRow key={it.group} group={it.group} label={it.label} prefix={it.prefix} options={it.options} allowedTypes={it.allowedTypes} />
        )
      )}
    </div>
  );
}
