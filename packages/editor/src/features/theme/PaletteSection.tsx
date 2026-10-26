/**
 * Palette section — the site colours, with a Light / Dark variant toggle.
 *
 * The Sun / Moon segmented toggle in the section header switches which palette the colour rows
 * edit. Light rows write `--color-<token>`; Dark rows write `--color-dark-<token>` (reflected on
 * the canvas live via the dark-preview flag, persisted under the dark scope). The first time the
 * Dark tab is opened with no dark colours yet, it is seeded from the light palette, then diverges
 * as the dark rows are edited.
 */
import { ThemeColorRow } from "./ThemeColorRow";
import { colorVar, DEFAULT_DARK_COLORS, PALETTE_TOKENS, type ThemeValues } from "./themeModel";
import { setPaletteEditMode, usePaletteEditMode } from "./themePreview";
import { Section } from "./parts";

interface Props {
  values: ThemeValues;
  setVar(name: string, value: string | null): void;
  setVars(entries: ReadonlyArray<readonly [string, string | null]>): void;
}

/** Tabler-style sun / moon marks, inlined so no icon registry edit is needed. */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M3 12h1M20 12h1M12 3v1M12 20v1M5.6 5.6l.7.7M17.7 17.7l.7.7M18.4 5.6l-.7.7M6.3 17.7l-.7.7" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}

export function PaletteSection({ values, setVar, setVars }: Props) {
  const mode = usePaletteEditMode();
  const colors = mode === "dark" ? values.darkColors : values.colors;

  const switchMode = (next: "light" | "dark") => {
    if (next === "dark" && !values.hasDarkPalette) {
      // Seed the dark palette from the current light overrides, falling back to the default dark
      // colours (DaisyUI's light defaults aren't in theme.css, so an undeclared token has no value
      // to copy); the dark rows then diverge as they are edited.
      setVars(PALETTE_TOKENS.map((t) => [colorVar(t.name, "dark"), values.colors[t.name] ?? DEFAULT_DARK_COLORS[t.name] ?? null]));
    }
    setPaletteEditMode(next);
  };

  const toggle = (
    <div className="border-base-300 bg-base-200 flex items-center rounded-md border p-0.5">
      <button
        type="button"
        onClick={() => switchMode("light")}
        aria-pressed={mode === "light"}
        aria-label="Light palette"
        className={`flex size-5 items-center justify-center rounded transition-colors ${mode === "light" ? "bg-base-100 text-base-content" : "text-base-content/50 hover:text-base-content"}`}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        onClick={() => switchMode("dark")}
        aria-pressed={mode === "dark"}
        aria-label="Dark palette"
        className={`flex size-5 items-center justify-center rounded transition-colors ${mode === "dark" ? "bg-base-100 text-base-content" : "text-base-content/50 hover:text-base-content"}`}
      >
        <MoonIcon />
      </button>
    </div>
  );

  return (
    <Section
      title="Palette"
      hint={mode === "dark" ? "Dark-mode colours. Shown when the site renders in dark mode." : "Site colours. Edits show on everything that uses the token."}
      right={toggle}
    >
      {PALETTE_TOKENS.map((t) => (
        <ThemeColorRow
          key={`${mode}-${t.name}`}
          name={t.name}
          label={t.label}
          value={colors[t.name] ?? null}
          onChange={(v) => setVar(colorVar(t.name, mode), v)}
        />
      ))}
    </Section>
  );
}
