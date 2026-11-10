"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getPending, subscribePending } from "@/lib/api";

const SHOW_AFTER_MS = 200; // quick requests never flash the bar
const SLOW_AFTER_MS = 4000; // after this, say plainly that it is still working

/** Thin bar at the top while data is loading, plus a note when it is taking longer than usual. */
export function LoadingBar() {
  const pending = useSyncExternalStore(subscribePending, getPending, () => 0);
  const busy = pending > 0;
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      setSlow(false);
      return;
    }
    const a = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const b = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [busy]);

  if (!visible) return null;
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-primary/15">
        <div className="loadbar-stripe h-full w-2/5 rounded-full bg-primary" />
      </div>
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
        {slow ? (
          <span className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg">กำลังโหลดข้อมูล ใช้เวลานานกว่าปกติเล็กน้อย กรุณารอสักครู่...</span>
        ) : (
          <span className="sr-only">กำลังโหลดข้อมูล</span>
        )}
      </div>
    </>
  );
}
