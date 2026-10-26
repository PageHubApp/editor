/**
 * Text that mixes plain words and `{{ … }}` bindings (an image's alt text, a title), split so an
 * editor can show each binding as a variable chip between the text boxes.
 *
 *   splitBound("Photo of {{ item.title }} today") // ["Photo of ", "{{ item.title }}", " today"]
 *   joinBound(["", "{{ item.title }}", ""])        // "{{ item.title }}"
 *
 * The result always alternates text, variable, text, … and starts and ends with a (maybe empty)
 * text, so index parity says which is which: even = text, odd = variable.
 */

const VAR = /(\{\{[^{}]*\}\})/;

export const splitBound = (value: string): string[] => value.split(VAR);

export const joinBound = (parts: readonly string[]): string => parts.join("");

/** A variable part → the path shown on its chip (`{{ item.title | upcase }}` → `item.title`). */
export const variablePath = (part: string): string => /^\{\{\s*([^\s|}]+)/.exec(part)?.[1] ?? part;

/** Replace the text at even index `i`. */
export const setText = (parts: readonly string[], i: number, text: string): string[] => parts.map((p, j) => (j === i ? text : p));

/** Remove the variable at odd index `i`, joining the text on either side. */
export const removeVariable = (parts: readonly string[], i: number): string[] => [...parts.slice(0, i - 1), `${parts[i - 1]}${parts[i + 1]}`, ...parts.slice(i + 2)];

/** Append a variable (`item.title`) after the last text. */
export const appendVariable = (parts: readonly string[], path: string): string[] => [...parts, `{{ ${path} }}`, ""];
