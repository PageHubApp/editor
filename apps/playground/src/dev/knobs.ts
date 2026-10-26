/**
 * Dev-only knobs. Loaded by `main.tsx` only under `import.meta.env.DEV`, so a production build of the playground
 * never contains them. Open the editor with `?slow=1500` (ms of added latency) and/or `?fail=css,files` (endpoints
 * that answer 500: info, files, file, css, fonts) and every request to those endpoints carries the same params,
 * which the dev server honours (`editorDevServer({ devKnobs: true })`); `slow` also delays each canvas render
 * (`slowCanvasRender`). `?fixture=media` swaps in a media library whose loading and error states these params drive.
 * Without any of them this does nothing.
 */
import { type Extension, type Store } from "@pagehub/engine";
import { defaultCanvasRender, type CanvasHost, type CanvasRender } from "@pagehub/editor";
import { mediaFixture } from "../fixtures/media.ts";

const params = new URLSearchParams(location.search);
const knob = new URLSearchParams();
for (const k of ["slow", "fail"]) if (params.has(k)) knob.set(k, params.get(k)!);
const slowMs = Number(params.get("slow")) || 0;

if ([...knob].length) {
  const ENDPOINT = /^\/(api\/(info|files|file|batch)$|__site\.css$|__fonts)/;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || !ENDPOINT.test(url.pathname)) return real(input, init);
    for (const [k, v] of knob) url.searchParams.set(k, v);
    return real(typeof input === "string" || input instanceof URL ? url.href : new Request(url.href, input), init);
  };
}

/** With `?slow=<ms>`, each canvas render also waits that long (a data-bound page over a network would). `undefined` otherwise: the editor uses its own default renderer. */
export function slowCanvasRender(getStore: () => Store | null, host?: CanvasHost): CanvasRender | undefined {
  if (!slowMs) return undefined;
  let inner: CanvasRender | null = null;
  return async (state, path) => {
    await new Promise((r) => setTimeout(r, slowMs));
    inner ??= defaultCanvasRender(getStore()!, host);
    return inner(state, path);
  };
}

/** The fixture the URL asks for (`?fixture=media`), or nothing. */
export function fixtureExtension(): Extension | null {
  if (params.get("fixture") !== "media") return null;
  return mediaFixture({ delayMs: slowMs, failing: (params.get("fail") ?? "").split(",").includes("media") });
}
