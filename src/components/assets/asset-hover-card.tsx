"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_PREFIX, type AssetDetail } from "@shared/index";
import { StatusBadge } from "@/components/status-badge";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";

// Details are fetched the first time the pointer rests on a code and kept for a minute, so moving along a column is instant.
const cache = new Map<number, { at: number; data: Promise<AssetDetail> }>();
const TTL = 60_000;
function load(id: number): Promise<AssetDetail> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const data = apiGet<AssetDetail>(`/assets/${id}`, undefined, undefined, true);
  cache.set(id, { at: Date.now(), data });
  data.catch(() => cache.delete(id));
  return data;
}

const W = 340;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function Card({ a }: { a: AssetDetail }) {
  const photo = a.images[0];
  return (
    <div className="flex gap-3">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API_PREFIX}/assets/${a.id}/images/${photo.id}?size=thumb`} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] font-bold leading-snug">{a.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          {a.health && <span className="text-xs text-muted-foreground">สุขภาพ <b className="tabular text-foreground">{a.health.score}</b>/100</span>}
        </div>
      </div>
    </div>
  );
}

/** The asset code as a link to its page; resting the mouse (or keyboard focus) on it shows the asset's details in a small card. */
export function AssetCodeLink({ id, code, className }: { id: number; code: string; className?: string }) {
  const tipId = useId();
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AssetDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      // below the code, or above it when there is not enough room underneath
      setPos(window.innerHeight - r.bottom < 300 ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
      setOpen(true);
      setFailed(false);
      load(id).then(setData, () => setFailed(true));
    }, 220);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const a = data && data.id === id ? data : null;
  const nextDue = a?.plans.filter((p) => p.active && p.nextDueDate).map((p) => p.nextDueDate as string).sort()[0];
  const last = a?.workOrders.find((w) => w.status === "done" && w.performedOn);
  return (
    <>
      <Link
        ref={anchor}
        href={`/assets/${id}`}
        className={className}
        aria-describedby={open ? tipId : undefined}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {code}
      </Link>
      {open &&
        pos &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: W, zIndex: 70 }}
            className="pointer-events-none rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-2xl"
          >
            {failed && <p className="text-bad">โหลดรายละเอียดไม่สำเร็จ</p>}
            {!a && !failed && <p className="text-muted-foreground">กำลังโหลด...</p>}
            {a && (
              <div className="grid gap-3">
                <Card a={a} />
                <dl className="grid gap-1 border-t border-border pt-3 text-[13px]">
                  <Row label="รหัส" value={a.code} />
                  <Row label="ประเภท" value={a.type} />
                  <Row label="ยี่ห้อ / รุ่น" value={[a.brand, a.model].filter(Boolean).join(" ")} />
                  <Row label="หมายเลขเครื่อง" value={a.serialNumber} />
                  <Row label="ส่วนงาน" value={a.unit} />
                  <Row label="สถานที่" value={[a.location, a.locationDetail].filter(Boolean).join(" · ")} />
                  <Row label="ประกันหมด" value={a.warrantyEnd && formatDate(a.warrantyEnd)} />
                  <Row label="ซ่อมบำรุงล่าสุด" value={last?.performedOn && formatDate(last.performedOn)} />
                  <Row label="ครบกำหนดถัดไป" value={nextDue ? formatDate(nextDue) : <span className="text-muted-foreground">ยังไม่ได้กำหนดแผน</span>} />
                  {a.inProgressJobs > 0 && <Row label="งานค้าง" value={`${a.inProgressJobs} รายการกำลังดำเนินการ`} />}
                </dl>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
