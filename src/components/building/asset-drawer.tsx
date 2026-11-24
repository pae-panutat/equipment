"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ASSET_STATUS_LABEL, type AssetListItem } from "@shared/index";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Alert } from "./building-3d";

const TONE: Record<Alert, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || "—"}</dd>
    </div>
  );
}

/** The equipment's details, sliding in from the right. The slide uses the Web Animations API so it still plays when the system has animations switched off. */
export function AssetDrawer({ asset: a, alert, onClose }: { asset: AssetListItem; alert: Alert; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return; // slide in once; picking another dot only swaps the content
    opened.current = true;
    panel.current?.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <aside
      ref={panel}
      aria-label={`ข้อมูลอุปกรณ์ ${a.code}`}
      className="fixed inset-y-0 right-0 z-50 flex w-[min(400px,100vw)] flex-col border-l border-border bg-card shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <i className={cn("size-2.5 rounded-full", TONE[alert])} aria-hidden="true" />
            {a.code}
          </p>
          <h2 className="mt-1 break-words text-lg font-bold">{a.name}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="grid size-9 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <dl className="flex-1 divide-y divide-border overflow-y-auto px-5 py-2">
        <Row label="สถานะ" value={ASSET_STATUS_LABEL[a.status]} />
        <Row label="ประเภท" value={a.type} />
        <Row label="ยี่ห้อ / รุ่น" value={[a.brand, a.model].filter(Boolean).join(" ") || null} />
        <Row label="ส่วนงาน" value={a.unit} />
        <Row label="ที่ตั้ง" value={a.location} />
        <Row label="บำรุงรักษาล่าสุด" value={a.lastMaintenance ? formatDate(a.lastMaintenance) : null} />
        <Row label="ครบกำหนดถัดไป" value={a.nextDue ? formatDate(a.nextDue) : null} />
      </dl>
      <div className="border-t border-border p-5">
        <Link href={`/assets/${a.id}`} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90">
          เปิดหน้ารายละเอียด
        </Link>
      </div>
    </aside>
  );
}
