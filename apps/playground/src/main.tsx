/**
 * The playground. `/api/info?site=` (served by `@pagehub/dev-server`) says whether a site resolves: then the
 * editor runs over that folder through the file API; otherwise it runs over the built-in sample
 * kept in localStorage. `?sample=1` forces the sample.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Store, StorageDef } from "@pagehub/engine";
import { Editor } from "@pagehub/editor";
import { htmlKit, liquidKit, tailwindKit } from "@pagehub/engine/kits";
import { devCanvasHost, httpStorage } from "@pagehub/dev-server/client";
import { EditorSkeleton, MediaManager } from "@pagehub/editor/components";
import { Spinner, useDelayedFlag } from "@pagehub/editor/primitives";
import { devDataSources } from "./dataSources.ts";
import { localSampleStorage, resetSample } from "./sample/localSampleStorage.ts";

// The dev knobs (?slow= ?fail= ?fixture=) exist only in the dev server's build of the app.
const knobs = import.meta.env.DEV ? await import("./dev/knobs.ts") : null;

interface Source {
  kind: "dir" | "sample";
  name: string;
  storage: StorageDef;
  /** Switchable sites under the server's sites root (dir mode only). `name` is the folder id
   *  (the `?site=` key); `label` is the human-readable display name. */
  sites: { name: string; label: string }[];
}

/** Resolve this tab's source. Only "no server API here" (404 / not JSON: static hosting) falls back to the sample; a server that errors or doesn't answer throws, so the app shows an error with Retry rather than silently opening a sample. */
async function detect(): Promise<Source> {
  const forceSample = new URLSearchParams(location.search).has("sample");
  if (!forceSample) {
    const res = await fetch(`/api/info?site=${encodeURIComponent(siteFromUrl() ?? "")}`, { signal: AbortSignal.timeout(20_000) }).catch((e: Error) => {
      throw new Error(e.name === "TimeoutError" ? "The server did not answer in time." : `Could not reach the server: ${e.message}`);
    });
    if (res.status >= 500) throw new Error(`The server failed to open the site (${res.status}).`);
    const info = res.ok ? ((await res.json().catch(() => null)) as { dir: string | null; name: string; sites?: { name: string; label?: string }[] } | null) : null;
    if (info?.dir) {
      // No (or unknown) site in the URL: the server picked its default — write it in so a reload keeps it.
      if (siteFromUrl() !== info.name) {
        const u = new URL(location.href);
        u.searchParams.set("site", info.name);
        history.replaceState(null, "", u);
      }
      return { kind: "dir", name: info.name, storage: httpStorage(), sites: (info.sites ?? []).map((s) => ({ name: s.name, label: s.label || s.name })) };
    }
  }
  return { kind: "sample", name: "Sample site (saved in this browser)", storage: localSampleStorage(), sites: [] };
}

const siteFromUrl = () => new URLSearchParams(location.search).get("site");

/** Switch THIS tab's site: update the URL (dropping the page) and reload. Other tabs are untouched. */
function openSite(name: string) {
  const u = new URL(location.href);
  u.searchParams.set("site", name);
  location.assign(u);
}

/** Shared box chrome so the ‹ / › steppers match the select's height and border exactly. */
const PICKER_CHROME = "bg-base-100 text-base-content rounded border border-base-300 px-1.5 py-0.5";

/**
 * Site switcher: ‹ prev, the native <select>, › next. A native select is the right primitive for a
 * dev-harness switcher — zero deps, free keyboard + type-ahead, OS-native, fine at this list size —
 * so we just flank it with steppers that walk the SAME sorted order the dropdown shows.
 */
function SitePicker({ source }: { source: Source }) {
  const idx = source.sites.findIndex((s) => s.name === source.name);
  // Switching is a full reload: lock the picker and show progress from the click until the new page takes over.
  const [target, setTarget] = useState<string | null>(null);
  const go = (name: string) => {
    setTarget(name);
    openSite(name);
  };
  const step = (delta: number) => {
    const next = source.sites[idx + delta];
    if (next) go(next.name);
  };
  const busy = target !== null;
  return (
    <div className="flex items-center gap-1" aria-busy={busy}>
      <button
        type="button"
        aria-label="Previous site"
        className={`${PICKER_CHROME} leading-none disabled:opacity-40 disabled:cursor-not-allowed`}
        disabled={busy || idx <= 0}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <select
        className={PICKER_CHROME}
        data-testid="site-picker"
        value={target ?? source.name}
        disabled={busy}
        onChange={(e) => go(e.target.value)}
      >
        {source.sites.map((s) => (
          <option key={s.name} value={s.name}>
            {s.label === s.name ? s.name : `${s.label} · ${s.name.slice(0, 8)}…`}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="Next site"
        className={`${PICKER_CHROME} leading-none disabled:opacity-40 disabled:cursor-not-allowed`}
        disabled={busy || idx < 0 || idx >= source.sites.length - 1}
        onClick={() => step(1)}
      >
        ›
      </button>
      {/* a fixed-size slot, so the spinner appearing never nudges the header */}
      <span className="inline-flex size-4 items-center justify-center">{busy && <Spinner label="Opening site" />}</span>
    </div>
  );
}

function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    setError(null);
    let live = true;
    detect().then(
      (s) => live && setSource(s),
      (e: Error) => live && setError(e.message),
    );
    return () => void (live = false);
  }, [attempt]);
  const waiting = useDelayedFlag(!source && !error);
  const core = useRef<Store | null>(null);
  // The dev server fills the canvas host; in the browser-only sample there is no server to ask.
  const canvasHost = useMemo(() => (source?.kind === "dir" ? devCanvasHost({ site: siteFromUrl(), files: (p) => core.current?.state.files.get(p) }) : undefined), [source?.kind]);
  const canvasRender = useMemo(() => knobs?.slowCanvasRender(() => core.current, canvasHost), [canvasHost]);
  const extensions = useMemo(() => [htmlKit(), tailwindKit(), liquidKit(), devDataSources(), knobs?.fixtureExtension() ?? []], []);
  if (!source) {
    // The whole editor shell as skeletons (after the loading delay); a failed lookup is an inline error with Retry.
    if (!error && !waiting) return null;
    return (
      <div className="flex h-full flex-col">
        <header className="bg-base-200 border-base-300 h-9 shrink-0 border-b" />
        <div className="min-h-0 flex-1">
          <EditorSkeleton error={error ? { message: error, retry: () => setAttempt((n) => n + 1) } : undefined} />
        </div>
      </div>
    );
  }
  const dark = document.documentElement.dataset.theme === "dark";
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    setSource({ ...source });
  };
  return (
    <div className="flex h-full flex-col">
      <header className="bg-base-200 text-base-content flex h-9 shrink-0 items-center gap-3 border-b border-base-300 px-3 text-xs">
        <strong>PageHub Editor</strong>
        {source.kind === "dir" && source.sites.length > 1 ? (
          <SitePicker source={source} />
        ) : (
          <span className="opacity-70" data-testid="source-name">{source.name}</span>
        )}
        <span className="flex-1" />
        {source.kind === "sample" && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true);
              resetSample();
              location.reload();
            }}
            onBlur={() => setConfirmReset(false)}
          >
            {confirmReset ? "Click again to discard your sample edits" : "Reset sample"}
          </button>
        )}
        <button type="button" className="underline" onClick={toggleTheme}>{dark ? "Light" : "Dark"} theme</button>
      </header>
      <div className="min-h-0 flex-1">
        <Editor storage={source.storage} extensions={extensions} canvasRender={canvasRender} canvasHost={canvasHost} onReady={(ed) => void (core.current = ed as unknown as Store)} components={{ DiffPreview: null, MediaManager }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

// The canvas loads the site runtime once per page; a runtime source edit needs a fresh page to re-run it.
import.meta.hot?.on("site:reload", (d: { kind: string }) => d.kind === "runtime" && location.reload());
