/**
 * The site palette read out of `theme.css` the way the canvas cascades it: custom properties in the
 * base scope are the light palette; those inside `@media (prefers-color-scheme: dark)`, a `.dark` /
 * `[data-theme="dark"]` selector, or the legacy `--color-dark-*` names are the dark palette (laid
 * over the light one). Later declarations win within a mode, `var(--x)` references are resolved
 * against the same mode, and a token declared only as `--<name>` still counts.
 *
 *   parseThemePalette(css, ["primary"]) → { light: Map { "primary" → "oklch(...)" }, dark: Map }
 */
export interface ThemePalette {
  light: Map<string, string>;
  dark: Map<string, string>;
}

const DARK_PRELUDE = /prefers-color-scheme\s*:\s*dark|\.dark\b|data-theme\s*=\s*["']?dark/i;

/** Every `{ prelude, body }` at one nesting level, with `body` kept raw so it can be recursed into. */
function blocks(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth++ === 0) open = i;
    } else if (c === "}") {
      if (--depth === 0) {
        out.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, i) });
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) start = i + 1;
  }
  return out;
}

type Vars = Map<string, string>;

function collect(css: string, dark: boolean, light: Vars, darkVars: Vars): void {
  for (const { prelude, body } of blocks(css)) {
    const inDark = dark || DARK_PRELUDE.test(prelude);
    if (body.includes("{")) collect(body, inDark, light, darkVars);
    const flat = body.replace(/\{[^{}]*\}/g, "");
    const target = inDark ? darkVars : light;
    const re = /(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi;
    for (let m = re.exec(flat); m; m = re.exec(flat)) target.set(m[1]!, m[2]!.trim());
  }
}

function resolve(value: string, vars: Vars, fallback: Vars, depth = 0): string {
  if (depth > 5) return value;
  return value.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]*))?\)/gi, (_m, name: string, dflt?: string) => {
    const v = vars.get(name) ?? fallback.get(name);
    return v ? resolve(v, vars, fallback, depth + 1) : (dflt ?? "").trim();
  });
}

/** The palette for `names` plus any extra `--color-*` token the site declares. */
export function parseThemePalette(css: string | undefined, names: readonly string[]): ThemePalette {
  const light: Vars = new Map();
  const darkOnly: Vars = new Map();
  if (css) collect(css, false, light, darkOnly);
  // Legacy `--color-dark-<name>` declarations are dark-palette entries.
  for (const [k, v] of [...light]) if (k.startsWith("--color-dark-")) (light.delete(k), darkOnly.set(`--color-${k.slice(13)}`, v));
  const dark: Vars = new Map([...light, ...darkOnly]);

  const pick = (vars: Vars, fallback: Vars): Map<string, string> => {
    const out = new Map<string, string>();
    const read = (name: string) => vars.get(`--color-${name}`) ?? vars.get(`--${name}`);
    for (const n of names) {
      const raw = read(n);
      if (raw) out.set(n, resolve(raw, vars, fallback));
    }
    for (const k of vars.keys()) {
      const m = /^--color-([a-z][a-z0-9-]*)$/.exec(k);
      if (m && !out.has(m[1]!) && !m[1]!.startsWith("dark-")) out.set(m[1]!, resolve(vars.get(k)!, vars, fallback));
    }
    return out;
  };
  return { light: pick(light, light), dark: pick(dark, light) };
}

/** Whether the canvas document is currently in its dark mode (class / attribute / system scheme). */
export function canvasIsDark(): boolean {
  const frame = typeof document === "undefined" ? null : document.querySelector<HTMLIFrameElement>("[data-canvas-frame]");
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;
  if (!doc || !win) return false;
  const root = doc.documentElement;
  if (root.matches(".dark, [data-theme='dark']")) return true;
  return win.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
