"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraduationCap, Wrench } from "lucide-react";
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

const input = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";

export function LoginForm() {
  const sp = useSearchParams();
  const { refresh } = useAuth();
  const { data: cfg } = useApi<AuthConfig>("/auth/config");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
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
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
            <Wrench className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold">CMU Asset</span>
            <span className="block text-xs text-muted-foreground">Maintenance</span>
          </span>
        </div>

        <Card>
          <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
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
            className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground hover:opacity-90"
          >
            <GraduationCap className="size-5" aria-hidden="true" />
            เข้าสู่ระบบด้วย CMU Account
          </a>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            หรือ
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="grid gap-4">
            <label className="grid gap-1 text-[13px] text-muted-foreground">
              ชื่อผู้ใช้ (Username)
              <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            </label>
            <label className="grid gap-1 text-[13px] text-muted-foreground">
              รหัสผ่าน (Password)
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-xl border border-primary px-4 font-bold text-primary enabled:hover:bg-primary-soft disabled:opacity-50"
            >
              {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">ไม่ควรเลือก &quot;Remember me&quot; บนเครื่องที่ใช้ร่วมกับผู้อื่น</p>
      </div>
    </div>
  );
}
