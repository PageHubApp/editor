/**
 * Capture-phase `submit`: puts how long the page has been open (whole ms) in a hidden `_ph_t` field of a PageHub form,
 * for both a native post and the fetch one. The server files a post without it, or sent within seconds, as spam: a bot
 * that posts straight to the endpoint never opened the page. The field is not in the page's HTML, so a bot copying the
 * form's hidden inputs has nothing to copy.
 */
export function submitStamp(e: Event) {
  const form = e.target as HTMLFormElement | null;
  if (!form?.matches?.("form[data-form-id]")) return;
  const win = form.ownerDocument.defaultView;
  if (!win) return;
  let input = form.querySelector<HTMLInputElement>('input[name="_ph_t"]');
  if (!input) {
    input = form.ownerDocument.createElement("input");
    input.type = "hidden";
    input.name = "_ph_t";
    form.append(input);
  }
  input.value = String(Math.round(win.performance.now()));
}
