"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Printer } from "lucide-react";
import {
  PRIORITY_LABEL,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
  canEditAssets,
  type AssetDetail,
  type Priority,
  type WorkOrderStatus,
} from "@shared/index";
import { AssetEditDialog } from "@/components/assets/asset-edit-dialog";
import { AssetPhotos } from "@/components/assets/asset-photos";
import { WorkOrderDialog } from "@/components/assets/work-order-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { formatBaht, formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { API_PREFIX } from "@shared/index";

// Status is shown as text AND colour (never colour alone).
const WO_TONE: Record<WorkOrderStatus, { badge: string; dot: string }> = {
  done: { badge: "bg-ok-soft text-ok", dot: "bg-ok" },
  in_progress: { badge: "bg-warn-soft text-warn", dot: "bg-warn" },
};
const PRIORITY_TONE: Record<Priority, string> = {
  urgent: "bg-bad-soft text-bad",
  high: "bg-warn-soft text-warn",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

// Same grid on every row and on the header, so the columns line up: date | job | status
const WO_GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 sm:grid-cols-[132px_minmax(0,1fr)_140px] sm:gap-x-4";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-2 text-[15px] sm:grid-cols-[160px_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function AssetDetailView({ id }: { id: string }) {
  const { data: a, error, loading, reload } = useApi<AssetDetail>(`/assets/${encodeURIComponent(id)}`);
  const { user } = useAuth();
  const canRecord = user ? canEditAssets(user.role) : false; // only a Super Admin or Technician may record work (the server enforces it too)
  const [dialog, setDialog] = useState<{ id?: number; planId?: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Arriving from the dashboard: ?plan=<id> opens the record form for that plan, ?job=<id> opens that job. Only for those who may record.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const planParam = Number(params.get("plan"));
  const jobParam = Number(params.get("job"));
  const hasTarget = (Number.isInteger(planParam) && planParam > 0) || (Number.isInteger(jobParam) && jobParam > 0);
  const targetHandled = useRef(false);
  useEffect(() => {
    if (targetHandled.current || !a || !user || !hasTarget) return;
    targetHandled.current = true;
    if (canRecord) {
      if (a.workOrders.some((w) => w.id === jobParam)) setDialog({ id: jobParam });
      else if (a.plans.some((p) => p.id === planParam && p.active)) setDialog({ planId: planParam });
    }
    router.replace(pathname, { scroll: false }); // drop the parameter so a refresh does not open it again
  }, [a, user, canRecord, planParam, jobParam, hasTarget, pathname, router]);
  const [editingInfo, setEditingInfo] = useState(false); // the asset-information dialog
  const [infoNote, setInfoNote] = useState<string | null>(null);

  if (loading && !a) return <Skeleton className="h-96" />;
  if (error || !a) return <ErrorState message={error ?? "ไม่พบอุปกรณ์"} onRetry={reload} />;

  return (
    <div className="grid gap-6">
      <div className="print:hidden">
        <Link href="/assets" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          ทะเบียนอุปกรณ์
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">{a.name}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="mt-1 text-muted-foreground">
          รหัส {a.code} · {a.type} · {a.unit}
        </p>
      </div>

      <AssetPhotos assetId={a.id} images={a.images} canEdit={canRecord} onChanged={reload} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>ข้อมูลอุปกรณ์</CardTitle>
            {canRecord && (
              <button
                type="button"
                onClick={() => setEditingInfo(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 hover:bg-muted"
              >
                <Pencil className="size-4" aria-hidden="true" />
                แก้ไขข้อมูล
              </button>
            )}
          </div>
          {infoNote && (
            <p role="status" className="mt-3 rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
              {infoNote}
            </p>
          )}
          <dl className="mt-3 divide-y divide-border">
            <Row label="ยี่ห้อ / รุ่น" value={[a.brand, a.model].filter(Boolean).join(" ")} />
            <Row label="หมายเลขเครื่อง" value={a.serialNumber} />
            <Row label="เลขครุภัณฑ์เดิม" value={a.legacyAssetNo} />
            <Row label="ส่วนงานเจ้าของ" value={a.unit} />
            <Row label="สถานที่" value={[a.location, a.locationDetail].filter(Boolean).join(" · ")} />
            <Row label="วันที่ติดตั้ง" value={a.installDate && formatDate(a.installDate)} />
            <Row label="วันที่ซื้อ" value={a.purchaseDate && formatDate(a.purchaseDate)} />
            <Row label="ประกันหมด" value={a.warrantyEnd && formatDate(a.warrantyEnd)} />
            <Row label="หมายเหตุ" value={a.notes} />
          </dl>
        </Card>

        <Card className="hidden h-fit text-center sm:block print:block print:border-0 print:p-0 print:shadow-none">
          <CardTitle className="print:hidden">QR Code อุปกรณ์</CardTitle>
          {/* always black on white (set by the server) so it scans in both themes and on paper */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${API_PREFIX}/assets/${a.id}/qr.svg`} alt={`QR Code ของ ${a.code}`} width={240} height={240} className="mx-auto mt-3 rounded-xl bg-white" />
          <p className="mt-2 text-lg font-bold">{a.code}</p>
          <p className="text-sm text-muted-foreground print:text-black">{a.name}</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 hover:bg-muted print:hidden"
          >
            <Printer className="size-4" aria-hidden="true" />
            พิมพ์ป้าย QR
          </button>
          <p className="mt-3 text-xs text-muted-foreground print:hidden">สแกนแล้วต้องเข้าสู่ระบบก่อน และเห็นได้เฉพาะอุปกรณ์ที่มีสิทธิ์</p>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardTitle>แผนบำรุงรักษา</CardTitle>
        <div className="mt-3">
          {a.plans.length === 0 ? (
            <EmptyState title="ยังไม่มีแผนบำรุงรักษา" />
          ) : (
            <ul className="divide-y divide-border">
              {a.plans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div>
                    <div className="font-bold">{p.title}</div>
                    <div className="text-sm text-muted-foreground">
                      ทุก {p.intervalValue} {p.intervalUnit === "month" ? "เดือน" : "วัน"}
                      {p.active ? "" : " · ปิดใช้งาน"}
                    </div>
                  </div>
                  <div className="text-sm">ครบกำหนด {p.nextDueDate ? formatDate(p.nextDueDate) : "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            ประวัติงาน <span className="text-sm font-normal text-muted-foreground">(งานที่ยังไม่เสร็จทั้งหมด และล่าสุด 10 รายการ)</span>
          </CardTitle>
          {canRecord && (
            <button
              type="button"
              onClick={() => setDialog({})}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-5" aria-hidden="true" />
              บันทึกงานซ่อมบำรุง
            </button>
          )}
        </div>
        {note && (
          <p role="status" className="mt-3 rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
            {note}
          </p>
        )}
        <div className="mt-3">
          {a.workOrders.length === 0 ? (
            <EmptyState title="ยังไม่มีใบงาน" hint={canRecord ? "กดปุ่ม บันทึกงานซ่อมบำรุง เพื่อเพิ่มรายการแรก" : undefined} />
          ) : (
            <>
              <div className={`${WO_GRID} hidden border-b border-border pb-2 text-xs text-muted-foreground sm:grid`} aria-hidden="true">
                <span>วันที่</span>
                <span>งาน</span>
                <span>สถานะ</span>
              </div>
              <ul className="divide-y divide-border">
                {a.workOrders.map((w) => {
                  const tone = WO_TONE[w.status];
                  const date = w.performedOn ?? w.dueDate;
                  const costs = [w.laborCost, w.partsCost, w.otherCost];
                  const known = costs.filter((c): c is number => c !== null);
                  const hasFooter = known.length > 0 || Boolean(w.recordedBy);
                  // rows are numbered so an absent description / footer leaves no empty gap on phones
                  const extra = (w.description ? 1 : 0) + (hasFooter ? 1 : 0);
                  const footRow = w.description ? "row-start-4" : "row-start-3";
                  const dateRow = extra === 2 ? "row-start-5" : extra === 1 ? "row-start-4" : "row-start-3";
                  return (
                    <li key={w.id} className={`${WO_GRID} py-3.5 sm:items-start`}>
                      <div className="contents sm:col-start-2 sm:row-start-1 sm:block">
                        <p className="col-start-1 row-start-1 min-w-0 break-words font-bold">{w.title}</p>
                        <p className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:mt-1">
                          <span className="tabular">{w.number}</span>
                          <span className="rounded-md bg-muted px-2 py-0.5">{WORK_ORDER_KIND_LABEL[w.kind]}</span>
                          <span className={`rounded-md px-2 py-0.5 ${PRIORITY_TONE[w.priority]}`}>ความสำคัญ {PRIORITY_LABEL[w.priority]}</span>
                        </p>
                        {w.description && <p className="col-span-2 row-start-3 line-clamp-3 whitespace-pre-line break-words text-sm text-muted-foreground sm:mt-1.5">{w.description}</p>}
                        {hasFooter && (
                          <p className={`col-span-2 ${footRow} flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:mt-1.5`}>
                            {known.length > 0 && (
                              <span>
                                ค่าใช้จ่าย {formatBaht(known.reduce((x, y) => x + y, 0))}
                                {known.length < 3 ? " (บางรายการไม่ทราบ)" : ""}
                              </span>
                            )}
                            {w.recordedBy && <span>บันทึกโดย {w.recordedBy}</span>}
                          </p>
                        )}
                      </div>
                      <div className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end sm:col-start-3 sm:justify-self-start">
                        <span className={`inline-flex h-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tone.badge}`}>
                          <i className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                          {WORK_ORDER_STATUS_LABEL[w.status]}
                        </span>
                        {canRecord && (
                          <button
                            type="button"
                            onClick={() => setDialog({ id: w.id })}
                            aria-label={`แก้ไขหรือบันทึกผล ${w.number}`}
                            title="แก้ไข / บันทึกผล"
                            className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <p className={`tabular col-span-2 ${dateRow} text-sm sm:col-span-1 sm:col-start-1 sm:row-start-1`}>
                        {date ? (
                          <>
                            <span className="text-muted-foreground">{w.performedOn ? "ดำเนินการ " : "กำหนด "}</span>
                            <span className="whitespace-nowrap font-bold">{formatDate(date)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">ยังไม่ระบุวันที่</span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </Card>

      {editingInfo && (
        <AssetEditDialog
          assetId={a.id}
          onClose={(code) => {
            setEditingInfo(false);
            if (code) {
              reload(); // title, badge and the information card show the new values
              setInfoNote("บันทึกการแก้ไขข้อมูลอุปกรณ์เรียบร้อยแล้ว");
              setTimeout(() => setInfoNote(null), 5000);
            }
          }}
        />
      )}

      {dialog && (
        <WorkOrderDialog
          assetId={a.id}
          workOrderId={dialog.id}
          planId={dialog.planId}
          onClose={(saved) => {
            setDialog(null);
            if (saved) {
              reload();
              setNote(dialog.id === undefined ? "บันทึกงานเรียบร้อยแล้ว" : "บันทึกการแก้ไขเรียบร้อยแล้ว");
              setTimeout(() => setNote(null), 5000);
            }
          }}
        />
      )}
    </div>
  );
}
