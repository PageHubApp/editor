import { parseDuration } from "../duration";

const timers = new WeakMap<HTMLFormElement, ReturnType<typeof setTimeout>>();
const sent = new WeakMap<HTMLFormElement, string>();

function formOf(e: Event): HTMLFormElement | null {
  const t = e.target as HTMLElement | null;
  if (!t?.closest || !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return null;
  const f = t.closest<HTMLFormElement>("form[data-autosubmit]");
  return f && (t as HTMLInputElement).type !== "submit" ? f : null;
}

function submit(f: HTMLFormElement) {
  const key = new URLSearchParams(new FormData(f) as unknown as Record<string, string>).toString();
  if (sent.get(f) === key) return;
  sent.set(f, key);
  f.requestSubmit ? f.requestSubmit() : f.submit();
}

/** `change` always submits at once (cancelling a pending debounce). */
export function autosubmitChange(e: Event) {
  const f = formOf(e);
  if (!f) return;
  clearTimeout(timers.get(f));
  submit(f);
}

/** `input` submits after the form's `data-autosubmit="300ms"` delay; with no delay it waits for `change`. */
export function autosubmitInput(e: Event) {
  const f = formOf(e);
  const ms = f ? parseDuration(f.getAttribute("data-autosubmit"), 0) : 0;
  if (!f || !ms) return;
  clearTimeout(timers.get(f));
  timers.set(f, setTimeout(() => submit(f), ms));
}
