"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog over a dimmed, blurred page. Locks page scroll, keeps keyboard focus inside, and returns focus
 * to where it was. Clicking the backdrop does NOT close it (so an edit is never lost by a stray click);
 * Escape closes only when `canDismiss` is true.
 */
export function Modal({
  title,
  onClose,
  canDismiss = true,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  canDismiss?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const dismissible = useRef({ canDismiss, onClose });
  dismissible.current = { canDismiss, onClose };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = dialog.current?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible.current.canDismiss) {
        e.stopPropagation();
        dismissible.current.onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (!dialog.current.contains(document.activeElement)) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6 print:hidden">
      {/* dimmed + blurred page behind the dialog */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-border bg-card text-card-foreground shadow-2xl outline-none",
          className,
        )}
      >
        <h2 id={titleId} className="shrink-0 border-b border-border px-5 py-4 text-lg font-bold sm:px-6">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
