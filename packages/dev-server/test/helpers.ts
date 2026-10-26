import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as render from "@pagehub/engine/render";
import * as canvas from "@pagehub/engine/canvas";
import * as host from "@pagehub/engine/host";
import * as fs from "@pagehub/engine/fs";
import * as runtime from "@pagehub/site-runtime";
import { mergeEngine } from "../src/engine.ts";

export const engine = mergeEngine(render, canvas, host, fs, runtime);

/** A throwaway site folder holding `files`. */
export function tempSite(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dev-server-test-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
