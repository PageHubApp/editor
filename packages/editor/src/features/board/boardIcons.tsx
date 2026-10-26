/** The board's Tabler glyphs (MIT) that the shared icon set doesn't carry. */
const PATHS = {
  grip: "M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  focus: "M5 8v-2a2 2 0 0 1 2 -2h2M5 16v2a2 2 0 0 0 2 2h2M15 4h2a2 2 0 0 1 2 2v2M15 20h2a2 2 0 0 0 2 -2v-2M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  gridAdd: "M4 4h6v6h-6zM14 4h6v6h-6zM4 14h6v6h-6zM14 17h6M17 14v6",
  alignTop: "M4 4l16 0M8 9m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2zM14 9m0 2a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h0a2 2 0 0 1 -2 -2z",
  alignLeft: "M4 4l0 16M9 8m0 2a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2zM9 14m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z",
  textSize: "M3 7v-2h13v2M10 5v14M12 19h-4M15 13v-1h6v1M18 12v7M17 19h2",
  heading: "M7 12h10M7 5v14M17 5v14M15 19h4M15 5h4M5 19h4M5 5h4",
  boxModel: "M8 8h8v8h-8zM4 4h16v16h-16zM16 16l3.3 3.3M16 8l3.3 -3.3M8 8l-3.3 -3.3M8 16l-3.3 3.3",
  x: "M18 6l-12 12M6 6l12 12",
  minus: "M5 12l14 0",
  plus: "M12 5l0 14M5 12l14 0",
  chevronDown: "M6 9l6 6l6 -6",
} as const;

export type BoardIconName = keyof typeof PATHS;

export function BoardIcon({ name, className = "size-4" }: { name: BoardIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
