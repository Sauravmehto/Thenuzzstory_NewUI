"use client";

import { useEffect, useState } from "react";

interface Ghost<T> {
  key: string;
  item: T;
  index: number;
  since: number;
}

export interface RenderedItem<T> {
  item: T;
  key: string;
  exiting: boolean;
}

/**
 * Keeps removed list items on screen for `ms` so they can animate out,
 * instead of vanishing the instant the data changes. Removed items stay in
 * their old position, flagged `exiting`. If an item comes back (Undo) before
 * its exit finishes, the live copy simply takes over.
 *
 * Change detection is key-based, so it still works if upstream reuses array
 * references.
 */
export function useExitingItems<T>(items: T[], keyOf: (item: T) => string, ms = 320): RenderedItem<T>[] {
  const [prev, setPrev] = useState(items);
  const [prevSig, setPrevSig] = useState(() => items.map(keyOf).join("\u0001"));
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([]);
  const sig = items.map(keyOf).join("\u0001");

  // Adjust state during render when the list changes (React's documented
  // pattern for deriving state from props): no extra frame without the row.
  if (sig !== prevSig) {
    const live = new Set(items.map(keyOf));
    const now = Date.now();
    const removed: Ghost<T>[] = [];
    prev.forEach((item, index) => {
      const key = keyOf(item);
      if (!live.has(key)) removed.push({ key, item, index, since: now });
    });
    setPrev(items);
    setPrevSig(sig);
    setGhosts((current) => [
      ...current.filter((g) => !live.has(g.key) && !removed.some((r) => r.key === g.key)),
      ...removed,
    ]);
  }

  useEffect(() => {
    if (ghosts.length === 0) return;
    const oldest = Math.min(...ghosts.map((g) => g.since));
    const timer = window.setTimeout(
      () => setGhosts((current) => current.filter((g) => Date.now() - g.since < ms - 16)),
      Math.max(0, oldest + ms - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [ghosts, ms]);

  const rendered: RenderedItem<T>[] = items.map((item) => ({ item, key: keyOf(item), exiting: false }));
  const live = new Set(rendered.map((r) => r.key));
  for (const ghost of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (live.has(ghost.key)) continue;
    rendered.splice(Math.min(ghost.index, rendered.length), 0, { item: ghost.item, key: ghost.key, exiting: true });
  }
  return rendered;
}
