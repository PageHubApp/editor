/**
 * Dev-only network knob, loaded ONLY when `editorDevServer({ devKnobs: true })` (the playground does; the CLI never
 * does). `SLOW_MS=1500` / `FAIL=files,css` in the environment, or `?slow=1500&fail=css` on a request, delay or 500
 * the endpoints an editor waits on, so loading and error states can be seen. The playground forwards the editor
 * URL's params onto each request (`apps/playground/src/dev/knobs.ts`).
 */
import type { ServerResponse } from "node:http";
import { sendJson } from "./fileApi";

const ENDPOINTS: Array<[name: string, match: (path: string) => boolean]> = [
  ["info", (p) => p === "/api/info"],
  ["files", (p) => p === "/api/files"],
  ["file", (p) => p === "/api/file"],
  ["file", (p) => p === "/api/batch"],
  ["css", (p) => p === "/__site.css"],
  ["fonts", (p) => p.startsWith("/__fonts")],
];

/** Delay the request, and answer 500 when its endpoint is listed in `fail`. Returns true when it answered. */
export async function devNetworkKnob(url: URL, res: ServerResponse, env: Record<string, string | undefined>): Promise<boolean> {
  const hit = ENDPOINTS.find(([, match]) => match(url.pathname));
  if (!hit) return false;
  const ms = Number(url.searchParams.get("slow") ?? env.SLOW_MS) || 0;
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  const fail = (url.searchParams.get("fail") ?? env.FAIL ?? "").split(",");
  if (!fail.includes(hit[0])) return false;
  sendJson(res, 500, { error: `injected failure (${hit[0]})` });
  return true;
}
