"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { canEditAssets, type AssetDetail, type CalendarItem } from "@shared/index";
import { PlanDialog } from "@/components/assets/plan-dialog";
import { WorkOrderDialog } from "@/components/assets/work-order-dialog";
import { ItemPopup } from "./item-popup";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { Card, ErrorState, Skeleton } from "@/components/ui/card";
import { apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const shift = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export function CalendarView() {
  const { user } = useAuth();
  const canMove = user ? canEditAssets(user.role) : false;
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [picked, setPicked] = useState<string | null>(null); // the day whose list is open
  const [moving, setMoving] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);
  const [view, setView] = useState<CalendarItem | null>(null); // the entry whose details are open
  const [adding, setAdding] = useState<string | null>(null); // a new plan, due on this day
  const [editPlan, setEditPlan] = useState<{ assetId: number; plan: AssetDetail["plans"][number] } | null>(null);
  const [record, setRecord] = useState<{ assetId: number; planId?: number; id?: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const saved = (message: string) => {
    reload();
    setNote(message);
    setTimeout(() => setNote(null), 5000);
  };
  const { data, error, loading, reload } = useApi<{ month: string; items: CalendarItem[] }>("/calendar", { month, ...filters }, { live: true });

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const i of data?.items ?? []) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [data]);

  // 6 weeks starting on the Sunday on or before the 1st
  const cells = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [month]);

  async function moveTo(item: CalendarItem, date: string) {
    if (item.kind !== "plan" || date === item.date || !canMove) return;
    setMoving(`${item.kind}${item.id}`);
    setError2(null);
    try {
      await apiSend("PATCH", `/plans/${item.id}`, { nextDueDate: date });
      reload();
    } catch (e) {
      setError2(e instanceof Error ? e.message : "เลื่อนวันไม่สำเร็จ");
    } finally {
      setMoving(null);
    }
  }

  const dayItems = picked ? (byDay.get(picked) ?? []) : [];
  const chip = (i: CalendarItem, date: string) =>
    i.kind === "job" ? "bg-warn-soft text-warn" : date < now ? "bg-bad-soft text-bad" : "bg-primary-soft text-primary";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ปฏิทินงานบำรุงรักษา</h1>
        <p className="mt-1 text-muted-foreground">{canMove ? "ลากแผนไปวางวันใหม่เพื่อเลื่อนวัน หรือกดวันเพื่อดูรายการ" : "กดวันเพื่อดูรายการ"}</p>
      </div>

      <Card className="p-4 sm:p-5">
        <FilterBar value={filters} onChange={setFilters} />
      </Card>

      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setMonth(shift(month, -1))} aria-label="เดือนก่อนหน้า" className="grid size-9 place-items-center rounded-xl border border-border hover:bg-muted">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{formatMonth(month)}</h2>
            <button type="button" onClick={() => (setMonth(now.slice(0, 7)), setPicked(now))} className="min-h-9 rounded-xl px-3 text-sm text-primary hover:bg-primary-soft">
              วันนี้
            </button>
            {canMove && (
              <button type="button" onClick={() => setAdding(picked ?? now)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground">
                <Plus className="size-4" aria-hidden="true" /> เพิ่มแผน
              </button>
            )}
          </div>
          <button type="button" onClick={() => setMonth(shift(month, 1))} aria-label="เดือนถัดไป" className="grid size-9 place-items-center rounded-xl border border-border hover:bg-muted">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>

        {error && <ErrorState message={error} onRetry={reload} />}
        {loading && !data ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {DAYS.map((d) => (
              <div key={d} className="bg-muted px-1 py-2 text-center text-xs text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((date) => {
              const items = byDay.get(date) ?? [];
              const inMonth = date.startsWith(month);
              return (
                <div
                  key={date}
                  onDragOver={(e) => canMove && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const raw = JSON.parse(e.dataTransfer.getData("text/plain")) as CalendarItem;
                      void moveTo(raw, date);
                    } catch {
                      /* not one of ours */
                    }
                  }}
                  className={cn("min-h-[64px] bg-card p-1 sm:min-h-[104px] sm:p-1.5", !inMonth && "opacity-45")}
                >
                  <button
                    type="button"
                    onClick={() => setPicked(date)}
                    aria-label={`${formatDate(date)} มี ${items.length} รายการ`}
                    aria-pressed={picked === date}
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-xs",
                      date === now && "bg-primary font-bold text-primary-foreground",
                      picked === date && date !== now && "ring-2 ring-primary",
                    )}
                  >
                    {Number(date.slice(8))}
                  </button>
                  {/* phone: dots only; larger screens: the plan names */}
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {items.slice(0, 4).map((i) => (
                      <i key={`${i.kind}${i.id}`} className={cn("size-2 rounded-full", i.kind === "job" ? "bg-warn" : date < now ? "bg-bad" : "bg-primary")} />
                    ))}
                  </div>
                  <ul className="mt-1 hidden gap-1 sm:grid">
                    {items.slice(0, 3).map((i) => (
                      <li
                        key={`${i.kind}${i.id}`}
                        draggable={canMove && i.kind === "plan"}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify(i))}
                      >
                        <button
                          type="button"
                          onClick={() => (setPicked(date), setView(i))}
                          className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] hover:brightness-125", chip(i, date), canMove && i.kind === "plan" && "cursor-grab", moving === `${i.kind}${i.id}` && "opacity-50")}
                          title={`${i.assetCode} · ${i.title}`}
                        >
                          {i.assetCode}
                        </button>
                      </li>
                    ))}
                    {items.length > 3 && (
                      <li>
                        <button type="button" onClick={() => setPicked(date)} className="px-1 text-[11px] text-muted-foreground hover:text-foreground">
                          +{items.length - 3} รายการ
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" /> แผนบำรุงรักษา</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-bad" /> เกินกำหนด</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-warn" /> ใบงานที่ยังไม่เสร็จ</span>
        </div>
      </Card>

      {picked && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{formatDate(picked)}</h2>
            {canMove && (
              <button type="button" onClick={() => setAdding(picked)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-sm font-bold hover:bg-muted">
                <Plus className="size-4" aria-hidden="true" /> เพิ่มแผนในวันนี้
              </button>
            )}
          </div>
          {error2 && (
            <p role="alert" className="mt-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
              {error2}
            </p>
          )}
          {dayItems.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">ไม่มีรายการในวันนี้</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {dayItems.map((i) => (
                <li key={`${i.kind}${i.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <button type="button" onClick={() => setView(i)} className="min-w-0 text-left hover:underline">
                    <span className="block text-sm font-bold text-primary">{i.assetCode}</span>
                    <span className="block break-words text-sm">{i.title}</span>
                    <span className="block text-xs text-muted-foreground">{i.kind === "plan" ? "แผนบำรุงรักษา" : "ใบงาน"} · {i.assetName}</span>
                  </button>
                  {canMove && i.kind === "plan" && (
                    <label className="grid gap-0.5 text-xs text-muted-foreground">
                      เลื่อนไปวันที่
                      <input
                        type="date"
                        defaultValue={i.date}
                        onChange={(e) => e.target.value && void moveTo(i, e.target.value)}
                        className="min-h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground"
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {note && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
          {note}
        </p>
      )}

      {view && (
        <ItemPopup
          item={view}
          today={now}
          canEdit={canMove}
          onClose={() => setView(null)}
          onRecord={(planId) => (setRecord({ assetId: view.assetId, planId }), setView(null))}
          onEditPlan={(plan) => (setEditPlan({ assetId: view.assetId, plan }), setView(null))}
          onOpenJob={(id) => (setRecord({ assetId: view.assetId, id }), setView(null))}
        />
      )}
      {adding && <PlanDialog assetId={null} defaultDue={adding} onClose={(m) => (setAdding(null), m && saved(m))} />}
      {editPlan && <PlanDialog assetId={editPlan.assetId} plan={editPlan.plan} onClose={(m) => (setEditPlan(null), m && saved(m))} />}
      {record && <WorkOrderDialog assetId={record.assetId} planId={record.planId} workOrderId={record.id} onClose={(ok) => (setRecord(null), ok && saved("บันทึกงานเรียบร้อยแล้ว"))} />}
    </div>
  );
}
