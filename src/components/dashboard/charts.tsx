"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** Number that eases up to its value once (no motion when the user prefers reduced motion). */
export function CountUp({ value }: { value: number }) {
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || from.current === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{formatNumber(Math.round(shown))}</>;
}

/** A single bar split into segments (e.g. asset status), with a legend that carries the numbers. */
export function SegmentBar({ segments }: { segments: { label: string; value: number; dot: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => <div key={s.label} className={s.dot} style={{ width: `${(s.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-4 grid gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <i className={`size-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
              {s.label}
            </span>
            <b className="tabular">
              {formatNumber(s.value)}
              <span className="ml-1.5 font-normal text-muted-foreground">({total ? Math.round((s.value / total) * 100) : 0}%)</span>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
