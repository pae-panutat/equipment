"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wrench } from "lucide-react";
import { WORK_ORDER_KIND_LABEL, WORK_ORDER_STATUS_LABEL } from "@shared/index";
import { formatDateTime } from "@/lib/format";

type Item = { number: string; assetCode: string; assetName: string; title: string; kind: keyof typeof WORK_ORDER_KIND_LABEL; status: keyof typeof WORK_ORDER_STATUS_LABEL; at: string };

const W = 320;
const DELAY = 260; // the mouse must rest a moment before the card opens, so moving down the list stays quiet

/** Wraps one row of "recent activity": resting the mouse (or keyboard focus) on it opens a small card with a summary of that job. */
export function ActivityHover({ item, className, children }: { item: Item; className?: string; children: React.ReactNode }) {
  const tipId = useId();
  const box = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const open = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left + 24, window.innerWidth - W - 8));
    // under the row, or above it when there is not enough room
    setPos(window.innerHeight - r.bottom < 190 ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
  };
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(open, DELAY);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <li
      ref={box}
      className={className}
      aria-describedby={pos ? tipId : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={hide}
      onFocusCapture={open}
      onBlurCapture={hide}
      onClickCapture={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div id={tipId} role="tooltip" style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: W, zIndex: 70 }} className="pointer-events-none print:hidden">
            <div className="railpop rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Wrench className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-[15px] font-bold leading-snug">{item.title}</p>
                  <p className="mt-0.5 break-words text-muted-foreground">
                    <b className="text-primary">{item.assetCode}</b> · {item.assetName}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid gap-1 border-t border-border pt-3 text-[13px]">
                {[
                  ["เลขที่ใบงาน", item.number],
                  ["ประเภทงาน", WORK_ORDER_KIND_LABEL[item.kind]],
                  ["สถานะ", WORK_ORDER_STATUS_LABEL[item.status]],
                  ["เวลา", formatDateTime(item.at)],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[88px_1fr] gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>,
          document.body,
        )}
    </li>
  );
}
