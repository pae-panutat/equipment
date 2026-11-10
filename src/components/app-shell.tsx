"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Boxes, LayoutDashboard, LogOut, Menu, UserCog, Wrench, X } from "lucide-react";
import { ROLE_LABEL } from "@shared/index";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/assets", label: "ทะเบียนอุปกรณ์", icon: Boxes },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = user?.role === "super_admin" ? [...NAV, { href: "/users", label: "ผู้ใช้งาน", icon: UserCog }] : NAV;
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
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
  const pathname = usePathname();
  const { user, loading, connectionError, retry, logout } = useAuth();

  // the login page has its own full-screen layout
  if (pathname === "/login") return <>{children}</>;
  // wait for the session check; signed-out visitors are redirected to /login by AuthProvider
  // the server could not be reached: stay on this page (do NOT send the user to /login; their sign-in is still saved)
  if (connectionError && !user) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div role="alert" className="grid max-w-sm gap-3 text-center">
          <p className="text-lg font-bold">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</p>
          <p className="text-sm text-muted-foreground">{connectionError}</p>
          <button type="button" onClick={retry} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    );
  }
  if (loading || !user) return <div className="min-h-dvh" aria-busy="true" />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr] print:block">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card p-4 lg:flex print:hidden">
        <Brand />
        <NavLinks />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-8 print:hidden">
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
          <div className="ml-auto hidden min-w-0 text-right leading-tight sm:block">
            <p className="truncate text-sm font-bold">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABEL[user.role]}
              {user.unitName ? ` · ${user.unitName}` : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center sm:ml-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
              className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {open && (
          <div className="border-b border-border bg-card p-3 lg:hidden print:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}

        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
