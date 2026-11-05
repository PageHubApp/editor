/** The rental agreement step before checkout, loaded only when a booking form asks the guest to sign. */
/**
 * Opens a stay's agreement `<dialog data-agreement-row>`: the server's text for these dates goes in
 * `[data-agreement-text]`, and its form signs it. Resolves with the token, or null if the guest closes it.
 */
export function askAgreement(dialog: HTMLDialogElement, api: string, stay: unknown): Promise<string | null> {
  const win = dialog.ownerDocument.defaultView!;
  const form = dialog.querySelector("form")!;
  const failed = dialog.querySelector<HTMLElement>("[data-agreement-error]");
  const fail = (e: unknown) => {
    if (!failed) return;
    failed.textContent = e instanceof Error ? e.message : "That didn't work. Try again in a moment.";
    failed.hidden = false;
  };
  const call = async (body: Record<string, unknown>) => {
    if (failed) failed.hidden = true;
    const r = await win.fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: dialog.getAttribute("data-agreement-row"), stay, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "That didn't work. Try again in a moment.");
    return j;
  };
  return new Promise((resolve) => {
    const open = new AbortController();
    const finish = (token: string | null) => {
      open.abort();
      resolve(token);
    };
    dialog.addEventListener("close", () => finish(null), { signal: open.signal });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(form);
      call({ name: d.get("agreementName"), consent: !!d.get("agreementConsent") })
        .then((j) => {
          finish(j.token);
          dialog.close();
        })
        .catch(fail);
    }, { signal: open.signal });
    dialog.showModal();
    const box = dialog.querySelector("[data-agreement-text]");
    // The server escaped everything in this HTML (`agreementHtml`).
    call({ preview: true }).then((j) => { if (box) box.innerHTML = j.html; }).catch(fail);
  });
}
