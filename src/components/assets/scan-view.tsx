"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";

/** Resolves a scanned QR token to an asset (the server checks the user's unit scope) and opens its page. */
export function ScanView({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

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
  }, [token, router]);

  if (!error) {
    return (
      <div className="grid place-items-center gap-3 py-20 text-muted-foreground" aria-busy="true">
        <ScanLine className="size-8 animate-pulse" aria-hidden="true" />
        <p>กำลังเปิดข้อมูลอุปกรณ์...</p>
      </div>
    );
  }
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <h1 className="text-xl font-bold">{error.status === 403 ? "ไม่มีสิทธิ์ดูอุปกรณ์นี้" : error.status === 404 ? "ไม่พบอุปกรณ์" : "เปิดข้อมูลไม่สำเร็จ"}</h1>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      <Link href="/assets" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border px-4 hover:bg-muted">
        ไปที่ทะเบียนอุปกรณ์
      </Link>
    </Card>
  );
}
