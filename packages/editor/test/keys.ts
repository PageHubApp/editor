/** Keyboard helpers for the keyboard tests: dispatch a real `keydown` and report whether it was prevented. */
import { act } from "react";

/** `"ctrl+shift+z"` → init; the last part is the key. */
export function keyInit(spec: string): KeyboardEventInit {
  const parts = spec.split(/\+(?!$)/);
  const key = parts.pop()!;
  return { key, ctrlKey: parts.includes("ctrl"), metaKey: parts.includes("meta"), shiftKey: parts.includes("shift"), altKey: parts.includes("alt"), bubbles: true, cancelable: true };
}

/** Press a key on `target` (default: the body); true when something prevented the default. */
export function press(spec: string, target: EventTarget = document.body): boolean {
  const ev = new KeyboardEvent("keydown", keyInit(spec));
  act(() => void target.dispatchEvent(ev));
  return ev.defaultPrevented;
}

export const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
