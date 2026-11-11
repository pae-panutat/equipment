"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import { API_PREFIX } from "@shared/index";
import { ErrorState, Skeleton } from "@/components/ui/card";
import { useApi } from "@/lib/use-api";

type Label = { id: number; code: string; name: string; unit: string };

// Two sheet layouts on A4: 24 small labels (3 x 8, 70 x 37 mm) or 8 large ones (2 x 4, 105 x 74 mm).
const SIZES = {
  small: { cols: 3, rows: 8, w: 70, h: 37.125, qr: 27, name: "ขนาดเล็ก (24 ป้ายต่อแผ่น)" },
  large: { cols: 2, rows: 4, w: 105, h: 74.25, qr: 52, name: "ขนาดใหญ่ (8 ป้ายต่อแผ่น)" },
} as const;

/** Print the QR labels of the chosen assets on A4 sheets, with a thin cut line round each label. */
export function LabelsView() {
  const sp = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter((v) => /^\d+$/.test(v)).slice(0, 200).join(",");
  const [size, setSize] = useState<keyof typeof SIZES>("small");
  const { data, error, loading, reload } = useApi<{ items: Label[] }>("/labels", { ids });
  const s = SIZES[size];
  const per = s.cols * s.rows;
  const sheets: Label[][] = [];
  for (let i = 0; data && i < data.items.length; i += per) sheets.push(data.items.slice(i, i + per));

  return (
    <div className="grid gap-5">
      <style>{`@media print { @page { size: A4; margin: 0 } main { padding: 0 !important; max-width: none !important } body { background: #fff !important } body::before { display: none !important } }`}</style>
      <div className="grid gap-3 print:hidden">
        <Link href="/assets" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> ทะเบียนอุปกรณ์
        </Link>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">พิมพ์ป้าย QR</h1>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[13px] text-muted-foreground">
            ขนาดป้าย
            <select className="min-h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" value={size} onChange={(e) => setSize(e.target.value as keyof typeof SIZES)}>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data || data.items.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
          >
            <Printer className="size-4" aria-hidden="true" /> พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.items.length} ป้าย · ${sheets.length} แผ่น` : ""} · ตอนพิมพ์เลือกกระดาษ A4 และตั้งระยะขอบเป็น “ไม่มี” แล้วตัดตามเส้นรอบป้าย
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-96 print:hidden" />}
      {data && data.items.length === 0 && <p className="text-muted-foreground print:hidden">ไม่พบอุปกรณ์ที่เลือก</p>}

      <div className="grid justify-center gap-6 overflow-x-auto print:block print:gap-0 print:overflow-visible">
        {sheets.map((sheet, n) => (
          <section
            key={n}
            className="bg-white text-black shadow-lg print:shadow-none"
            style={{ width: "210mm", height: "297mm", display: "grid", gridTemplateColumns: `repeat(${s.cols}, ${s.w}mm)`, gridAutoRows: `${s.h}mm`, alignContent: "start", breakAfter: "page", pageBreakAfter: "always", overflow: "hidden" }}
          >
            {sheet.map((l) => (
              <div key={l.id} style={{ width: `${s.w}mm`, height: `${s.h}mm`, outline: "0.2mm dashed #9ca3af", outlineOffset: "-0.1mm", display: "flex", alignItems: "center", gap: "2.5mm", padding: "2.5mm" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_PREFIX}/assets/${l.id}/qr.svg`} alt={`QR Code ของ ${l.code}`} style={{ width: `${s.qr}mm`, height: `${s.qr}mm`, flexShrink: 0 }} />
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <div style={{ fontWeight: 700, fontSize: size === "large" ? "6mm" : "3.8mm", lineHeight: 1.2 }}>{l.code}</div>
                  <div style={{ fontSize: size === "large" ? "4mm" : "2.9mm", lineHeight: 1.25, marginTop: "0.8mm" }}>{l.name}</div>
                  <div style={{ fontSize: size === "large" ? "3.2mm" : "2.4mm", color: "#4b5563", marginTop: "0.8mm", lineHeight: 1.25 }}>{l.unit}</div>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
