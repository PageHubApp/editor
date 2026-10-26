/**
 * The remote layout of a site folder: the paths PageHub stores, the content hash it versions them by, and a walk of a
 * local folder that finds the files `push` may send.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The paths a hosted site may hold. Mirrors `SOURCE_PATH_RE` in the app (`utils/htmlFirst/manifest.ts`); the server
 * is the authority, this only lets the CLI skip and explain a file before it is sent.
 */
export const SOURCE_PATH_RE =
  /^(pages\/[a-z0-9\-/[\]_]+\.liquid|partials\/[a-z0-9\-_]+\.liquid|sections\/[a-z0-9\-_]+\.liquid|theme\.css|site\.json|locales\/[a-z]{2}(-[A-Z]{2})?\.json|emails\/[a-z_]+\.(liquid|json)|assets\/[a-z0-9][a-z0-9\-_.]*\.js)$/;

/** A file larger than this is refused by the server's lint. */
export const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;

export const isSourcePath = (path: string): boolean => SOURCE_PATH_RE.test(path) && !path.includes("..") && !path.includes("//");

/** The folders whose files are all site files: a file there that fails `isSourcePath` is most likely a misnamed one. */
const SITE_ROOTS = ["pages/", "partials/", "sections/", "assets/", "locales/", "emails/"];
export const looksLikeSitePath = (path: string): boolean => SITE_ROOTS.some((r) => path.startsWith(r)) || path === "theme.css" || path === "site.json";

/** The version PageHub gives a file: sha256 (hex) of its UTF-8 text (`hashFile` in the app). */
export const hashText = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

export interface LocalWalk {
  /** POSIX paths (relative to the folder) of the files `push` may send. */
  files: string[];
  /** Files in a site folder (`pages/`, `partials/`, …) whose name the server would refuse. */
  misnamed: string[];
}

/** Every site file under `dir`. Dot-folders (`.pagehub`, `.git`) and `node_modules` are skipped. */
export function walkLocal(dir: string): LocalWalk {
  const files: string[] = [];
  const misnamed: string[] = [];
  const visit = (abs: string, rel: string) => {
    // A symlink is never followed: a repo can ship `pages/x.liquid -> ~/.aws/credentials`, and `push` would upload its target.
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const name = entry.name;
      if (name.startsWith(".") || name === "node_modules" || entry.isSymbolicLink()) continue;
      const full = join(abs, name);
      const path = rel ? `${rel}/${name}` : name;
      if (entry.isDirectory()) visit(full, path);
      else if (isSourcePath(path)) files.push(path);
      else if (looksLikeSitePath(path)) misnamed.push(path);
    }
  };
  visit(dir, "");
  return { files, misnamed };
}

/** 1-based line of a character offset. */
export const lineOfOffset = (text: string, offset: number): number => {
  let line = 1;
  const end = Math.min(Math.max(offset, 0), text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};
