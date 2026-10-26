// Rename the project in one pass. brand.json is the single source of the name;
// this rewrites every tracked text file that spells the old values, then brand.json.
//
//   node scripts/rename-brand.mjs --name acme-editor --display "Acme Editor" --scope @acme
//   node scripts/rename-brand.mjs --check   # fail if any package name drifts from brand.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const brandPath = path.join(root, 'brand.json');
const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]);
    return acc;
  }, []),
);

const pkgFiles = execFileSync('git', ['ls-files', 'package.json', 'packages/*/package.json'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);

if (args.check) {
  const bad = pkgFiles
    .map((f) => [f, JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')).name])
    .filter(([f, name]) => f !== 'package.json' && !name.startsWith(`${brand.npmScope}/`));
  if (bad.length) { console.error('Package names not under', brand.npmScope, bad); process.exit(1); }
  console.log('brand check ok:', brand.npmScope);
  process.exit(0);
}

const next = { name: args.name ?? brand.name, displayName: args.display ?? brand.displayName, npmScope: args.scope ?? brand.npmScope };
const pairs = [[brand.npmScope, next.npmScope], [brand.displayName, next.displayName], [brand.name, next.name]]
  .filter(([a, b]) => a !== b);
if (!pairs.length) { console.log('nothing to rename'); process.exit(0); }

const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => f && f !== 'brand.json' && f !== 'pnpm-lock.yaml' && /\.(md|json|ya?ml|ts|tsx|mjs|js|html|liquid|css)$/.test(f));
let changed = 0;
for (const f of files) {
  const p = path.join(root, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = pairs.reduce((s, [a, b]) => s.split(a).join(b), before);
  if (after !== before) { fs.writeFileSync(p, after); changed++; }
}
fs.writeFileSync(brandPath, JSON.stringify({ ...brand, ...next }, null, 2) + '\n');
console.log(`renamed in ${changed} files; run pnpm install to refresh the lockfile`);
