"use client";

import { useEffect, useMemo, useState } from "react";
import { ASSET_STATUS_LABEL, type AssetStatus, type FilterOptions, type LocationOption } from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { unitOptions } from "@/lib/unit-options";
import { Skeleton } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type V = {
  code: string; name: string; typeId: string; ownerUnitId: string; status: string; locationId: string; locationDetail: string;
  brand: string; model: string; serialNumber: string; legacyAssetNo: string; installDate: string; purchaseDate: string; warrantyEnd: string; notes: string;
};
type Key = keyof V;

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "min-h-11 rounded-xl px-4 font-bold disabled:opacity-50";
const CODE_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

// "In progress" is not offered: that status is set by the system when a job is in progress. "Disposed" makes no sense for a new asset.
const START_STATUSES: AssetStatus[] = ["active", "faulty", "inactive"];

const EMPTY: V = {
  code: "", name: "", typeId: "", ownerUnitId: "", status: "active", locationId: "", locationDetail: "", brand: "", model: "",
  serialNumber: "", legacyAssetNo: "", installDate: "", purchaseDate: "", warrantyEnd: "", notes: "",
};

const LABEL: Record<Key, string> = {
  code: "รหัสอุปกรณ์", name: "ชื่ออุปกรณ์", typeId: "ประเภทอุปกรณ์", ownerUnitId: "ส่วนงานเจ้าของ", status: "สถานะ", locationId: "สถานที่",
  locationDetail: "รายละเอียดที่ตั้ง", brand: "ยี่ห้อ", model: "รุ่น", serialNumber: "หมายเลขเครื่อง", legacyAssetNo: "เลขครุภัณฑ์เดิม",
  installDate: "วันที่ติดตั้ง", purchaseDate: "วันที่ซื้อ", warrantyEnd: "ประกันหมด", notes: "หมายเหตุ",
};
const ORDER: Key[] = ["code", "name", "typeId", "ownerUnitId", "status", "locationId", "locationDetail", "brand", "model", "serialNumber", "legacyAssetNo", "installDate", "purchaseDate", "warrantyEnd", "notes"];

/** Add a new asset (Super Admin / Technician). A popup with a confirm step, like editing. */
export function AssetCreateDialog({ defaultUnitId, onClose }: { defaultUnitId?: string; onClose: (created: { id: number; code: string } | null) => void }) {
  const filters = useApi<FilterOptions>("/meta/filters");
  const locations = useApi<LocationOption[]>("/meta/locations");
  const [dirty, setDirty] = useState(false);
  const loadError = filters.error ?? locations.error;
  const ready = filters.data && locations.data;

  return (
    <Modal title="เพิ่มอุปกรณ์ใหม่" onClose={() => onClose(null)} canDismiss={!dirty}>
      {loadError ? (
        <div className="grid gap-4 p-6">
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
            {loadError}
          </p>
          <button type="button" data-autofocus onClick={() => onClose(null)} className={`${btn} border border-border`}>
            ปิด
          </button>
        </div>
      ) : !ready ? (
        <div className="p-6">
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Form units={filters.data!.units} types={filters.data!.types} locations={locations.data!} defaultUnitId={defaultUnitId} onClose={onClose} onDirtyChange={setDirty} />
      )}
    </Modal>
  );
}

function Form({
  units, types, locations, defaultUnitId, onClose, onDirtyChange,
}: {
  units: FilterOptions["units"]; types: FilterOptions["types"]; locations: LocationOption[]; defaultUnitId?: string;
  onClose: (created: { id: number; code: string } | null) => void; onDirtyChange: (d: boolean) => void;
}) {
  const unitOpts = useMemo(() => unitOptions(units), [units]);
  const initial = useMemo<V>(() => ({ ...EMPTY, ownerUnitId: unitOpts.some((u) => String(u.id) === defaultUnitId) ? defaultUnitId! : unitOpts.length === 1 ? String(unitOpts[0].id) : "" }), [unitOpts, defaultUnitId]);
  const [v, setV] = useState<V>(initial);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: Key, value: string) => {
    if (key === "code") setCodeTouched(true);
    setV((s) => ({ ...s, [key]: value }));
    setError(null);
  };

  const dirty = ORDER.some((k) => v[k] !== initial[k]) || step === "confirm";
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Suggest the next free code once the type and the unit are known (until the person types their own).
  useEffect(() => {
    if (codeTouched || !v.typeId || !v.ownerUnitId) return;
    let cancelled = false;
    apiGet<{ code: string }>("/meta/next-asset-code", { typeId: v.typeId, unitId: v.ownerUnitId })
      .then((r) => !cancelled && setV((s) => (codeTouched ? s : { ...s, code: r.code })))
      .catch(() => undefined); // a suggestion is only a convenience
    return () => {
      cancelled = true;
    };
  }, [v.typeId, v.ownerUnitId, codeTouched]);

  const typeName = (id: string) => types.find((t) => String(t.id) === id)?.name ?? "";
  const unitName = (id: string) => unitOpts.find((u) => String(u.id) === id)?.label.replace(/^(— )+/, "") ?? "";
  const locationName = (id: string) => locations.find((l) => String(l.id) === id)?.label ?? "";
  const show = (k: Key): string => {
    const x = v[k].trim();
    switch (k) {
      case "typeId": return typeName(v.typeId);
      case "ownerUnitId": return unitName(v.ownerUnitId);
      case "locationId": return x ? locationName(x) : "";
      case "status": return ASSET_STATUS_LABEL[v.status as AssetStatus];
      case "installDate":
      case "purchaseDate":
      case "warrantyEnd": return x ? formatDate(x) : "";
      default: return x;
    }
  };

  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!CODE_RULE.test(v.code.trim())) return setError("รหัสอุปกรณ์ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - ยาวไม่เกิน 40 ตัว และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข");
    if (!v.name.trim()) return setError("กรุณากรอกชื่ออุปกรณ์");
    if (!v.typeId) return setError("กรุณาเลือกประเภทอุปกรณ์");
    if (!v.ownerUnitId) return setError("กรุณาเลือกส่วนงานเจ้าของอุปกรณ์");
    setError(null);
    setStep("confirm");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const text = (k: Key) => (v[k].trim() === "" ? undefined : v[k].trim());
      const body = {
        code: v.code.trim(), name: v.name.trim(), typeId: Number(v.typeId), ownerUnitId: Number(v.ownerUnitId), status: v.status,
        locationId: v.locationId ? Number(v.locationId) : undefined, locationDetail: text("locationDetail"), brand: text("brand"), model: text("model"),
        serialNumber: text("serialNumber"), legacyAssetNo: text("legacyAssetNo"), installDate: text("installDate"), purchaseDate: text("purchaseDate"),
        warrantyEnd: text("warrantyEnd"), notes: text("notes"),
      };
      const r = await apiSend<{ id: number; code: string }>("POST", "/assets", body);
      onClose({ id: r.id, code: r.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เพิ่มอุปกรณ์ไม่สำเร็จ");
      setStep("edit"); // e.g. the code is already taken: go back to the form so it can be changed
      setSaving(false);
    }
  }

  if (types.length === 0 || unitOpts.length === 0) {
    return (
      <div className="grid gap-4 p-6">
        <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          {types.length === 0 ? "ยังไม่มีประเภทอุปกรณ์ในระบบ" : "ยังไม่มีส่วนงานที่คุณเพิ่มอุปกรณ์ได้"} ต้องเพิ่มข้อมูลนี้ก่อนจึงจะเพิ่มอุปกรณ์ได้
        </p>
        <button type="button" data-autofocus onClick={() => onClose(null)} className={`${btn} border border-border`}>
          ปิด
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    const rows = ORDER.filter((k) => show(k) !== "");
    return (
      <>
        <div className="overflow-y-auto px-5 py-4 sm:px-6">
          <p className="text-[15px]">
            ตรวจสอบข้อมูลของอุปกรณ์ใหม่ <b>{v.code.trim()}</b> แล้วกดยืนยันเพื่อเพิ่มลงทะเบียน (QR Code จะถูกสร้างให้อัตโนมัติ)
          </p>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {rows.map((k) => (
              <li key={k} className="grid gap-1 px-4 py-3 text-[15px] sm:grid-cols-[170px_1fr] sm:gap-3">
                <span className="text-muted-foreground">{LABEL[k]}</span>
                <b className="whitespace-pre-wrap break-words">{show(k)}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
          <button type="button" disabled={saving} onClick={() => setStep("edit")} className={`${btn} border border-border hover:bg-muted`}>
            กลับไปแก้ไข
          </button>
          <button type="button" data-autofocus disabled={saving} onClick={() => void save()} className={`${btn} bg-primary text-primary-foreground`}>
            {saving ? "กำลังบันทึก..." : "ยืนยันและเพิ่มอุปกรณ์"}
          </button>
        </div>
      </>
    );
  }

  const field = (k: Key, control: React.ReactNode, opts: { wide?: boolean; hint?: string; required?: boolean } = {}) => (
    <label className={`grid gap-1 text-[13px] text-muted-foreground ${opts.wide ? "sm:col-span-2" : ""}`}>
      {LABEL[k]}
      {opts.required ? " *" : ""}
      {control}
      {opts.hint && <span className="text-xs">{opts.hint}</span>}
    </label>
  );
  const text = (k: Key, max: number, o: { type?: string; autoFocus?: boolean; placeholder?: string } = {}) => (
    <input className={input} type={o.type ?? "text"} value={v[k]} maxLength={max} placeholder={o.placeholder} data-autofocus={o.autoFocus ? "" : undefined} onChange={(e) => set(k, e.target.value)} />
  );

  return (
    <>
      <form id="asset-create-form" onSubmit={review} className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2 sm:px-6">
        {field("typeId", (
          <select className={input} value={v.typeId} data-autofocus="" onChange={(e) => set("typeId", e.target.value)}>
            <option value="">— เลือกประเภท —</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ), { required: true })}
        {field("ownerUnitId", (
          <select className={input} value={v.ownerUnitId} onChange={(e) => set("ownerUnitId", e.target.value)}>
            <option value="">— เลือกส่วนงาน —</option>
            {unitOpts.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        ), { required: true })}
        {field("code", text("code", 40, { placeholder: "เช่น AC-ENG-001" }), { wide: true, required: true, hint: "ระบบเสนอรหัสให้เมื่อเลือกประเภทและส่วนงาน แก้เองได้ (A-Z a-z 0-9 . _ - ไม่ซ้ำกับอุปกรณ์อื่น) และแก้ภายหลังไม่ได้" })}
        {field("name", text("name", 191, { placeholder: "เช่น เครื่องปรับอากาศ Daikin ห้อง 301" }), { wide: true, required: true })}
        {field("status", (
          <select className={input} value={v.status} onChange={(e) => set("status", e.target.value)}>
            {START_STATUSES.map((s) => <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>)}
          </select>
        ))}
        {field("locationId", (
          <select className={input} value={v.locationId} onChange={(e) => set("locationId", e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        ))}
        {field("locationDetail", text("locationDetail", 255), { wide: true })}
        {field("brand", text("brand", 120))}
        {field("model", text("model", 120))}
        {field("serialNumber", text("serialNumber", 120))}
        {field("legacyAssetNo", text("legacyAssetNo", 60))}
        {field("installDate", text("installDate", 10, { type: "date" }))}
        {field("purchaseDate", text("purchaseDate", 10, { type: "date" }))}
        {field("warrantyEnd", text("warrantyEnd", 10, { type: "date" }))}
        {field("notes", <textarea className={`${input} min-h-24 py-2`} value={v.notes} maxLength={5000} onChange={(e) => set("notes", e.target.value)} />, { wide: true })}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:px-6">
        <span className="text-sm text-muted-foreground">ช่องที่มี * ต้องกรอก</span>
        <div className="flex gap-3">
          <button type="button" onClick={() => onClose(null)} className={`${btn} border border-border hover:bg-muted`}>
            ยกเลิก
          </button>
          <button type="submit" form="asset-create-form" className={`${btn} bg-primary text-primary-foreground`}>
            ตรวจสอบและเพิ่ม
          </button>
        </div>
      </div>
    </>
  );
}
