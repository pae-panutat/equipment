"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, Boxes, ClipboardCheck, IdCard, Monitor, ScanQrCode } from "lucide-react";
import { safeNextPath, type AuthConfig } from "@shared/index";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";

const ERRORS: Record<string, string> = {
  cmu_disabled: "ยังไม่เปิดใช้การเข้าสู่ระบบด้วย CMU Account",
  cmu_state: "การเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
  cmu_failed: "เชื่อมต่อ CMU Account ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  cmu_domain: "ต้องใช้บัญชี @cmu.ac.th เท่านั้น",
  inactive: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
};

const input = "min-h-10 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";

export function LoginForm() {
  const sp = useSearchParams();
  const { refresh } = useAuth();
  const { data: cfg } = useApi<AuthConfig>("/auth/config");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Signed in for good (a year since the last visit, renewed each time the site is used) is the default, so a phone that scans a QR
  // code stays signed in. The box is un-ticked only for a shared computer, and that choice is kept per browser.
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("remember-me") === "0") setRemember(false);
    } catch {
      /* storage can be unavailable (private mode): the box simply stays ticked */
    }
  }, []);
  const changeRemember = (on: boolean) => {
    setRemember(on);
    try {
      localStorage.setItem("remember-me", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  // the login screen is a fixed full-screen layer: lock the document too, so the mouse wheel can never scroll the page behind it
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[sp.get("error") ?? ""] ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", "/auth/login", { username, password, remember });
      await refresh(); // AuthProvider then moves to "/"
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 isolate grid place-items-center overflow-hidden px-4 py-3">
      <div className="login-bg" aria-hidden="true">
        <span className="login-blob left-[-10%] top-[-15%] size-[520px] bg-primary" />
        <span className="login-blob right-[-8%] top-[20%] size-[460px] bg-gold [animation-delay:-6s]" />
        <span className="login-blob bottom-[-20%] left-[25%] size-[480px] bg-[#5238ea] [animation-delay:-12s]" />
      </div>
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="grid w-full max-w-[1040px] items-center gap-6 lg:grid-cols-[1.1fr_420px] lg:gap-16">
        <div className="hidden lg:block">
          <span className="inline-grid size-16 place-items-center rounded-2xl brand-mark shadow-[0_12px_40px_-8px_var(--primary)]" aria-hidden="true">
            <Monitor className="size-9" />
          </span>
          <h2 className="login-title mt-6 text-5xl font-bold leading-[1.15] tracking-[-0.02em]">
            ทะเบียนครุภัณฑ์
            <br />
            และงานซ่อมบำรุง
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">CMU Asset &amp; Maintenance</p>
          <ul className="mt-6 grid max-w-sm gap-1.5">
            {[
              { Icon: Boxes, text: "ทะเบียนอุปกรณ์ทุกส่วนงาน ค้นหาได้ทันที" },
              { Icon: ScanQrCode, text: "สแกน QR Code เปิดข้อมูลอุปกรณ์ได้ที่หน้างาน" },
              { Icon: ClipboardCheck, text: "แผนบำรุงรักษาและใบงาน แจ้งเตือนก่อนครบกำหนด" },
              { Icon: Activity, text: "ภาพรวมและรายการใหม่อัปเดตสด" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-1.5 backdrop-blur-md">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full max-w-[420px] justify-self-center">
        <div className="mb-3 flex items-center justify-center gap-2.5 lg:hidden">
          <span className="grid size-11 place-items-center rounded-xl brand-mark" aria-hidden="true">
            <Monitor className="size-6" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold">CMU Asset</span>
            <span className="block text-xs text-muted-foreground">Maintenance</span>
          </span>
        </div>

        <Card className="login-card bg-card/75 backdrop-blur-xl">
          <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}

          {/* always shown; until the CMU OAuth keys are configured the click only explains that it is not ready */}
          <a
            href={`/api/v1/auth/cmu/start?${new URLSearchParams({ ...(remember ? { remember: "1" } : {}), next: safeNextPath(sp.get("next")) })}`}
            onClick={(e) => {
              if (cfg && !cfg.cmuEnabled) {
                e.preventDefault();
                setError(ERRORS.cmu_disabled);
              }
            }}
            className="text-sm mt-3 flex min-h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground hover:opacity-90"
          >
            <IdCard className="size-5" aria-hidden="true" />
            เข้าสู่ระบบด้วย CMU Account
          </a>
          <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            หรือ
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="grid gap-2.5">
            <label className="grid gap-1 text-[13px] text-muted-foreground">
              ชื่อผู้ใช้ (Username)
              <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            </label>
            <label className="grid gap-1 text-[13px] text-muted-foreground">
              รหัสผ่าน (Password)
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="flex min-h-9 items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={remember} onChange={(e) => changeRemember(e.target.checked)} />
              Remember me
            </label>
            <button
              type="submit"
              disabled={busy}
              className="text-sm min-h-9 rounded-xl border border-primary px-3.5 font-bold text-primary enabled:hover:bg-primary-soft disabled:opacity-50"
            >
              {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        </Card>
        </div>
      </div>
    </div>
  );
}
