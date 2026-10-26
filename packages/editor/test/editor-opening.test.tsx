import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Editor } from "../src/index.ts";
import { render, type Rendered } from "./harness.tsx";

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
});

describe("editor opening from storage", () => {
  it("shows the shell skeleton on the first commit while files arrive, never nothing", () => {
    const storage = { load: () => new Promise(() => {}), save: async () => ({}) } as never;
    const r = render(<Editor storage={storage} />);
    open.push(r);
    assert.ok(r.container.querySelector("[data-editor-skeleton]"));
  });
});
