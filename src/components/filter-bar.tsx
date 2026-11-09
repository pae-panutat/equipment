"use client";

import { ASSET_STATUSES, ASSET_STATUS_LABEL, type AssetStatus, type FilterOptions } from "@shared/index";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export type Filters = { unitId: string; typeId: string; status: string; from: string; to: string };
export const EMPTY_FILTERS: Filters = { unitId: "", typeId: "", status: "", from: "", to: "" };

const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-[13px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

/** Units are shown as an indented tree so sub-units are easy to tell apart. */
function unitOptions(units: FilterOptions["units"]) {
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const u of units.filter((x) => x.parentId === parent)) {
      out.push({ id: u.id, label: `${"— ".repeat(depth)}${u.name}` });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function FilterBar({
  value,
  onChange,
  withDates = false,
  className,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  withDates?: boolean;
  className?: string;
}) {
  const { data } = useApi<FilterOptions>("/meta/filters");
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const dirty = Object.values(value).some(Boolean);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]", className)}>
      <Field label="ส่วนงาน (รวมส่วนงานย่อย)">
        <select className={field} value={value.unitId} onChange={(e) => set({ unitId: e.target.value })}>
          <option value="">ทุกส่วนงาน</option>
          {unitOptions(data?.units ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ประเภทอุปกรณ์">
        <select className={field} value={value.typeId} onChange={(e) => set({ typeId: e.target.value })}>
          <option value="">ทุกประเภท</option>
          {(data?.types ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="สถานะ">
        <select className={field} value={value.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">ทุกสถานะ</option>
          {ASSET_STATUSES.map((s: AssetStatus) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      {withDates && (
        <>
          <Field label="ตั้งแต่วันที่">
            <input type="date" className={field} value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="ถึงวันที่">
            <input type="date" className={field} value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </Field>
        </>
      )}
      <div className="flex items-end">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onChange(EMPTY_FILTERS)}
          className="min-h-11 w-full rounded-xl border border-border px-4 text-[15px] text-muted-foreground enabled:hover:bg-muted disabled:opacity-40"
        >
          ล้างตัวกรอง
        </button>
      </div>
    </div>
  );
}
