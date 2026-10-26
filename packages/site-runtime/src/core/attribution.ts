const KEY = "ph_attribution";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
const MAX = 200;

/**
 * First page of a session: remember how the visitor arrived (utm_*, gclid, landing path, referrer) in
 * sessionStorage, so a form on a later page can say where the lead came from. Later pages never overwrite it.
 */
export function captureAttribution(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  try {
    if (win.sessionStorage.getItem(KEY)) return;
    const query = new URLSearchParams(win.location.search);
    const found: Record<string, string> = {
      landingPath: (win.location.pathname + win.location.search).slice(0, MAX),
      referrer: doc.referrer.slice(0, MAX),
    };
    for (const name of PARAMS) {
      const value = query.get(name);
      if (value) found[name] = value.slice(0, MAX);
    }
    win.sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // Storage blocked (private mode, cookies off): the form still submits, without a source.
  }
}

/** Capture-phase `submit`: puts the remembered source in a hidden `_ph_attribution` field of a PageHub form, for both a native post and the fetch one. */
export function attributionSubmit(e: Event) {
  const form = e.target as HTMLFormElement | null;
  if (!form?.matches?.("form[data-form-id]")) return;
  let saved: string | null = null;
  try {
    saved = form.ownerDocument.defaultView?.sessionStorage.getItem(KEY) ?? null;
  } catch {
    return;
  }
  if (!saved) return;
  let input = form.querySelector<HTMLInputElement>('input[name="_ph_attribution"]');
  if (!input) {
    input = form.ownerDocument.createElement("input");
    input.type = "hidden";
    input.name = "_ph_attribution";
    form.append(input);
  }
  input.value = saved;
}
