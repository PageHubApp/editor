/**
 * `pagehub-editor open [folder|file]`: serve the editor over a local site folder and open the browser.
 * Today this starts the playground app's Vite server (the contributor path); the published CLI will serve the
 * prebuilt playground bundle through the dev-server's `createFileApi` instead, with no Vite.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface OpenOptions {
  target?: string;
  port?: number;
  host?: string;
  open: boolean;
}

export async function openEditor({ target, port, host, open }: OpenOptions): Promise<void> {
  let dir: string | undefined;
  if (target) {
    const abs = resolve(target);
    const s = await stat(abs).catch(() => null);
    if (!s) throw new Error(`No such file or folder: ${abs}`);
    dir = s.isDirectory() ? abs : dirname(abs);
  }
  // The playground's Vite config reads the folder to open from SITE_DIR.
  if (dir) process.env.SITE_DIR = dir;
  // The playground app is part of the repo checkout, not of the published package.
  const configFile = fileURLToPath(new URL("../../../apps/playground/vite.config.mjs", import.meta.url));
  if (!existsSync(configFile)) throw new Error("`open` needs the playground app, which is only in a clone of the repository for now (run `pnpm dev` there).");
  const { createServer } = await import("vite");
  const server = await createServer({ configFile, server: { port, host } });
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5050/";
  server.printUrls();
  if (!open) return;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(opener, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
