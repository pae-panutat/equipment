"use client";

import { useMemo, useState } from "react";
import { CsvIcon, PdfIcon } from "@/components/ui/file-icons";
import { ASSET_STATUS_LABEL, WORK_ORDER_KINDS, WORK_ORDER_KIND_LABEL, type AssetStatus, type WorkOrderKind } from "@shared/index";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { Card, ErrorState, Skeleton } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { MonthPicker } from "@/components/ui/month-picker";
import { apiGet } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatMonth, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Summary = { from: string; to: string; generatedOn: string; rows: { month: string; unit: string; kind: WorkOrderKind; count: number }[] };
type Register = {
  generatedOn: string;
  rows: Record<"code" | "name" | "type" | "unit" | "status" | "brand" | "model" | "serialNumber" | "legacyAssetNo" | "location" | "installDate" | "purchaseDate" | "warrantyEnd" | "lastMaintenance" | "nextDue", string>[];
};

const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 7);
const back = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

export function ReportsView() {
  const [from, setFrom] = useState(back(thisMonth(), 11));
  const [to, setTo] = useState(thisMonth());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const valid = from <= to;
  const { data, error, loading, reload } = useApi<Summary>(valid ? "/reports/work-summary" : "/pulse", valid ? { from, to, ...filters } : undefined);

  // one row per unit, a column per month, plus a total, for completed jobs of every kind
  const table = useMemo(() => {
    if (!data || !valid || !("rows" in data)) return null;
    const months: string[] = [];
    for (let m = data.from; m <= data.to; m = back(m, -1)) months.push(m);
    const units = [...new Set(data.rows.map((r) => r.unit))].sort((a, b) => a.localeCompare(b, "th"));
    const cell = new Map<string, number>();
    const kinds = new Map<string, number>();
    for (const r of data.rows) {
      cell.set(`${r.unit}|${r.month}`, (cell.get(`${r.unit}|${r.month}`) ?? 0) + r.count);
      kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + r.count);
    }
    const total = data.rows.reduce((s, r) => s + r.count, 0);
    return { months, units, cell, kinds, total };
  }, [data, valid]);

  function exportSummary() {
    if (!data || !table) return;
    downloadCsv(`สรุปงานบำรุงรักษา_${from}_${to}.csv`, [
      ["ส่วนงาน", ...table.months.map(formatMonth), "รวม"],
      ...table.units.map((u) => {
        const vals = table.months.map((m) => table.cell.get(`${u}|${m}`) ?? 0);
        return [u, ...vals, vals.reduce((a, b) => a + b, 0)];
      }),
      ["รวมทั้งหมด", ...table.months.map((m) => table.units.reduce((s, u) => s + (table.cell.get(`${u}|${m}`) ?? 0), 0)), table.total],
      [],
      ["แยกตามประเภทงาน", ...WORK_ORDER_KINDS.map((k) => `${WORK_ORDER_KIND_LABEL[k]}: ${table.kinds.get(k) ?? 0}`)],
    ]);
  }

  async function exportRegister() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await apiGet<Register>("/reports/assets", { unitId: filters.unitId || undefined, typeId: filters.typeId || undefined, status: filters.status || undefined });
      downloadCsv(`ทะเบียนอุปกรณ์_${r.generatedOn}.csv`, [
        ["รหัส", "ชื่อ", "ประเภท", "ส่วนงาน", "สถานะ", "ยี่ห้อ", "รุ่น", "หมายเลขเครื่อง", "เลขครุภัณฑ์เดิม", "สถานที่", "วันที่ติดตั้ง", "วันที่ซื้อ", "ประกันหมด", "บำรุงรักษาล่าสุด", "ครบกำหนดถัดไป"],
        ...r.rows.map((a) => [a.code, a.name, a.type, a.unit, ASSET_STATUS_LABEL[a.status as AssetStatus] ?? a.status, a.brand, a.model, a.serialNumber, a.legacyAssetNo, a.location, a.installDate, a.purchaseDate, a.warrantyEnd, a.lastMaintenance, a.nextDue]),
      ]);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">รายงาน</h1>
        <p className="mt-1 text-muted-foreground">สรุปงานบำรุงรักษาที่เสร็จสิ้น และส่งออกทะเบียนอุปกรณ์</p>
      </div>

      <Card className="filter-card grid gap-4 p-4 sm:p-5 print:hidden">
        <FilterBar value={filters} onChange={setFilters}>
          <MonthPicker label="ตั้งแต่เดือน" value={from} max={to} onChange={setFrom} />
          <MonthPicker label="ถึงเดือน" value={to} min={from} onChange={setTo} />
        </FilterBar>
        {!valid && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">เดือนเริ่มต้นต้องไม่หลังเดือนสิ้นสุด</p>}
        {problem && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">{problem}</p>}
      </Card>

      <Card className="print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">สรุปงานบำรุงรักษาที่เสร็จสิ้น</h2>
            <p className="text-sm text-muted-foreground">
              {formatMonth(from)} – {formatMonth(to)} · นับตามวันที่ทำจริง · ออกรายงาน {formatDate(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }))}
            </p>
          </div>
          <div className="flex gap-1.5 print:hidden">
            <IconButton big label="ส่งออกเป็น CSV (เปิดใน Excel)" icon={CsvIcon} onClick={exportSummary} disabled={!table} />
            <IconButton big label="พิมพ์ / บันทึกเป็น PDF" icon={PdfIcon} onClick={() => window.print()} disabled={!table} />
          </div>
        </div>

        {error && valid && <ErrorState message={error} onRetry={reload} />}
        {loading && !table && valid && <Skeleton className="mt-4 h-48" />}
        {table && (
          <div className="mt-4">
            {/* phone: a card per unit */}
            <div className="grid gap-3 md:hidden print:hidden">
              {table.units.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีงานที่เสร็จสิ้นในช่วงนี้</p>}
              {[...table.units.map((u) => ({ name: u, vals: table.months.map((m) => table.cell.get(`${u}|${m}`) ?? 0) })), { name: "รวมทั้งหมด", vals: table.months.map((m) => table.units.reduce((s, u) => s + (table.cell.get(`${u}|${m}`) ?? 0), 0)), strong: true }].map((r) => (
                <section key={r.name} className={`rounded-2xl border p-3 ${"strong" in r ? "border-primary/40 bg-primary-soft" : "border-border bg-muted/40"}`}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="min-w-0 break-words text-sm font-bold">{r.name}</h3>
                    <span className="tabular shrink-0 text-lg font-bold">{formatNumber(r.vals.reduce((a, b) => a + b, 0))}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {table.months.map((m, i) => (
                      <div key={m} className={`rounded-lg bg-card px-1 py-1 text-center ${r.vals[i] ? "" : "opacity-50"}`}>
                        <div className="text-[10px] leading-tight text-muted-foreground">{formatMonth(m)}</div>
                        <div className="tabular text-sm font-bold">{formatNumber(r.vals[i])}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* tablet and computer: the table, squeezed to the width of the card (no scroll bar) */}
            <table className="hidden w-full table-fixed border-collapse text-left text-xs md:table lg:text-sm print:table">
              <colgroup>
                <col className="w-[21%] lg:w-[19%]" />
                {table.months.map((m) => (
                  <col key={m} />
                ))}
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="align-bottom text-muted-foreground">
                  <th className="py-2 pr-2 font-normal">ส่วนงาน</th>
                  {table.months.map((m) => {
                    const [mo, yr] = formatMonth(m).split(" ");
                    return (
                      <th key={m} className="px-0.5 py-2 text-right font-normal leading-tight">
                        <span className="block">{mo}</span>
                        <span className="block text-[10px] opacity-70">{yr}</span>
                      </th>
                    );
                  })}
                  <th className="py-2 pl-1 text-right font-bold">รวม</th>
                </tr>
              </thead>
              <tbody>
                {table.units.length === 0 && (
                  <tr><td colSpan={table.months.length + 2} className="py-6 text-center text-muted-foreground">ไม่มีงานที่เสร็จสิ้นในช่วงนี้</td></tr>
                )}
                {table.units.map((u) => {
                  const vals = table.months.map((m) => table.cell.get(`${u}|${m}`) ?? 0);
                  return (
                    <tr key={u} className="border-t border-border">
                      <td className="break-words py-2.5 pr-2">{u}</td>
                      {vals.map((v, i) => (
                        <td key={i} className={`tabular px-0.5 py-2.5 text-right ${v ? "" : "text-muted-foreground"}`}>{formatNumber(v)}</td>
                      ))}
                      <td className="tabular py-2.5 pl-1 text-right font-bold">{formatNumber(vals.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border font-bold">
                  <td className="py-2.5 pr-2">รวมทั้งหมด</td>
                  {table.months.map((m) => (
                    <td key={m} className="tabular px-0.5 py-2.5 text-right">{formatNumber(table.units.reduce((s, u) => s + (table.cell.get(`${u}|${m}`) ?? 0), 0))}</td>
                  ))}
                  <td className="tabular py-2.5 pl-1 text-right">{formatNumber(table.total)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted-foreground">
              {WORK_ORDER_KINDS.map((k) => `${WORK_ORDER_KIND_LABEL[k]} ${formatNumber(table.kinds.get(k) ?? 0)} งาน`).join(" · ")}
            </p>
          </div>
        )}
      </Card>

      <Card className="print:hidden">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">ทะเบียนอุปกรณ์</h2>
          <IconButton big label={busy ? "กำลังเตรียมไฟล์..." : "ส่งออกทะเบียนเป็น CSV (เปิดใน Excel)"} icon={CsvIcon} onClick={() => void exportRegister()} disabled={busy} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">รายการอุปกรณ์ทั้งหมดตามตัวกรองด้านบน (สูงสุด 5,000 รายการ) พร้อมวันที่ติดตั้ง ประกัน และรอบบำรุงรักษา</p>
      </Card>
    </div>
  );
}
