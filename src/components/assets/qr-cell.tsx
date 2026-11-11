"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { downloadQrPng, qrSvgUrl, safeFileName } from "@/lib/qr-download";

const POPOVER_W = 264;
const POPOVER_H = 372;
const CLOSE_DELAY_MS = 200; // lets the mouse travel from the thumbnail to the popover without it closing

type Asset = { id: number; code: string; name: string };

/**
 * Small QR thumbnail for a table row. Hover (or tap / keyboard focus) shows a large QR with save buttons.
 * The popover is portalled and fixed-positioned because the table sits in a scrolling container that would clip it.
 */
export function QrCell({ asset }: { asset: Asset }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => {
    clearTimeout(timer.current);
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    // visible area without scrollbars (clientWidth/Height); never place the popover off-screen
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - POPOVER_W - 8)); // the QR column is the first one, so the popup lines up with its left side
    const below = r.bottom + 4;
    const top = below + POPOVER_H > vh ? Math.max(8, r.top - POPOVER_H - 4) : below;
    setPos({ top, left });
  }, []);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setPos(null);
    setError(null);
  }, []);
  const closeSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [close]);

  // Close on Escape, on a tap/click elsewhere, and when the page scrolls or resizes (a fixed popover would drift away).
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popover.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function savePng() {
    setError(null);
    try {
      await downloadQrPng(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกรูปภาพไม่สำเร็จ");
    }
  }

  const btn = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-muted";

  return (
    <>
      {/* a button (not a bare image) so it can be focused/tapped on touch screens and with the keyboard */}
      <button
        ref={trigger}
        type="button"
        aria-label={`ดู QR Code ของ ${asset.code}`}
        aria-expanded={pos !== null}
        onMouseEnter={open}
        onMouseLeave={closeSoon}
        onFocus={open}
        onClick={() => (pos ? close() : open())}
        className="grid size-9 place-items-center rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSvgUrl(asset.id)} alt="" width={40} height={40} className="size-10 rounded bg-white" />
      </button>

      {pos &&
        createPortal(
          <div
            ref={popover}
            role="dialog"
            aria-label={`QR Code ของ ${asset.code}`}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={closeSoon}
            style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
            className="fixed z-50 rounded-2xl border border-border bg-popover p-4 text-center text-popover-foreground shadow-xl print:hidden"
          >
            {/* black on white from the server, so it scans in both themes */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSvgUrl(asset.id)} alt={`QR Code ของ ${asset.code}`} width={232} height={232} className="mx-auto size-[232px] rounded-lg bg-white" />
            <p className="mt-2 font-bold">{asset.code}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{asset.name}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={() => void savePng()} className={btn} title="บันทึกเป็นรูป PNG (มีรหัสและชื่ออุปกรณ์ใต้ QR)">
                <Download className="size-4" aria-hidden="true" />
                บันทึก PNG
              </button>
              <a href={qrSvgUrl(asset.id)} download={`${safeFileName(asset.code)}.svg`} className={btn} title="บันทึกเป็นไฟล์ SVG">
                SVG
              </a>
            </div>
            {error && (
              <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-2 py-1.5 text-xs text-bad">
                {error}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
