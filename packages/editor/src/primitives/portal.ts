/**
 * Where overlays portal to: `document.body` unless a host provides another element with
 * `<PortalTarget value={el}>` (e.g. a shadow root or a styled container). Portalled surfaces
 * carry `OVERLAY_ROOT_CLASS` so editor styles scoped to `.pagehub-editor` still reach them.
 */
import { createContext, useContext } from "react";

export const OVERLAY_ROOT_CLASS = "pagehub-editor";

const PortalTargetContext = createContext<HTMLElement | null>(null);
export const PortalTarget = PortalTargetContext.Provider;

export function usePortalTarget(override?: HTMLElement | null): HTMLElement | null {
  const ctx = useContext(PortalTargetContext);
  if (override) return override;
  if (ctx) return ctx;
  return typeof document === "undefined" ? null : document.body;
}
