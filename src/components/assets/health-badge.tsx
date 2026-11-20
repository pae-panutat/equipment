"use client";

import { useState } from "react";
import type { AssetHealth } from "@shared/index";

const LEVEL = {
  good: { label: "สุขภาพดี", stroke: "var(--ok)", text: "text-ok" },
  fair: { label: "พอใช้", stroke: "var(--primary)", text: "text-primary" },
  watch: { label: "ควรเฝ้าระวัง", stroke: "var(--warn)", text: "text-warn" },
  replace: { label: "ควรพิจารณาเปลี่ยน", stroke: "var(--bad)", text: "text-bad" },
} as const;

/** A ring showing the asset's health score (0-100); pressing it lists what lowered the score. */
export function HealthBadge({ health }: { health: AssetHealth }) {
  const [open, setOpen] = useState(false);
  const l = LEVEL[health.level];
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative ml-auto print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-2.5 rounded-2xl border border-border bg-card/70 py-1 pl-1.5 pr-3.5 text-left backdrop-blur hover:bg-muted"
      >
        <svg viewBox="0 0 52 52" className="size-10" role="img" aria-label={`คะแนนสุขภาพอุปกรณ์ ${health.score} จาก 100`}>
          <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" style={{ stroke: "var(--border)" }} />
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - health.score / 100)}
            style={{ stroke: l.stroke, transition: "stroke-dashoffset 1s cubic-bezier(.3,.8,.2,1)" }}
          />
          <text x="26" y="31" textAnchor="middle" fontSize="15" fontWeight="700" className="tabular fill-current">
            {health.score}
          </text>
        </svg>
        <span className="leading-tight">
          <span className={`block text-sm font-bold ${l.text}`}>{l.label}</span>
          <span className="block text-xs text-muted-foreground">คะแนนสุขภาพอุปกรณ์</span>
        </span>
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-1 rounded-2xl border border-border bg-popover p-3 text-sm shadow-xl">
          {health.factors.length === 0 && <li className="text-muted-foreground">ไม่มีปัจจัยที่ทำให้คะแนนลดลง</li>}
          {health.factors.map((f) => (
            <li key={f.label} className="flex justify-between gap-3">
              <span>{f.label}</span>
              <b className="tabular text-bad">{f.points}</b>
            </li>
          ))}
          <li className="mt-1 border-t border-border pt-1.5 text-xs text-muted-foreground">คะแนนเริ่มที่ 100 ใช้เป็นแนวทางประกอบการตัดสินใจ ไม่ใช่ค่าที่วัดจริงของเครื่อง</li>
        </ul>
      )}
    </div>
  );
}
