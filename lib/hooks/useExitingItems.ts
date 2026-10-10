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
 * `items` must be referentially stable between renders (memoised), because
 * a new array identity is what tells the hook the list changed.
 */
export function useExitingItems<T>(items: T[], keyOf: (item: T) => string, ms = 320): RenderedItem<T>[] {
  const [prev, setPrev] = useState(items);
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([]);

  // Adjust state during render when the list changes (React's documented
  // pattern for deriving state from props): no extra frame without the row.
  if (items !== prev) {
    const live = new Set(items.map(keyOf));
    const now = Date.now();
    const removed: Ghost<T>[] = [];
    prev.forEach((item, index) => {
      const key = keyOf(item);
      if (!live.has(key)) removed.push({ key, item, index, since: now });
    });
    setPrev(items);
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
