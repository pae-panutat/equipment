"use client";

// Bento-style charts for the asset dashboard.
// Smooth gradient line, squarified treemap and floating tooltip. Thai labels, one font (LINE Seed), no fixed "up/green" deltas,
// and safe handling of empty / single / all-zero data.

import * as React from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";

/* ---------------- helpers ---------------- */

function useReducedMotion() {
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

function useSize() {
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

/** smooth path through points (Catmull-Rom as cubic beziers) */
function smooth(P: [number, number][]) {
  const n = P.length;
  if (n < 2) return "";
  const g = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), k = 0.18;
    d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** a "nice" tick step (1, 2, 5 × 10^n) so axis labels are whole numbers */
function niceStep(rawStep: number) {
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

/* ---------------- line chart ---------------- */

export type LinePoint = { label: string; value: number };

export function LineChart({ series, caption, unit, tip }: { series: LinePoint[]; caption?: string; unit: string; tip: TipRef }) {
  const [ref, { w: W, h: H }] = useSize();
  const reduce = useReducedMotion();
  const [drawn, setDrawn] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);
  const id = React.useId().replace(/:/g, "");
  React.useEffect(() => {
    if (!W) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(r);
  }, [W]);

  const n = series.length;
  const vals = series.map((s) => s.value);
  const hi = Math.max(1, ...vals);
  const step = niceStep(hi / 3);
  const mx = Math.ceil((hi * 1.1) / step) * step || step;
  const top = 30, bot = 18, left = 14, right = 48;
  const Y = (v: number) => top + (1 - v / mx) * (H - top - bot);
  const X = (i: number) => (n === 1 ? left + (W - left - right) / 2 : left + (i / (n - 1)) * (W - left - right));
  const P = vals.map((v, i) => [X(i), Y(v)] as [number, number]);
  const d = W && n > 1 ? smooth(P) : "";
  const last = P[n - 1];
  const ticks: number[] = [];
  for (let v = 0; v <= mx + 1e-9; v += step) ticks.push(v);

  const move = (e: React.PointerEvent) => {
    if (!n) return;
    const r = (e.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - left) / (W - left - right)) * (n - 1))));
    setHover(i);
    tip.current?.show(r.left + P[i][0], r.top + P[i][1], { title: series[i].label, rows: [{ label: unit, value: formatNumber(vals[i]), color: "var(--primary)" }] });
  };

  return (
    <div ref={ref} className="relative min-h-[300px] flex-1 overflow-hidden rounded-[18px] border border-border bg-muted/40 sm:min-h-[340px]">
      {caption && <div className="pointer-events-none absolute left-3 top-2.5 text-[11px] text-muted-foreground">{caption}</div>}
      {W > 0 && n > 0 && (
        <svg width={W} height={H} className="block" role="img" aria-label={`${caption ?? unit}: ${series.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
          <defs>
            <linearGradient id={`${id}l`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.55 }} />
              <stop offset="1" style={{ stopColor: "var(--primary)" }} />
            </linearGradient>
            <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.22 }} />
              <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
            </linearGradient>
            {hover !== null && (
              <radialGradient id={`${id}s`} gradientUnits="userSpaceOnUse" cx={P[hover][0]} cy={P[hover][1]} r={240}>
                <stop offset="0" style={{ stopColor: "var(--card)", stopOpacity: 0 }} />
                <stop offset="0.6" style={{ stopColor: "var(--card)", stopOpacity: 0 }} />
                <stop offset="1" style={{ stopColor: "var(--card)", stopOpacity: 0.5 }} />
              </radialGradient>
            )}
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={W} y1={Y(v)} y2={Y(v)} className="stroke-border" strokeWidth={1} />
              <text x={W - 10} y={Y(v) - 5} textAnchor="end" fontSize={10} className="tabular fill-muted-foreground">
                {formatNumber(v)}
              </text>
            </g>
          ))}
          {n > 1 && <path d={`${d}L${last[0]},${H - bot}L${P[0][0]},${H - bot}Z`} fill={`url(#${id}a)`} />}
          {n > 1 && (
            <path
              d={d}
              pathLength={1}
              fill="none"
              stroke={`url(#${id}l)`}
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ strokeDasharray: 1, strokeDashoffset: drawn || reduce ? 0 : 1, transition: reduce ? "none" : "stroke-dashoffset 1.4s cubic-bezier(.3,.8,.2,1) .2s" }}
            />
          )}
          <circle cx={last[0]} cy={last[1]} r={4.5} style={{ fill: "var(--primary)" }} className="stroke-card" strokeWidth={2} />
          {hover !== null && <rect width={W} height={H} fill={`url(#${id}s)`} pointerEvents="none" />}
          {hover !== null && (
            <>
              <line x1={P[hover][0]} x2={P[hover][0]} y1={0} y2={H} className="stroke-muted-foreground/50" strokeWidth={1} />
              <circle cx={P[hover][0]} cy={P[hover][1]} r={6} style={{ fill: "var(--primary)" }} className="stroke-card" strokeWidth={2} />
            </>
          )}
          {[0, Math.floor((n - 1) / 2), n - 1]
            .filter((i, k, a) => a.indexOf(i) === k)
            .map((i) => (
              <text key={i} x={Math.min(Math.max(P[i][0], 40), W - 40)} y={H - 4} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
                {series[i].label}
              </text>
            ))}
          <rect width={W} height={H} fill="transparent" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.current?.hide(); }} />
        </svg>
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
