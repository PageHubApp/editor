/**
 * A real Tailwind build for ONE site: the site's own `tailwind.css` entry (else the default base, Tailwind +
 * DaisyUI) with `@source` pointed at the site folder, so the canvas gets exactly the classes the site uses: custom
 * tokens, responsive variants, `hidden`, … that the editor app's own CSS never contains. Imports resolve from this
 * package (`base`), so a site's `@plugin "daisyui"` finds the copy installed here. Runs in-process
 * (`@tailwindcss/node`), no temp files. Only the site folder is scanned: the compiler's own `@source`s, no
 * auto-detected root.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

const base = fileURLToPath(new URL(".", import.meta.url));

/** The entry a site gets when it has no `tailwind.css` of its own: Tailwind + DaisyUI, plus the layout rules for show-hide overlays and drawers. */
export const DEFAULT_SITE_TAILWIND_FILE = base + "site-tailwind.css";

export async function compileSiteCss(siteDir: string): Promise<string> {
  const own = resolve(siteDir, "tailwind.css");
  const entry = existsSync(own) ? readFileSync(own, "utf8") : readFileSync(DEFAULT_SITE_TAILWIND_FILE, "utf8");
  const compiler = await compile(`${entry}\n@source "${siteDir}";\n`, { base, onDependency() {} });
  const scanner = new Scanner({ sources: compiler.sources });
  return optimize(compiler.build(scanner.scan()), { minify: true }).code;
}
