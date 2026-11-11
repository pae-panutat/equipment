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

/** A ring split by status, the total in the middle, and a legend that carries the numbers. */
export function StatusDonut({ segments }: { segments: { label: string; value: number; dot: string; stroke: string }[] }) {
  const reduce = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="relative size-36 shrink-0" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="13" style={{ stroke: "var(--muted)" }} />
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * C;
                const dash = Math.max(0, len - gap);
                const el = (
                  <circle
                    key={s.label}
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    strokeWidth="13"
                    strokeLinecap={gap ? "round" : "butt"}
                    className={s.stroke}
                    strokeDasharray={`${drawn || reduce ? dash : 0} ${C}`}
                    strokeDashoffset={-offset}
                    style={{ transition: reduce ? "none" : "stroke-dasharray 1s cubic-bezier(.3,.8,.2,1)" }}
                  />
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="tabular text-3xl font-bold leading-none">{formatNumber(total)}</span>
          <span className="mt-1 text-xs text-muted-foreground">รายการ</span>
        </div>
      </div>
      <ul className="grid min-w-[190px] flex-1 gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className={`flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-1.5 ${s.value === 0 ? "opacity-60" : ""}`}>
            <span className="inline-flex items-center gap-2">
              <i className={`size-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
              {s.label}
            </span>
            <span className="inline-flex items-center gap-2">
              <b className="tabular">{formatNumber(s.value)}</b>
              <span className="tabular w-10 text-right text-xs text-muted-foreground">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
