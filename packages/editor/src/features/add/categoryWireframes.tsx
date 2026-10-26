/**
 * The wireframe on each Blocks-home category card: a 320×180 sketch of what the category's
 * sections look like. A shape is `[x, y, w, h, colour, radius?, extra?]`. Every category the
 * block library ships has art (test/category-wireframes.test.tsx); an unknown one shows its name.
 */
import type { ReactNode, SVGProps } from "react";

const COLOR = {
  line: "var(--color-base-300, #e2e8f0)",
  block: "var(--color-base-100, #f1f5f9)",
  accent: "var(--color-primary, #3b82f6)",
  dark: "color-mix(in oklab, var(--color-base-content, #64748b) 55%, transparent)",
  white: "var(--color-base-100, #fff)",
} as const;

type Shape = [x: number, y: number, w: number, h: number, color: keyof typeof COLOR, rx?: number, extra?: SVGProps<SVGRectElement>];

const Art = ({ shapes, children }: { shapes: Shape[]; children?: ReactNode }) => (
  <svg viewBox="0 0 320 180" fill="none" className="h-full w-full" aria-hidden>
    {shapes.map(([x, y, w, h, c, rx = 2, extra], i) => (
      <rect key={i} x={x} y={y} width={w} height={h} rx={rx} fill={COLOR[c]} {...extra} />
    ))}
    {children}
  </svg>
);

const outline = (color: keyof typeof COLOR, width = 1): SVGProps<SVGRectElement> => ({ fill: "none", stroke: COLOR[color], strokeWidth: width });
const at = (xs: number[], make: (x: number, i: number) => Shape[]): Shape[] => xs.flatMap(make);

export const CATEGORY_WIREFRAMES: Record<string, ReactNode> = {
  "my-blocks": (
    <Art shapes={[
      [96, 50, 56, 42, "block", 6, { ...outline("dark", 1.5), strokeDasharray: "5 4", opacity: 0.55 }],
      [168, 50, 56, 42, "block", 6, { ...outline("dark", 1.5), strokeDasharray: "5 4", opacity: 0.55 }],
      [96, 102, 56, 42, "block", 6, { ...outline("dark", 1.5), strokeDasharray: "5 4", opacity: 0.55 }],
      [168, 102, 56, 42, "accent", 6, { opacity: 0.15, stroke: COLOR.accent, strokeWidth: 1.5, strokeDasharray: "5 4" }],
    ]} />
  ),
  hero: (
    <Art shapes={[
      [80, 30, 160, 10, "dark", 3], [60, 48, 200, 10, "dark", 3], [90, 70, 140, 6, "line"], [105, 82, 110, 6, "line"],
      [88, 102, 64, 22, "accent", 11], [162, 102, 64, 22, "dark", 11, outline("dark", 1.5)],
    ]} />
  ),
  features: (
    <Art shapes={at([40, 130, 220], (x) => [
      [x, 24, 28, 28, "accent", 8, { opacity: 0.2 }], [x + 6, 32, 16, 12, "accent"],
      [x - 4, 62, 68, 7, "dark"], [x - 4, 76, 68, 5, "line"], [x - 4, 86, 52, 5, "line"],
    ])} />
  ),
  content: (
    <Art
      shapes={[
        [24, 24, 130, 132, "block", 8], [174, 36, 50, 5, "accent"], [174, 52, 120, 8, "dark"], [174, 66, 100, 8, "dark"],
        [174, 86, 120, 5, "line"], [174, 96, 110, 5, "line"], [174, 106, 90, 5, "line"], [174, 124, 70, 20, "accent", 10],
      ]}
    >
      <polygon points="54,120 89,70 124,120" fill={COLOR.line} />
      <circle cx="70" cy="60" r="12" fill={COLOR.line} />
    </Art>
  ),
  cta: (
    <Art shapes={[
      [24, 24, 272, 132, "accent", 12, { opacity: 0.15 }], [80, 46, 160, 10, "dark", 3], [95, 64, 130, 6, "line"], [105, 76, 110, 6, "line"],
      [100, 100, 56, 22, "accent", 11], [164, 100, 56, 22, "dark", 11, outline("dark", 1.5)],
    ]} />
  ),
  testimonials: (
    <Art
      shapes={[
        [70, 64, 180, 6, "line"], [85, 78, 150, 6, "line"], [95, 92, 130, 6, "line"], [140, 110, 40, 2, "block", 1],
        [158, 126, 50, 6, "dark"], [158, 136, 36, 5, "line"],
      ]}
    >
      <text x="130" y="50" fontSize="48" fill={COLOR.line} fontFamily="Georgia">&ldquo;</text>
      <circle cx="140" cy="132" r="12" fill={COLOR.accent} opacity="0.2" />
    </Art>
  ),
  team: (
    <Art shapes={at([32, 122, 212], (x) => [
      [x, 20, 76, 140, "block", 8], [x, 20, 76, 70, "line", 8], [x, 82, 76, 8, "block", 0], [x + 12, 100, 52, 7, "dark"], [x + 18, 114, 40, 5, "line"],
    ])} />
  ),
  pricing: (
    <Art shapes={[
      [72, 10, 176, 8, "dark"], [96, 24, 128, 5, "line"],
      ...[28, 118, 208].flatMap((x, i): Shape[] => [
        [x, 40, 84, 128, "block", 8, { stroke: i === 1 ? COLOR.accent : COLOR.line, strokeWidth: i === 1 ? 2 : 1 }],
        [x + 24, 50, 36, 5, "dark"], [x + 12, 60, 60, 4, "line", 1], [x + 20, 72, 44, 10, "dark"], [x + 12, 88, 60, 3, "line", 1], [x + 12, 96, 56, 3, "line", 1], [x + 10, 118, 64, 16, "accent", 8],
      ]),
    ]} />
  ),
  newsletter: (
    <Art shapes={[
      [40, 28, 240, 10, "dark", 3], [56, 46, 208, 6, "line"], [72, 58, 176, 6, "line"], [40, 82, 240, 36, "white", 8, { stroke: COLOR.line }],
      [52, 94, 16, 12, "line"], [76, 97, 100, 6, "block"], [188, 82, 92, 36, "accent", 0], [210, 97, 48, 6, "white", 2, { opacity: 0.95 }],
    ]} />
  ),
  contact: (
    <Art shapes={[
      [60, 16, 200, 148, "block", 10], [80, 30, 50, 4, "accent"], [80, 40, 100, 8, "dark"],
      [80, 58, 160, 18, "white", 4, { stroke: COLOR.line }], [80, 82, 160, 18, "white", 4, { stroke: COLOR.line }], [80, 106, 160, 28, "white", 4, { stroke: COLOR.line }], [80, 140, 160, 18, "accent", 9],
    ]} />
  ),
  faq: (
    <Art shapes={at([24, 72, 120], (y) => [
      [40, y, 180, 7, "dark"], [40, y + 14, 240, 5, "line"], [40, y + 24, 200, 5, "line"], ...(y < 120 ? ([[40, y + 40, 240, 1, "block", 0]] as Shape[]) : []),
    ])} />
  ),
  commerce: (
    <Art shapes={[
      [90, 12, 140, 156, "block", 10], [90, 12, 140, 80, "line", 10], [90, 85, 140, 7, "block", 0], [106, 102, 80, 7, "dark"], [106, 116, 44, 7, "accent"], [106, 134, 108, 20, "accent", 10],
    ]} />
  ),
  "social-proof": (
    <Art shapes={[
      ...at([40, 132, 224], (x): Shape[] => [[x, 36, 56, 16, "dark", 3], [x, 58, 72, 6, "line"]]),
      [72, 108, 176, 8, "line"],
      ...at([88, 132, 176, 220], (x): Shape[] => [[x - 10, 132, 20, 20, "block", 10, { stroke: COLOR.line }]]),
    ]} />
  ),
  booking: (
    <Art shapes={[
      [24, 20, 170, 140, "block", 8], [36, 30, 70, 8, "dark"], [160, 30, 24, 8, "line"],
      ...at([38, 62, 86, 110, 134], (x): Shape[] => [[x, 50, 16, 5, "line"]]),
      ...[0, 1, 2, 3].flatMap((r): Shape[] => at([38, 62, 86, 110, 134, 158], (x, c): Shape[] => [[x, 66 + r * 22, 18, 16, r === 1 && c === 2 ? "accent" : "white", 4, { stroke: COLOR.line }]])),
      ...[0, 1, 2, 3].flatMap((i): Shape[] => [[210, 24 + i * 30, 86, 22, i === 1 ? "accent" : "white", 6, i === 1 ? { opacity: 0.9 } : { stroke: COLOR.line }]]),
      [214, 138, 78, 20, "dark", 10],
    ]} />
  ),
  interactive: (
    <Art shapes={[
      [24, 22, 272, 24, "block", 6], [24, 22, 90, 24, "accent", 6, { opacity: 0.2 }], [38, 31, 60, 6, "accent"], [128, 31, 50, 6, "line"], [200, 31, 50, 6, "line"],
      [24, 56, 272, 34, "white", 6, { stroke: COLOR.line }], [38, 66, 160, 6, "dark"], [38, 77, 220, 4, "line"],
      [24, 100, 272, 24, "white", 6, { stroke: COLOR.line }], [38, 109, 120, 6, "dark"], [270, 109, 14, 6, "line"],
      [24, 132, 272, 24, "white", 6, { stroke: COLOR.line }], [38, 141, 140, 6, "dark"], [270, 141, 14, 6, "line"],
    ]} />
  ),
  memberships: (
    <Art shapes={[
      [84, 10, 152, 8, "dark"],
      ...[32, 120, 208].flatMap((x, i): Shape[] => [
        [x, i === 1 ? 28 : 40, 80, i === 1 ? 140 : 116, "block", 8, { stroke: i === 1 ? COLOR.accent : COLOR.line, strokeWidth: i === 1 ? 2 : 1 }],
        [x + 26, (i === 1 ? 28 : 40) + 12, 28, 5, "dark"], [x + 20, (i === 1 ? 28 : 40) + 26, 40, 10, "dark"],
        [x + 12, (i === 1 ? 28 : 40) + 46, 56, 3, "line", 1], [x + 12, (i === 1 ? 28 : 40) + 56, 48, 3, "line", 1], [x + 12, (i === 1 ? 28 : 40) + 66, 52, 3, "line", 1],
        [x + 10, (i === 1 ? 28 : 40) + (i === 1 ? 108 : 86), 60, 16, i === 1 ? "accent" : "dark", 8, i === 1 ? undefined : outline("dark", 1.5)],
      ]),
      [140, 20, 40, 8, "accent", 4],
    ]} />
  ),
  stripe: (
    <Art shapes={[
      [24, 14, 130, 152, "block", 10], [24, 14, 130, 80, "line", 10], [24, 88, 130, 6, "block", 0], [38, 104, 80, 7, "dark"], [38, 118, 44, 7, "accent"], [38, 138, 102, 20, "accent", 10],
      [176, 24, 120, 10, "dark", 3], [176, 42, 90, 5, "line"],
      [176, 64, 120, 22, "white", 5, { stroke: COLOR.line }], [186, 72, 60, 6, "block"],
      [176, 94, 56, 22, "white", 5, { stroke: COLOR.line }], [240, 94, 56, 22, "white", 5, { stroke: COLOR.line }],
      [176, 128, 120, 26, "accent", 13],
    ]} />
  ),
  navigation: (
    <Art shapes={[
      [24, 24, 272, 36, "block", 6], [36, 34, 50, 8, "dark"], [196, 36, 28, 5, "line"], [232, 36, 28, 5, "line"], [268, 34, 18, 8, "accent"],
      [24, 100, 272, 60, "dark", 6], [120, 112, 80, 7, "block"], [100, 126, 120, 5, "line"], [128, 142, 24, 4, "line"], [158, 142, 24, 4, "line"],
    ]} />
  ),
};
