"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/**
 * A month field that looks like the browser's own (a box with a calendar icon that opens a small calendar) but is always in
 * Thai: "พฤศจิกายน 2569" with Buddhist years. The browser's own month field follows the browser's language, so it cannot be
 * made Thai. `value` and `onChange` use "YYYY-MM" (Gregorian).
 */
export function MonthPicker({ value, onChange, label, min, max }: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string }) {
  const [y, m] = value.split("-").map(Number);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(y);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    setYear(y);
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, y]);

  const key = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const out = (yy: number, mm: number) => (min !== undefined && key(yy, mm) < min) || (max !== undefined && key(yy, mm) > max);

  return (
    <div ref={box} className="relative grid gap-1 text-[13px] text-muted-foreground">
      <span id={id}>{label}</span>
      <button
        type="button"
        aria-labelledby={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-[170px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground hover:bg-muted"
      >
        {MONTHS[m - 1]} {y + 543}
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label={`เลือก${label}`} className="absolute left-0 top-full z-30 mt-1 w-64 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setYear(year - 1)} aria-label="ปีก่อนหน้า" className="grid size-8 place-items-center rounded-lg hover:bg-muted">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <b className="text-sm text-foreground">พ.ศ. {year + 543}</b>
            <button type="button" onClick={() => setYear(year + 1)} aria-label="ปีถัดไป" className="grid size-8 place-items-center rounded-lg hover:bg-muted">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((name, i) => {
              const selected = year === y && i + 1 === m;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={out(year, i + 1)}
                  onClick={() => (onChange(key(year, i + 1)), setOpen(false))}
                  aria-label={`${MONTHS[i]} ${year + 543}`}
                  aria-pressed={selected}
                  className={cn("min-h-9 rounded-lg px-1 text-[13px] transition-colors disabled:opacity-35", selected ? "bg-primary font-bold text-primary-foreground" : "text-foreground hover:bg-primary-soft hover:text-primary")}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
