import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createWorkerHost, createWorkerRenderer, WorkerRenderError, type WorkerResponse } from "../src/runtime/worker.ts";

const entry = new URL("../src/runtime/worker.ts", import.meta.url);
const FILES = {
  "pages/a.liquid": `<p>{{ title }}</p>{% render 'card', n: 1 %}`,
  "partials/card.liquid": `<b>{{ n }}</b>`,
  "pages/f.liquid": `{{ "hi" | shout }}`,
  "pages/loop.liquid": `{% for i in (1..100000) %}{% for j in (1..100000) %}{{ i }}{% endfor %}{% endfor %}`,
  "pages/bad.liquid": `{{ "a" | nope }}`,
};
const start = (init: Parameters<typeof createWorkerRenderer>[2]) => {
  const w = new Worker(entry);
  return createWorkerRenderer(w, (h) => w.on("message", h), init).then((r) => ({ r, w }));
};

test("round trip through a node:worker_threads Worker: render, partial, extension, files update", async () => {
  const { r, w } = await start({ files: FILES, extensions: [new URL("./fixtures/workerExt.ts", import.meta.url).href] });
  try {
    assert.equal(await r.render("pages/a.liquid", { title: "<Hi>" }), "<p>&lt;Hi&gt;</p><b>1</b>");
    assert.equal(await r.render("pages/f.liquid", {}), "HI!");
    assert.equal(await r.render("pages/a.liquid", { title: "x" }, { overrides: { "partials/card.liquid": "OV" } }), "<p>x</p>OV");
    await r.setFiles({ ...FILES, "partials/card.liquid": `<i>{{ n }}</i>` });
    assert.equal(await r.render("pages/a.liquid", { title: "x" }), "<p>x</p><i>1</i>");
  } finally {
    r.terminate();
  }
  void w;
});

test("errors cross the boundary with their name; a timeout is a RenderTimeoutError; the worker survives", async () => {
  const { r } = await start({ files: FILES });
  try {
    await assert.rejects(r.render("pages/loop.liquid", {}, { timeoutMs: 30 }), (e: WorkerRenderError) => e.name === "RenderTimeoutError");
    await assert.rejects(r.render("pages/bad.liquid", {}), /undefined filter/);
    await assert.rejects(r.render("pages/missing.liquid", {}), /file not found/);
    assert.equal(await r.render("pages/a.liquid", { title: "ok" }), "<p>ok</p><b>1</b>");
  } finally {
    r.terminate();
  }
});

test("data must be structured-clone JSON: a function in data is rejected by postMessage, not run", async () => {
  const { r } = await start({ files: FILES });
  try {
    await assert.rejects(r.render("pages/a.liquid", { title: (() => "x") as never }));
  } finally {
    r.terminate();
  }
});

test("host protocol without a Worker: render before init is an error answer", async () => {
  const out: WorkerResponse[] = [];
  const host = createWorkerHost((r) => out.push(r));
  await host({ id: 1, type: "render", path: "x", data: {} });
  assert.equal(out[0]!.ok, false);
  await host({ id: 2, type: "init", files: { x: "{{ 1 }}" } });
  await host({ id: 3, type: "render", path: "x", data: {} });
  assert.deepEqual(out.slice(1), [{ id: 2, ok: true }, { id: 3, ok: true, html: "1" }]);
});
