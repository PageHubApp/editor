/** Helpers for the examples' headless tests (`npx tsx --test examples/<name>/example.test.ts`). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createTestEditor, type TestEditor } from "@pagehub/engine/testing";
import { type Extension } from "@pagehub/engine";
import { createRendererFromConfiguration, type JsonValue, type Renderer } from "@pagehub/engine/render";

const TEXT = /\.(liquid|html?|json|css|js|svg|txt|md)$/;

/** Every site file under `root` as POSIX path → text, the way the file-system storage lists them. */
export function readSite(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (TEXT.test(name)) out[relative(root, full).split(sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}

export function openSite(files: Record<string, string>, opts: { extensions?: Extension; data?: Record<string, JsonValue>; role?: "client" | "viewer" } = {}): TestEditor {
  return createTestEditor({ files, extensions: opts.extensions, data: opts.data, role: opts.role });
}

/** A renderer over the editor's own configuration, reading the editor's current file texts. */
export function rendererOf(e: TestEditor, host?: Parameters<typeof createRendererFromConfiguration>[1]["host"]): Promise<Renderer> {
  return createRendererFromConfiguration(e.state.config, { files: (p) => e.state.files.get(p), host });
}

/** Lines removed and added between two texts, trimmed to the differing middle. */
export function changedLines(a: string, b: string): { removed: number; added: number } {
  const A = a.split("\n");
  const B = b.split("\n");
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let q = 0;
  while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  return { removed: A.length - p - q, added: B.length - p - q };
}

/** Error-level diagnostics across every file (what would block a save). */
export const errors = (e: TestEditor) => e.diagnostics.filter((d) => d.severity === "error");
