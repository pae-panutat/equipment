"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, ScanLine, SearchX, ShieldAlert, TriangleAlert } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { AssetDetailSkeleton } from "@/components/assets/asset-detail-skeleton";
import { Card } from "@/components/ui/card";

type ScanError = { status: number; message: string };

// What each failure means for the person holding the phone: an icon (never colour alone), a heading, and whether trying again can help.
function describe(status: number) {
  if (status === 403) return { Icon: ShieldAlert, tone: "bg-warn-soft text-warn", title: "ไม่มีสิทธิ์ดูอุปกรณ์นี้", retry: false };
  if (status === 404) return { Icon: SearchX, tone: "bg-muted text-muted-foreground", title: "ไม่พบอุปกรณ์", retry: false };
  return { Icon: TriangleAlert, tone: "bg-bad-soft text-bad", title: "เปิดข้อมูลไม่สำเร็จ", retry: true };
}

/** Resolves a scanned QR token to an asset (the server checks the user's unit scope) and opens its page. */
export function ScanView({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<ScanError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ assetId: number }>(`/q/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!cancelled) router.replace(`/assets/${r.assetId}`);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // a 401 is handled by AuthProvider (back to login, then back here)
        if (e instanceof ApiError && e.status === 401) return;
        setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, router, attempt]);

  if (!error) {
    return (
      <div className="grid gap-5" aria-busy="true">
        <p role="status" className="inline-flex w-fit items-center gap-2.5 rounded-full bg-primary-soft px-4 py-2 text-[15px] font-bold text-primary">
          <ScanLine className="size-5 animate-pulse" aria-hidden="true" />
          กำลังเปิดข้อมูลอุปกรณ์...
        </p>
        <AssetDetailSkeleton />
      </div>
    );
  }

  const { Icon, tone, title, retry } = describe(error.status);
  return (
    <Card role="alert" className="mx-auto mt-6 max-w-md text-center sm:mt-10">
      <span className={`mx-auto grid size-14 place-items-center rounded-full ${tone}`}>
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      <div className="mt-6 grid gap-2.5">
        {retry && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground hover:opacity-90"
          >
            <RotateCw className="size-4" aria-hidden="true" />
            ลองอีกครั้ง
          </button>
        )}
        <Link
          href="/assets"
          className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-bold ${retry ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:opacity-90"}`}
        >
          ไปที่ทะเบียนอุปกรณ์
        </Link>
      </div>
    </Card>
  );
}
