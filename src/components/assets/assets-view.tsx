"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, FileUp, Plus, Wrench } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { canEditAssets, type AssetListItem, type Paged } from "@shared/index";
import { EMPTY_FILTERS, FilterBar, type Filters } from "@/components/filter-bar";
import { AssetCreateDialog } from "@/components/assets/asset-create-dialog";
import { AssetCodeLink } from "@/components/assets/asset-hover-card";
import { AssetEditDialog } from "@/components/assets/asset-edit-dialog";
import { QrCell } from "@/components/assets/qr-cell";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { NewBadge } from "@/components/ui/new-badge";
import { useAuth } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useFresh } from "@/lib/use-fresh";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

type SortKey = "code" | "name" | "status" | "nextDue";
const PAGE_SIZE = 20;

/**
 * Shown when assets are ticked: a card that slides in from the right edge, out of the way of the list, with what is selected
 * and the two choices. (On a phone it sits just above the bottom menu.)
 */
function SelectionPanel({ picked, onCancel }: { picked: Map<number, string>; onCancel: () => void }) {
  const open = picked.size > 0;
  const codes = [...picked.values()];
  return (
    <aside
      role="status"
      aria-live="polite"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed bottom-20 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-4 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.45)] transition-[transform,opacity] duration-300 ease-out lg:bottom-6 lg:right-6 print:hidden",
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[120%] opacity-0",
      )}
    >
      <p className="text-sm">
        เลือกแล้ว <b className="text-base">{picked.size}</b> รายการ
      </p>
      {picked.size > 200 && <p className="mt-1 text-xs text-bad">พิมพ์ได้ครั้งละไม่เกิน 200 รายการ</p>}
      <p className="mt-1.5 line-clamp-2 break-words text-xs text-muted-foreground">
        {codes.slice(0, 6).join(", ")}
        {codes.length > 6 ? ` และอีก ${codes.length - 6}` : ""}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex min-h-9 items-center rounded-xl border border-border px-3.5 text-sm font-bold hover:bg-muted">
          Cancel
        </button>
        {picked.size <= 200 && (
          <Link
            href={`/assets/labels?ids=${[...picked.keys()].join(",")}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </Link>
        )}
      </div>
    </aside>
  );
}

/** The wrench behind an asset code: opens the asset's page (where work is recorded). */
function OpenAsset({ id, code }: { id: number; code: string }) {
  return (
    <Link
      href={`/assets/${id}`}
      aria-label={`เปิดหน้าอุปกรณ์ ${code}`}
      title="เปิดหน้าอุปกรณ์"
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Wrench className="size-4" aria-hidden="true" />
    </Link>
  );
}

export function AssetsView() {
  const sp = useSearchParams();
  const { user } = useAuth();
  const canEdit = user ? canEditAssets(user.role) : false; // the server enforces this too
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false); // the "add asset" dialog
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

  const { data, error, loading, reload, liveTick } = useApi<Paged<AssetListItem>>(
    "/assets",
    {
      unitId: filters.unitId,
      typeId: filters.typeId,
      status: filters.status,
      q,
      sort,
      dir,
      page,
      pageSize: PAGE_SIZE,
    },
    { live: true },
  );
  const fresh = useFresh(useMemo(() => data?.items.map((a) => a.id), [data]), liveTick); // rows that arrived while this list was open

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // ticked rows (kept while paging) for printing QR labels together
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  // The ticks are remembered for this browser tab, so after "Download" (the label page) the person can come back, tick more
  // and download again without starting over. Only Cancel (or closing the tab) clears them.
  const restored = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("qr-picked") ?? "[]") as [number, string][];
      if (Array.isArray(saved) && saved.length) setPicked(new Map(saved.filter((x) => Array.isArray(x) && Number.isInteger(x[0]) && typeof x[1] === "string")));
    } catch {
      /* storage can be unavailable: the ticks simply are not remembered */
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (picked.size) sessionStorage.setItem("qr-picked", JSON.stringify([...picked]));
      else sessionStorage.removeItem("qr-picked");
    } catch {
      /* ignore */
    }
  }, [picked]);
  const toggle = (id: number, code: string) =>
    setPicked((p) => {
      const n = new Map(p);
      if (!n.delete(id)) n.set(id, code);
      return n;
    });
  const pageRows = data?.items ?? [];
  const allOnPage = pageRows.length > 0 && pageRows.every((a) => picked.has(a.id));
  const togglePage = () =>
    setPicked((p) => {
      const n = new Map(p);
      for (const a of pageRows) allOnPage ? n.delete(a.id) : n.set(a.id, a.code);
      return n;
    });
  const tick = "size-3.5 shrink-0 accent-[var(--primary)]";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ทะเบียนอุปกรณ์</h1>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link href="/assets/import" className="text-sm inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3.5 font-bold hover:bg-muted">
              <FileUp className="size-5" aria-hidden="true" />
              นำเข้าจากไฟล์
            </Link>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-sm inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-5" aria-hidden="true" />
              เพิ่มอุปกรณ์
            </button>
          </div>
        )}
      </div>

      <Card className="filter-card grid gap-4 p-4 sm:p-5">
        <label className="relative block">
          <span className="sr-only">ค้นหา</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ค้นหาด้วยรหัส ชื่อ ยี่ห้อ หรือรุ่น"
            className="search-main min-h-14 w-full rounded-2xl border border-primary/35 bg-card pl-12 pr-4 text-base"
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

      {savedNote && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
          {savedNote}
        </p>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {!error && (
        <Card className="p-0 sm:p-0">
          {/* phone and tablet: one card per asset (a wide table would be cut off); the table is for wide screens */}
          <div className="flex items-center gap-2 border-b border-border p-3 xl:hidden">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">เรียงตาม</span>
              <Select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  setDir("asc");
                  setPage(1);
                }}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground"
              >
                <option value="code">รหัส</option>
                <option value="name">ชื่อ</option>
                <option value="status">สถานะ</option>
                <option value="nextDue">ครบกำหนดถัดไป</option>
              </Select>
            </label>
            <button
              type="button"
              onClick={() => {
                setDir((d) => (d === "asc" ? "desc" : "asc"));
                setPage(1);
              }}
              aria-label={dir === "asc" ? "เรียงจากน้อยไปมาก (กดเพื่อสลับ)" : "เรียงจากมากไปน้อย (กดเพื่อสลับ)"}
              title={dir === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted"
            >
              {dir === "asc" ? <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <ul className={cn("grid gap-3 p-3 xl:hidden", loading && "opacity-60")} aria-busy={loading}>
            {loading && !data && Array.from({ length: 4 }, (_, i) => <li key={i}><Skeleton className="h-36" /></li>)}
            {data?.items.map((a) => (
              <li key={a.id} className={cn("rounded-2xl border border-border bg-card p-4", fresh.has(a.id) && "fresh")}>
                <div className="flex items-start justify-between gap-3">
                  <input type="checkbox" className={`${tick} mt-0.5`} checked={picked.has(a.id)} onChange={() => toggle(a.id, a.code)} aria-label={`เลือก ${a.code} เพื่อพิมพ์ป้าย QR`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-x-1">
                      <AssetCodeLink id={a.id} code={a.code} className="min-w-0 break-all font-bold text-primary underline-offset-2 hover:underline" />
                      {canEdit && <OpenAsset id={a.id} code={a.code} />}
                      {fresh.has(a.id) && <NewBadge />}
                    </div>
                    <div className="mt-0.5 break-words text-[15px] font-bold leading-snug">{a.name}</div>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                <div className="mt-1 break-words text-xs leading-snug text-muted-foreground">
                  {[a.brand, a.model].filter(Boolean).join(" ") || "—"} · {a.type}
                </div>
                <div className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">
                  {a.unit} · {a.location ?? "ยังไม่ระบุที่ตั้ง"}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
                  <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">ล่าสุด</dt>
                      <dd className="tabular">{formatDate(a.lastMaintenance)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ครบกำหนดถัดไป</dt>
                      <dd className="tabular">{a.nextDue ? formatDate(a.nextDue) : <span className="text-muted-foreground">ยังไม่ได้กำหนดแผน</span>}</dd>
                    </div>
                  </dl>
                  <div className="flex shrink-0 items-center">
                    <QrCell asset={a} />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="w-10 py-3 pl-4 pr-0 font-normal">
                    <input type="checkbox" className={tick} checked={allOnPage} onChange={togglePage} aria-label="เลือกทั้งหน้านี้เพื่อพิมพ์ป้าย QR" />
                  </th>
                  <th className="px-4 py-3 font-normal">QR</th>
                  <Th label="รหัส" k="code" sort={sort} dir={dir} onSort={toggleSort} />
                  <Th label="ชื่อ / ยี่ห้อ รุ่น" k="name" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-normal">ส่วนงาน / ที่ตั้ง</th>
                  <Th label="สถานะ" k="status" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-normal">ล่าสุด</th>
                  <Th label="ครบกำหนดถัดไป" k="nextDue" sort={sort} dir={dir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !data &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={8} className="px-4 py-3">
                        <Skeleton className="h-9" />
                      </td>
                    </tr>
                  ))}
                {data?.items.map((a) => (
                  <tr
                    key={a.id}
                    className={cn("border-b border-border last:border-0", loading && "opacity-60", canEdit && "cursor-pointer hover:bg-muted/40", fresh.has(a.id) && "fresh")}
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
                    <td className="w-10 py-1.5 pl-4 pr-0">
                      <input type="checkbox" className={tick} checked={picked.has(a.id)} onChange={() => toggle(a.id, a.code)} aria-label={`เลือก ${a.code} เพื่อพิมพ์ป้าย QR`} />
                    </td>
                    <td className="px-4 py-1.5">
                      <QrCell asset={a} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 font-bold">
                      <div className="flex items-center gap-1">
                        <AssetCodeLink id={a.id} code={a.code} className="text-primary underline-offset-2 hover:underline" />
                        {canEdit && <OpenAsset id={a.id} code={a.code} />}
                        {fresh.has(a.id) && <NewBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[a.brand, a.model].filter(Boolean).join(" ") || "—"} · {a.type}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.unit}</div>
                      <div className="text-xs text-muted-foreground">{a.location ?? "ยังไม่ระบุที่ตั้ง"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3">{formatDate(a.lastMaintenance)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3">{a.nextDue ? formatDate(a.nextDue) : <span className="text-muted-foreground">ยังไม่ได้กำหนดแผน</span>}</td>
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

      {creating && (
        <AssetCreateDialog
          defaultUnitId={filters.unitId}
          onClose={(created) => {
            setCreating(false);
            if (created) {
              setText(created.code); // show the new asset: search for its code
              setPage(1);
              reload();
              setSavedNote(`เพิ่มอุปกรณ์ ${created.code} เรียบร้อยแล้ว`);
              setTimeout(() => setSavedNote(null), 6000);
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

      <SelectionPanel picked={picked} onCancel={() => setPicked(new Map())} />
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
      className="grid size-9 place-items-center rounded-xl border border-border enabled:hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}
