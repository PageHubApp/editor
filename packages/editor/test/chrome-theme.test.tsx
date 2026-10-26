import "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { act, useState } from "react";
import { useChromeTheme, type ChromeTheme } from "../src/react/useChromeTheme.ts";
import { render } from "./harness.tsx";

function Probe({ explicit }: { explicit?: ChromeTheme }) {
  const [scope, setScope] = useState<HTMLElement | null>(null);
  const theme = useChromeTheme(scope, explicit);
  return <div ref={setScope} data-testid="scope" data-theme={theme} />;
}

describe("chrome theme", () => {
  it("an explicit prop wins over the host wrapper", () => {
    const r = render(
      <div data-theme="light">
        <Probe explicit="dark" />
      </div>,
    );
    assert.equal(r.get("[data-testid=scope]").getAttribute("data-theme"), "dark");
    r.unmount();
  });

  it("follows the host wrapper's data-theme, and its changes, not the OS", () => {
    const r = render(
      <div data-theme="light" data-testid="host">
        <Probe />
      </div>,
    );
    assert.equal(r.get("[data-testid=scope]").getAttribute("data-theme"), "light");
    return act(async () => {
      r.get("[data-testid=host]").setAttribute("data-theme", "dark");
      await new Promise((res) => setTimeout(res, 10));
    }).then(() => {
      assert.equal(r.get("[data-testid=scope]").getAttribute("data-theme"), "dark");
      r.unmount();
    });
  });

  it("the stylesheet keys the chrome palette on the scope's data-theme, never on `.dark` or `:root`", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    assert.match(css, /\[data-ph-editor-scope\]\[data-theme="dark"\]/);
    assert.doesNotMatch(css, /^\.dark\b/m);
    assert.doesNotMatch(css, /^:root\b/m);
    assert.doesNotMatch(css, /themes:\s*light --default/);
  });
});
