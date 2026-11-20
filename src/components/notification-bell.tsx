"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { canEditAssets, type TodayNotifications } from "@shared/index";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { TONE } from "@/lib/due-tone";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The bell in the top bar: maintenance plans that are overdue, due today or coming up soon (the same list as the dashboard). */
export function NotificationBell() {
  const { user } = useAuth();
  // the server only returns plans of the units this user may see, so each faculty gets its own notifications
  const { data } = useApi<TodayNotifications>("/notifications/today", {}, { live: true });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // what is due today plus anything older that nobody has dealt with yet (overdue plans stay until they are done, moved or switched off)
  const items = data?.items ?? [];
  const canRecord = user ? canEditAssets(user.role) : false;
  const asOf = data?.asOf ?? "";

  // Which plans THIS account has already looked at, kept in this browser and keyed by the signed-in user (and the day):
  // opening the bell clears the red badge for that user only, never for another account or another machine.
  const seenKey = `bell-seen:${user?.id ?? ""}`;
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    if (!data) return;
    try {
      const saved = JSON.parse(localStorage.getItem(seenKey) ?? "null") as { date: string; ids: number[] } | null;
      // A plan that has left today's list (moved to another day, switched off, done) is forgotten, so when it comes
      // back it counts as a new notification again.
      const here = new Set(data.items.map((u) => u.planId));
      const kept = saved && saved.date === asOf ? saved.ids.filter((id) => here.has(id)) : [];
      if (!saved || saved.date !== asOf || kept.length !== saved.ids.length) localStorage.setItem(seenKey, JSON.stringify({ date: asOf, ids: kept }));
      setSeen(new Set(kept));
    } catch {
      setSeen(new Set());
    }
  }, [seenKey, asOf, data]);
  useEffect(() => {
    if (!open || !asOf) return;
    const ids = items.map((u) => u.planId);
    if (ids.every((id) => seen.has(id))) return;
    const next = new Set([...seen, ...ids]);
    setSeen(next);
    try {
      localStorage.setItem(seenKey, JSON.stringify({ date: asOf, ids: [...next] }));
    } catch {
      /* storage unavailable: the badge just clears for this visit */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // jobs somebody has already started, or that this user has already seen, don't count towards the red badge
  const pending = items.filter((u) => !u.inProgress && !seen.has(u.planId));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={pending.length ? `การแจ้งเตือน ${pending.length} รายการ` : "การแจ้งเตือน"}
        aria-expanded={open}
        title="การแจ้งเตือนการบำรุงรักษา"
        className="relative grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden="true" />
        {pending.length > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <p className="border-b border-border px-4 py-3 text-sm font-bold">แจ้งเตือนการบำรุงรักษา</p>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีงานบำรุงรักษาที่ต้องดำเนินการ</p>
          ) : (
            <ul className="max-h-[70dvh] overflow-y-auto">
              {items.map((u) => {
                const tone = u.inProgress ? TONE.plan : u.overdue ? TONE.overdue : TONE.soon;
                const late = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${u.dueDate}T00:00:00Z`)) / 86_400_000);
                const text = u.inProgress ? "กำลังดำเนินการแล้ว" : u.overdue ? `เกินกำหนด ${late} วัน` : "ครบกำหนดวันนี้";
                const href = canRecord ? `/assets/${u.assetId}?plan=${u.planId}` : `/assets/${u.assetId}`;
                return (
                  <li key={u.planId} className="border-t border-border first:border-t-0">
                    <Link href={href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
                      <span className="min-w-0 text-sm leading-snug">
                        <span className="block truncate font-bold">
                          {u.assetCode} · {u.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.assetName} · {u.unitName}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                          <span className={cn("rounded-full px-2 py-0.5 font-bold", tone.chip)}>{text}</span>
                          <span className="tabular text-muted-foreground">กำหนด {formatDate(u.dueDate)}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/calendar" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-sm font-bold text-primary hover:bg-muted/60">
            ดูปฏิทินบำรุงรักษา
          </Link>
        </div>
      )}
    </div>
  );
}
