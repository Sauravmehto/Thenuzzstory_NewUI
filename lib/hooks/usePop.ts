import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Marks one item as "popping" for a moment, to replay a CSS animation only
 * when the user acts (not on page load for items that were already saved).
 */
export function usePop(durationMs = 500) {
  const [popping, setPopping] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pop = useCallback(
    (id: string) => {
      setPopping(id);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPopping(null), durationMs);
    },
    [durationMs],
  );
  return [popping, pop] as const;
}
