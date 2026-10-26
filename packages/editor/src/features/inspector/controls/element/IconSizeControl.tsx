import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useRunCommand } from "../../../../react/bindings";
import { Chip } from "../../../../primitives/Chip";
import { UniversalInput } from "../../../toolbar/universal/UniversalInput";
import { tokenToValue, valueToToken } from "../../../toolbar/universal/universalValue";

/** The classes the converter puts on a sized icon span, so the svg inside fills the box. */
const FILL = ["[&>svg]:w-full", "[&>svg]:h-full"];
const SIZE_OPTIONS = ["w-3", "w-4", "w-5", "w-6", "w-8", "w-10", "w-12", "w-16", "w-20", "w-24"];
const BASE_SIZE = /^(?:size|w|h)-/;

/** The size token (`w-6`) a converted icon span carries: its `w-N`, else its `size-N`. */
export function iconSizeToken(classes: readonly string[]): string {
  const w = classes.find((c) => c.startsWith("w-"));
  if (w) return w;
  const size = classes.find((c) => c.startsWith("size-"));
  return size ? `w-${size.slice(5)}` : "";
}

/** The class list for an icon of `token` (`w-8`): the converter's `w-N h-N` pair plus the fill classes; `""` clears the size. Variant-prefixed sizes are left alone. */
export function iconSizeClasses(classes: readonly string[], token: string): string[] {
  const rest = classes.filter((c) => !BASE_SIZE.test(c));
  if (!token) return rest;
  const out = [...rest];
  const at = out.findIndex((c) => c.startsWith("[&>svg]:"));
  const pair = [token, `h-${token.slice(2)}`];
  out.splice(at < 0 ? out.length : at, 0, ...pair);
  for (const f of FILL) if (!out.includes(f)) out.push(f);
  return out;
}

/** Size of a converted icon span (`<span class="w-6 h-6 …">{{ 'tb/…' | icon }}</span>`): one value drives both `w-N` and `h-N`, the way the converter writes them. */
export function IconSizeControl({ handle, label }: { handle: NodeHandle; label: string }) {
  const run = useRunCommand();
  const token = useEditorState((s) => {
    void s.files.get(handle.path);
    return handle.alive ? iconSizeToken(handle.classes()) : "";
  });
  const write = (value: string) => {
    if (!handle.alive) return;
    const next = iconSizeClasses(handle.classes(), valueToToken("w", value));
    run("attr.set", { name: "class", value: next.length ? next.join(" ") : null, at: handle });
  };
  return (
    <Chip label={label} frame="bordered">
      <UniversalInput key={token} value={tokenToValue("w", token)} onChange={write} prefix="w" options={SIZE_OPTIONS} ariaLabel={label} />
    </Chip>
  );
}
