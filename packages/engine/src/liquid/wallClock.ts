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
 * The zone's offset at `instant` in minutes WEST of UTC (liquidjs's convention: Los Angeles in winter is 480).
 * liquidjs works a named zone's offset out by reading locale strings back in the SERVER's zone, which is an hour off
 * on the server's own daylight-saving change days; handing it this number avoids that.
 */
export function minutesWestAt(zone: string, instant: Date): number {
  return -zoneOffsetMs(zone, instant.getTime()) / 60000;
}

/**
 * A Date whose SERVER-local fields are `instant`'s wall-clock time in `zone`. liquidjs formats through the server's
 * local fields after shifting by the difference of two offsets, which is an hour off when the server changes clocks
 * between the two; a Date that already reads right locally, passed with the server's own offset, needs no shift.
 */
export function serverLocalWallClock(zone: string, instant: Date): Date {
  const w = new Date(instant.getTime() + zoneOffsetMs(zone, instant.getTime()));
  return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds());
}

/** The instant `value` denotes, read the way liquidjs reads it, or null when it is not a date. */
export function instantOf(value: unknown, timezone: number | string | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === "now" || value === "today") return new Date();
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value !== "string" || value.trim() === "") return null;
  if (/^\d+$/.test(value)) return new Date(Number(value) * 1000);
  const wall = wallClockInstant(value, timezone);
  if (wall) return Number.isNaN(wall.getTime()) ? null : wall;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
