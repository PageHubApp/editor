/**
 * A PageHub form posted without the fetch path (no `[data-form-state]` children): the browser sends it and the server
 * answers with the page again, its thank-you or errors rendered inside the form.
 */

const FORM = "form[data-form-id]";
/** How long a sent form ignores another submit: past it a visitor whose page never came back may try again. */
export const SUBMIT_LOCK_MS = 10_000;

/**
 * Bubble-phase `submit`: the first submit of a PageHub form goes out and marks it `aria-busy`; another while it is
 * on its way is dropped, so a double click (or a visitor pressing again on a slow reply) sends one submission.
 * A submit something else already handled (the fetch path, the site's own script) is left alone.
 */
export function lockSubmit(e: Event) {
  const form = e.target as HTMLFormElement | null;
  if (!form?.matches?.(FORM) || e.defaultPrevented) return;
  if (form.hasAttribute("aria-busy")) return void e.preventDefault();
  form.setAttribute("aria-busy", "true");
  form.ownerDocument.defaultView?.setTimeout(() => form.removeAttribute("aria-busy"), SUBMIT_LOCK_MS);
}

/** A page restored from the back/forward cache: its forms were never answered, so they take a submit again. */
export function unlockSubmits(doc: Document) {
  doc.querySelectorAll(`${FORM}[aria-busy]`).forEach((f) => f.removeAttribute("aria-busy"));
}

/**
 * The page answering a native post marks the posted form `data-form-posted` (server side). A form inside a `<dialog>`,
 * popover or `<details>` comes back closed, its answer unseen; this opens each closed one around it, outermost first.
 * Of two copies of one form, the one the URL's `#anchor` names is the one the visitor used.
 */
export function openPostedForm(doc: Document) {
  const forms = [...doc.querySelectorAll<HTMLFormElement>(`${FORM}[data-form-posted]`)];
  if (!forms.length) return;
  let id = "";
  try {
    id = decodeURIComponent(doc.defaultView?.location.hash.slice(1) ?? "");
  } catch {}
  const form = forms.find((f) => f.id === id) ?? forms[0]!;
  const around: Element[] = [];
  for (let el = form.parentElement; el; el = el.parentElement) around.unshift(el);
  for (const el of around) {
    try {
      if (el.tagName === "DIALOG") {
        const d = el as HTMLDialogElement;
        if (!d.open) d.showModal();
      } else if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
      else if (el.hasAttribute("popover") && !el.matches(":popover-open")) (el as HTMLElement).showPopover();
    } catch {}
  }
}
