import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-[17px] font-bold tracking-[-0.01em]", className)} {...props} />;
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "bad" | "warn" | "ok" }) {
  return (
    <div>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 text-[34px] font-bold leading-none sm:text-[40px]",
          tone === "bad" && "text-bad",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </div>
      {note && <div className="mt-2 text-[13px] text-muted-foreground">{note}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} aria-hidden="true" />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center gap-1 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="font-bold">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid place-items-center gap-2 rounded-2xl border border-bad/30 bg-bad-soft px-4 py-8 text-center text-bad">
      <p className="font-bold">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-11 rounded-xl bg-bad px-4 text-sm font-bold text-white">
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}
