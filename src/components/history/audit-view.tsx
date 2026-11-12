"use client";

import { useState } from "react";
import type { HistoryItem, Paged } from "@shared/index";
import { Card, ErrorState, Skeleton } from "@/components/ui/card";
import { useApi } from "@/lib/use-api";
import { HistoryList } from "./history-list";
import { Select } from "@/components/ui/select";

const ENTITIES = [
  { value: "", label: "ทั้งหมด" },
  { value: "asset", label: "อุปกรณ์" },
  { value: "work_order", label: "ใบงาน" },
  { value: "plan", label: "แผนบำรุงรักษา" },
  { value: "photo", label: "รูปภาพ" },
  { value: "import", label: "นำเข้าข้อมูล" },
];
const PAGE = 30;

/** Super Admin: the edit history of the whole system. */
export function AuditView() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const badRange = from !== "" && to !== "" && from > to;
  const { data, error, loading, reload } = useApi<Paged<HistoryItem>>("/audit", { entity: entity || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE }, { live: true });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ประวัติการแก้ไข</h1>
        <p className="mt-1 text-muted-foreground">ใครแก้อะไรเมื่อไหร่ในระบบ</p>
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          ประเภทรายการ
          <Select
            className="min-h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground"
            value={entity}
            onChange={(e) => (setEntity(e.target.value), setPage(1))}
          >
            {ENTITIES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
          {/* look back: pick any period in the past */}
          <label className="grid gap-1 text-[13px] text-muted-foreground">
            ตั้งแต่วันที่
            <input type="date" value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="min-h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" />
          </label>
          <label className="grid gap-1 text-[13px] text-muted-foreground">
            ถึงวันที่
            <input type="date" value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setPage(1))} className="min-h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => (setFrom(""), setTo(""), setPage(1))} className="text-sm min-h-11 rounded-xl border border-border px-3.5 hover:bg-muted">
              ล้างช่วงวันที่
            </button>
          )}
        </div>
        {badRange && <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด</p>}
        <div className="mt-3">
          {error && <ErrorState message={error} onRetry={reload} />}
          {loading && !data && <Skeleton className="h-64" />}
          {data && <HistoryList items={data.items} showAsset />}
        </div>
        {data && data.total > PAGE && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-sm min-h-9 rounded-xl border border-border px-3.5 hover:bg-muted disabled:opacity-40">
              ก่อนหน้า
            </button>
            <span className="text-muted-foreground">
              หน้า {page} / {pages}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="text-sm min-h-9 rounded-xl border border-border px-3.5 hover:bg-muted disabled:opacity-40">
              ถัดไป
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
