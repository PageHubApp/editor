/**
 * The `CodeView` slot's CodeMirror 6 editor: HTML + Liquid (`@codemirror/lang-liquid`), CSS
 * or JavaScript; rule diagnostics drawn at their ranges (`@codemirror/lint`, pushed with
 * `setDiagnostics`, no lint source of its own); Liquid tag / filter / variable completions.
 * Same contract as the plain field it replaces: `value` in, every edit out through
 * `onChange`; a new `value` from outside replaces the text.
 *
 *   <CodeMirrorView value={src} onChange={setDraft} language="liquid" diagnostics={marks} onSave={apply} />
 */
import { useEffect, useRef } from "react";
import { autocompletion, type Completion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { liquid } from "@codemirror/lang-liquid";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder as placeholderExt } from "@codemirror/view";
import type { CodeViewProps } from "../../components";
import type { ViewDiagnostic } from "./viewDiagnostics";

export interface LiquidCompletions {
  tags?: readonly string[];
  filters?: readonly string[];
  variables?: readonly string[];
}

export type CodeMirrorViewProps = CodeViewProps & { readOnly?: boolean };

const asCompletions = (names: readonly string[] | undefined, type: string): Completion[] | undefined => names?.map((label) => ({ label, type }));

function languageOf(lang: CodeViewProps["language"], c: LiquidCompletions | undefined): Extension {
  if (lang === "css") return css();
  if (lang === "javascript" || lang === "js") return javascript();
  if (lang === "html") return html();
  return liquid({ tags: asCompletions(c?.tags, "keyword"), filters: asCompletions(c?.filters, "function"), variables: asCompletions(c?.variables, "variable") });
}

export function CodeMirrorView({ value, onChange, language = "liquid", placeholder, label, minHeight, maxHeight, diagnostics, completions, onSave, readOnly }: CodeMirrorViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const latest = useRef({ onChange, onSave });
  latest.current = { onChange, onSave };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          lintGutter(),
          // suggestions open as the author types a name (`{{ prod`), not only on Ctrl+Space
          autocompletion({ activateOnTyping: true, activateOnTypingDelay: 50 }),
          // the language extensions carry a parser but no colors; a HighlightStyle is what paints
          // the tokens, and soft-wrap keeps long lines from overflowing the narrow panel
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          lang.current.of(languageOf(language, completions)),
          keymap.of([{ key: "Mod-s", preventDefault: true, run: (ed) => (latest.current.onSave?.(ed.state.doc.toString()), true) }, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => u.docChanged && latest.current.onChange(u.state.doc.toString())),
          EditorView.contentAttributes.of({ "aria-label": label ?? `${language} code` }),
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(!!readOnly),
          placeholder ? placeholderExt(placeholder) : [],
          // colours come from the editor's theme tokens, so the gutter and text follow light / dark
          EditorView.theme({
            "&": { minHeight: minHeight ?? "160px", maxHeight: maxHeight ?? "none", color: "var(--color-base-content)", backgroundColor: "var(--color-base-100)" },
            ".cm-scroller": { overflow: "auto" },
            ".cm-gutters": { backgroundColor: "var(--color-base-200)", color: "color-mix(in oklab, var(--color-base-content) 55%, transparent)", border: "none" },
            ".cm-cursor": { borderLeftColor: "var(--color-base-content)" },
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // the view is built once; the effects below keep it in step
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  const completionKey = JSON.stringify(completions ?? null);
  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(languageOf(language, completions)) });
    // `completions` by content: a new object with the same names doesn't reconfigure
  }, [language, completionKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    const marks = (diagnostics ?? []).filter((d) => d.to <= len).map((d) => ({ from: d.from, to: d.to, severity: d.severity, message: d.message, source: d.rule }));
    v.dispatch(setDiagnostics(v.state, marks));
  }, [diagnostics, value]);

  return <div ref={host} data-slot="CodeView" data-code-view={language} className="border-base-300 bg-base-100 overflow-hidden rounded-md border text-xs" />;
}
