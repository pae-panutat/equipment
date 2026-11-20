"use client";

import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { useState } from "react";
import { API_PREFIX } from "@shared/index";
import { ErrorState, Skeleton } from "@/components/ui/card";
import { useApi } from "@/lib/use-api";
import { Check, Printer, QrCode } from "lucide-react";

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
        <BackLink href="/assets">ทะเบียนอุปกรณ์</BackLink>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">พิมพ์ป้าย QR</h1>
        <div role="radiogroup" aria-label="ขนาดป้าย" className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => {
            const v = SIZES[k];
            const on = size === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSize(k)}
                className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"}`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {on ? <Check className="size-5" aria-hidden="true" /> : <QrCode className="size-5" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{v.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.w} × {Math.round(v.h)} มม. ต่อป้าย
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data || data.items.length === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-fit"
        >
          <Printer className="size-5" aria-hidden="true" />
          พิมพ์ป้าย
        </button>
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
