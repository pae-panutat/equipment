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
import { Tooltip, useTip, type TipRef } from "@/components/dashboard/bento";

type Summary = { from: string; to: string; generatedOn: string; rows: { month: string; unit: string; kind: WorkOrderKind; count: number }[] };
type Register = {
  generatedOn: string;
  rows: Record<"code" | "name" | "type" | "unit" | "status" | "brand" | "model" | "serialNumber" | "legacyAssetNo" | "location" | "installDate" | "purchaseDate" | "warrantyEnd" | "lastMaintenance" | "nextDue", string>[];
};

const KIND_COLOR: Record<WorkOrderKind, string> = { planned: "var(--primary)", repair: "#ff7a45", inspection: "#18b8a6" };

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
  const [showTable, setShowTable] = useState(false);
  const tip = useTip();
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
    const monthKind = new Map<string, number>();
    const unitKind = new Map<string, number>();
    for (const r of data.rows) {
      monthKind.set(`${r.month}|${r.kind}`, (monthKind.get(`${r.month}|${r.kind}`) ?? 0) + r.count);
      unitKind.set(`${r.unit}|${r.kind}`, (unitKind.get(`${r.unit}|${r.kind}`) ?? 0) + r.count);
    }
    const unitTotal = (u: string) => WORK_ORDER_KINDS.reduce((a, k) => a + (unitKind.get(`${u}|${k}`) ?? 0), 0);
    const rankedUnits = [...units].sort((a, b) => unitTotal(b) - unitTotal(a)).map((u) => ({ name: u, total: unitTotal(u) }));
    return { months, units, cell, kinds, total, monthKind, unitKind, rankedUnits };
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
      <Tooltip api={tip} />
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
        {table && table.total === 0 && <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีงานที่เสร็จสิ้นในช่วงนี้</p>}
        {table && table.total > 0 && (
          <div className="mt-5 grid gap-6">
            {/* the big picture: total, share of each kind as a ring */}
            <div className="grid items-center gap-5 rounded-2xl border border-border bg-muted/40 p-4 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-5">
              <Donut tip={tip} parts={WORK_ORDER_KINDS.map((k) => ({ label: WORK_ORDER_KIND_LABEL[k], value: table.kinds.get(k) ?? 0, color: KIND_COLOR[k] }))} total={table.total} />
              <div className="grid gap-3">
                {WORK_ORDER_KINDS.map((k) => {
                  const n = table.kinds.get(k) ?? 0;
                  const pct = table.total ? Math.round((n / table.total) * 100) : 0;
                  return (
                    <div key={k}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium"><span className="size-3 rounded-full" style={{ background: KIND_COLOR[k] }} />{WORK_ORDER_KIND_LABEL[k]}</span>
                        <span className="tabular text-muted-foreground"><b className="text-base text-foreground">{formatNumber(n)}</b> งาน · {pct}%</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: KIND_COLOR[k] }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* jobs per month: stacked columns */}
            <section>
              <h3 className="mb-3 text-base font-bold">จำนวนงานในแต่ละเดือน</h3>
              <MonthChart tip={tip} months={table.months} monthKind={table.monthKind} />
            </section>

            {/* jobs per unit: stacked bars, biggest first */}
            <section>
              <h3 className="mb-3 text-base font-bold">จำนวนงานแยกตามส่วนงาน</h3>
              <UnitBars tip={tip} units={table.rankedUnits} unitKind={table.unitKind} />
            </section>

            <div className="print:hidden">
              <button type="button" onClick={() => setShowTable((v) => !v)} className="text-sm font-bold text-primary hover:underline" aria-expanded={showTable}>
                {showTable ? "ซ่อนตารางตัวเลข" : "ดูตารางตัวเลขละเอียด"}
              </button>
            </div>
            <div className={showTable ? "" : "hidden print:block"}>
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
                        <div className="text-[10px] leading-tight text-muted-foreground">{formatMonth(m).split(" ")[0]}</div>
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
                        <span className="inline-block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{mo} <span className="text-[10px] opacity-70">{yr}</span></span>
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
            </div>
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

/** tooltip rows for a stack: one line per kind of job, then the total */
function kindRows(get: (k: WorkOrderKind) => number) {
  const total = WORK_ORDER_KINDS.reduce((a, k) => a + get(k), 0);
  return [...WORK_ORDER_KINDS.map((k) => ({ label: WORK_ORDER_KIND_LABEL[k], value: `${formatNumber(get(k))} งาน`, color: KIND_COLOR[k] })), { label: "รวม", value: `${formatNumber(total)} งาน` }];
}

const SHORT_MONTH = (m: string) => formatMonth(m).split(" ")[0];

/** A ring showing each part's share, with the total in the middle. */
function Donut({ parts, total, tip }: { parts: { label: string; value: number; color: string }[]; total: number; tip: TipRef }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative mx-auto size-40 shrink-0">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90" role="img" aria-label="สัดส่วนงานแยกตามประเภท">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" strokeWidth="20" />
        {parts.map((p, i) => {
          const len = total ? (p.value / total) * C : 0;
          const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="20" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} className="cursor-pointer transition-opacity hover:opacity-80" onPointerMove={(e) => tip.current?.show(e.clientX, e.clientY, { title: p.label, rows: [{ label: "จำนวน", value: `${formatNumber(p.value)} งาน`, color: p.color }, { label: "สัดส่วน", value: `${total ? Math.round((p.value / total) * 100) : 0}%` }] })} onPointerLeave={() => tip.current?.hide()} />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="tabular text-3xl font-bold leading-none">{formatNumber(total)}</div>
        <div className="mt-1 text-xs text-muted-foreground">งานทั้งหมด</div>
      </div>
    </div>
  );
}

/** One column per month; each column is stacked by kind of job. */
function MonthChart({ months, monthKind, tip }: { months: string[]; monthKind: Map<string, number>; tip: TipRef }) {
  const totals = months.map((m) => WORK_ORDER_KINDS.reduce((a, k) => a + (monthKind.get(`${m}|${k}`) ?? 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="flex h-52 items-end gap-1 border-b border-border sm:gap-2" role="img" aria-label="กราฟแท่งจำนวนงานแต่ละเดือน">
        {months.map((m, i) => (
          <div
            key={m}
            className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-lg hover:bg-primary/10"
            onPointerMove={(e) => tip.current?.show(e.clientX, e.clientY, { title: formatMonth(m), rows: kindRows((k) => monthKind.get(`${m}|${k}`) ?? 0) })}
            onPointerLeave={() => tip.current?.hide()}
          >
            <div className="tabular mb-1 text-center text-[11px] font-bold sm:text-xs">{totals[i] ? formatNumber(totals[i]) : ""}</div>
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `${(totals[i] / max) * 85}%` }}>
              {WORK_ORDER_KINDS.map((k) => {
                const n = monthKind.get(`${m}|${k}`) ?? 0;
                return n ? <div key={k} style={{ flexGrow: n, background: KIND_COLOR[k] }} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-2">
        {months.map((m) => (
          <div key={m} className={`min-w-0 flex-1 whitespace-nowrap text-center text-[10px] leading-tight text-muted-foreground sm:text-xs ${months.length > 12 ? "[writing-mode:vertical-rl]" : "[writing-mode:vertical-rl] sm:[writing-mode:horizontal-tb]"}`}>{SHORT_MONTH(m)}</div>
        ))}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {WORK_ORDER_KINDS.map((k) => (
        <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />{WORK_ORDER_KIND_LABEL[k]}</span>
      ))}
    </div>
  );
}

/** A horizontal bar per unit, longest first, stacked by kind of job. */
function UnitBars({ units, unitKind, tip }: { units: { name: string; total: number }[]; unitKind: Map<string, number>; tip: TipRef }) {
  const max = Math.max(1, ...units.map((u) => u.total));
  return (
    <div>
      <div className="grid gap-2.5">
        {units.map((u) => (
          <div
            key={u.name}
            className="grid cursor-pointer items-center gap-x-3 gap-y-1 rounded-lg px-1.5 py-1 hover:bg-primary/10 sm:grid-cols-[minmax(0,14rem)_1fr]"
            onPointerMove={(e) => tip.current?.show(e.clientX, e.clientY, { title: u.name, rows: kindRows((k) => unitKind.get(`${u.name}|${k}`) ?? 0) })}
            onPointerLeave={() => tip.current?.hide()}
          >
            <div className="min-w-0 break-words text-sm leading-snug">{u.name}</div>
            <div className="flex items-center gap-2">
              <div className="flex h-5 overflow-hidden rounded-full bg-border/40" style={{ width: `${Math.max(3, (u.total / max) * 100)}%` }}>
                {WORK_ORDER_KINDS.map((k) => {
                  const n = unitKind.get(`${u.name}|${k}`) ?? 0;
                  return n ? <div key={k} style={{ flexGrow: n, background: KIND_COLOR[k] }} /> : null;
                })}
              </div>
              <span className="tabular shrink-0 text-sm font-bold">{formatNumber(u.total)}</span>
            </div>
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}
