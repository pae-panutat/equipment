"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Boxes, ChevronRight, Snowflake } from "lucide-react";
import { canEditAssets } from "@shared/index";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABEL,
  DUE_SOON_DAYS,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
  type DashboardSummary,
} from "@shared/index";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { STATUS_DOT } from "@/components/status-badge";
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { formatDate, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { useFresh } from "@/lib/use-fresh";
import { TONE } from "@/lib/due-tone";
import { cn } from "@/lib/utils";
import { NewBadge } from "@/components/ui/new-badge";
import { CountUp, StatusDonut } from "./charts";
import { LineChart, Tooltip, Treemap, useTip, type TreeItem } from "./bento";

export function DashboardView() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { data, error, loading, reload, liveTick } = useApi<DashboardSummary>("/dashboard/summary", filters, { live: true });
  const fresh = useFresh(useMemo(() => data?.recent.map((r) => r.id), [data]), liveTick); // new activity while the dashboard is open

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ภาพรวมทะเบียนอุปกรณ์</h1>
        <p className="mt-1 text-muted-foreground">จำนวนอุปกรณ์ สถานะ และงานบำรุงรักษาของส่วนงาน</p>
      </div>

      <Card className="filter-card p-4 sm:p-5">
        <FilterBar value={filters} onChange={setFilters} />
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <DashboardSkeleton />}
      {data && <Content data={data} filters={filters} fresh={fresh} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
      {["lg:col-span-5", "lg:col-span-7", "lg:col-span-7", "lg:col-span-5"].map((span, i) => (
        <Skeleton key={i} className={`h-64 rounded-[28px] ${span}`} />
      ))}
    </div>
  );
}

const PALETTE: { color: string; ink: "dark" | "light" }[] = [
  { color: "#8B3DFF", ink: "light" },
  { color: "#7CFF5B", ink: "dark" },
  { color: "#FFB800", ink: "dark" },
  { color: "#FF5A1F", ink: "dark" },
  { color: "#22D3EE", ink: "dark" },
  { color: "#FF3DA5", ink: "dark" },
];

function Content({ data, filters, fresh }: { data: DashboardSummary; filters: Filters; fresh: ReadonlySet<number> }) {
  const { user } = useAuth();
  const canRecord = user ? canEditAssets(user.role) : false; // only a Super Admin or Technician may record work (the server enforces it too)
  const tip = useTip();
  const acQuery = new URLSearchParams();
  if (filters.unitId) acQuery.set("unitId", filters.unitId);
  if (data.totals.airConditionerTypeId) acQuery.set("typeId", String(data.totals.airConditionerTypeId));
  const acLink = `/assets?${acQuery}`;

  if (data.totals.assets === 0) {
    return <EmptyState title="ไม่พบอุปกรณ์ตามตัวกรองนี้" hint="ลองล้างตัวกรองหรือเลือกส่วนงานอื่น" />;
  }

  const RING: Record<(typeof ASSET_STATUSES)[number], string> = {
    active: "stroke-green-400",
    faulty: "stroke-red-400",
    under_repair: "stroke-amber-400",
    inactive: "stroke-slate-400",
    disposed: "stroke-slate-400",
  };
  const statusSegments = ASSET_STATUSES.map((s) => ({
    label: ASSET_STATUS_LABEL[s],
    value: data.byStatus.find((x) => x.status === s)?.count ?? 0,
    dot: STATUS_DOT[s],
    stroke: RING[s],
  }));
  const months = data.completedByMonth.map((m) => ({ ...m, label: formatMonth(m.month) }));
  // pressing a type opens the register showing only that type (keeping the unit and status filters chosen above)
  const typeHref = (typeId: number) => {
    const q = new URLSearchParams({ typeId: String(typeId) });
    if (filters.unitId) q.set("unitId", filters.unitId);
    if (filters.status) q.set("status", filters.status);
    return `/assets?${q}`;
  };
  const treeItems: TreeItem[] = data.byType.map((t, i) => ({ name: t.name, value: t.count, href: typeHref(t.id), ...PALETTE[i % PALETTE.length] }));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="flex flex-col overflow-hidden p-0 sm:p-0 lg:col-span-5">
        {/* the headline numbers on a coloured band */}
        <div className="relative overflow-hidden bg-[image:var(--grad)] px-5 py-5 text-primary-foreground sm:px-6">
          <span className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-primary-foreground/10" aria-hidden="true" />
          <span className="pointer-events-none absolute -bottom-12 right-20 size-28 rounded-full bg-primary-foreground/10" aria-hidden="true" />
          <div className="relative grid grid-cols-2 gap-4">
            {[
              { icon: Boxes, label: "อุปกรณ์ทั้งหมด", value: data.totals.assets, note: "รายการ (1 ตัว = 1 รายการ)" },
              { icon: Snowflake, label: "เครื่องปรับอากาศ", value: data.totals.airConditioners, note: "ตัว ตามตัวกรองที่เลือก" },
            ].map((t) => (
              <div key={t.label} className="min-w-0">
                <span className="inline-flex items-center gap-2 text-sm opacity-90">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary-foreground/20">
                    <t.icon className="size-4" aria-hidden="true" />
                  </span>
                  {t.label}
                </span>
                <div className="tabular mt-2 text-[44px] font-bold leading-none tracking-[-0.02em]">
                  <CountUp value={t.value} />
                </div>
                <div className="mt-1.5 text-xs opacity-85">{t.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
          <CardTitle className="text-[15px]">สถานะอุปกรณ์</CardTitle>
          <StatusDonut segments={statusSegments} />
          <Link
            href={acLink}
            className="mt-auto inline-flex min-h-9 items-center justify-between gap-2 rounded-xl bg-primary-soft px-3.5 text-sm font-bold text-primary transition-colors hover:bg-muted"
          >
            ดูแอร์ในทะเบียนอุปกรณ์ <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>

      <Card className="flex flex-col lg:col-span-7">
        <CardTitle className="mb-3">งานบำรุงรักษาที่เสร็จสิ้น</CardTitle>
        <LineChart series={months.map((m) => ({ label: m.label, value: m.count }))} unit="งานเสร็จสิ้น" tip={tip} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
          <table className="mt-2 w-full text-left">
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1">{m.label}</td>
                  <td className="tabular py-1 text-right">{formatNumber(m.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card className="lg:col-span-12">
        <CardTitle>อุปกรณ์ตามประเภท</CardTitle>
        <Treemap items={treeItems} unit="รายการ" label="อุปกรณ์ตามประเภท" tip={tip} />
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 text-left font-normal">ประเภท</th>
              <th className="pb-2 text-right font-normal">รายการ</th>
              <th className="pb-2 text-right font-normal">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {data.byType.map((t, i) => (
              <tr key={t.id} className="border-t border-border">
                <td className="py-2.5">
                  <Link href={typeHref(t.id)} className="inline-flex items-center gap-2 hover:underline">
                    <i className="size-2.5 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length].color }} aria-hidden="true" />
                    {t.name}
                  </Link>
                </td>
                <td className="tabular py-2.5 text-right font-bold">{formatNumber(t.count)}</td>
                <td className="tabular py-2.5 text-right text-muted-foreground">{Math.round((t.count / data.totals.assets) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="lg:col-span-12">
        <CardTitle>รายการใกล้ครบกำหนดและเกินกำหนด</CardTitle>
        {data.upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="ไม่มีงานใกล้ครบกำหนด" hint={`ไม่มีแผนที่ครบกำหนดภายใน ${DUE_SOON_DAYS} วัน`} />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-2 font-normal">อุปกรณ์</th>
                  <th className="py-2 font-normal">งาน</th>
                  <th className="py-2 text-right font-normal">กำหนด</th>
                  <th className="w-8 py-2" aria-label="เปิด" />
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((u) => {
                  // the whole row is a link (every cell links to the same place; only the first one is a tab stop)
                  const href = canRecord ? `/assets/${u.assetId}?plan=${u.planId}` : `/assets/${u.assetId}`;
                  const cell = "block py-2.5";
                  return (
                    <tr key={`${u.planId}-${u.dueDate}`} className="border-t border-border transition-colors hover:bg-muted/50">
                      <td className="pr-3">
                        <Link href={href} className={cell} aria-label={`${canRecord ? "บันทึกงาน" : "ดูอุปกรณ์"} ${u.assetCode} ${u.title} กำหนด ${formatDate(u.dueDate)}`}>
                          <span className="block font-bold text-primary">{u.assetCode}</span>
                          <span className="block text-muted-foreground">{u.assetName}</span>
                        </Link>
                      </td>
                      <td className="pr-3">
                        <Link href={href} tabIndex={-1} aria-hidden="true" className={cell}>
                          {u.title}
                        </Link>
                      </td>
                      <td className="text-right">
                        <Link href={href} tabIndex={-1} aria-hidden="true" className={cell}>
                          <span className="tabular block">{formatDate(u.dueDate)}</span>
                          {(() => {
                            const days = Math.round((Date.parse(`${u.dueDate}T00:00:00Z`) - Date.parse(`${data.asOf}T00:00:00Z`)) / 86_400_000);
                            const tone = u.overdue ? TONE.overdue : TONE.soon;
                            return (
                              <span className={cn("mt-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", tone.chip)}>
                                <i className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
                                {u.overdue ? `เกินกำหนด ${Math.abs(days)} วัน` : days === 0 ? "ครบกำหนดวันนี้" : `ใกล้ครบกำหนด อีก ${days} วัน`}
                              </span>
                            );
                          })()}
                        </Link>
                      </td>
                      <td className="text-right">
                        <Link href={href} tabIndex={-1} aria-hidden="true" className={cell}>
                          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="lg:col-span-12">
        <CardTitle>กิจกรรมล่าสุด</CardTitle>
        {data.recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="ยังไม่มีกิจกรรม" />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.recent.map((r) => (
              <li key={r.id} className={fresh.has(r.id) ? "fresh rounded-lg" : undefined}>
                <Link
                  href={canRecord ? `/assets/${r.assetId}?job=${r.id}` : `/assets/${r.assetId}`}
                  className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted/50"
                  aria-label={`${canRecord ? "เปิดใบงาน" : "ดูอุปกรณ์"} ${r.assetCode} ${r.title}`}
                >
                  <span className="min-w-0">
                    <b className="text-primary">{r.assetCode}</b>
                    {fresh.has(r.id) && <NewBadge />} · {r.title}
                    <span className="ml-2 text-muted-foreground">
                      {WORK_ORDER_KIND_LABEL[r.kind]} · {WORK_ORDER_STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="tabular">{formatDateTime(r.at)}</span>
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Tooltip api={tip} />

      <p className="text-xs text-muted-foreground lg:col-span-12">
        {filters.unitId || filters.typeId || filters.status ? "แสดงเฉพาะอุปกรณ์ตามตัวกรองที่เลือก" : "แสดงทุกส่วนงาน"} · ข้อมูลทั้งหมดเป็นข้อมูลสมมติเพื่อทดสอบระบบ
      </p>
    </div>
  );
}
