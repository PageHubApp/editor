import { Component, type ReactNode } from "react";

/**
 * Catches a render-time throw (e.g. `useOpenEditor` rethrowing an open failure) and shows `fallback(error, retry)`; `retry` remounts the children.
 * The wrapper's `display: contents` is inline, not the `contents` utility: `<Editor>` puts this boundary OUTSIDE its
 * `[data-ph-editor-scope]`, where the editor's scoped utilities never apply, so a class would leave a block box that
 * cuts the editor's `h-full` chain.
 */
export class ErrorBoundary extends Component<{ fallback(error: Error, retry: () => void): ReactNode; children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : <div key={this.state.attempt} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}
