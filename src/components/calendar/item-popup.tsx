"use client";

import Link from "next/link";
import { Boxes, Building2, CalendarClock, CalendarDays, ExternalLink, MapPin, Repeat, Tag, Wrench, X, ClipboardList } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

const btn = "inline-flex text-sm min-h-9 items-center gap-2 rounded-xl px-3.5 font-bold";

// The banner takes the colour the entry has on the calendar: red when overdue, yellow for an unfinished job, purple for a plan.
const BANNER = {
  overdue: { band: "bg-gradient-to-br from-red-500 to-rose-600 text-white", chip: "bg-white/25 text-white" },
  job: { band: "bg-gradient-to-br from-amber-400 to-yellow-500 text-yellow-950", chip: "bg-black/10 text-yellow-950" },
  plan: { band: "bg-[image:var(--grad)] text-white", chip: "bg-white/25 text-white" },
} as const;

type Icon = React.ComponentType<{ className?: string }>;
function Row({ icon: Icon, label, children }: { icon: Icon; label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm">{children}</dd>
      </div>
    </div>
  );
}

/** The details of one calendar entry (a plan or a job), with what can be done with it. */
export function ItemPopup({
  item,
  today,
  canEdit,
  onClose,
  onOpenJob,
}: {
  item: CalendarItem;
  today: string;
  canEdit: boolean;
  onClose: () => void;
  onOpenJob: (jobId: number) => void;
}) {
  const { data: a, error, reload } = useApi<AssetDetail>(`/assets/${item.assetId}`);
  const plan = item.kind === "plan" ? a?.plans.find((p) => p.id === item.id) : undefined;
  const job = item.kind === "job" ? a?.workOrders.find((w) => w.id === item.id) : undefined;
  const overdue = item.date < today;
  const tone = BANNER[overdue ? "overdue" : item.kind === "job" ? "job" : "plan"];

  return (
    <Modal title={item.kind === "plan" ? "รายละเอียดแผนบำรุงรักษา" : "รายละเอียดใบงาน"} onClose={onClose} className="max-w-[560px]">
      <div className="grid gap-3 overflow-y-auto pb-4">
        <div className={cn("relative px-5 py-4 sm:px-6", tone.band)}>
          <button type="button" onClick={onClose} aria-label="ปิด" title="ปิด" className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-black/10 hover:bg-black/20">
            <X className="size-4" aria-hidden="true" />
          </button>
          <p className="pr-10 break-words text-lg font-bold leading-snug">{item.title}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", tone.chip)}>
              <CalendarDays className="size-3.5" aria-hidden="true" /> {formatDate(item.date)}
            </span>
            {overdue && <span className={cn("rounded-full px-2.5 py-1", tone.chip)}>เกินกำหนด</span>}
            <span className={cn("rounded-full px-2.5 py-1", tone.chip)}>{item.kind === "plan" ? "แผนบำรุงรักษา" : "ใบงานที่ยังไม่เสร็จ"}</span>
          </p>
        </div>

        <div className="px-5 sm:px-6">
          {error && <ErrorState message={error} onRetry={reload} />}
          {!a && !error && <Skeleton className="h-40" />}
          {a && (
            <dl className="divide-y divide-border">
              <Row icon={Building2} label="ส่วนงาน">{a.unit}</Row>
              <Row icon={MapPin} label="สถานที่">{[a.location, a.locationDetail].filter(Boolean).join(" · ")}</Row>
              <Row icon={Tag} label="ประเภท">{[a.type, [a.brand, a.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</Row>
              <Row icon={Boxes} label="อุปกรณ์">
                <Link href={`/assets/${a.id}`} className="font-bold text-primary hover:underline">{a.code}</Link> · {a.name}
                <span className="ml-2 inline-block align-middle"><StatusBadge status={a.status} /></span>
              </Row>
              {job && (
                <>
                  <Row icon={ClipboardList} label="เลขที่ใบงาน">{job.number}</Row>
                  <Row icon={Tag} label="ประเภทงาน / ความสำคัญ">{WORK_ORDER_KIND_LABEL[job.kind]} · {PRIORITY_LABEL[job.priority]}</Row>
                  <Row icon={CalendarClock} label="สถานะใบงาน">{WORK_ORDER_STATUS_LABEL[job.status]}</Row>
                  <Row icon={ClipboardList} label="รายละเอียด">{job.description}</Row>
                </>
              )}
              {plan && (
                <>
                  <Row icon={CalendarClock} label="สถานะ">{plan.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Row>
                  <Row icon={Repeat} label="รอบ">ทุก {plan.intervalValue} {plan.intervalUnit === "month" ? "เดือน" : "วัน"}</Row>
                </>
              )}
            </dl>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 pt-3 sm:px-6">
          <Link href={`/assets/${item.assetId}`} className={`${btn} border border-border hover:bg-muted`}>
            <ExternalLink className="size-4" aria-hidden="true" /> เปิดหน้าอุปกรณ์
          </Link>
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
