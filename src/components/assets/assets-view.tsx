"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pencil, Wrench } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { canEditAssets, type AssetListItem, type Paged } from "@shared/index";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { AssetEditDialog } from "@/components/assets/asset-edit-dialog";
import { WorkOrderDialog } from "@/components/assets/work-order-dialog";
import { QrCell } from "@/components/assets/qr-cell";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type SortKey = "code" | "name" | "status" | "nextDue";
const PAGE_SIZE = 20;

export function AssetsView() {
  const sp = useSearchParams();
  const { user } = useAuth();
  const canEdit = user ? canEditAssets(user.role) : false; // the server enforces this too
  const [editingId, setEditingId] = useState<number | null>(null);
  const [recordingId, setRecordingId] = useState<number | null>(null); // record maintenance work for this asset
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    unitId: sp.get("unitId") ?? "",
    typeId: sp.get("typeId") ?? "",
    status: sp.get("status") ?? "",
  });
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("code");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // debounce the search box; any filter change goes back to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, error, loading, reload } = useApi<Paged<AssetListItem>>("/assets", {
    unitId: filters.unitId,
    typeId: filters.typeId,
    status: filters.status,
    q,
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
  });

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ทะเบียนอุปกรณ์</h1>
        <p className="mt-1 text-muted-foreground">ค้นหา กรอง และจัดเรียงอุปกรณ์ (ประมวลผลที่ฝั่งเซิร์ฟเวอร์)</p>
      </div>

      <Card className="grid gap-4 p-4 sm:p-5">
        <label className="relative block">
          <span className="sr-only">ค้นหา</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ค้นหาด้วยรหัส ชื่อ ยี่ห้อ หรือรุ่น"
            className="min-h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-[15px]"
          />
        </label>
        <FilterBar
          value={filters}
          onChange={(f) => {
            setFilters(f);
            setPage(1);
          }}
        />
      </Card>

      {canEdit && <p className="-mb-2 text-sm text-muted-foreground">ดับเบิลคลิกที่แถวเพื่อแก้ไขอุปกรณ์ (แก้ไขรหัสไม่ได้) หรือกดปุ่มดินสอท้ายแถว</p>}
      {savedNote && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
          {savedNote}
        </p>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {!error && (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <Th label="รหัส" k="code" sort={sort} dir={dir} onSort={toggleSort} />
                  <Th label="ชื่อ / ยี่ห้อ รุ่น" k="name" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-normal">ส่วนงาน / ที่ตั้ง</th>
                  <Th label="สถานะ" k="status" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-normal">ล่าสุด</th>
                  <Th label="ครบกำหนดถัดไป" k="nextDue" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-normal">QR Code</th>
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !data &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-9" />
                      </td>
                    </tr>
                  ))}
                {data?.items.map((a) => (
                  <tr
                    key={a.id}
                    className={cn("border-b border-border last:border-0", loading && "opacity-60", canEdit && "cursor-pointer hover:bg-muted/40")}
                    title={canEdit ? "ดับเบิลคลิกเพื่อแก้ไข" : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onMouseDown={(e) => {
                      if (canEdit && e.detail > 1) e.preventDefault(); // a double click should not select a word
                    }}
                    onDoubleClick={(e) => {
                      if (canEdit && !(e.target as HTMLElement).closest("a, button, input, select, textarea")) setEditingId(a.id);
                    }}
                    onKeyDown={(e) => {
                      if (canEdit && e.key === "Enter" && e.target === e.currentTarget) setEditingId(a.id);
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-bold">
                      <Link href={`/assets/${a.id}`} className="text-primary underline-offset-2 hover:underline">
                        {a.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.name}</div>
                      <div className="text-muted-foreground">
                        {[a.brand, a.model].filter(Boolean).join(" ") || "—"} · {a.type}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.unit}</div>
                      <div className="text-muted-foreground">{a.location ?? "ยังไม่ระบุที่ตั้ง"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3">{formatDate(a.lastMaintenance)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3">{a.nextDue ? formatDate(a.nextDue) : <span className="text-muted-foreground">ยังไม่ได้กำหนดแผน</span>}</td>
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-1">
                        <QrCell asset={a} />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setRecordingId(a.id)}
                            aria-label={`บันทึกงานซ่อมบำรุง ${a.code}`}
                            title="บันทึกงานซ่อมบำรุง"
                            className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Wrench className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditingId(a.id)}
                            aria-label={`แก้ไข ${a.code}`}
                            title="แก้ไข"
                            className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <div className="p-5">
              <EmptyState title="ไม่พบอุปกรณ์" hint="ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง" />
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                ทั้งหมด {formatNumber(data.total)} รายการ · หน้า {formatNumber(data.page)} / {formatNumber(pages)}
              </span>
              <div className="flex gap-2">
                <PageButton label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </PageButton>
                <PageButton label="หน้าถัดไป" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </PageButton>
              </div>
            </div>
          )}
        </Card>
      )}

      {recordingId !== null && (
        <WorkOrderDialog
          assetId={recordingId}
          onClose={(saved) => {
            setRecordingId(null);
            if (saved) {
              reload(); // the "last maintenance" column changes
              setSavedNote("บันทึกงานซ่อมบำรุงเรียบร้อยแล้ว");
              setTimeout(() => setSavedNote(null), 5000);
            }
          }}
        />
      )}
      {editingId !== null && (
        <AssetEditDialog
          assetId={editingId}
          onClose={(code) => {
            setEditingId(null);
            reload(); // also after a conflict, so the table shows the latest data
            if (code) {
              setSavedNote(`บันทึกการแก้ไข ${code} เรียบร้อยแล้ว`);
              setTimeout(() => setSavedNote(null), 5000);
            }
          }}
        />
      )}
    </div>
  );
}

function Th({ label, k, sort, dir, onSort }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void }) {
  const active = sort === k;
  return (
    <th className="px-4 py-3 font-normal" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex min-h-8 items-center gap-1 hover:text-foreground", active && "font-bold text-foreground")}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />)}
      </button>
    </th>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl border border-border enabled:hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}
