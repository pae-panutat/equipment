"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
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
import { formatBaht, formatDate, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { CountUp, SegmentBar } from "./charts";
import { LineChart, Tooltip, Treemap, useTip, type TreeItem } from "./bento";

export function DashboardView() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { data, error, loading, reload } = useApi<DashboardSummary>("/dashboard/summary", filters);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ภาพรวมทะเบียนอุปกรณ์</h1>
        <p className="mt-1 text-muted-foreground">จำนวนอุปกรณ์ สถานะ และงานบำรุงรักษาของส่วนงาน</p>
      </div>

      <Card className="p-4 sm:p-5">
        <FilterBar value={filters} onChange={setFilters} withDates />
        <p className="mt-3 text-xs text-muted-foreground">
          ช่วงวันที่ใช้กับ “งานเสร็จสิ้น” (ตามวันที่ทำจริง) และ “ค่าใช้จ่าย” เท่านั้น ส่วนจำนวนอุปกรณ์ สถานะ และงานใกล้ครบกำหนดเป็นข้อมูลปัจจุบัน
          {data && <> ณ วันที่ {formatDate(data.asOf)}</>}
        </p>
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <DashboardSkeleton />}
      {data && <Content data={data} filters={filters} />}
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

function Content({ data, filters }: { data: DashboardSummary; filters: Filters }) {
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
  const completedTotal = data.completedByMonth.reduce((a, m) => a + m.count, 0);
  const range = data.filters.from && data.filters.to ? `${formatDate(data.filters.from)} – ${formatDate(data.filters.to)}` : "";

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
        <div className="flex flex-1 flex-col gap-5 sm:flex-row">
          <div className="shrink-0">
            <div className="text-[13px] text-muted-foreground">งานบำรุงรักษาที่เสร็จสิ้น</div>
            <div className="tabular mt-2.5 text-[38px] font-bold leading-none sm:text-[44px]">
              <CountUp value={completedTotal} />
              <span className="ml-1.5 text-base font-normal text-muted-foreground">งาน</span>
            </div>
            <div className="mt-2 text-[13px] text-muted-foreground">นับตามวันที่ทำจริง · {range}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">ไม่มีข้อมูลเปรียบเทียบช่วงก่อนหน้า</div>
          </div>
          <LineChart series={months.map((m) => ({ label: m.label, value: m.count }))} caption="รายเดือน" unit="งานเสร็จสิ้น" tip={tip} />
        </div>
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

      <Card className="lg:col-span-7">
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

      <div className="grid gap-4 lg:col-span-5">
      <Card>
        <CardTitle>งานบำรุงรักษา</CardTitle>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="เกินกำหนด" value={<CountUp value={data.maintenance.overdue} />} tone={data.maintenance.overdue ? "bad" : undefined} />
          <Stat label={`ใกล้ครบ ${DUE_SOON_DAYS} วัน`} value={<CountUp value={data.maintenance.dueSoon} />} tone={data.maintenance.dueSoon ? "warn" : undefined} />
          <Stat label="ยังไม่มีแผน" value={<CountUp value={data.maintenance.noPlan} />} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">นับเป็นจำนวนอุปกรณ์ (1 ตัวนับครั้งเดียวแม้มีหลายแผน) ไม่นับอุปกรณ์ที่จำหน่ายออก</p>
      </Card>

      <Card>
        <Stat
          label="ค่าใช้จ่ายซ่อม/บำรุงรักษา"
          value={<CountUp value={data.cost.total} format={(n) => formatNumber(n)} />}
          note={
            <>
              บาท · งานที่เสร็จในช่วงที่เลือก ({formatNumber(data.cost.ordersWithCost)} งานที่ระบุค่าใช้จ่าย)
              {data.cost.ordersWithUnknownCost > 0 && (
                <span className="mt-1 flex items-start gap-1.5 text-warn">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {formatNumber(data.cost.ordersWithUnknownCost)} งานยังไม่ทราบค่าใช้จ่าย (ไม่ได้นับเป็น 0 บาท)
                </span>
              )}
            </>
          }
        />
        <p className="mt-3 text-xs text-muted-foreground">ยังไม่มีข้อมูลเปรียบเทียบช่วงก่อนหน้า</p>
      </Card>
      </div>

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
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((u) => (
                  <tr key={`${u.assetId}-${u.title}-${u.dueDate}`} className="border-t border-border">
                    <td className="py-2.5 pr-3">
                      <div className="font-bold">{u.assetCode}</div>
                      <div className="text-muted-foreground">{u.assetName}</div>
                    </td>
                    <td className="py-2.5 pr-3">{u.title}</td>
                    <td className="py-2.5 text-right">
                      <span className="tabular block">{formatDate(u.dueDate)}</span>
                      <span className={`text-xs font-bold ${u.overdue ? "text-bad" : "text-warn"}`}>{u.overdue ? "เกินกำหนด" : "ใกล้ครบกำหนด"}</span>
                    </td>
                  </tr>
                ))}
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
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0">
                  <b>{r.assetCode}</b> · {r.title}
                  <span className="ml-2 text-muted-foreground">
                    {WORK_ORDER_KIND_LABEL[r.kind]} · {WORK_ORDER_STATUS_LABEL[r.status]}
                  </span>
                </span>
                <span className="tabular text-muted-foreground">{formatDateTime(r.at)}</span>
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
