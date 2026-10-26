/** The one place HTML is escaped, for filters, tags, canvas and inspector code that build markup. Pure, no I/O. */
const MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => MAP[c]!);
}

/** For a double-quoted attribute value: `&` and `"` only. */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** For text between tags: `&`, `<` and `>`. (`escapeText` in the edit ops is this plus Liquid delimiters.) */
export function escapeMarkupText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `name="value"` pairs for the given attributes; null / undefined / false are skipped, true is a bare attribute. */
export function attrString(attrs: Record<string, unknown>): string {
  let out = "";
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (!/^[a-zA-Z][\w:-]*$/.test(name) || /^on/i.test(name)) continue;
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`;
  }
  return out;
}
