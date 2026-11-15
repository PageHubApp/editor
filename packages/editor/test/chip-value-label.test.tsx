import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BreakpointChipView } from "../src/features/toolbar/breakpoint-chip/BreakpointChipView.tsx";
import { chipValueLabel } from "../src/features/toolbar/breakpoint-chip/chipValueLabel.ts";
import { render } from "./harness.tsx";

describe("chip value labels", () => {
  it("spacing scale reads in px, arbitrary values unwrap, tokens read as words", () => {
    assert.equal(chipValueLabel("p-4"), "16px");
    assert.equal(chipValueLabel("gap-x-2"), "8px");
    assert.equal(chipValueLabel("p-[24px]"), "24px");
    assert.equal(chipValueLabel("gap-space-md"), "Medium");
    assert.equal(chipValueLabel("text-xl"), "Extra Large");
    assert.equal(chipValueLabel("hidden"), "Hidden");
  });

  it("the badge tooltip lists humanized values per screen size", () => {
    const r = render(
      <BreakpointChipView explicit={[{ bp: "mobile", value: "p-4" }, { bp: "md", value: "p-8" }]} activeBp="md" density="always" label="Padding" onToggle={() => {}} />,
    );
    const tip = r.get("[data-ph-bp-chip]").getAttribute("data-tooltip-content")!;
    assert.ok(tip.includes("16px") && tip.includes("32px") && !tip.includes("p-4"), tip);
    r.unmount();
  });
});
