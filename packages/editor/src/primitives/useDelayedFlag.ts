import { useEffect, useState } from "react";

/** A loading UI that never flashes: shows only once a wait has lasted `ms`, hides the instant it ends. */
export const LOADING_DELAY_MS = 150;

export function useDelayedFlag(flag: boolean, ms: number = LOADING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return void setShown(false);
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [flag, ms]);
  return flag && shown;
}
