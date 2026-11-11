"use client";

import Link from "next/link";
import { History, Plus, Pencil, Trash2 } from "lucide-react";
import type { HistoryItem } from "@shared/index";
import { ASSET_STATUS_LABEL, PRIORITY_LABEL, WORK_ORDER_KIND_LABEL, WORK_ORDER_STATUS_LABEL } from "@shared/index";
import { formatDateTime } from "@/lib/format";

const FIELD: Record<string, string> = {
  name: "ชื่ออุปกรณ์", typeId: "ประเภท", status: "สถานะ", ownerUnitId: "ส่วนงานเจ้าของ", locationId: "สถานที่", locationDetail: "รายละเอียดที่ตั้ง",
  brand: "ยี่ห้อ", model: "รุ่น", serialNumber: "หมายเลขเครื่อง", legacyAssetNo: "เลขครุภัณฑ์เดิม", installDate: "วันที่ติดตั้ง",
  purchaseDate: "วันที่ซื้อ", warrantyEnd: "ประกันหมด", notes: "หมายเหตุ", title: "หัวข้อ", kind: "ประเภทงาน", description: "รายละเอียด",
  priority: "ความสำคัญ", dueDate: "กำหนดเสร็จ", performedOn: "วันที่ดำเนินการ", planId: "แผน", intervalValue: "รอบ", intervalUnit: "หน่วยรอบ",
  nextDueDate: "ครบกำหนดครั้งถัดไป", active: "เปิดใช้งาน",
};

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  if (key === "status") return (ASSET_STATUS_LABEL as Record<string, string>)[s] ?? (WORK_ORDER_STATUS_LABEL as Record<string, string>)[s] ?? s;
  if (key === "kind") return (WORK_ORDER_KIND_LABEL as Record<string, string>)[s] ?? s;
  if (key === "priority") return (PRIORITY_LABEL as Record<string, string>)[s] ?? s;
  if (key === "intervalUnit") return s === "month" ? "เดือน" : s === "day" ? "วัน" : s;
  if (key === "active") return s === "1" || s === "true" ? "เปิด" : "ปิด";
  return s;
}

const ICON = { create: Plus, update: Pencil, delete: Trash2 } as const;

/** A list of edit-history lines; each can be opened to see what changed (before → after). */
export function HistoryList({ items, showAsset = false }: { items: HistoryItem[]; showAsset?: boolean }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <History className="size-4" aria-hidden="true" /> ยังไม่มีประวัติการแก้ไข
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((h) => {
        const Icon = ICON[h.action as keyof typeof ICON] ?? Pencil;
        const changes = h.changes ? Object.entries(h.changes) : [];
        return (
          <li key={h.id} className="flex gap-3 py-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold">
                {h.summary}
                {showAsset && h.assetId && h.assetCode && (
                  <>
                    {" · "}
                    <Link href={`/assets/${h.assetId}`} className="text-primary hover:underline">
                      {h.assetCode}
                    </Link>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {h.username} · {formatDateTime(h.at)}
              </p>
              {changes.length > 0 && (
                <ul className="mt-1.5 grid gap-0.5 text-xs">
                  {changes.map(([k, [a, b]]) => (
                    <li key={k} className="break-words">
                      <span className="text-muted-foreground">{FIELD[k] ?? k}:</span> <span className="line-through opacity-60">{show(k, a)}</span> → <b>{show(k, b)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
