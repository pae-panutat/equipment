"use client";

import { useEffect, useState } from "react";
import type { AssetDetail, AssetListItem, Paged } from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { apiGet, apiSend } from "@/lib/api";
import { focusField } from "@/lib/focus-field";
import { Select } from "@/components/ui/select";

type Plan = AssetDetail["plans"][number];

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "text-sm min-h-9 rounded-xl px-3.5 font-bold disabled:opacity-50";

/**
 * Add a maintenance plan to an asset, or change one (name, interval, next due date, on/off).
 * With `assetId` null (adding from the calendar) the person first picks the asset; `defaultDue` pre-fills the due date.
 */
export function PlanDialog({
  assetId,
  plan,
  defaultDue,
  onClose,
}: {
  assetId: number | null;
  plan?: Plan;
  defaultDue?: string;
  onClose: (saved: string | null) => void;
}) {
  const editing = Boolean(plan);
  const [asset, setAsset] = useState<{ id: number; code: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<AssetListItem[]>([]);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [value, setValue] = useState(String(plan?.intervalValue ?? 6));
  const [unit, setUnit] = useState<"day" | "month">(plan?.intervalUnit ?? "month");
  const [due, setDue] = useState(plan?.nextDueDate ?? defaultDue ?? "");
  const [active, setActive] = useState(plan?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = assetId ?? asset?.id ?? null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

  // look up assets while typing (only when the asset has to be chosen here)
  useEffect(() => {
    if (assetId !== null || asset || search.trim().length < 1) {
      setFound([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      apiGet<Paged<AssetListItem>>("/assets", { q: search.trim(), pageSize: 6 }, ctrl.signal, true).then((r) => setFound(r.items)).catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [search, asset, assetId]);

  const dirty = plan
    ? title !== plan.title || value !== String(plan.intervalValue) || unit !== plan.intervalUnit || due !== (plan.nextDueDate ?? "") || active !== plan.active
    : title !== "" || asset !== null || due !== (defaultDue ?? "");

  const refuse = (message: string, key: string) => {
    setError(message);
    focusField(key);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (target === null) return refuse("กรุณาเลือกอุปกรณ์", "asset");
    if (!title.trim()) return refuse("กรุณากรอกชื่อแผน", "title");
    if (!Number.isInteger(n) || n < 1 || n > 999) return refuse("รอบต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 999", "interval");
    if (!due) return refuse("กรุณาเลือกวันครบกำหนดครั้งถัดไป", "due");
    if (due < today && due !== plan?.nextDueDate) return refuse("วันครบกำหนดต้องไม่เป็นวันที่ผ่านมาแล้ว", "due"); // an existing overdue date may stay as it is
    setSaving(true);
    setError(null);
    try {
      const body = { title: title.trim(), intervalValue: n, intervalUnit: unit, nextDueDate: due };
      if (plan) await apiSend("PATCH", `/plans/${plan.id}`, { ...body, active });
      else await apiSend("POST", `/assets/${target}/plans`, body);
      onClose(plan ? "บันทึกแผนเรียบร้อยแล้ว" : "เพิ่มแผนเรียบร้อยแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "แก้ไขแผนบำรุงรักษา" : "เพิ่มแผนบำรุงรักษา"} onClose={() => onClose(null)} canDismiss={!dirty}>
      <form onSubmit={submit} className="grid gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        {assetId === null && (
          <div data-field="asset" className="grid gap-1 text-[13px] text-muted-foreground">
            อุปกรณ์ *
            {asset ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-[15px] text-foreground">
                <span className="min-w-0 break-words">
                  <b>{asset.code}</b> · {asset.name}
                </span>
                <button type="button" onClick={() => (setAsset(null), setSearch(""))} className="shrink-0 text-sm text-primary hover:underline">
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <>
                <input data-autofocus className={input} value={search} onChange={(e) => (setSearch(e.target.value), setError(null))} placeholder="พิมพ์รหัสหรือชื่ออุปกรณ์เพื่อค้นหา" />
                {found.length > 0 && (
                  <ul className="overflow-hidden rounded-xl border border-border bg-card text-[15px] text-foreground">
                    {found.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => (setAsset({ id: a.id, code: a.code, name: a.name }), setFound([]))}
                          className="block w-full px-3 py-2 text-left hover:bg-muted"
                        >
                          <b>{a.code}</b> · {a.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <label data-field="title" className="grid gap-1 text-[13px] text-muted-foreground">
          ชื่อแผน *
          <input data-autofocus={assetId === null ? undefined : ""} className={input} value={title} maxLength={191} onChange={(e) => (setTitle(e.target.value), setError(null))} placeholder="เช่น ล้างทำความสะอาดแอร์" />
        </label>
        <div data-field="interval" className="grid gap-1 text-[13px] text-muted-foreground">
          ทำซ้ำทุก *
          <div className="grid grid-cols-2 gap-3">
            <input className={input} type="number" inputMode="numeric" min={1} max={999} value={value} onChange={(e) => (setValue(e.target.value), setError(null))} aria-label="จำนวนรอบ" />
            <Select className={input} value={unit} onChange={(e) => setUnit(e.target.value as "day" | "month")} aria-label="หน่วยของรอบ">
              <option value="month">เดือน</option>
              <option value="day">วัน</option>
            </Select>
          </div>
        </div>
        <label data-field="due" className="grid gap-1 text-[13px] text-muted-foreground">
          ครบกำหนดครั้งถัดไป *
          <input className={input} type="date" value={due} min={plan?.nextDueDate && plan.nextDueDate < today ? plan.nextDueDate : today} onChange={(e) => (setDue(e.target.value), setError(null))} />
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
