import { start } from "./core";
import { runStateAction } from "./state-action";
import { get, set } from "./state-store";

/** Lets a host re-run the runtime on a document it rewrote (the editing canvas writes its frame again on every render). */
(globalThis as { __siteRuntime?: { start: typeof start; state: { get: typeof get; set: typeof set; run: typeof runStateAction } } }).__siteRuntime = { start, state: { get, set, run: runStateAction } };
start();
