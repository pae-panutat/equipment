"use client";

import { useState } from "react";
import type { AssetDetail } from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { apiSend } from "@/lib/api";
import { focusField } from "@/lib/focus-field";

type Plan = AssetDetail["plans"][number];

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "min-h-11 rounded-xl px-4 font-bold disabled:opacity-50";

/** Add a maintenance plan to an asset, or change one (name, interval, next due date, on/off). */
export function PlanDialog({ assetId, plan, onClose }: { assetId: number; plan?: Plan; onClose: (saved: string | null) => void }) {
  const editing = Boolean(plan);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [value, setValue] = useState(String(plan?.intervalValue ?? 6));
  const [unit, setUnit] = useState<"day" | "month">(plan?.intervalUnit ?? "month");
  const [due, setDue] = useState(plan?.nextDueDate ?? "");
  const [active, setActive] = useState(plan?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = plan
    ? title !== plan.title || value !== String(plan.intervalValue) || unit !== plan.intervalUnit || due !== (plan.nextDueDate ?? "") || active !== plan.active
    : title !== "" || due !== "";

  const refuse = (message: string, key: string) => {
    setError(message);
    focusField(key);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!title.trim()) return refuse("กรุณากรอกชื่อแผน", "title");
    if (!Number.isInteger(n) || n < 1 || n > 999) return refuse("รอบต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 999", "interval");
    if (!due) return refuse("กรุณาเลือกวันครบกำหนดครั้งถัดไป", "due");
    setSaving(true);
    setError(null);
    try {
      const body = { title: title.trim(), intervalValue: n, intervalUnit: unit, nextDueDate: due };
      if (plan) await apiSend("PATCH", `/plans/${plan.id}`, { ...body, active });
      else await apiSend("POST", `/assets/${assetId}/plans`, body);
      onClose(plan ? "บันทึกแผนเรียบร้อยแล้ว" : "เพิ่มแผนเรียบร้อยแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "แก้ไขแผนบำรุงรักษา" : "เพิ่มแผนบำรุงรักษา"} onClose={() => onClose(null)} canDismiss={!dirty}>
      <form onSubmit={submit} className="grid gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        <label data-field="title" className="grid gap-1 text-[13px] text-muted-foreground">
          ชื่อแผน *
          <input data-autofocus className={input} value={title} maxLength={191} onChange={(e) => (setTitle(e.target.value), setError(null))} placeholder="เช่น ล้างทำความสะอาดแอร์" />
        </label>
        <div data-field="interval" className="grid gap-1 text-[13px] text-muted-foreground">
          ทำซ้ำทุก *
          <div className="grid grid-cols-2 gap-3">
            <input className={input} type="number" inputMode="numeric" min={1} max={999} value={value} onChange={(e) => (setValue(e.target.value), setError(null))} aria-label="จำนวนรอบ" />
            <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as "day" | "month")} aria-label="หน่วยของรอบ">
              <option value="month">เดือน</option>
              <option value="day">วัน</option>
            </select>
          </div>
        </div>
        <label data-field="due" className="grid gap-1 text-[13px] text-muted-foreground">
          ครบกำหนดครั้งถัดไป *
          <input className={input} type="date" value={due} onChange={(e) => (setDue(e.target.value), setError(null))} />
        </label>
        {editing && (
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
            เปิดใช้งานแผนนี้
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-border pt-3">
          <button type="button" onClick={() => onClose(null)} className={`${btn} border border-border hover:bg-muted`}>
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || (editing && !dirty)} className={`${btn} bg-primary text-primary-foreground`}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
