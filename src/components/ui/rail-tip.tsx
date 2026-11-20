"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

const HOVER_DELAY = 220; // ms the mouse must rest on an item before its name appears (so sweeping across the rail stays quiet)
const SWEEP_GRACE = 350; // ms: moving straight from one item to the next skips the wait, so the rail feels continuous
let lastHidden = 0;

/**
 * Hover / keyboard-focus label for the folded sidebar: shows the icon and the name next to the item.
 * It is portalled and fixed-positioned because the sidebar clips whatever sticks out of it.
 * With `enabled={false}` it renders just the children (the open sidebar already shows the names).
 */
export function RailTip({ label, icon: Icon, enabled = true, children }: { label: string; icon: Icon; enabled?: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dim, setDim] = useState(0); // x where the dimmed area starts

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const open = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
    // the page area to the right of the sidebar gets dimmed and blurred while a name is shown
    setDim(box.current?.closest("aside")?.getBoundingClientRect().right ?? r.right + 4);
  }, []);
  // mouse: wait a beat first (unless the mouse just left a neighbouring item); keyboard focus shows at once
  const show = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(open, Date.now() - lastHidden < SWEEP_GRACE ? 0 : HOVER_DELAY);
  }, [open]);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setPos((p) => {
      if (p) lastHidden = Date.now();
      return null;
    });
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // a fixed tip would drift away from its item if the page scrolls or resizes
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos, hide]);

  if (!enabled) return <>{children}</>;
  return (
    <span ref={box} className="block" onMouseEnter={show} onMouseLeave={hide} onFocusCapture={open} onBlurCapture={hide} onClickCapture={hide}>
      {children}
      {pos &&
        createPortal(
          <>
          <span aria-hidden="true" style={{ left: dim }} className="railfade pointer-events-none fixed inset-y-0 right-0 z-40 bg-black/55 backdrop-blur-sm print:hidden" />
          <span style={{ top: pos.top, left: pos.left }} className="pointer-events-none fixed z-50 -translate-y-1/2 print:hidden">
            {/* the pop (a soft overshoot out of the item) lives on the inner box, so it does not fight the centring transform */}
            <span
              role="tooltip"
              className="railpop flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-border bg-popover px-4 py-2.5 text-base font-bold text-popover-foreground shadow-lg"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{label}</span>
            </span>
          </span>
          </>,
          document.body,
        )}
    </span>
  );
}
