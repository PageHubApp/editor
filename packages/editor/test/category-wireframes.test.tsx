import assert from "node:assert/strict";
import { test } from "node:test";

import { CATEGORY_WIREFRAMES } from "../src/features/add/categoryWireframes";

/** The categories the block library ships (GET /api/editor/sites/[id]/blocks), plus the caller's own blocks. A new one is added here and drawn. */
const LIBRARY_CATEGORIES = [
  "my-blocks", "booking", "commerce", "contact", "content", "cta", "faq", "features", "hero", "interactive", "memberships",
  "navigation", "newsletter", "pricing", "social-proof", "stripe", "team", "testimonials",
];

test("every block category has a wireframe, so no card falls back to its name", () => {
  const missing = LIBRARY_CATEGORIES.filter((id) => !CATEGORY_WIREFRAMES[id]);
  assert.deepEqual(missing, []);
});
