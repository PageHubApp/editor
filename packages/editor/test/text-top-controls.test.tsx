/** TextTopControls: the "Edit with AI" button is a host-gated slot (aiChatFacet), never a dead button. */
import "./setup.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { defineCommand } from "@pagehub/engine";
import { aiChatFacet } from "../src/features/menus/aiChat.ts";
import { inspector, pageEditor, select } from "./inspectorFixture.tsx";
import type { Rendered } from "./harness.tsx";

const TEXT_PAGE = `<section class="p-4"><h1 class="text-xl">Hello</h1></section>`;

let open: Rendered[] = [];
afterEach(() => {
  for (const r of open) r.unmount();
  open = [];
});

describe("TextTopControls — Edit with AI is a host-gated slot", () => {
  it("no host AI (standalone/demo): Edit HTML shows, Edit with AI does not", () => {
    const e = pageEditor({ "index.liquid": TEXT_PAGE });
    const r = inspector(e);
    open.push(r);
    select(e, "h1");
    assert.ok(r.container.querySelector("[data-edit-html]"), "Edit HTML renders");
    assert.equal(r.container.querySelector("[data-edit-ai]"), null, "Edit with AI absent without a host AI command");
  });

  it("with a host AI command: Edit with AI renders and runs it with the selected element", async () => {
    const got: string[] = [];
    const cmd = defineCommand<{ at?: { tag: string } }>({ id: "host.aiInclude", title: "AI", run: (ctx, a) => (ctx.dispatch && got.push(a?.at?.tag ?? "?"), true) });
    const e = pageEditor({ "index.liquid": TEXT_PAGE }, [cmd, aiChatFacet.of("host.aiInclude")]);
    const r = inspector(e);
    open.push(r);
    select(e, "h1");
    const ai = r.get("[data-edit-ai]");
    assert.ok(ai, "Edit with AI renders when the host registers an AI command");
    await r.click(ai);
    assert.deepEqual(got, ["h1"], "clicking runs the host command with the selected element");
  });
});
