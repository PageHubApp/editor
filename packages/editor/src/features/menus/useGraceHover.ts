/** A hover-opened panel that survives the pointer crossing a gap: it closes 160ms after the pointer leaves. */
import { useCallback, useEffect, useRef, useState } from "react";

const SUBMENU_GRACE_MS = 160;

export function useGraceHover(delay = SUBMENU_GRACE_MS) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => void (timer.current !== undefined && clearTimeout(timer.current));
  useEffect(() => stop, []);
  const enter = useCallback(() => {
    stop();
    setOpen(true);
  }, []);
  const leave = useCallback(() => {
    stop();
    timer.current = setTimeout(() => setOpen(false), delay);
  }, [delay]);
  const close = useCallback(() => {
    stop();
    setOpen(false);
  }, []);
  return { open, enter, leave, close, toggle: () => (open ? close() : enter()) };
}
