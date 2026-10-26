type State = "idle" | "sending" | "sent" | "error";

const FALLBACK_MESSAGE = "Something went wrong and your message was not sent. Please try again.";
const mounted = new WeakSet<HTMLFormElement>();

const slots = (form: HTMLFormElement) => [...form.querySelectorAll<HTMLElement>("[data-form-state]")];

/**
 * Shows the `[data-form-state=<state>]` children of a form and hides the rest. `error` keeps the `idle`
 * fields visible (their values untouched) next to the error slot, so the visitor can fix and resubmit.
 */
function show(form: HTMLFormElement, state: State) {
  const visible = state === "error" ? ["idle", "error"] : [state];
  slots(form).forEach((el) => (el.hidden = !visible.includes(el.getAttribute("data-form-state")!)));
}

/** The authored `error` slot, or a small message element the runtime adds. Themed by the site's `--color-error`. */
function errorSlot(form: HTMLFormElement): HTMLElement {
  const authored = slots(form).find((el) => el.getAttribute("data-form-state") === "error");
  if (authored) return authored;
  const p = document.createElement("p");
  p.setAttribute("data-form-error", "");
  p.style.color = "var(--color-error)";
  p.textContent = FALLBACK_MESSAGE;
  p.hidden = true;
  const submit = form.querySelector<HTMLElement>('[type="submit"], button:not([type])');
  submit ? submit.before(p) : form.append(p);
  return p;
}

function fail(form: HTMLFormElement) {
  const msg = errorSlot(form);
  show(form, "error");
  msg.hidden = false;
  msg.setAttribute("role", "alert");
  msg.tabIndex = -1;
  msg.focus();
}

/**
 * A `{% form %}` that has `[data-form-state]` children submits with fetch and swaps those states in place. Without JS the
 * native POST still works. Never in the editing canvas (`data-ph-edit`): that document is the dashboard's origin, so a
 * fetch to the form's `action` there would carry the editor's session.
 */
export function mount(el: Element) {
  const form = (el.closest("form") ?? el) as HTMLFormElement;
  if (form.tagName !== "FORM" || form.method.toLowerCase() !== "post" || mounted.has(form)) return;
  mounted.add(form);
  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || form.ownerDocument.documentElement.hasAttribute("data-ph-edit")) return;
    busy = true;
    form.querySelector("[data-form-error]")?.setAttribute("hidden", "");
    show(form, "sending");
    try {
      const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      if (res.ok) {
        show(form, "sent");
        form.reset();
      } else fail(form);
    } catch {
      fail(form);
    }
    busy = false;
  });
}
