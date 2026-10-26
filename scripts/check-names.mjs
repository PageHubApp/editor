// Fails when a name that belongs to the PageHub SaaS (not to this open-source editor) leaks into the repo.
//
//   node scripts/check-names.mjs          # exit 1 and list every hit
//
// What stays on purpose (never flagged): the `ph-` class prefix and `data-ph-*` attributes, the runtime
// global `PageHub`, the `@pagehub/*` package scope, the `pagehub-editor` bin and product name, and the
// `text/x-pagehub-editor` clipboard type. Those are this project's own brand (docs/OSS-RESTRUCTURE-PLAN.md §8).
//
// A line that must name a forbidden string (this file, the test that asserts none ships) carries
// `names-check:allow`. Whole files that are allowed to name the host product are in ALLOW_FILES.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** [id, pattern, why] — each pattern is tested per line. */
export const RULES = [
  ["host-domain", /pagehub\.dev/i, "the SaaS domain: use example.com in tests and docs"],
  ["x-pagehub-key", /\bx-pagehub-(?!editor\b)/, "schema/extension keys are neutral (`x-liquid-expression`, `x-handle`)"],
  ["host-endpoint", /storefront-checkout|\/api\/stripe\b|\/api\/v1\/sites\b/, "no SaaS endpoint is hard-coded; hosts configure one"],
  ["stage-reference", /\bBUILD-PLAN\b|\bHANDOFF\b|\bS[0-4]\.\d{1,2}\b|\bDecision \d+\b/, "internal planning references mean nothing in a public source file"],
  ["ws-event", /\bph:(site|reload|chat)\b/, "events are `site:changed`, `site:reload`, `site:chat`"],
  ["private-path", /\/Users\/[a-z]/i, "a local machine path"],
  ["craft-name", /\bCraft(?:JS)?\b|\.craft\.tsx|@craftjs|packages\/sdk\b/, "the SaaS editor's internals"],
  ["craft-inspector-kind", /typeSpec\("[A-Z]|inspector: \{ type: "[A-Z]|inspectorTabs: \{ [A-Z]/, "inspector kinds are kebab-case (`text`, `form-control`, `map-pin`)"],
  ["host-product-voice", /PageHub(?:['’]s|\s+(?:SDK|dashboard|plugin|inspector))/, "write what the code does, not what the SaaS does"],
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".out", ".vite", ".vite-temp", "coverage"]);
const SKIP_FILES = new Set(["pnpm-lock.yaml", "parity-report.json", "parity-report.md"]);
const TEXT = /\.(?:ts|tsx|mts|mjs|js|css|html|json|md|liquid|yml|yaml|txt|svg)$/;
/** Files that may name the host product: the plan that explains it, legal notices, contact addresses. */
const ALLOW_FILES = new Set([
  "docs/OSS-RESTRUCTURE-PLAN.md",
  "NOTICE",
  "LICENSE",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "scripts/check-names.mjs",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (st.isFile() && !SKIP_FILES.has(name) && (TEXT.test(name) || name === "NOTICE")) yield p;
  }
}

export function checkNames(root = ROOT) {
  const hits = [];
  for (const file of walk(root)) {
    const rel = relative(root, file);
    if (ALLOW_FILES.has(rel) || /(^|\/)LICENSE(\.md)?$/.test(rel) || rel.startsWith("examples/imported-zip/input/site.zip")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("names-check:allow")) return;
      for (const [id, re, why] of RULES) if (re.test(line)) hits.push({ rel, line: i + 1, id, why, text: line.trim().slice(0, 140) });
    });
  }
  return hits;
}

if (process.argv[1] === import.meta.filename) {
  const hits = checkNames();
  for (const h of hits) console.error(`${h.rel}:${h.line}  [${h.id}] ${h.why}\n    ${h.text}`);
  if (hits.length) {
    console.error(`\n${hits.length} forbidden name(s). Fix them, or mark a deliberate one with "names-check:allow".`);
    process.exit(1);
  }
  console.log("names check ok");
}
