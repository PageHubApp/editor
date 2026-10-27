/**
 * A date-time with no offset is a wall-clock time in the SITE's zone, so a page renders the same on any server
 * (Shopify's rule). The probe runs in child processes with different `TZ` values: in-process, the server zone
 * cannot change after start.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wallClockInstant } from "../src/liquid/wallClock.ts";

const PROBE = fileURLToPath(new URL("./fixtures/dateProbe.ts", import.meta.url));
const CWD = fileURLToPath(new URL("..", import.meta.url));

function probe(tz: string): Record<string, Record<string, string>> {
  const run = spawnSync(process.execPath, ["--conditions=pagehub-source", "--import", "tsx", PROBE], { cwd: CWD, env: { ...process.env, TZ: tz }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("date and time_tag give identical output under TZ=UTC and TZ=America/Los_Angeles (and Asia/Kolkata)", () => {
  const utc = probe("UTC");
  assert.deepEqual(probe("America/Los_Angeles"), utc);
  assert.deepEqual(probe("Asia/Kolkata"), utc);
});

test("a wall-clock string reads as that wall-clock time in the site's zone", () => {
  const out = probe("America/Los_Angeles");
  for (const zone of Object.keys(out)) {
    const z = out[zone]!;
    assert.equal(z["2027-01-16T10:00"], `2027-01-16 10:00 AM|<time datetime="2027-01-16T10:00">10:00 AM</time>`, zone);
    assert.equal(z["2027-01-16 10:00"]!.split("|")[0], "2027-01-16 10:00 AM", zone);
    assert.equal(z["2027-01-16T18:00:30"]!.split("|")[0], "2027-01-16 06:00 PM", zone);
    assert.equal(z["2027-07-16T10:00"]!.split("|")[0], "2027-07-16 10:00 AM", `${zone}: summer time too`);
    assert.equal(z["2027-01-16"]!.split("|")[0], "2027-01-16 12:00 AM", `${zone}: date-only keeps its day`);
  }
});

test("a string with an offset is an instant, shifted into the site's zone", () => {
  const out = probe("America/Los_Angeles");
  assert.equal(out["America/Los_Angeles"]!["2027-01-16T10:00Z"]!.split("|")[0], "2027-01-16 02:00 AM");
  assert.equal(out["Asia/Kolkata"]!["2027-01-16T10:00Z"]!.split("|")[0], "2027-01-16 03:30 PM");
  assert.equal(out["America/Los_Angeles"]!["2027-01-16T10:00:00+02:00"]!.split("|")[0], "2027-01-16 12:00 AM");
});

test("the server's own daylight-saving change days print the right day and hour", () => {
  // Nov 1 and Mar 8, 2026 are the US clock changes: liquidjs alone printed `2026-10-31 11:00 PM` on a Pacific server.
  for (const server of ["America/Los_Angeles", "America/New_York", "UTC"]) {
    const la = probe(server)["America/Los_Angeles"]!;
    assert.equal(la["2026-11-01"]!.split("|")[0], "2026-11-01 12:00 AM", server);
    assert.equal(la["2026-03-08"]!.split("|")[0], "2026-03-08 12:00 AM", server);
    assert.equal(la["2026-11-01T08:30Z"]!.split("|")[0], "2026-11-01 01:30 AM", `${server}: the second 1:30, in standard time`);
    assert.equal(la["2026-03-08T10:30Z"]!.split("|")[0], "2026-03-08 03:30 AM", `${server}: after the spring jump`);
  }
});

test("an impossible date is left as written, not rolled into the next month", () => {
  const z = probe("UTC")["UTC"]!["2027-02-30T10:00"]!;
  assert.ok(z.startsWith("2027-02-30T10:00|"), z);
  assert.ok(z.endsWith("|"), "time_tag renders nothing");
});

test("wallClockInstant: the instant is the site zone's, across daylight saving; minutes-west numbers work", () => {
  assert.equal(wallClockInstant("2027-01-16T10:00", "America/Los_Angeles")!.toISOString(), "2027-01-16T18:00:00.000Z");
  assert.equal(wallClockInstant("2027-07-16T10:00", "America/Los_Angeles")!.toISOString(), "2027-07-16T17:00:00.000Z");
  assert.equal(wallClockInstant("2027-01-16", "Asia/Kolkata")!.toISOString(), "2027-01-15T18:30:00.000Z");
  assert.equal(wallClockInstant("2027-01-16T10:00", 480)!.toISOString(), "2027-01-16T18:00:00.000Z");
  assert.equal(wallClockInstant("2027-01-16T10:00:00Z", "UTC"), null);
  assert.equal(wallClockInstant("not a date", "UTC"), null);
});
