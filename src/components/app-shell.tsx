"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Database, LayoutDashboard, LogOut, Menu, MoreHorizontal, Monitor, History, CalendarDays, FileBarChart } from "lucide-react";
import { ROLE_LABEL } from "@shared/index";
import { RailTip } from "@/components/ui/rail-tip";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar, UserIcon } from "@/components/ui/user-icon";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; short?: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }> };

// The menu is split into groups separated by a divider; a group may have a small heading (shown when the sidebar is open).
const MAIN: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/assets", label: "ทะเบียนอุปกรณ์", short: "อุปกรณ์", icon: Boxes },
  { href: "/calendar", label: "ปฏิทินบำรุงรักษา", short: "ปฏิทิน", icon: CalendarDays },
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
  const row = cn("flex min-h-10 items-center gap-3 rounded-2xl text-sm transition-colors", compact ? "justify-center px-0" : "px-3.5");
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

/** Phone only: the menu sits at the bottom of the screen like a mobile app; the admin pages open from "เพิ่มเติม". */
function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const admin = user?.role === "super_admin";
  const is = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const adminActive = ADMIN.some((i) => is(i.href));
  const cell = "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight transition-colors";
  return (
    <>
      {more && admin && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] grid gap-1 rounded-2xl border border-border bg-popover p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pt-1 text-xs text-muted-foreground">ผู้ดูแลระบบ</p>
            {ADMIN.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={is(href) ? "page" : undefined}
                className={cn("flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm", is(href) ? "bg-primary-soft font-bold text-primary" : "hover:bg-muted")}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
        <div className="mx-auto flex max-w-xl">
          {MAIN.map(({ href, label, short, icon: Icon }) => (
            <Link key={href} href={href} aria-current={is(href) ? "page" : undefined} aria-label={label} className={cn(cell, is(href) ? "font-bold text-primary" : "text-muted-foreground")}>
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", is(href) && "bg-primary-soft")}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {short ?? label}
            </Link>
          ))}
          {admin && (
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="เมนูเพิ่มเติม" className={cn(cell, adminActive || more ? "font-bold text-primary" : "text-muted-foreground")}>
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", (adminActive || more) && "bg-primary-soft")}>
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </span>
              เพิ่มเติม
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl brand-mark" aria-hidden="true">
        <Monitor className="size-[18px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold">CMU Asset</span>
        <span className="block text-xs text-muted-foreground">Maintenance</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
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
          <button type="button" onClick={retry} className="text-sm min-h-9 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground">
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
          // folded: just the logo, which goes to the home page
          <div className="flex flex-col items-center">
            <RailTip label="CMU Asset · หน้าแรก" icon={Monitor}>
              <Link
                href="/"
                aria-label="CMU Asset Maintenance — หน้าแรก"
                className="grid size-11 shrink-0 place-items-center rounded-xl brand-mark transition-opacity hover:opacity-90"
              >
                <Monitor className="size-5" aria-hidden="true" />
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
            className="hidden size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:-ml-2.5 lg:grid"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2.5" title={`${user.displayName} · ${ROLE_LABEL[user.role]}`}>
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
              className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* the content fills all the room next to the sidebar, folded or not (centred only on very wide screens) */}
        <main className="mx-auto w-full max-w-[1800px] px-4 pb-24 pt-6 lg:px-8 lg:py-8 print:p-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
