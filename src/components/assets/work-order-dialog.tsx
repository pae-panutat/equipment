"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  ASSET_STATUSES,
  assetStatusProblem,
  autoAssetStatus,
  ASSET_STATUS_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  WORK_ORDER_KINDS,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_TERMINAL,
  type AssetDetail,
  type AssetStatus,
  type WorkOrderItem,
  type WorkOrderStatus,
} from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/card";
import { ApiError, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { focusField } from "@/lib/focus-field";
import { useApi } from "@/lib/use-api";

type Values = {
  kind: string;
  title: string;
  status: string;
  performedOn: string;
  dueDate: string;
  priority: string;
  planId: string;
  description: string;
  assetStatus: string; // "" = leave the asset's status alone
};
type Key = keyof Values;

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "min-h-11 rounded-xl px-4 font-bold disabled:opacity-50";

/** Today in Thailand as YYYY-MM-DD (the server uses the same day for its "not in the future" rule). */
const todayBangkok = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

function initialValues(asset: AssetDetail, wo: WorkOrderItem | null, planId?: number): Values {
  if (wo) {
    return {
      kind: wo.kind, title: wo.title, status: wo.status, performedOn: wo.performedOn ?? "", dueDate: wo.dueDate ?? "", priority: wo.priority,
      planId: wo.planId === null ? "" : String(wo.planId), description: wo.description ?? "", assetStatus: "",
    };
  }
  const activePlans = asset.plans.filter((p) => p.active);
  const fromPlan = planId !== undefined ? activePlans.find((p) => p.id === planId) : undefined; // opened from "due soon / overdue": that plan's job
  if (fromPlan) {
    return {
      kind: "planned", title: fromPlan.title, status: "done", performedOn: todayBangkok(), dueDate: "", priority: "normal", planId: String(fromPlan.id),
      description: "", assetStatus: "",
    };
  }
  return {
    kind: activePlans.length ? "planned" : "repair", title: "", status: "done", performedOn: todayBangkok(), dueDate: "", priority: "normal",
    planId: activePlans.length === 1 ? String(activePlans[0].id) : "", description: "", assetStatus: "",
  };
}

/** The value as the API stores it (empty -> null; ids -> numbers). */
function toApi(key: Key, raw: string): string | number | null {
  const v = raw.trim();
  switch (key) {
    case "planId":
      return v === "" ? null : Number(v);
    case "performedOn":
    case "dueDate":
    case "description":
    case "assetStatus":
      return v === "" ? null : v;
    default:
      return v;
  }
}

const LABEL: Record<Key, string> = {
  kind: "ประเภทงาน", title: "หัวข้องาน", status: "สถานะงาน", performedOn: "วันที่ดำเนินการ", dueDate: "กำหนดเสร็จ", priority: "ความสำคัญ",
  planId: "แผนบำรุงรักษา", description: "รายละเอียด / ผลการดำเนินการ", assetStatus: "สถานะอุปกรณ์",
};
const ORDER: Key[] = ["kind", "title", "status", "performedOn", "dueDate", "priority", "planId", "description", "assetStatus"];

const UNFINISHED: readonly WorkOrderStatus[] = ["in_progress"];

export function WorkOrderDialog({ assetId, workOrderId, planId, onClose }: { assetId: number; workOrderId?: number; planId?: number; onClose: (saved: boolean) => void }) {
  const detail = useApi<AssetDetail>(`/assets/${assetId}`);
  const [dirty, setDirty] = useState(false); // unsaved input: Esc must not throw it away
  // which record the form works on: a given job, "new", or null = not chosen yet (the asset has unfinished jobs to pick from)
  const [choice, setChoice] = useState<"new" | number | null>(workOrderId ?? null);
  const unfinished = detail.data ? detail.data.workOrders.filter((w) => UNFINISHED.includes(w.status)) : [];
  const target = choice === null && detail.data && unfinished.length === 0 ? "new" : choice;
  const wo = detail.data && typeof target === "number" ? detail.data.workOrders.find((w) => w.id === target) ?? null : null;
  const missing = detail.data && typeof target === "number" && !wo;
  const title = target === "new" || target === null ? "บันทึกงานซ่อมบำรุง" : "แก้ไข / บันทึกผลงาน";

  return (
    <Modal title={detail.data ? `${title} · ${detail.data.code}` : title} onClose={() => onClose(false)} canDismiss={!dirty}>
      {detail.error || missing ? (
        <div className="grid gap-4 p-6">
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
            {detail.error ?? "ไม่พบรายการงานนี้ (อาจถูกแก้ไขไปแล้ว)"}
          </p>
          <button type="button" data-autofocus onClick={() => onClose(false)} className={`${btn} border border-border`}>
            ปิด
          </button>
        </div>
      ) : !detail.data ? (
        <div className="p-6">
          <Skeleton className="h-64" />
        </div>
      ) : target === null ? (
        <PickJob asset={detail.data} jobs={unfinished} onPick={setChoice} onCancel={() => onClose(false)} />
      ) : (
        <Form key={String(target)} asset={detail.data} wo={wo} planId={planId} onClose={onClose} onDirtyChange={setDirty} />
      )}
    </Modal>
  );
}

/** Shown when the asset still has unfinished jobs: update one of them instead of starting a duplicate. */
function PickJob({ asset, jobs, onPick, onCancel }: { asset: AssetDetail; jobs: WorkOrderItem[]; onPick: (c: "new" | number) => void; onCancel: () => void }) {
  return (
    <>
      <div className="overflow-y-auto px-5 py-4 sm:px-6">
        <p className="text-[15px]">
          อุปกรณ์นี้ยังมีงานที่ <b>ยังไม่เสร็จ {jobs.length} รายการ</b> (สถานะอุปกรณ์ตอนนี้: <b>{ASSET_STATUS_LABEL[asset.status]}</b>) เลือกงานที่ต้องการบันทึกผล หรือเพิ่มงานใหม่
        </p>
        <ul className="mt-4 grid gap-2">
          {jobs.map((w, i) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="break-words font-bold">{w.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {w.number} · {WORK_ORDER_KIND_LABEL[w.kind]} · <b className="text-foreground">{WORK_ORDER_STATUS_LABEL[w.status]}</b>
                  {w.dueDate ? ` · กำหนด ${formatDate(w.dueDate)}` : ""}
                </p>
              </div>
              <button type="button" data-autofocus={i === 0 ? "" : undefined} onClick={() => onPick(w.id)} className={`${btn} bg-primary text-primary-foreground`}>
                บันทึกผล / แก้ไข
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
        <button type="button" onClick={onCancel} className={`${btn} border border-border hover:bg-muted`}>
          ยกเลิก
        </button>
        <button type="button" onClick={() => onPick("new")} className={`${btn} border border-border hover:bg-muted`}>
          เพิ่มงานใหม่ (คนละเรื่องกับงานข้างบน)
        </button>
      </div>
    </>
  );
}

function Form({ asset, wo, planId, onClose, onDirtyChange }: { asset: AssetDetail; wo: WorkOrderItem | null; planId?: number; onClose: (saved: boolean) => void; onDirtyChange: (d: boolean) => void }) {
  const base = useMemo(() => initialValues(asset, wo, planId), [asset, wo, planId]);
  const [v, setV] = useState<Values>(base);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const editing = wo !== null;
  const locked = editing && WORK_ORDER_TERMINAL.includes(wo.status); // the status of a finished job is fixed

  const set = (key: Key, value: string) => {
    setV((s) => {
      const next = { ...s, [key]: value };
      // choosing "planned" with exactly one active plan links it automatically
      if (key === "kind" && value === "planned" && !s.planId) {
        const active = asset.plans.filter((p) => p.active);
        if (active.length === 1) next.planId = String(active[0].id);
      }
      if (key === "status" && value === "done" && !s.performedOn) next.performedOn = todayBangkok();
      return next;
    });
    setError(null);
  };

  // what is different from what was loaded (a new record: everything that was filled in)
  const changed = editing ? ORDER.filter((k) => toApi(k, v[k]) !== toApi(k, base[k])) : [];
  const hasChanges = editing ? changed.length > 0 : v.title.trim() !== "" || v.description.trim() !== "";
  const confirmedRows = editing ? changed : ORDER.filter((k) => toApi(k, v[k]) !== null);
  const dirty = hasChanges || step === "confirm";
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // The asset's own status follows its jobs automatically (the same rule the server applies); a status picked below overrides it,
  // but only one that does not contradict the jobs (see assetStatusProblem).
  const inProgressAfter = asset.inProgressJobs - (wo?.status === "in_progress" ? 1 : 0) + (v.status === "in_progress" ? 1 : 0);
  const auto = v.assetStatus === "" ? autoAssetStatus({ current: asset.status, inProgress: inProgressAfter }) : null;

  const planLabel = (id: string) => {
    const p = asset.plans.find((x) => String(x.id) === id);
    return p ? `${p.title}${p.nextDueDate ? ` (ครบกำหนด ${formatDate(p.nextDueDate)})` : ""}` : "ไม่เชื่อมแผน";
  };
  function show(k: Key, raw: string): string {
    const val = toApi(k, raw);
    switch (k) {
      case "kind": return WORK_ORDER_KIND_LABEL[raw as keyof typeof WORK_ORDER_KIND_LABEL] ?? raw;
      case "status": return WORK_ORDER_STATUS_LABEL[raw as keyof typeof WORK_ORDER_STATUS_LABEL] ?? raw;
      case "priority": return PRIORITY_LABEL[raw as keyof typeof PRIORITY_LABEL] ?? raw;
      case "planId": return planLabel(raw);
      case "performedOn":
      case "dueDate": return val === null ? "ไม่ระบุ" : formatDate(String(val));
      case "assetStatus": return val === null ? "ไม่เปลี่ยน" : `เปลี่ยนเป็น "${ASSET_STATUS_LABEL[val as AssetStatus]}"`;
      default: return val === null || val === "" ? "ไม่ระบุ" : String(val);
    }
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    // show the message and take the person to the field that needs fixing
    const refuse = (message: string, key?: Key) => {
      setError(message);
      if (key) focusField(key);
    };
    if (!v.title.trim()) return refuse("กรุณากรอกหัวข้องาน", "title");
    if (v.status === "done" && !v.performedOn) return refuse("งานที่เสร็จสิ้นต้องระบุวันที่ดำเนินการ", "performedOn");
    if (v.performedOn && v.performedOn > todayBangkok()) return refuse("วันที่ดำเนินการต้องไม่เป็นวันในอนาคต", "performedOn");
    if (v.assetStatus) {
      const problem = assetStatusProblem(v.assetStatus as AssetStatus, inProgressAfter);
      if (problem) return refuse(problem, "assetStatus");
    }
    if (editing && changed.length === 0) return setError("ยังไม่มีการเปลี่ยนแปลง");
    setError(null);
    setStep("confirm");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const k of editing ? changed : ORDER) {
        const val = toApi(k, v[k]);
        if (k === "assetStatus") {
          if (val !== null) body.assetStatus = val;
        } else body[k] = val;
      }
      if (editing) await apiSend("PATCH", `/work-orders/${wo.id}`, { expectedVersion: wo.version, ...body });
      else await apiSend("POST", `/assets/${asset.id}/work-orders`, body);
      onClose(true);
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  if (step === "confirm") {
    return (
      <>
        <div className="overflow-y-auto px-5 py-4 sm:px-6">
          <p className="text-[15px]">
            {editing ? (
              <>ตรวจสอบการเปลี่ยนแปลงของ <b>{wo.number}</b> ({changed.length} รายการ) แล้วกดยืนยันเพื่อบันทึก</>
            ) : (
              <>ตรวจสอบรายการงานของ <b>{asset.code}</b> แล้วกดยืนยันเพื่อบันทึกลงฐานข้อมูล</>
            )}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {confirmedRows.map((k) => (
              <li key={k} className="grid gap-1 px-4 py-3 text-[15px] sm:grid-cols-[170px_1fr] sm:gap-3">
                <span className="text-muted-foreground">{LABEL[k]}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {editing && (
                    <>
                      <span className="break-words text-muted-foreground line-through">{show(k, base[k])}</span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </>
                  )}
                  <b className="whitespace-pre-wrap break-words">{show(k, v[k])}</b>
                </span>
              </li>
            ))}
            {auto && (
              <li className="grid gap-1 px-4 py-3 text-[15px] sm:grid-cols-[170px_1fr] sm:gap-3">
                <span className="text-muted-foreground">{LABEL.assetStatus}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground line-through">{ASSET_STATUS_LABEL[asset.status]}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <b>{ASSET_STATUS_LABEL[auto]}</b>
                  <span className="text-xs text-muted-foreground">(ระบบปรับให้อัตโนมัติ)</span>
                </span>
              </li>
            )}
          </ul>
          {v.status === "done" && v.planId && (
            <p className="mt-3 text-sm text-muted-foreground">เมื่อบันทึก ระบบจะเลื่อนวันครบกำหนดรอบถัดไปของแผนนี้ให้อัตโนมัติ</p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
          {conflict ? (
            <button type="button" data-autofocus onClick={() => onClose(true)} className={`${btn} bg-primary text-primary-foreground`}>
              ปิดและโหลดข้อมูลล่าสุด
            </button>
          ) : (
            <>
              <button type="button" disabled={saving} onClick={() => setStep("edit")} className={`${btn} border border-border hover:bg-muted`}>
                กลับไปแก้ไข
              </button>
              <button type="button" data-autofocus disabled={saving} onClick={() => void save()} className={`${btn} bg-primary text-primary-foreground`}>
                {saving ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  const field = (k: Key, children: React.ReactNode, wide = false) => (
    <label data-field={k} className={`grid gap-1 text-[13px] text-muted-foreground ${wide ? "sm:col-span-2" : ""}`}>
      {LABEL[k]}
      {children}
    </label>
  );
  const activePlans = asset.plans.filter((p) => p.active || String(p.id) === v.planId);

  return (
    <>
      <form id="work-order-form" onSubmit={review} className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2 sm:px-6">
        <p className="rounded-xl bg-muted px-3 py-2 text-sm sm:col-span-2">
          {asset.code} · {asset.name} · สถานะปัจจุบัน <b>{ASSET_STATUS_LABEL[asset.status]}</b>
          {editing && <> · ใบงาน <b>{wo.number}</b></>}
        </p>
        {field("kind", <select className={input} value={v.kind} onChange={(e) => set("kind", e.target.value)}>{WORK_ORDER_KINDS.map((k) => <option key={k} value={k}>{WORK_ORDER_KIND_LABEL[k]}</option>)}</select>)}
        {field("status", (
          <select className={input} value={v.status} disabled={locked} onChange={(e) => set("status", e.target.value)}>
            {(locked ? [wo.status] : WORK_ORDER_STATUSES).map((s) => <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>)}
          </select>
        ))}
        {field("title", <input data-autofocus className={input} value={v.title} maxLength={191} onChange={(e) => set("title", e.target.value)} placeholder="เช่น ล้างทำความสะอาดแอร์ / เปลี่ยนคาปาซิเตอร์" />, true)}
        {field("performedOn", <input className={input} type="date" value={v.performedOn} max={todayBangkok()} onChange={(e) => set("performedOn", e.target.value)} />)}
        {field("dueDate", <input className={input} type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />)}
        {field("priority", <select className={input} value={v.priority} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>)}
        {asset.plans.length > 0 &&
          field("planId", (
            <select className={input} value={v.planId} onChange={(e) => set("planId", e.target.value)}>
              <option value="">— ไม่เชื่อมแผน —</option>
              {activePlans.map((p) => <option key={p.id} value={p.id}>{planLabel(String(p.id))}</option>)}
            </select>
          ))}
        {field("description", <textarea className={`${input} min-h-24 py-2`} value={v.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} />, true)}
        {field("assetStatus", (
          <select className={input} value={v.assetStatus} onChange={(e) => set("assetStatus", e.target.value)}>
            <option value="">{auto ? `อัตโนมัติ: เปลี่ยนเป็น ${ASSET_STATUS_LABEL[auto]}` : "ไม่เปลี่ยน"} (ปัจจุบัน: {ASSET_STATUS_LABEL[asset.status]})</option>
            {ASSET_STATUSES.filter((s) => s !== asset.status).map((s) => {
              const problem = assetStatusProblem(s, inProgressAfter);
              return <option key={s} value={s} disabled={problem !== null} title={problem ?? undefined}>เปลี่ยนเป็น {ASSET_STATUS_LABEL[s]}{problem ? " (เลือกไม่ได้ตอนนี้)" : ""}</option>;
            })}
          </select>
        ), true)}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
        <button type="button" onClick={() => onClose(false)} className={`${btn} border border-border hover:bg-muted`}>
          ยกเลิก
        </button>
        <button type="submit" form="work-order-form" className={`${btn} bg-primary text-primary-foreground`}>
          ตรวจสอบและบันทึก
        </button>
      </div>
    </>
  );
}
