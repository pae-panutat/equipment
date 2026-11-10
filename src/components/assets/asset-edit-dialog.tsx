"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ASSET_STATUSES, ASSET_STATUS_LABEL, assetStatusProblem, type AssetDetail, type AssetStatus, type FilterOptions, type LocationOption } from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { unitOptions } from "@/lib/unit-options";
import { Skeleton } from "@/components/ui/card";
import { ApiError, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Kind = "text" | "textarea" | "date" | "type" | "status" | "unit" | "location";
type Key =
  | "name" | "typeId" | "status" | "ownerUnitId" | "locationId" | "locationDetail" | "brand" | "model"
  | "serialNumber" | "legacyAssetNo" | "installDate" | "purchaseDate" | "warrantyEnd" | "notes";
type Values = Record<Key, string>;
type FieldDef = { key: Key; label: string; kind: Kind; max?: number; wide?: boolean };

// The asset code is deliberately not here: it can never be edited.
const FIELDS: FieldDef[] = [
  { key: "name", label: "ชื่ออุปกรณ์ *", kind: "text", max: 191, wide: true },
  { key: "typeId", label: "ประเภทอุปกรณ์", kind: "type" },
  { key: "status", label: "สถานะ", kind: "status" },
  { key: "ownerUnitId", label: "ส่วนงานเจ้าของ", kind: "unit", wide: true },
  { key: "locationId", label: "สถานที่", kind: "location", wide: true },
  { key: "locationDetail", label: "รายละเอียดที่ตั้ง", kind: "text", max: 255, wide: true },
  { key: "brand", label: "ยี่ห้อ", kind: "text", max: 120 },
  { key: "model", label: "รุ่น", kind: "text", max: 120 },
  { key: "serialNumber", label: "หมายเลขเครื่อง", kind: "text", max: 120 },
  { key: "legacyAssetNo", label: "เลขครุภัณฑ์เดิม", kind: "text", max: 60 },
  { key: "installDate", label: "วันที่ติดตั้ง", kind: "date" },
  { key: "purchaseDate", label: "วันที่ซื้อ", kind: "date" },
  { key: "warrantyEnd", label: "ประกันหมด", kind: "date" },
  { key: "notes", label: "หมายเหตุ", kind: "textarea", max: 5000, wide: true },
];

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "min-h-11 rounded-xl px-4 font-bold disabled:opacity-50";

function initialValues(a: AssetDetail): Values {
  return {
    name: a.name,
    typeId: String(a.typeId),
    status: a.status,
    ownerUnitId: String(a.ownerUnitId),
    locationId: a.locationId === null ? "" : String(a.locationId),
    locationDetail: a.locationDetail ?? "",
    brand: a.brand ?? "",
    model: a.model ?? "",
    serialNumber: a.serialNumber ?? "",
    legacyAssetNo: a.legacyAssetNo ?? "",
    installDate: a.installDate ?? "",
    purchaseDate: a.purchaseDate ?? "",
    warrantyEnd: a.warrantyEnd ?? "",
    notes: a.notes ?? "",
  };
}

/** The value as the API stores it (empty text -> null, ids -> numbers). */
function toApi(key: Key, raw: string): string | number | null {
  const v = raw.trim();
  switch (key) {
    case "name":
    case "status":
      return v;
    case "typeId":
    case "ownerUnitId":
      return Number(v);
    case "locationId":
      return v === "" ? null : Number(v);
    default:
      return v === "" ? null : v;
  }
}

export function AssetEditDialog({ assetId, onClose }: { assetId: number; onClose: (changedCode: string | null) => void }) {
  const detail = useApi<AssetDetail>(`/assets/${assetId}`);
  const filters = useApi<FilterOptions>("/meta/filters");
  const locations = useApi<LocationOption[]>("/meta/locations");
  const ready = detail.data && filters.data && locations.data;
  const [dirty, setDirty] = useState(false); // unsaved edits: Esc must not throw them away
  const loadError = detail.error ?? filters.error ?? locations.error;

  return (
    <Modal title={detail.data ? `แก้ไขอุปกรณ์ ${detail.data.code}` : "แก้ไขอุปกรณ์"} onClose={() => onClose(null)} canDismiss={!dirty}>
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
        <EditForm asset={detail.data!} units={filters.data!.units} types={filters.data!.types} locations={locations.data!} onClose={onClose} onDirtyChange={setDirty} />
      )}
    </Modal>
  );
}

function EditForm({
  asset,
  units,
  types,
  locations,
  onClose,
  onDirtyChange,
}: {
  asset: AssetDetail;
  units: FilterOptions["units"];
  types: FilterOptions["types"];
  locations: LocationOption[];
  onClose: (changedCode: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const base = useMemo(() => initialValues(asset), [asset]);
  const [values, setValues] = useState<Values>(base);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const set = (key: Key, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setError(null);
  };

  const changes = FIELDS.filter((f) => toApi(f.key, values[f.key]) !== toApi(f.key, base[f.key]));

  const hasChanges = changes.length > 0;
  useEffect(() => onDirtyChange(hasChanges || step === "confirm"), [hasChanges, step, onDirtyChange]);

  // Options always include the current value, even if it was archived since (so the select never silently changes it).
  const typeOptions = types.some((t) => t.id === asset.typeId) ? types : [{ id: asset.typeId, name: asset.type }, ...types];
  const unitOpts = unitOptions(units);
  if (!unitOpts.some((u) => u.id === asset.ownerUnitId)) unitOpts.unshift({ id: asset.ownerUnitId, label: asset.unit });
  const locationOpts = asset.locationId !== null && !locations.some((l) => l.id === asset.locationId)
    ? [{ id: asset.locationId, label: asset.location ?? `#${asset.locationId}` }, ...locations]
    : locations;

  function display(key: Key, raw: string): string {
    const v = toApi(key, raw);
    switch (key) {
      case "typeId":
        return typeOptions.find((t) => t.id === v)?.name ?? "—";
      case "ownerUnitId":
        return unitOpts.find((u) => u.id === v)?.label.replace(/^(— )+/, "") ?? "—";
      case "locationId":
        return v === null ? "ไม่ระบุ" : (locationOpts.find((l) => l.id === v)?.label ?? "—");
      case "status":
        return ASSET_STATUS_LABEL[v as AssetStatus] ?? String(v);
      case "installDate":
      case "purchaseDate":
      case "warrantyEnd":
        return v === null ? "ไม่ระบุ" : formatDate(String(v));
      default:
        return v === null || v === "" ? "ไม่ระบุ" : String(v);
    }
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("กรุณากรอกชื่ออุปกรณ์");
    if (changes.length === 0) return setError("ยังไม่มีการเปลี่ยนแปลง");
    setError(null);
    setStep("confirm");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { expectedVersion: asset.version };
      for (const f of changes) body[f.key] = toApi(f.key, values[f.key]);
      await apiSend("PATCH", `/assets/${asset.id}`, body);
      onClose(asset.code);
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
            ตรวจสอบการเปลี่ยนแปลงของ <b>{asset.code}</b> ({changes.length} รายการ) แล้วกดยืนยันเพื่อบันทึกลงฐานข้อมูล
          </p>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {changes.map((f) => (
              <li key={f.key} className="grid gap-1 px-4 py-3 text-[15px] sm:grid-cols-[150px_1fr] sm:gap-3">
                <span className="text-muted-foreground">{f.label.replace(" *", "")}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-muted-foreground line-through">{display(f.key, base[f.key])}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <b className="whitespace-pre-wrap break-words">{display(f.key, values[f.key])}</b>
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-5 py-3 sm:px-6">
          {conflict ? (
            <button type="button" data-autofocus onClick={() => onClose(null)} className={`${btn} bg-primary text-primary-foreground`}>
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

  const dirty = changes.length > 0;
  return (
    <>
      <form id="asset-edit-form" onSubmit={review} className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2 sm:px-6">
        <label className="grid gap-1 text-[13px] text-muted-foreground sm:col-span-2">
          รหัสอุปกรณ์ (แก้ไขไม่ได้)
          <input className={`${input} cursor-not-allowed opacity-70`} value={asset.code} readOnly disabled />
        </label>
        {FIELDS.map((f, i) => (
          <label key={f.key} className={`grid gap-1 text-[13px] text-muted-foreground ${f.wide ? "sm:col-span-2" : ""}`}>
            {f.label}
            {f.kind === "textarea" ? (
              <textarea className={`${input} min-h-24 py-2`} value={values[f.key]} maxLength={f.max} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.kind === "type" ? (
              <select className={input} value={values.typeId} onChange={(e) => set("typeId", e.target.value)}>
                {typeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : f.kind === "status" ? (
              <>
                <select className={input} value={values.status} onChange={(e) => set("status", e.target.value)}>
                  {ASSET_STATUSES.map((s) => {
                    const problem = s === asset.status ? null : assetStatusProblem(s, asset.inProgressJobs);
                    return (
                      <option key={s} value={s} disabled={problem !== null} title={problem ?? undefined}>
                        {ASSET_STATUS_LABEL[s]}
                        {problem ? " (เลือกไม่ได้ตอนนี้)" : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="text-xs">
                  {asset.inProgressJobs > 0
                    ? `มีงานกำลังดำเนินการ ${asset.inProgressJobs} รายการ จึงเป็น "กำลังดำเนินการ" — บันทึกผลงานให้เสร็จแล้วสถานะจะเปลี่ยนเอง`
                    : "สถานะ \"กำลังดำเนินการ\" ระบบตั้งให้เองเมื่อมีงานที่กำลังดำเนินการ (ตั้งเองไม่ได้)"}
                </span>
              </>
            ) : f.kind === "unit" ? (
              <select className={input} value={values.ownerUnitId} onChange={(e) => set("ownerUnitId", e.target.value)}>
                {unitOpts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            ) : f.kind === "location" ? (
              <select className={input} value={values.locationId} onChange={(e) => set("locationId", e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {locationOpts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={input}
                type={f.kind === "date" ? "date" : "text"}
                maxLength={f.max}
                value={values[f.key]}
                data-autofocus={i === 0 ? "" : undefined}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </label>
        ))}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:px-6">
        <span className="text-sm text-muted-foreground">{dirty ? `แก้ไขแล้ว ${changes.length} รายการ (ยังไม่ได้บันทึก)` : "ยังไม่มีการเปลี่ยนแปลง"}</span>
        <div className="flex gap-3">
          <button type="button" onClick={() => onClose(null)} className={`${btn} border border-border hover:bg-muted`}>
            ยกเลิก
          </button>
          <button type="submit" form="asset-edit-form" className={`${btn} bg-primary text-primary-foreground`}>
            ตรวจสอบและบันทึก
          </button>
        </div>
      </div>
    </>
  );
}
