/** Prints the date filters' output for wall-clock strings as JSON. `dateWallClock.test.ts` runs it under different `TZ` values. */
import { createRenderer } from "../../src/runtime/createRenderer.ts";
import { renderPage } from "../../src/runtime/renderPage.ts";

const SITE_ZONES = ["America/Los_Angeles", "America/Chicago", "Asia/Kolkata", "Pacific/Auckland", "UTC"];
const STRINGS = ["2027-01-16T10:00", "2027-01-16 10:00", "2027-01-16T18:00:30", "2027-07-16T10:00", "2027-01-16", "2027-01-16T10:00Z", "2027-01-16T10:00:00+02:00", "2027-02-30T10:00", "2026-11-01", "2026-03-08", "2026-11-01T08:30Z", "2026-03-08T10:30Z"];
const source = STRINGS.map(s => `{{ '${s}' | date: '%Y-%m-%d %I:%M %p' }}|{{ '${s}' | time_tag: '%I:%M %p' }}`).join("\n");

const out: Record<string, Record<string, string>> = {};
for (const zone of SITE_ZONES) {
  const renderer = createRenderer({ files: p => (p === "pages/index.liquid" ? source : undefined), timezoneOffset: zone });
  const page = await renderPage(renderer, { path: "pages/index.liquid", url: "/", title: "t", source }, { path: "/" }, { site: { name: "S", pages: [] }, dataSources: [] });
  out[zone] = Object.fromEntries(page.html.split("\n").map((line, i) => [STRINGS[i]!, line]));
}
console.log(JSON.stringify(out));
