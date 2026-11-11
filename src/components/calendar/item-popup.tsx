"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Wrench } from "lucide-react";
import {
  PRIORITY_LABEL,
  WORK_ORDER_KIND_LABEL,
  WORK_ORDER_STATUS_LABEL,
  type AssetDetail,
  type CalendarItem,
} from "@shared/index";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState, Skeleton } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const btn = "inline-flex text-sm min-h-9 items-center gap-2 rounded-xl px-3.5 font-bold";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** The details of one calendar entry (a plan or a job), with what can be done with it. */
export function ItemPopup({
  item,
  today,
  canEdit,
  onClose,
  onRecord,
  onEditPlan,
  onOpenJob,
}: {
  item: CalendarItem;
  today: string;
  canEdit: boolean;
  onClose: () => void;
  onRecord: (planId: number) => void;
  onEditPlan: (plan: AssetDetail["plans"][number]) => void;
  onOpenJob: (jobId: number) => void;
}) {
  const { data: a, error, reload } = useApi<AssetDetail>(`/assets/${item.assetId}`);
  const plan = item.kind === "plan" ? a?.plans.find((p) => p.id === item.id) : undefined;
  const job = item.kind === "job" ? a?.workOrders.find((w) => w.id === item.id) : undefined;
  const overdue = item.date < today;

  return (
    <Modal title={item.kind === "plan" ? "รายละเอียดแผนบำรุงรักษา" : "รายละเอียดใบงาน"} onClose={onClose}>
      <div className="grid gap-3 overflow-y-auto px-5 py-4 sm:px-6">
        <div>
          <p className="break-words text-lg font-bold leading-snug">{item.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className={overdue ? "font-bold text-bad" : "font-bold text-primary"}>
              {formatDate(item.date)}
            </span>
            {overdue && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-bold text-bad">เกินกำหนด</span>}
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">{item.kind === "plan" ? "แผนบำรุงรักษา" : "ใบงานที่ยังไม่เสร็จ"}</span>
          </p>
        </div>

        {error && <ErrorState message={error} onRetry={reload} />}
        {!a && !error && <Skeleton className="h-40" />}
        {a && (
          <dl className="divide-y divide-border border-y border-border text-sm">
            {plan && (
              <>
                <Row label="รอบ">ทุก {plan.intervalValue} {plan.intervalUnit === "month" ? "เดือน" : "วัน"}</Row>
                <Row label="สถานะแผน">{plan.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Row>
              </>
            )}
            {job && (
              <>
                <Row label="เลขที่">{job.number}</Row>
                <Row label="ประเภทงาน">{WORK_ORDER_KIND_LABEL[job.kind]}</Row>
                <Row label="สถานะ">{WORK_ORDER_STATUS_LABEL[job.status]}</Row>
                <Row label="ความสำคัญ">{PRIORITY_LABEL[job.priority]}</Row>
                <Row label="รายละเอียด">{job.description}</Row>
              </>
            )}
            <Row label="อุปกรณ์">
              <Link href={`/assets/${a.id}`} className="font-bold text-primary hover:underline">{a.code}</Link> · {a.name}
            </Row>
            <Row label="สถานะอุปกรณ์"><StatusBadge status={a.status} /></Row>
            <Row label="ประเภท">{a.type}</Row>
            <Row label="ยี่ห้อ / รุ่น">{[a.brand, a.model].filter(Boolean).join(" ")}</Row>
            <Row label="ส่วนงาน">{a.unit}</Row>
            <Row label="สถานที่">{[a.location, a.locationDetail].filter(Boolean).join(" · ")}</Row>
          </dl>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Link href={`/assets/${item.assetId}`} className={`${btn} border border-border hover:bg-muted`}>
            <ExternalLink className="size-4" aria-hidden="true" /> เปิดหน้าอุปกรณ์
          </Link>
          {canEdit && plan && (
            <button type="button" onClick={() => onEditPlan(plan)} className={`${btn} border border-border hover:bg-muted`}>
              <Pencil className="size-4" aria-hidden="true" /> แก้ไขแผน
            </button>
          )}
          {canEdit && plan && plan.active && (
            <button type="button" onClick={() => onRecord(plan.id)} className={`${btn} bg-primary text-primary-foreground`}>
              <Wrench className="size-4" aria-hidden="true" /> บันทึกงานตามแผน
            </button>
          )}
          {canEdit && job && (
            <button type="button" onClick={() => onOpenJob(job.id)} className={`${btn} bg-primary text-primary-foreground`}>
              <Wrench className="size-4" aria-hidden="true" /> เปิดใบงาน
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
