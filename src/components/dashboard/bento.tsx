"use client";

// Bento-style charts for the asset dashboard.
// Squarified treemap and floating tooltip. Thai labels, one font (LINE Seed), no fixed "up/green" deltas,
// and safe handling of empty / single / all-zero data.

import * as React from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";

/* ---------------- helpers ---------------- */

export function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export function useSize() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** a "nice" tick step (1, 2, 5 × 10^n) so axis labels are whole numbers */
export function niceStep(rawStep: number) {
  const step = Math.max(1, rawStep);
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= step) ?? step;
}

/* ---------------- tooltip ---------------- */

export type Tip = { title: string; rows: { label: string; value: string; color?: string }[] };
export type TipApi = { show: (x: number, y: number, t: Tip) => void; hide: () => void };
export type TipRef = { current: TipApi | null };

export function useTip() {
  return React.useRef<TipApi | null>(null) as TipRef;
}

export function Tooltip({ api }: { api: TipRef }) {
  const [tip, setTip] = React.useState<(Tip & { x: number; y: number }) | null>(null);
  const [pos, setPos] = React.useState({ l: 0, t: 0 });
  const box = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    api.current = { show: (x, y, t) => setTip({ ...t, x, y }), hide: () => setTip(null) };
    return () => {
      api.current = null;
    };
  }, [api]);
  React.useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const r = box.current.getBoundingClientRect();
    let l = tip.x + 14;
    let t = tip.y - r.height - 12;
    if (l + r.width > window.innerWidth - 8) l = tip.x - r.width - 14;
    if (t < 8) t = tip.y + 16;
    setPos({ l, t });
  }, [tip]);
  return (
    <div
      ref={box}
      role="tooltip"
      className={`pointer-events-none fixed z-50 whitespace-nowrap rounded-xl border border-border bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur-md transition-opacity duration-150 ${tip ? "opacity-100" : "opacity-0"}`}
      style={{ left: pos.l, top: pos.t }}
    >
      {tip && (
        <>
          <div className="mb-1 text-muted-foreground">{tip.title}</div>
          {tip.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {r.color && <i className="inline-block size-2 rounded-[2px]" style={{ background: r.color }} />}
                {r.label}
              </span>
              <b className="tabular font-bold">{r.value}</b>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- treemap ---------------- */

/** `href`: where pressing the tile goes (the list of that kind). */
export type TreeItem = { name: string; value: number; color: string; ink: "dark" | "light"; href?: string };
type Rect = TreeItem & { x: number; y: number; w: number; h: number };

function squarify(items: TreeItem[], x: number, y: number, w: number, h: number): Rect[] {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total <= 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const out: Rect[] = [];
  let rest = items.filter((i) => i.value > 0).map((i) => ({ ...i, a: i.value * scale }));
  const worst = (row: typeof rest, len: number) => {
    const s = row.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...row.map((r) => r.a));
    const mn = Math.min(...row.map((r) => r.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  while (rest.length) {
    const len = Math.min(w, h);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) row.push(rest[i++]);
    rest = rest.slice(i);
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  }
  return out;
}

export function Treemap({ items, unit, label, tip }: { items: TreeItem[]; unit: string; label: string; tip: TipRef }) {
  const [ref, { w: W, h: H }] = useSize();
  const [placed, setPlaced] = React.useState(false);
  React.useEffect(() => {
    if (!W) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setPlaced(true)));
    return () => cancelAnimationFrame(r);
  }, [W]);
  const G = 6;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const rects = W && H ? squarify(sorted, 0, 0, W + G, H + G) : [];
  return (
    <div ref={ref} className="relative mt-1.5 h-[300px] sm:h-[360px]" role="group" aria-label={`${label}: ${sorted.map((i) => `${i.name} ${i.value}`).join(", ")}`}>
      {rects.map((r) => {
        const w = r.w - G;
        const h = r.h - G;
        const share = total ? `${Math.round((r.value / total) * 1000) / 10}%` : "0%";
        const showName = h >= 56 && w >= 80;
        const showNum = h >= 40 && w >= 48;
        const ink = r.ink === "light" ? "text-white" : "text-neutral-950";
        return (
          <Tile
            key={r.name}
            href={r.href}
            aria-label={r.href ? `${r.name} ${formatNumber(r.value)} ${unit} — ดูรายการ` : undefined}
            className={`absolute flex flex-col justify-between overflow-hidden rounded-[14px] p-3 transition-[left,top,width,height,filter] duration-700 [transition-timing-function:cubic-bezier(.2,.9,.25,1)] hover:brightness-110 motion-reduce:transition-none ${r.href ? "cursor-pointer" : ""} ${ink}`}
            style={{ left: placed ? r.x : W / 2, top: placed ? r.y : H / 2, width: placed ? w : 0, height: placed ? h : 0, background: r.color }}
            onPointerMove={(e) => tip.current?.show(e.clientX, e.clientY, { title: label, rows: [{ label: r.name, value: `${formatNumber(r.value)} ${unit}`, color: r.color }, { label: "สัดส่วน", value: share }] })}
            onPointerLeave={() => tip.current?.hide()}
          >
            {showName && <div className="truncate text-[15px] font-bold">{r.name}</div>}
            {showNum && (
              <div className="flex items-end justify-between gap-1.5">
                <span className="tabular font-bold leading-none tracking-[-0.03em]" style={{ fontSize: Math.max(18, Math.min(60, h - (showName ? 52 : 24), w * 0.4)) }}>{formatNumber(r.value)}</span>
                {w >= 110 && <span className="rounded-md bg-black/75 px-2 py-1 text-[13px] font-bold text-white">{share}</span>}
              </div>
            )}
          </Tile>
        );
      })}
    </div>
  );
}

/** One tile of the treemap: a link when it has somewhere to go, otherwise a plain box. */
function Tile({ href, children, ...rest }: { href?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return href ? (
    <Link href={href} {...(rest as React.HTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </Link>
  ) : (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  );
}
