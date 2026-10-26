/** Maps an element definition's `insert.icon` (a Tabler name, `tb/` prefix optional) to an editor icon. */
import { isIconName, type IconName } from "../../primitives/icons";

/** The icon for an `insert.icon` name, else the box. */
export function glyphFor(icon: string | undefined): IconName {
  const name = icon?.replace(/^tb\//, "") ?? "";
  return isIconName(name) ? name : "box";
}
