/** Shared bits of the parity scripts: paths, the state matrix, shot file naming. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const OUT = ROOT + "scripts/parity/.out/";
export const STATES_FILE = ROOT + "docs/s3-parity-states.json";

export async function loadStates(only) {
  const matrix = JSON.parse(await readFile(STATES_FILE, "utf8"));
  const ids = new Set();
  for (const s of matrix.states) {
    if (ids.has(s.id)) throw new Error(`duplicate state id ${s.id}`);
    ids.add(s.id);
  }
  const wanted = only?.length ? only : null;
  if (wanted) for (const id of wanted) if (!ids.has(id)) throw new Error(`unknown state ${id}`);
  return { ...matrix, states: matrix.states.filter((s) => !wanted || wanted.includes(s.id)) };
}

/** File stem of one shot: `<state>__<width>__<theme>`. */
export const shotName = (id, width, theme) => `${id}__${width}__${theme}`;

/** `--flag value` / `--flag=value` / bare `--flag` parser. */
export function parseArgs(argv, known) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`unexpected argument ${argv[i]}`);
    const [, key, inline] = m;
    if (!(key in known)) throw new Error(`unknown flag --${key} (known: ${Object.keys(known).map((k) => "--" + k).join(", ")})`);
    args[key] = known[key] === "bool" ? true : (inline ?? argv[++i]);
  }
  return args;
}

export const list = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : null);

/** Serve a folder of static files on a free local port. */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

export async function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    try {
      const file = resolve(dir, "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(resolve(dir))) throw new Error("outside");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

