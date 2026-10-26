// Tabler outline paths (MIT, https://tabler.io/icons), inlined for inspector control glyphs
// (align, direction, box-model, distribution); no runtime icon-library dependency.
const PATHS = {
  TbBoxAlignTop: ["M4 10.005h16v-5a1 1 0 0 0 -1 -1h-14a1 1 0 0 0 -1 1v5", "M4 15.005v-.01", "M4 20.005v-.01", "M9 20.005v-.01", "M15 20.005v-.01", "M20 20.005v-.01", "M20 15.005v-.01"],
  TbBoxAlignBottom: ["M4 14h16v5a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-5", "M4 9v.01", "M4 4v.01", "M9 4v.01", "M15 4v.01", "M20 4v.01", "M20 9v.01"],
  TbBoxAlignLeft: ["M10.002 20.003v-16h-5a1 1 0 0 0 -1 1v14a1 1 0 0 0 1 1h5", "M15.002 20.003h-.01", "M20.003 20.003h-.011", "M20.003 15.002h-.011", "M20.003 9.002h-.011", "M20.003 4.002h-.011", "M15.002 4.002h-.01"],
  TbBoxAlignRight: ["M13.998 20.003v-16h5a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-5", "M8.998 20.003h.01", "M3.997 20.003h.011", "M3.997 15.002h.011", "M3.997 9.002h.011", "M3.997 4.002h.011", "M8.998 4.002h.01"],
  TbLayoutAlignTop: ["M4 4l16 0", "M9 10a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -8"],
  TbLayoutAlignMiddle: ["M4 12l5 0", "M15 12l5 0", "M9 8a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -8"],
  TbLayoutAlignBottom: ["M4 20l16 0", "M9 6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -8"],
  TbLayoutAlignLeft: ["M4 4l0 16", "M8 11a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -2"],
  TbLayoutAlignCenter: ["M12 4l0 5", "M12 15l0 5", "M6 11a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -2"],
  TbLayoutAlignRight: ["M20 4l0 16", "M4 11a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -2"],
  TbBaseline: ["M4 20h16", "M8 16v-8a4 4 0 1 1 8 0v8", "M8 10h8"],
  TbAlignBoxCenterStretch: ["M3 19v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2", "M11 17h2", "M9 12h6", "M10 7h4"],
  TbLayoutDistributeHorizontal: ["M4 4l16 0", "M4 20l16 0", "M6 11a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -2"],
  TbSpaces: ["M6.045 9.777a6 6 0 1 0 5.951 .023", "M11.997 20.196a6 6 0 1 0 -2.948 -5.97", "M17.95 9.785q .05 -.386 .05 -.785a6 6 0 1 0 -3.056 5.23"],
  TbSpace: ["M4 10v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1 -1v-3"],
  TbSquare: ["M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"],
  TbAlignLeft: ["M4 6l16 0", "M4 12l10 0", "M4 18l14 0"],
  TbAlignCenter: ["M4 6l16 0", "M8 12l8 0", "M6 18l12 0"],
  TbAlignRight: ["M4 6l16 0", "M10 12l10 0", "M6 18l14 0"],
  TbAlignJustified: ["M4 6l16 0", "M4 12l16 0", "M4 18l12 0"],
  TbSpacingHorizontal: ["M20 20h-2a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h2", "M4 20h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2", "M12 8v8"],
  TbBoxPadding: ["M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12", "M8 16v.01", "M8 12v.01", "M8 8v.01", "M16 16v.01", "M16 12v.01", "M16 8v.01", "M12 8v.01", "M12 16v.01"],
  TbBorderInner: ["M4 12l16 0", "M12 4l0 16", "M4 4l0 .01", "M8 4l0 .01", "M16 4l0 .01", "M20 4l0 .01", "M4 8l0 .01", "M20 8l0 .01", "M4 16l0 .01", "M20 16l0 .01", "M4 20l0 .01", "M8 20l0 .01", "M16 20l0 .01", "M20 20l0 .01"],
  TbColumns: ["M4 6l5.5 0", "M4 10l5.5 0", "M4 14l5.5 0", "M4 18l5.5 0", "M14.5 6l5.5 0", "M14.5 10l5.5 0", "M14.5 14l5.5 0", "M14.5 18l5.5 0"],
  TbLayoutColumns: ["M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12", "M12 4l0 16"],
  TbLayoutRows: ["M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12", "M4 12l16 0"],
  TbStack2: ["M12 4l-8 4l8 4l8 -4l-8 -4", "M4 12l8 4l8 -4", "M4 16l8 4l8 -4"],
  TbLayoutGrid: ["M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4", "M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"],
} as const;

export type ControlIconName = keyof typeof PATHS;

/** One inspector-control glyph, drawn with the same stroke frame as `ui/primitives/icons`. */
export function ControlIcon({ name, className = "size-3.5 shrink-0" }: { name: ControlIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
