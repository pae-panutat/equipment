"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Boxes, LayoutDashboard, Menu, Wrench, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/assets", label: "ทะเบียนอุปกรณ์", icon: Boxes },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] transition-colors",
              active ? "bg-primary-soft font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <div className="mt-2 flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] text-muted-foreground/60" aria-disabled="true">
        <Wrench className="size-[18px]" aria-hidden="true" />
        งานบำรุงรักษา
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px]">เร็วๆ นี้</span>
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
        <Wrench className="size-[18px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold">CMU Asset</span>
        <span className="block text-xs text-muted-foreground">Maintenance</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card p-4 lg:flex">
        <Brand />
        <NavLinks />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <p className="ml-auto hidden rounded-full bg-warn-soft px-3 py-1 text-xs text-warn sm:block">ข้อมูลสมมติ · ยังไม่มีระบบเข้าสู่ระบบ</p>
          <div className="ml-auto sm:ml-0">
            <ThemeToggle />
          </div>
        </header>

        {open && (
          <div className="border-b border-border bg-card p-3 lg:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}

        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
