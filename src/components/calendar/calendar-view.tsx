"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { canEditAssets, type AssetDetail, type CalendarItem } from "@shared/index";
import { PlanDialog } from "@/components/assets/plan-dialog";
import { WorkOrderDialog } from "@/components/assets/work-order-dialog";
import { TONE } from "@/lib/due-tone";
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

  // the days of this month only: blank cells before the 1st and after the last day, as many weeks as the month needs
  const cells = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const lead = first.getUTCDay();
    const total = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => (i < lead || i >= lead + days ? null : `${month}-${String(i - lead + 1).padStart(2, "0")}`));
  }, [month]);

  async function moveTo(item: CalendarItem, date: string) {
    if (item.kind !== "plan" || date === item.date || !canMove || date < now) return; // a plan cannot be moved to a day that has passed
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
  const tone = (i: CalendarItem, date: string) => (date < now ? TONE.overdue : i.kind === "job" ? TONE.job : TONE.plan);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ปฏิทินงานบำรุงรักษา</h1>
        <p className="mt-1 text-muted-foreground">{canMove ? "ลากแผนไปวางวันใหม่เพื่อเลื่อนวัน หรือกดวันเพื่อดูรายการ" : "กดวันเพื่อดูรายการ"}</p>
      </div>

      <Card className="filter-card p-4 sm:p-5">
        <FilterBar value={filters} onChange={setFilters} />
      </Card>

      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setMonth(shift(month, -1))} aria-label="เดือนก่อนหน้า" className="grid size-9 place-items-center rounded-xl border border-border hover:bg-muted">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{formatMonth(month)}</h2>
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
            {cells.map((date, n) => {
              if (date === null) return <div key={`blank${n}`} className="min-h-[64px] bg-muted/40 sm:min-h-[104px]" aria-hidden="true" />;
              const items = byDay.get(date) ?? [];
              const past = date < now;
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
                  className={cn("group relative min-h-[64px] bg-card p-1 sm:min-h-[104px] sm:p-1.5")}
                >
                  {canMove && !past && (
                    <button
                      type="button"
                      onClick={() => setAdding(date)}
                      aria-label={`เพิ่มแผนวันที่ ${formatDate(date)}`}
                      title="เพิ่มแผนในวันนี้"
                      className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-full bg-muted/70 text-muted-foreground opacity-0 transition-opacity hover:bg-primary-soft hover:text-primary focus-visible:opacity-100 group-hover:opacity-60 hover:!opacity-100 [@media(hover:none)]:opacity-40"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
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
                      <i key={`${i.kind}${i.id}`} className={cn("size-2 rounded-full", tone(i, date).dot)} />
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
                          className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] hover:brightness-95", tone(i, date).chip, canMove && i.kind === "plan" && "cursor-grab", moving === `${i.kind}${i.id}` && "opacity-50")}
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
          {([TONE.plan, TONE.overdue, TONE.job] as const).map((t) => (
            <span key={t.name} className="inline-flex items-center gap-1.5">
              <i className={cn("size-2.5 rounded-full", t.dot)} /> {t.name}
            </span>
          ))}
        </div>
      </Card>

      {picked && (
        <Card>
          <h2 className="text-lg font-bold">{formatDate(picked)}</h2>
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
          onOpenJob={(id) => (setRecord({ assetId: view.assetId, id }), setView(null))}
        />
      )}
      {adding && <PlanDialog assetId={null} defaultDue={adding} onClose={(m) => (setAdding(null), m && saved(m))} />}
      {record && <WorkOrderDialog assetId={record.assetId} planId={record.planId} workOrderId={record.id} onClose={(ok) => (setRecord(null), ok && saved("บันทึกงานเรียบร้อยแล้ว"))} />}
    </div>
  );
}
