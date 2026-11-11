"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
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
import { Card, CardTitle, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui/card";
import { formatDate, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { useFresh } from "@/lib/use-fresh";
import { NewBadge } from "@/components/ui/new-badge";
import { CountUp, SegmentBar } from "./charts";
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

      <Card className="p-4 sm:p-5">
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
  { color: "#7B3FBF", ink: "light" },
  { color: "#F2C14E", ink: "dark" },
  { color: "#C77DFF", ink: "dark" },
  { color: "#FF7A45", ink: "dark" },
  { color: "#4FD1C5", ink: "dark" },
  { color: "#FF6FAE", ink: "dark" },
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

  const statusSegments = ASSET_STATUSES.map((s) => ({
    label: ASSET_STATUS_LABEL[s],
    value: data.byStatus.find((x) => x.status === s)?.count ?? 0,
    dot: STATUS_DOT[s],
  }));
  const months = data.completedByMonth.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const treeItems: TreeItem[] = data.byType.map((t, i) => ({ name: t.name, value: t.count, ...PALETTE[i % PALETTE.length] }));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="flex flex-col lg:col-span-5">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="อุปกรณ์ทั้งหมด" value={<CountUp value={data.totals.assets} />} note="รายการ (1 ตัว = 1 รายการ)" />
          <Stat label="เครื่องปรับอากาศ" value={<CountUp value={data.totals.airConditioners} />} note="ตัว ตามตัวกรองที่เลือก" />
        </div>
        <div className="mt-6">
          <CardTitle className="mb-3 text-[15px]">สถานะอุปกรณ์</CardTitle>
          <SegmentBar segments={statusSegments} />
        </div>
        <Link href={acLink} className="mt-auto inline-flex min-h-11 items-center gap-2 pt-5 text-[15px] font-bold text-primary hover:underline">
          ดูแอร์ในทะเบียนอุปกรณ์ <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
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
                  <span className="inline-flex items-center gap-2">
                    <i className="size-2.5 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length].color }} aria-hidden="true" />
                    {t.name}
                  </span>
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
                          <span className={`text-xs font-bold ${u.overdue ? "text-bad" : "text-warn"}`}>{u.overdue ? "เกินกำหนด" : "ใกล้ครบกำหนด"}</span>
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
