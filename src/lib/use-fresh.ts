"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_MS = 8000;

/**
 * Ids that just appeared in a list because of a live update (see useApi `liveTick`). A normal load, a page change or a
 * filter change never counts as "new": only rows that arrive while the person is already looking at the list.
 * They stay in the set for a few seconds so the row can blink and show a "new" tag.
 */
export function useFresh(ids: readonly number[] | undefined, liveTick: number): ReadonlySet<number> {
  const previous = useRef<Set<number> | null>(null);
  const lastTick = useRef(liveTick);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (!ids) return;
    const before = previous.current;
    if (before && liveTick !== lastTick.current) {
      const added = ids.filter((id) => !before.has(id));
      if (added.length) {
        setFresh((cur) => new Set([...cur, ...added]));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setFresh(new Set()), SHOW_MS);
      }
    }
    previous.current = new Set(ids);
    lastTick.current = liveTick;
  }, [ids, liveTick]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return fresh;
}
