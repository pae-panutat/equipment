"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { type AssetListItem, type Paged } from "@shared/index";
import { Card, ErrorState, Skeleton } from "@/components/ui/card";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { planSize, type Alert, type Kind, type Room } from "./building-3d";
import { AssetDrawer } from "./asset-drawer";

// three.js is large and needs the browser: it is fetched only when this page opens, and never rendered on the server.
const Building3D = dynamic(() => import("./building-3d").then((m) => m.Building3D), { ssr: false, loading: () => <Skeleton className="h-[460px]" /> });

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const TONE: Record<Alert, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };
const WORST: Alert[] = ["ok", "warn", "bad"];

type Placed = { asset: AssetListItem; floor: number; room: string; alert: Alert; kind: Kind };

const kindOf = (type: string): Kind => {
  const t = type.toLowerCase();
  return t.includes("chiller") ? "chiller" : t.includes("pump") || t.includes("ปั๊ม") ? "pump" : t.includes("ปรับอากาศ") || t.includes("air") || t.includes("ahu") || t.includes("fcu") ? "air" : "other";
};

/** The location text is "campus › building › floor › room"; pick the building, floor number and room out of it. */
function place(a: AssetListItem, now: string): { building: string; p: Placed } | null {
  const parts = (a.location ?? "").split(" › ");
  const building = parts.find((s) => s.startsWith("อาคาร"));
  const floor = parts.map((s) => /^ชั้น\s*(\d+)/.exec(s)).find(Boolean);
  if (!building || !floor) return null;
  const room = parts.find((s) => s.startsWith("ห้อง")) ?? "";
  const alert: Alert = a.status === "faulty" || a.status === "under_repair" ? "bad" : a.nextDue && a.nextDue < now ? "warn" : "ok";
  return { building, p: { asset: a, floor: Number(floor[1]), room, alert, kind: kindOf(a.type) } };
}

const worst = (list: Placed[]): Alert => WORST[Math.max(0, ...list.map((p) => WORST.indexOf(p.alert)))];

export function BuildingView() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { user } = useAuth();
  // The model is shown only once a faculty/unit is chosen; someone who sees only their own faculty has it chosen from the start.
  const unitChosen = Boolean(filters.unitId || (user && !user.seesAllUnits && user.unitId));
  const { data, error, loading, reload } = useApi<Paged<AssetListItem>>(
    "/assets",
    { pageSize: 100, sort: "code", unitId: filters.unitId, typeId: filters.typeId, status: filters.status },
    { live: true },
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [floor, setFloor] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const now = today();

  const buildings = useMemo(() => {
    const m = new Map<string, Placed[]>();
    for (const a of data?.items ?? []) {
      const r = place(a, now);
      if (r) m.set(r.building, [...(m.get(r.building) ?? []), r.p]);
    }
    return m;
  }, [data, now]);

  const names = [...buildings.keys()].sort();
  const name = chosen && buildings.has(chosen) ? chosen : (names[0] ?? null);
  const placed = useMemo(() => (name ? (buildings.get(name) ?? []) : []), [buildings, name]);

  const floors = useMemo(() => [...new Set(placed.map((p) => p.floor))].sort((a, b) => a - b), [placed]);
  const shown = floors.includes(floor) ? floor : (floors[0] ?? 1);

  // the rooms of the floor on show, each with its machines
  const rooms: Room[] = useMemo(() => {
    const here = placed.filter((p) => p.floor === shown);
    return [...new Set(here.map((p) => p.room))].sort().map((r) => ({
      name: r || "ไม่ระบุห้อง",
      items: here.filter((p) => p.room === r).map((p) => ({ id: p.asset.id, label: p.asset.code, name: p.asset.name, kind: p.kind, alert: p.alert })),
    }));
  }, [placed, shown]);

  const extent = useMemo(() => planSize(Math.max(2, ...floors.map((f) => new Set(placed.filter((p) => p.floor === f).map((p) => p.room)).size))), [floors, placed]);
  const needs = placed.filter((p) => p.alert !== "ok").length;
  const current = placed.find((p) => p.asset.id === picked) ?? null;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">อาคาร 3 มิติ</h1>
        <p className="mt-1 text-muted-foreground">ลากเพื่อเลื่อนแผนผัง (คลิกขวาลากเพื่อหมุน, ล้อเมาส์เพื่อซูม) กดที่เครื่องเพื่อดูข้อมูลอุปกรณ์นั้น</p>
      </div>

      <FilterBar allUnitsLabel="กรุณาเลือกส่วนงาน" value={filters} onChange={(v) => (setFilters(v), setPicked(null))} />

      {!unitChosen ? (
        <Card>
          <p className="py-6 text-center text-muted-foreground">เลือกส่วนงาน/คณะก่อน เพื่อดูแบบจำลองอาคาร 3 มิติ</p>
        </Card>
      ) : (
        <>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <Skeleton className="h-[460px]" />
      ) : names.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">ยังไม่มีอุปกรณ์ที่ระบุอาคารและชั้น จึงยังสร้างโมเดลไม่ได้</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {names.length > 1 ? (
                <select
                  value={name ?? ""}
                  onChange={(e) => (setChosen(e.target.value), setPicked(null))}
                  aria-label="เลือกอาคาร"
                  className="min-h-10 rounded-xl border border-border bg-card px-3 text-sm font-bold"
                >
                  {names.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              ) : (
                <b className="mr-1 text-lg">{name}</b>
              )}
              <div role="tablist" aria-label="เลือกชั้น" className="flex flex-wrap gap-1.5">
                {floors.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={f === shown}
                    onClick={() => (setFloor(f), setPicked(null))}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold",
                      f === shown ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    ชั้น {f}
                    <i className={cn("size-2 rounded-full", TONE[worst(placed.filter((p) => p.floor === f))], f === shown && "ring-2 ring-white/70")} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{placed.length}</b> รายการ · <b className={needs ? "text-red-600 dark:text-red-400" : "text-foreground"}>{needs}</b> ต้องดูแล
            </p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(["ok", "warn", "bad"] as const).map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5">
                <i className={cn("size-2.5 rounded-full", TONE[a])} /> {a === "ok" ? "ปกติ" : a === "warn" ? "เลยกำหนดบำรุงรักษา" : "ชำรุด/กำลังซ่อม"}
              </span>
            ))}
          </div>

          <div className="h-[max(620px,calc(100dvh-220px))]">
            <Building3D rooms={rooms} extent={extent} selected={picked} onPick={setPicked} />
          </div>
        </div>
      )}
        </>
      )}

      {current && <AssetDrawer asset={current.asset} alert={current.alert} onClose={() => setPicked(null)} />}
    </div>
  );
}
