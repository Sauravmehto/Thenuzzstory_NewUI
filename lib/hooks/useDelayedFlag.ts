import { useEffect, useState } from "react";

/**
 * Returns true only once `active` has stayed true for `delayMs`.
 * Used for spinners: on a fast network the request finishes before the
 * delay, so the user never sees a flicker of loading UI.
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}
