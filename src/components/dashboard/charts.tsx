"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

// A column is a tall strip of 0–9 repeated four times; a spin scrolls it up by whole turns and lands on the digit.
const STRIP = Array.from({ length: 40 }, (_, i) => i % 10).join("\n");
const ROW = 1.1; // line height of one digit, in em

/** One digit of a spinning number: scrolls up through the digits, blurred while it is moving fast, and settles on `d`. */
function SpinDigit({ d, delay }: { d: number; delay: number }) {
  const strip = useRef<HTMLSpanElement>(null);
  const shown = useRef(0); // the digit this column is resting on (a new column starts at 0, so a first load spins up from 0)
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const at = (row: number) => `translateY(${-row * ROW}em)`;
    const from = shown.current;
    if (from === d) {
      el.style.transform = at(d);
      return;
    }
    const turns = ((d - from + 10) % 10) + 20; // always forward, at least two full turns so it visibly whirs
    const end = from + turns;
    // Web Animations run from script, so the Windows "animation effects" switch (which only switches off CSS animation) does not stop them
    const anim = el.animate(
      [
        { transform: at(from), filter: "blur(0px)" },
        { transform: at(from + turns * 0.55), filter: "blur(2.6px)", offset: 0.3 },
        { transform: at(end), filter: "blur(0px)" },
      ],
      { duration: 900, delay, easing: "cubic-bezier(0.22, 0.75, 0.25, 1)", fill: "both" },
    );
    const rest = () => {
      el.style.transform = at(d);
      shown.current = d;
    };
    anim.onfinish = () => {
      rest();
      anim.cancel();
    };
    return () => {
      anim.onfinish = null;
      anim.cancel();
      rest();
    };
  }, [d, delay]);
  return (
    <span className="relative inline-block leading-[1.1] [clip-path:inset(0)]" aria-hidden="true">
      <span className="invisible">0</span>
      <span ref={strip} className="absolute inset-x-0 top-0 whitespace-pre text-center will-change-transform">
        {STRIP}
      </span>
    </span>
  );
}

/**
 * A number whose digits spin like a digital clock: when it first appears every digit whirs up from 0 and lands on its value, a little
 * after the one to its left; when the value changes later (a new filter) the digits that differ spin to their new value. Anything
 * that is not a digit (commas, a dot, a dash) stays put. Columns are keyed from the right end, so the ones digit keeps its column
 * when the number gets longer.
 */
export function CountText({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span className="inline-flex items-baseline" role="img" aria-label={text}>
      {chars.map((ch, i) =>
        /^[0-9]$/.test(ch) ? (
          <SpinDigit key={chars.length - i} d={Number(ch)} delay={i * 45} />
        ) : (
          <span key={chars.length - i} aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

/** A ring split by status, the total in the middle, and a legend that carries the numbers. */
export function StatusDonut({ segments }: { segments: { label: string; value: number; dot: string; stroke: string; href?: string }[] }) {
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="relative size-48 shrink-0 sm:size-56" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
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
          <span className="tabular text-5xl font-bold leading-none tracking-[-0.02em]">
            <CountText text={formatNumber(total)} />
          </span>
          <span className="mt-1.5 text-sm text-muted-foreground">รายการ</span>
        </div>
      </div>
      <ul className="grid w-full gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label}>
            {(() => {
              const body = (
                <>
                  <span className="inline-flex items-center gap-2">
                    <i className={`size-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <b className="tabular">{formatNumber(s.value)}</b>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">{total ? Math.round((s.value / total) * 100) : 0}%</span>
                  </span>
                </>
              );
              const row = "grow flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-1.5";
              // a status with something in it opens the register filtered to it; an empty one is not a link
              return s.href && s.value > 0 ? (
                <Link href={s.href} className={`${row} hover:bg-primary-soft hover:text-primary`}>{body}</Link>
              ) : (
                <div className={`${row} ${s.value === 0 ? "opacity-60" : ""}`}>{body}</div>
              );
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}
