import { useMemo, type HTMLAttributes } from "react";

/**
 * The `dangerouslySetInnerHTML` value for `html`, identical across renders while the string is unchanged.
 * React 19 resets an element's innerHTML whenever the prop object changes identity, so an inline
 * `{{ __html }}` rebuilds the children on every render. On anything under the pointer (hover and focus re-render
 * it) that swaps the node between mousedown and mouseup and the click is lost.
 *
 *   <span dangerouslySetInnerHTML={useStableHtml(svg)} />
 */
export function useStableHtml(html: string | null | undefined): { __html: string } {
  return useMemo(() => ({ __html: html ?? "" }), [html]);
}

/** A `<span>` of raw markup (an inline svg) with a stable `dangerouslySetInnerHTML`; for places a hook can't be called (inside a conditional). */
export function HtmlSpan({ html, ...rest }: { html: string | null | undefined } & Omit<HTMLAttributes<HTMLSpanElement>, "dangerouslySetInnerHTML" | "children">) {
  return <span {...rest} dangerouslySetInnerHTML={useStableHtml(html)} />;
}
