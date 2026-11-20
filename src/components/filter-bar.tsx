"use client";

import { ASSET_STATUSES, ASSET_STATUS_LABEL, type AssetStatus, type FilterOptions } from "@shared/index";
import { useAuth } from "@/lib/auth";
import { unitOptions } from "@/lib/unit-options";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export type Filters = { unitId: string; typeId: string; status: string };
export const EMPTY_FILTERS: Filters = { unitId: "", typeId: "", status: "" };

const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";

function Field({ label, children, className, emphasis = false }: { label: string; children: React.ReactNode; className?: string; emphasis?: boolean }) {
  return (
    <label className={cn("grid min-w-0 gap-1 text-[13px]", emphasis ? "font-bold text-foreground" : "text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}

/** Units are shown as an indented tree so sub-units are easy to tell apart. */
export function FilterBar({
  value,
  onChange,
  className,
  children,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  className?: string;
  /** extra fields shown in the same row, after "สถานะ" (e.g. a month range); the unit box is made narrower to make room */
  children?: React.ReactNode;
}) {
  const { data } = useApi<FilterOptions>("/meta/filters");
  const { user } = useAuth();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  // Someone who sees only their own faculty has no "all units": the box shows their faculty (and its sub-units) from the start.
  const restricted = Boolean(user && !user.seesAllUnits);
  const own = restricted && user?.unitId ? String(user.unitId) : "";
  const dirty = Boolean((value.unitId && value.unitId !== own) || value.typeId || value.status);

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        children ? "xl:grid-cols-[minmax(190px,1.2fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto_auto_auto]" : "xl:grid-cols-[minmax(300px,2.4fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto]",
        className,
      )}
    >
      <Field label={restricted ? "ส่วนงาน" : "ส่วนงาน (รวมส่วนงานย่อย)"} className="sm:col-span-2 xl:col-span-1" emphasis>
        <Select
          className={cn(field, "border-primary/50 font-bold")}
          value={restricted ? value.unitId || own : value.unitId}
          onChange={(e) => set({ unitId: e.target.value === own ? "" : e.target.value })}
        >
          {!restricted && <option value="">ทุกส่วนงาน</option>}
          {restricted && !own && <option value="">— ยังไม่กำหนดส่วนงาน —</option>}
          {unitOptions(data?.units ?? [], { keepRoot: restricted }).map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ประเภทอุปกรณ์">
        <Select className={field} value={value.typeId} onChange={(e) => set({ typeId: e.target.value })}>
          <option value="">ทุกประเภท</option>
          {(data?.types ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="สถานะ">
        <Select className={field} value={value.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">ทุกสถานะ</option>
          {ASSET_STATUSES.map((s: AssetStatus) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      {children}
      <div className="flex items-end sm:col-span-2 xl:col-span-1">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onChange(EMPTY_FILTERS)}
          className="min-h-9 w-full rounded-xl border border-border px-3.5 text-sm text-muted-foreground enabled:hover:bg-muted disabled:opacity-40"
        >
          ล้างตัวกรอง
        </button>
      </div>
    </div>
  );
}
