"use client";

import { ASSET_STATUSES, ASSET_STATUS_LABEL, type AssetStatus, type FilterOptions } from "@shared/index";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

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
  className,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  className?: string;
}) {
  const { data } = useApi<FilterOptions>("/meta/filters");
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const dirty = Object.values(value).some(Boolean);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(300px,2.4fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto]", className)}>
      <Field label="ส่วนงาน (รวมส่วนงานย่อย)" className="sm:col-span-2 xl:col-span-1" emphasis>
        <select className={cn(field, "border-primary/50 font-bold")} value={value.unitId} onChange={(e) => set({ unitId: e.target.value })}>
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
      <div className="flex items-end sm:col-span-2 xl:col-span-1">
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
