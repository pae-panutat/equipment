"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Database, LayoutDashboard, LogOut, Menu, ScanQrCode, X, History, CalendarDays, FileBarChart } from "lucide-react";
import { ROLE_LABEL } from "@shared/index";
import { CommandPalette } from "@/components/command-palette";
import { RailTip } from "@/components/ui/rail-tip";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar, UserIcon } from "@/components/ui/user-icon";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }> };

// The menu is split into groups separated by a divider; a group may have a small heading (shown when the sidebar is open).
const MAIN: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/assets", label: "ทะเบียนอุปกรณ์", icon: Boxes },
  { href: "/calendar", label: "ปฏิทินบำรุงรักษา", icon: CalendarDays },
  { href: "/reports", label: "รายงาน", icon: FileBarChart },
];
const ADMIN: NavItem[] = [
  { href: "/master", label: "ข้อมูลหลัก", icon: Database },
  { href: "/users", label: "ผู้ใช้งาน", icon: UserIcon },
  { href: "/audit", label: "ประวัติการแก้ไข", icon: History },
];

/** compact = the folded sidebar: icons only (the name is still the tooltip and the screen-reader label). */
function NavLinks({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const groups: { heading?: string; items: NavItem[] }[] = [{ items: MAIN }];
  if (user?.role === "super_admin") groups.push({ heading: "ผู้ดูแลระบบ", items: ADMIN });
  const row = cn("flex min-h-11 items-center gap-3 rounded-2xl text-[15px] transition-colors", compact ? "justify-center px-0" : "px-3.5");
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col">
      {groups.map((g, i) => (
        <div key={g.heading ?? "main"} role="group" aria-label={g.heading} className={cn("flex flex-col gap-1", i > 0 && "mt-3 border-t border-border pt-3")}>
          {g.heading && !compact && <p className="px-3.5 pb-1 text-xs text-muted-foreground">{g.heading}</p>}
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <RailTip key={href} label={label} icon={Icon} enabled={compact}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(row, active ? "bg-primary-soft font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                <span className={compact ? "sr-only" : undefined}>{label}</span>
              </Link>
              </RailTip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl brand-mark" aria-hidden="true">
        <ScanQrCode className="size-[18px]" />
      </span>
      <span className="whitespace-nowrap leading-tight max-[420px]:hidden">
        <span className="block text-[15px] font-bold">CMU Asset</span>
        <span className="block text-xs text-muted-foreground">Maintenance</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false); // phone: the menu dropdown
  const [collapsed, setCollapsed] = useState(false); // desktop: the sidebar folded to a narrow icon rail
  const pathname = usePathname();
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch {
      /* storage can be unavailable (private mode); the sidebar simply starts open */
    }
  }, []);
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "open" : "collapsed");
      } catch {
        /* still works for this visit */
      }
      return !c;
    });
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
    <div className={cn("min-h-dvh lg:grid print:block", collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[260px_1fr]")}>
      <aside
        className={cn("sticky top-0 hidden h-dvh flex-col gap-6 overflow-hidden border-r border-border bg-card lg:flex print:hidden", collapsed ? "p-3" : "p-4")}
        aria-label="เมนูด้านข้าง"
      >
        {collapsed ? (
          // folded: just the purple logo, which goes to the home page
          <div className="flex flex-col items-center">
            <RailTip label="CMU Asset · หน้าแรก" icon={ScanQrCode}>
              <Link
                href="/"
                aria-label="CMU Asset Maintenance — หน้าแรก"
                className="grid size-11 shrink-0 place-items-center rounded-xl brand-mark transition-opacity hover:opacity-90"
              >
                <ScanQrCode className="size-5" aria-hidden="true" />
              </Link>
            </RailTip>
          </div>
        ) : (
          <Brand />
        )}
        <NavLinks compact={collapsed} />
      </aside>

      <div className="min-w-0">
        <header className="brand-line sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-8 print:hidden">
          {/* desktop: the hamburger at the left end of the top bar folds / opens the sidebar */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "ขยายเมนูด้านข้าง" : "หุบเมนูด้านข้าง"}
            aria-expanded={!collapsed}
            className="hidden size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:-ml-2.5 lg:grid"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
          {/* phone only: the sidebar is not there, so the same button opens the menu as a dropdown */}
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto">
            <CommandPalette />
          </div>
          <div className="flex min-w-0 items-center gap-2.5" title={`${user.displayName} · ${ROLE_LABEL[user.role]}`}>
            <div className="hidden min-w-0 text-right leading-tight sm:block">
              <p className="truncate text-sm font-bold">{user.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABEL[user.role]}
                {user.unitName ? ` · ${user.unitName}` : ""}
              </p>
            </div>
            <UserAvatar />
          </div>
          <div className="flex items-center">
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

        {/* the content fills all the room next to the sidebar, folded or not (centred only on very wide screens) */}
        <main className="mx-auto w-full max-w-[1800px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
