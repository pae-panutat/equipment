"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

/**
 * Hover / keyboard-focus label for the folded sidebar: shows the icon and the name next to the item.
 * It is portalled and fixed-positioned because the sidebar clips whatever sticks out of it.
 * With `enabled={false}` it renders just the children (the open sidebar already shows the names).
 */
export function RailTip({ label, icon: Icon, enabled = true, children }: { label: string; icon: Icon; enabled?: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dim, setDim] = useState(0); // x where the dimmed area starts

  const show = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
    // the page area to the right of the sidebar gets dimmed and blurred while a name is shown
    setDim(box.current?.closest("aside")?.getBoundingClientRect().right ?? r.right + 4);
  }, []);
  const hide = useCallback(() => setPos(null), []);

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
    <span ref={box} className="block" onMouseEnter={show} onMouseLeave={hide} onFocusCapture={show} onBlurCapture={hide} onClickCapture={hide}>
      {children}
      {pos &&
        createPortal(
          <>
          <span aria-hidden="true" style={{ left: dim }} className="railfade pointer-events-none fixed inset-y-0 right-0 z-40 bg-black/55 backdrop-blur-sm print:hidden" />
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 flex -translate-y-1/2 items-center gap-2.5 whitespace-nowrap rounded-xl border border-border bg-popover px-4 py-2.5 text-base font-bold text-popover-foreground shadow-lg print:hidden"
          >
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            {label}
          </span>
          </>,
          document.body,
        )}
    </span>
  );
}
