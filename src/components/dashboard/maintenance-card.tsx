"use client";

import * as React from "react";
import { WORK_ORDER_KIND_LABEL, type DashboardSummary, type WorkOrderKind } from "@shared/index";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMonth, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { niceStep, useReducedMotion, useSize, type TipRef } from "./bento";
import { CountText } from "./charts";

// Stacked from the bottom up in this order. Colours are the dashboard's own chart colours; red/green are kept for "late"/"fine" elsewhere.
const KIND_COLOR: Record<WorkOrderKind, string> = { planned: "var(--primary)", inspection: "#22D3EE", repair: "#FFB800" };
const STACK: WorkOrderKind[] = ["planned", "inspection", "repair"];

type Month = DashboardSummary["completedByMonth"][number];
type Stats = DashboardSummary["maintenanceStats"];

const shortMonth = new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "UTC" });
const monthShort = (ym: string) => shortMonth.format(new Date(`${ym}-01T00:00:00Z`));
const buddhistYear = (ym: string) => String(Number(ym.slice(0, 4)) + 543);

// One colour per figure, so the four read apart at a glance. Repairs uses the yellow of the repair bars below.
const KPI_VALUE = {
  violet: "text-primary",
  green: "text-emerald-700 dark:text-emerald-300",
  yellow: "text-amber-700 dark:text-amber-300",
  blue: "text-sky-700 dark:text-sky-300",
} as const;

// No boxes and no icon chips: a label in plain grey over a large figure, set in a ruled strip like a line in a report.
function Kpi({ tone, label, value, unit }: { tone: keyof typeof KPI_VALUE; label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-2 flex items-baseline gap-1.5 leading-none", KPI_VALUE[tone])}>
        <span className="text-[36px] font-bold tracking-[-0.03em]">
          <CountText text={value} />
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

/** The four headline figures of the chart's range. */
function Kpis({ stats }: { stats: Stats }) {
  const c = stats.current;
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-border">
      <Kpi tone="violet" label="งานที่เสร็จ" value={formatNumber(c.done)} unit="งาน" />
      <Kpi tone="green" label="ทำทันกำหนด" value={c.onTimePct === null ? "—" : String(c.onTimePct)} unit={c.onTimePct === null ? undefined : "%"} />
      <Kpi tone="yellow" label="งานซ่อม" value={formatNumber(c.repairs)} unit="งาน" />
      <Kpi tone="blue" label="ช้ากว่ากำหนดเฉลี่ย" value={c.avgLateDays === null ? "—" : formatNumber(c.avgLateDays)} unit={c.avgLateDays === null ? undefined : "วัน"} />
    </div>
  );
}

/** One card: the four figures, then jobs finished per month as stacked bars (by kind) with a line for the jobs that were due that month. */
export function MaintenanceCard({ months, stats, asOf, tip, className }: { months: Month[]; stats: Stats; asOf: string; tip: TipRef; className?: string }) {
  const thisMonth = asOf.slice(0, 7);
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>งานบำรุงรักษาที่เสร็จสิ้น</CardTitle>
        <p className="text-sm text-muted-foreground">แท่งคืองานที่เสร็จ เส้นประคืองานที่ครบกำหนด</p>
      </div>

      <Kpis stats={stats} />

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        {STACK.map((k) => (
          <span key={k} className="inline-flex items-center gap-2">
            <i className="size-3 rounded-[4px]" style={{ background: KIND_COLOR[k] }} aria-hidden="true" />
            {WORK_ORDER_KIND_LABEL[k]}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--foreground)" strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          ครบกำหนดในเดือนนั้น
        </span>
        {months.some((m) => m.month === thisMonth) && <span className="text-muted-foreground">เดือนนี้ยังไม่จบ (แท่งจาง)</span>}
      </div>

      <Bars months={months} thisMonth={thisMonth} tip={tip} />

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[420px] text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-1 font-normal">เดือน</th>
                {STACK.map((k) => (
                  <th key={k} className="pb-1 text-right font-normal">
                    {WORK_ORDER_KIND_LABEL[k]}
                  </th>
                ))}
                <th className="pb-1 text-right font-normal">รวม</th>
                <th className="pb-1 text-right font-normal">ครบกำหนด</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1">{formatMonth(m.month)}</td>
                  {STACK.map((k) => (
                    <td key={k} className="tabular py-1 text-right">
                      {formatNumber(m.byKind[k])}
                    </td>
                  ))}
                  <td className="tabular py-1 text-right font-bold">{formatNumber(m.count)}</td>
                  <td className="tabular py-1 text-right">{formatNumber(m.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function Bars({ months, thisMonth, tip }: { months: Month[]; thisMonth: string; tip: TipRef }) {
  const [ref, { w: W, h: H }] = useSize();
  const reduce = useReducedMotion();
  const [grown, setGrown] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!W) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(r);
  }, [W]);

  const n = months.length;
  const hi = Math.max(1, ...months.map((m) => Math.max(m.count, m.due)));
  const step = niceStep(hi / 4);
  const mx = Math.ceil((hi * 1.12) / step) * step || step;
  const top = 22, bot = 44, left = 34, right = 10;
  const plotW = Math.max(0, W - left - right);
  const slot = n ? plotW / n : 0;
  const bw = Math.max(6, Math.min(56, slot * 0.7));
  const Y = (v: number) => top + (1 - v / mx) * (H - top - bot);
  const cx = (i: number) => left + slot * i + slot / 2;
  const every = Math.max(1, Math.ceil(40 / Math.max(slot, 1))); // thin out the month names when the range is long
  const ticks: number[] = [];
  for (let v = 0; v <= mx + 1e-9; v += step) ticks.push(v);
  const duePath = months.map((m, i) => `${i ? "L" : "M"}${cx(i)},${Y(m.due)}`).join("");

  const show = (i: number, e: React.PointerEvent) => {
    const m = months[i];
    setHover(i);
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    tip.current?.show(r.left + cx(i), r.top + Y(Math.max(m.count, m.due)), {
      title: formatMonth(m.month) + (m.month === thisMonth ? " (ยังไม่จบเดือน)" : ""),
      rows: [
        ...STACK.map((k) => ({ label: WORK_ORDER_KIND_LABEL[k], value: formatNumber(m.byKind[k]), color: KIND_COLOR[k] })),
        { label: "รวมที่เสร็จ", value: formatNumber(m.count) },
        { label: "ครบกำหนดในเดือนนี้", value: formatNumber(m.due) },
      ],
    });
  };

  return (
    <div ref={ref} className="relative mt-3 min-h-[240px] flex-1 overflow-hidden sm:min-h-[280px]">
      {W > 0 && n > 0 && (
        <svg
          width={W}
          height={H}
          className="block"
          role="img"
          aria-label={`งานเสร็จต่อเดือน: ${months.map((m) => `${formatMonth(m.month)} ${m.count} งาน ครบกำหนด ${m.due}`).join(", ")}`}
          onPointerLeave={() => (setHover(null), tip.current?.hide())}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "3 4"} />
              <text x={left - 8} y={Y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
                {v}
              </text>
            </g>
          ))}

          {/* a faint band behind the month under the pointer */}
          {hover !== null && <rect x={left + slot * hover} y={top - 6} width={slot} height={H - top - bot + 6} rx={8} fill="var(--muted)" opacity={0.6} />}

          {months.map((m, i) => {
            const open = m.month === thisMonth;
            let acc = 0;
            return (
              <g key={m.month}>
                {STACK.map((k) => {
                  const v = m.byKind[k];
                  if (!v) return null;
                  const y0 = Y(acc), y1 = Y(acc + v);
                  acc += v;
                  return (
                    <rect
                      key={k}
                      x={cx(i) - bw / 2}
                      y={y1}
                      width={bw}
                      height={Math.max(0, y0 - y1 - 1.5)}
                      rx={3}
                      fill={KIND_COLOR[k]}
                      fillOpacity={open ? 0.4 : 1}
                      stroke={open ? KIND_COLOR[k] : undefined}
                      strokeWidth={open ? 1.5 : undefined}
                      strokeDasharray={open ? "4 3" : undefined}
                      style={reduce ? undefined : { transformBox: "fill-box", transformOrigin: "bottom", transform: grown ? "scaleY(1)" : "scaleY(0)", transition: `transform .55s cubic-bezier(.2,.8,.2,1) ${i * 25}ms` }}
                    />
                  );
                })}
                {m.count > 0 && bw >= 18 && (
                  <text x={cx(i)} y={Y(m.count) - 7} textAnchor="middle" className="fill-foreground text-[13px] font-bold">
                    {m.count}
                  </text>
                )}
                {i % every === 0 && (
                  <>
                    <text x={cx(i)} y={H - 24} textAnchor="middle" className={cn("text-[12px]", hover === i ? "fill-foreground font-bold" : "fill-muted-foreground")}>
                      {monthShort(m.month)}
                    </text>
                    {(i === 0 || m.month.endsWith("-01")) && (
                      <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                        {buddhistYear(m.month)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          <path d={duePath} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
          {months.map((m, i) => (
            <circle key={m.month} cx={cx(i)} cy={Y(m.due)} r={hover === i ? 5.5 : 4} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2} />
          ))}

          {/* one invisible column per month catches the pointer, so a thin bar is as easy to hit as a wide one */}
          {months.map((m, i) => (
            <rect key={`hit${m.month}`} x={left + slot * i} y={0} width={slot} height={H} fill="transparent" onPointerMove={(e) => show(i, e)} onPointerDown={(e) => show(i, e)} />
          ))}
        </svg>
      )}
    </div>
  );
}
