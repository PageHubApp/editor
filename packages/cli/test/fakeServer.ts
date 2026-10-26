/** An in-memory PageHub files API for the sync tests: the same answers the real routes give, none of the network. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Client, FileChange, FileListing, PageRequest, RemotePage, SaveResult } from "../src/remote/client";
import { hashText } from "../src/remote/paths";

export const BAD = "{% bad %}";

export class FakeServer implements Client {
  baseUrl = "http://fake.test";
  files = new Map<string, string>();
  pages: RemotePage[] = [];
  version = 1;
  bulk = true;
  /** What the server does to text it stores (its sanitizer / formatter). */
  normalize: (text: string) => string = (t) => t;
  /** Every batch the server was sent. */
  saves: Array<{ changes: readonly FileChange[]; baseVersions: Record<string, string | null>; pages: readonly PageRequest[] }> = [];
  deletedPages: string[] = [];
  reads = 0;

  constructor(files: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(files)) this.files.set(p, t);
  }

  edit(path: string, text: string) {
    this.files.set(path, text);
    this.version++;
  }

  async listFiles(): Promise<FileListing> {
    const paths = [...this.files.keys()].sort();
    return { paths, versions: Object.fromEntries(paths.map((p) => [p, hashText(this.files.get(p)!)])), version: this.version };
  }

  async readFile(_siteId: string, path: string) {
    this.reads++;
    const text = this.files.get(path);
    return text === undefined ? null : { text, version: hashText(text) };
  }

  async readFiles(siteId: string, paths: readonly string[]) {
    const out: Record<string, { text: string; version: string }> = {};
    for (const p of paths) out[p] = (await this.readFile(siteId, p))!;
    return out;
  }

  async supportsBulk() {
    return this.bulk;
  }

  async saveBatch(_siteId: string, changes: readonly FileChange[], baseVersions: Record<string, string | null>, pages: readonly PageRequest[] = []): Promise<SaveResult> {
    this.saves.push({ changes, baseVersions, pages });
    const stale = changes.filter((c) => (baseVersions[c.path] ?? null) !== (this.files.has(c.path) ? hashText(this.files.get(c.path)!) : null));
    if (stale.length) {
      return { kind: "conflict", conflicts: stale.map((c) => ({ path: c.path, theirs: this.files.get(c.path) ?? "", version: this.files.has(c.path) ? hashText(this.files.get(c.path)!) : "" })) };
    }
    for (const c of changes) {
      if ("text" in c && c.text.includes(BAD)) {
        return { kind: "lint", path: c.path, message: `${c.path}: unknown tag bad`, issues: [{ rule: "unknown-tag", message: "Unknown tag `bad`", range: { start: c.text.indexOf(BAD), end: c.text.indexOf(BAD) + BAD.length } }] };
      }
      if ("text" in c && c.text.includes("data-edit-lock-broken")) return { kind: "rejected", status: 403, message: `${c.path}: removes a locked element` };
    }
    const versions: Record<string, string> = {};
    for (const c of changes) {
      if ("delete" in c) this.files.delete(c.path);
      else {
        const stored = this.normalize(c.text);
        this.files.set(c.path, stored);
        versions[c.path] = hashText(stored);
      }
    }
    const created: RemotePage[] = pages.map((p) => {
      const route = p.path.replace(/^pages\//, "").replace(/\.liquid$/, "").replace(/\[(\w+)\]/g, ":$1");
      const page: RemotePage = { pageId: route.replace(/[^a-z0-9]/gi, "_"), name: p.name ?? route, slug: route.split("/")[0]!, file: p.path, url: `/${route}`, isHomePage: false, is404Page: false, isHidden: false, pathPattern: null };
      this.pages.push(page);
      return page;
    });
    this.version++;
    return { kind: "ok", versions, version: this.version, advisories: [], pages: created };
  }

  async listPages() {
    return this.pages;
  }

  async deletePage(_siteId: string, pageId: string) {
    const page = this.pages.find((p) => p.pageId === pageId)!;
    this.deletedPages.push(pageId);
    this.files.delete(page.file!);
    this.pages = this.pages.filter((p) => p !== page);
    this.version++;
    return { kind: "ok" as const, page };
  }

  async countSites() {
    return 1;
  }
}

/** A page record for a file the fake server already has. */
export function pageRow(file: string, extra: Partial<RemotePage> = {}): RemotePage {
  const route = file.replace(/^pages\//, "").replace(/\.liquid$/, "").replace(/\[(\w+)\]/g, ":$1");
  const home = route === "index";
  return { pageId: route.replace(/[^a-z0-9]/gi, "_"), name: route, slug: home ? "" : route, file, url: home ? "/" : `/${route}`, isHomePage: home, is404Page: false, isHidden: false, pathPattern: null, ...extra };
}

export function tempDir(prefix = "cli-sync-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** Collects what a command prints. */
export function sink() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, log: (l: string) => void out.push(l), error: (l: string) => void err.push(l), text: () => [...out, ...err].join("\n") };
}
