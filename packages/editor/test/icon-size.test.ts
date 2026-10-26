import "./setup.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iconSizeClasses, iconSizeToken } from "../src/features/inspector/controls/element/IconSizeControl.tsx";

// Class lists as the converter wrote them on Moss & Fern's icon spans.
const FEATURE = "text-primary inline-flex items-center justify-center w-6 h-6 box-content p-space-2xs rounded-full bg-secondary [&>svg]:w-full [&>svg]:h-full".split(" ");
const ROW = "text-primary inline-flex items-center justify-center w-5 h-5 shrink-0 mt-0.5 [&>svg]:w-full [&>svg]:h-full".split(" ");

describe("icon size", () => {
  it("reads the converter's w-N", () => {
    assert.equal(iconSizeToken(FEATURE), "w-6");
    assert.equal(iconSizeToken(ROW), "w-5");
    assert.equal(iconSizeToken(["size-8"]), "w-8");
    assert.equal(iconSizeToken(["text-primary"]), "");
  });

  it("writes the w-N h-N pair in place and keeps every other class", () => {
    const next = iconSizeClasses(FEATURE, "w-10");
    assert.deepEqual(next.filter((c) => /^(w|h)-/.test(c)), ["w-10", "h-10"]);
    assert.equal(next.join(" "), "text-primary inline-flex items-center justify-center box-content p-space-2xs rounded-full bg-secondary w-10 h-10 [&>svg]:w-full [&>svg]:h-full");
    assert.equal(iconSizeToken(next), "w-10");
  });

  it("drops a size-N and an arbitrary pair, and adds the fill classes when missing", () => {
    assert.equal(iconSizeClasses(["fill-current", "size-6"], "w-[30px]").join(" "), "fill-current w-[30px] h-[30px] [&>svg]:w-full [&>svg]:h-full");
  });

  it("clears the size", () => {
    assert.equal(iconSizeClasses(ROW, "").join(" "), "text-primary inline-flex items-center justify-center shrink-0 mt-0.5 [&>svg]:w-full [&>svg]:h-full");
  });
});
