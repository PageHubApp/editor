import { set } from "../state-store";

/**
 * `data-date-range="<name>"` on a calendar: tap a check-in day, then a check-out day.
 *
 * Days are `[data-date="YYYY-MM-DD"]` buttons with the night's `data-price` (minor units); a booked night carries
 * `data-booked` and can only be a check-out day. Every night of the stay (check-in up to, not including, check-out)
 * must be open, else the tap starts a new stay. The picked days get `data-range="start|in|end"` for styling, and the
 * dates land in the inputs named by `data-date-range-in` / `-out` (default `checkIn` / `checkOut`) inside the
 * calendar's form. State keys for the summary: `<name>:in`, `<name>:out` ("Sun, Nov 1"), `<name>:nights`
 * ("2 nights"), `<name>:total` ("$420.00" in `data-currency`, default usd).
 *
 * Stay rules, all optional: a night's `data-min-stay` is the fewest nights a stay starting there can have,
 * `data-no-checkin="true"` can't start a stay, `data-no-checkout="true"` can't end one. A tap that breaks one sets `<name>:hint` with
 * the reason. `data-fee` on the calendar (minor units) is added once to the total, `data-tax-percent` is charged on the
 * nights and fee, and the checkout enforces the same rules. `data-date-range-url` starts from a stay in the page's URL
 * (`?checkIn=&checkOut=`, the input names), ignored unless it passes the same rules.
 */
export function mount(root: Element) {
  const name = root.getAttribute("data-date-range") || "dates";
  const scope = root.closest("form") ?? root;
  const input = (n: string) => scope.querySelector<HTMLInputElement>('input[name="' + n + '"]');
  const inEl = input(root.getAttribute("data-date-range-in") || "checkIn");
  const outEl = input(root.getAttribute("data-date-range-out") || "checkOut");
  const cells = () => [...root.querySelectorAll<HTMLElement>("[data-date]")];
  const day = (iso: string) => new Date(iso + "T12:00:00Z");
  const label = (iso: string) => day(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  let start = "";
  let end = "";
  let hint = "";
  const fee = Number(root.getAttribute("data-fee")) || 0;
  const taxPercent = Number(root.getAttribute("data-tax-percent")) || 0;
  const flagged = (el: Element | null, attr: string) => el?.getAttribute(attr) === "true";
  const cellOn = (iso: string) => root.querySelector<HTMLElement>('[data-date="' + iso + '"]');

  /** The nights from `a` up to (not including) `b`, or null when one is booked or missing. */
  const nights = (a: string, b: string): HTMLElement[] | null => {
    const byDate = new Map(cells().map((c) => [c.getAttribute("data-date")!, c]));
    const out: HTMLElement[] = [];
    for (let d = day(a); d < day(b); d.setUTCDate(d.getUTCDate() + 1)) {
      const c = byDate.get(d.toISOString().slice(0, 10));
      if (!c || c.hasAttribute("data-booked")) return null;
      out.push(c);
    }
    return out;
  };

  const render = () => {
    const stay = start && end ? nights(start, end) ?? [] : [];
    for (const c of cells()) {
      const d = c.getAttribute("data-date")!;
      const r = d === start ? "start" : d === end ? "end" : start && end && d > start && d < end ? "in" : "";
      r ? c.setAttribute("data-range", r) : c.removeAttribute("data-range");
      c.setAttribute("aria-pressed", String(!!r));
    }
    if (inEl) inEl.value = start;
    if (outEl) outEl.value = end;
    const n = stay.length;
    const subtotal = stay.reduce((s, c) => s + (Number(c.getAttribute("data-price")) || 0), n ? fee : 0);
    const cents = subtotal + Math.round((subtotal * taxPercent) / 100);
    let total = "";
    try {
      total = new Intl.NumberFormat("en-US", { style: "currency", currency: root.getAttribute("data-currency") || "usd" }).format(cents / 100);
    } catch {
      total = (cents / 100).toFixed(2);
    }
    set(name + ":in", start ? label(start) : undefined);
    set(name + ":out", end ? label(end) : undefined);
    set(name + ":nights", n ? n + (n === 1 ? " night" : " nights") : undefined);
    set(name + ":total", n ? total : undefined);
    set(name + ":hint", hint || undefined);
  };

  if (root.hasAttribute("data-date-range-url")) {
    const q = new URLSearchParams(location.search);
    const a = q.get(root.getAttribute("data-date-range-in") || "checkIn") || "";
    const b = q.get(root.getAttribute("data-date-range-out") || "checkOut") || "";
    const first = cellOn(a);
    const stay = first && b > a && !flagged(first, "data-no-checkin") ? nights(a, b) : null;
    if (stay && stay.length >= (Number(first!.getAttribute("data-min-stay")) || 0) && !flagged(cellOn(b), "data-no-checkout")) {
      start = a;
      end = b;
    }
  }

  root.addEventListener("click", (e) => {
    const c = (e.target as Element).closest?.<HTMLElement>("[data-date]");
    if (!c || !root.contains(c)) return;
    e.preventDefault();
    const d = c.getAttribute("data-date")!;
    const open = !c.hasAttribute("data-booked");
    hint = "";
    const stay = start && !end && d > start ? nights(start, d) : null;
    const min = start ? Number(cellOn(start)?.getAttribute("data-min-stay")) || 0 : 0;
    if (stay && flagged(c, "data-no-checkout")) hint = "You can't check out on " + label(d) + ". Pick another day.";
    else if (stay && stay.length < min) hint = "A stay from " + label(start) + " is at least " + min + " nights.";
    else if (stay) end = d;
    else if (open && flagged(c, "data-no-checkin")) hint = "You can't check in on " + label(d) + ". Pick another day.";
    else if (open) (start = d), (end = "");
    render();
  });
  render();
}
