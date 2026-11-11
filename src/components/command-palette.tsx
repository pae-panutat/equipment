"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CalendarDays, CornerDownLeft, FileBarChart, FileUp, History, LayoutDashboard, Search } from "lucide-react";
import { canEditAssets, type AssetListItem, type Paged } from "@shared/index";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Item = { key: string; label: string; hint?: string; href: string; icon: React.ComponentType<{ className?: string }> };

/**
 * Quick search (Ctrl+K, or ⌘K on a Mac): type an asset code or name and jump to it, or type a page name.
 * The button for it sits in the top bar; this component renders the button and the dialog.
 */
export function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setText("");
    setAssets([]);
    setAt(0);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
      opener.current?.focus?.();
    };
  }, [open]);

  // look up assets as the person types (after a short pause)
  useEffect(() => {
    if (!open || text.trim().length < 1) {
      setAssets([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      apiGet<Paged<AssetListItem>>("/assets", { q: text.trim(), pageSize: 8 }, ctrl.signal, true)
        .then((r) => (setAssets(r.items), setAt(0)))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, open]);

  const pages: Item[] = [
    { key: "p-home", label: "ภาพรวม", href: "/", icon: LayoutDashboard },
    { key: "p-assets", label: "ทะเบียนอุปกรณ์", href: "/assets", icon: Boxes },
    { key: "p-cal", label: "ปฏิทินบำรุงรักษา", href: "/calendar", icon: CalendarDays },
    { key: "p-rep", label: "รายงาน", href: "/reports", icon: FileBarChart },
    ...(user && canEditAssets(user.role) ? [{ key: "p-imp", label: "นำเข้าอุปกรณ์จากไฟล์", href: "/assets/import", icon: FileUp }] : []),
    ...(user?.role === "super_admin" ? [{ key: "p-audit", label: "ประวัติการแก้ไข", href: "/audit", icon: History }] : []),
  ];
  const q = text.trim().toLowerCase();
  const items: Item[] = [
    ...assets.map((a) => ({ key: `a-${a.id}`, label: `${a.code} · ${a.name}`, hint: [a.type, a.unit].join(" · "), href: `/assets/${a.id}`, icon: Boxes })),
    ...pages.filter((p) => !q || p.label.toLowerCase().includes(q)),
  ];

  const go = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    router.push(it.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          opener.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }}
        aria-label="ค้นหาด่วน (Ctrl+K)"
        title="ค้นหาด่วน (Ctrl+K)"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden md:inline">ค้นหา</span>
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] md:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="ค้นหาด่วน" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  else if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => Math.min(i + 1, items.length - 1)));
                  else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => Math.max(i - 1, 0)));
                  else if (e.key === "Enter") (e.preventDefault(), go(items[at]));
                }}
                placeholder="พิมพ์รหัส ชื่ออุปกรณ์ หรือชื่อหน้า..."
                aria-label="ค้นหา"
                className="min-h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</kbd>
            </div>
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบรายการ</li>}
              {items.map((it, i) => (
                <li key={it.key} role="option" aria-selected={i === at}>
                  <button
                    type="button"
                    onMouseEnter={() => setAt(i)}
                    onClick={() => go(it)}
                    className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left", i === at ? "bg-primary-soft text-primary" : "hover:bg-muted")}
                  >
                    <it.icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{it.label}</span>
                      {it.hint && <span className="block truncate text-xs text-muted-foreground">{it.hint}</span>}
                    </span>
                    {i === at && <CornerDownLeft className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
