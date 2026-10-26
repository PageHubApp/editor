/**
 * A date or date-time string with no offset (`2026-06-15`, `2026-06-15 10:30`, `2026-06-15T10:30:15`) is a wall-clock
 * time: Shopify reads it in the shop's zone. `new Date(str)` reads it in the SERVER's zone, so the same page rendered
 * on a UTC host and on a Pacific host would print two different times. These helpers turn it into the instant that
 * wall-clock time is in the SITE's zone, so the output is the same on any machine.
 */

/** Group 1 is the date, group 2 the time (`HH:MM`, `HH:MM:SS` or `HH:MM:SS.mmm`) or undefined. */
export const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/;

/** The site zone's offset from UTC in ms at `instant` (`+` east of Greenwich). An unknown zone name is UTC. */
function zoneOffsetMs(zone: string, instant: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(new Date(instant));
    const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(instant / 1000) * 1000;
  } catch {
    return 0;
  }
}

/**
 * The instant a wall-clock string denotes in `timezone` (an IANA name, or minutes WEST of UTC as liquidjs takes it),
 * or null when `value` is not a wall-clock string. An impossible date (`2026-13-45`) is an Invalid Date.
 */
export function wallClockInstant(value: unknown, timezone: number | string | undefined): Date | null {
  const m = typeof value === "string" ? WALL_CLOCK.exec(value.trim()) : null;
  if (!m) return null;
  const [y, mo, d] = m[1]!.split("-").map(Number) as [number, number, number];
  const [hh = 0, mi = 0, rest = "0"] = (m[2] ?? "00:00").split(":");
  const [ss = "0", ms = "0"] = rest.split(".");
  const wall = Date.UTC(y, mo - 1, d, Number(hh), Number(mi), Number(ss), Number(ms.padEnd(3, "0")));
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== Number(hh)) return new Date(NaN);
  if (typeof timezone !== "string") return new Date(wall + (timezone ?? 0) * 60000);
  // The offset depends on the instant, which is what we are looking for: guess with the offset at the wall time read as UTC, then once more with the result (a daylight-saving change in between).
  const first = wall - zoneOffsetMs(timezone, wall);
  return new Date(wall - zoneOffsetMs(timezone, first));
}
