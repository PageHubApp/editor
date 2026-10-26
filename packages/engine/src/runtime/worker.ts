/**
 * Worker entry hosting a renderer. Works as a Web Worker (the canvas) and as a
 * `node:worker_threads` Worker (tests, servers). Only structured-clone JSON crosses the boundary.
 *
 * Messages in:
 *   { id, type: "init",   files, extensions?, limits?, timezoneOffset? }   build the renderer
 *   { id, type: "files",  files }                                         replace the site files
 *   { id, type: "render", path, data, timeoutMs?, mode?, overrides? }     render one page
 * Every message is answered with { id, ok: true, html? } or { id, ok: false, error: { name, message } }.
 *
 * `extensions` are module specifiers (URLs) the worker imports; every exported `defineTag` /
 * `defineFilter` / `defineDataSource` value in them is installed. Code never travels in a message.
 *
 * The same file holds the main-thread client (`createWorkerRenderer`). Importing it does not start
 * a host; only running it as a worker entry does.
 */
import { createRenderer, type Renderer } from "./createRenderer";
import type { RenderLimits } from "../liquid/engine";
import type { RenderMode } from "./renderPage";

export interface WorkerInit {
  files: Record<string, string>;
  extensions?: string[];
  limits?: Partial<RenderLimits>;
  timezoneOffset?: number | string;
}

export type WorkerRequest =
  | ({ id: number; type: "init" } & WorkerInit)
  | { id: number; type: "files"; files: Record<string, string> }
  | { id: number; type: "render"; path: string; data: Record<string, unknown>; timeoutMs?: number; mode?: RenderMode; overrides?: Record<string, string> };

/** `Omit<…, "id">` applied to each member of the union (plain `Omit` collapses it to the shared keys). */
type DistributiveOmitId<T> = T extends unknown ? Omit<T, "id"> : never;

export type WorkerResponse = { id: number; ok: true; html?: string } | { id: number; ok: false; error: { name: string; message: string } };

const isRuntimeExtension = (v: unknown): boolean => !!v && typeof v === "object" && ["tag", "filter", "dataSource"].includes((v as { runtime?: string }).runtime ?? "");

/** The host: feed it messages, it answers through `post`. Exported so it can be driven without a Worker. */
export function createWorkerHost(post: (res: WorkerResponse) => void): (msg: WorkerRequest) => Promise<void> {
  let files: Record<string, string> = {};
  let renderer: Renderer | undefined;
  let init: WorkerInit | undefined;
  let extensions: unknown[] = [];

  const build = () => {
    renderer = createRenderer({ files: (p) => (Object.hasOwn(files, p) ? files[p] : undefined), extensions: extensions as never[], limits: init?.limits, timezoneOffset: init?.timezoneOffset });
  };

  return async (msg) => {
    try {
      if (msg.type === "init") {
        init = msg;
        files = { ...msg.files };
        extensions = [];
        for (const spec of msg.extensions ?? []) {
          const mod = (await import(spec)) as Record<string, unknown>;
          for (const v of Object.values(mod)) {
            if (Array.isArray(v)) extensions.push(...v.filter(isRuntimeExtension));
            else if (isRuntimeExtension(v)) extensions.push(v);
          }
        }
        build();
        post({ id: msg.id, ok: true });
      } else if (msg.type === "files") {
        files = { ...msg.files };
        post({ id: msg.id, ok: true });
      } else if (msg.type === "render") {
        if (!renderer) throw new Error("worker not initialised: send { type: 'init' } first");
        const html = await renderer.render(msg.path, msg.data, { timeoutMs: msg.timeoutMs, mode: msg.mode, overrides: msg.overrides });
        post({ id: msg.id, ok: true, html });
      } else {
        throw new Error(`unknown message type ${JSON.stringify((msg as { type?: unknown }).type)}`);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      post({ id: (msg as { id: number }).id, ok: false, error: { name: err.name, message: err.message } });
    }
  };
}

// ---- main-thread client -------------------------------------------------------------------

/** What both `Worker` classes (Web, `node:worker_threads`) share, adapted by `listen`. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  terminate(): unknown;
}

export class WorkerRenderError extends Error {
  constructor(readonly remoteName: string, message: string) {
    super(message);
    this.name = remoteName;
  }
}

export interface WorkerRenderer {
  render(path: string, data: Record<string, unknown>, opts?: { timeoutMs?: number; mode?: RenderMode; overrides?: Record<string, string> }): Promise<string>;
  setFiles(files: Record<string, string>): Promise<void>;
  terminate(): void;
}

/**
 * Wrap a Worker running this file. `listen` subscribes to the worker's responses:
 * `(h) => worker.on("message", h)` for Node, `(h) => worker.addEventListener("message", (e) => h(e.data))` for the web.
 * Resolves once the worker has built its renderer.
 */
export async function createWorkerRenderer(worker: WorkerLike, listen: (handler: (res: WorkerResponse) => void) => void, init: WorkerInit): Promise<WorkerRenderer> {
  let next = 0;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void }>();
  listen((res) => {
    pending.get(res.id)?.resolve(res);
    pending.delete(res.id);
  });
  const call = (msg: DistributiveOmitId<WorkerRequest>) =>
    new Promise<WorkerResponse>((resolve) => {
      const id = ++next;
      pending.set(id, { resolve });
      worker.postMessage({ ...msg, id } as WorkerRequest);
    }).then((res) => {
      if (!res.ok) throw new WorkerRenderError(res.error.name, res.error.message);
      return res;
    });
  await call({ type: "init", ...init });
  return {
    async render(path, data, opts = {}) {
      return (await call({ type: "render", path, data, ...opts })).html ?? "";
    },
    async setFiles(files) {
      await call({ type: "files", files });
    },
    terminate() {
      worker.terminate();
    },
  };
}

// ---- bootstrap: only when this file IS the worker -----------------------------------------

const scope = globalThis as unknown as { postMessage?: (m: unknown) => void; addEventListener?: (t: string, h: (e: { data: WorkerRequest }) => void) => void; WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope !== "undefined" && scope.postMessage && scope.addEventListener) {
  const host = createWorkerHost((r) => scope.postMessage!(r));
  scope.addEventListener("message", (e) => void host(e.data));
} else if (typeof process !== "undefined" && process.versions?.node) {
  const { isMainThread, parentPort } = await import("node:worker_threads");
  if (!isMainThread && parentPort) {
    const port = parentPort;
    const host = createWorkerHost((r) => port.postMessage(r));
    port.on("message", (m: WorkerRequest) => void host(m));
  }
}
