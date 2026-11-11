"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  /** What it does: shown as the tooltip and read by screen readers (there is no visible text). */
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** "primary" fills the button with the brand colour; the default is a quiet outline. */
  tone?: "quiet" | "primary";
  /** A larger button with a purple tint and a bigger icon, for the export buttons in a card's corner. */
  big?: boolean;
  className?: string;
};

/** A small icon-only button (export, print, download). Place it in the top-right corner of its card. */
export function IconButton({ label, icon: Icon, onClick, href, disabled, tone = "quiet", big = false, className }: Props) {
  const cls = cn(
    "inline-grid shrink-0 place-items-center transition-all disabled:pointer-events-none disabled:opacity-40 print:hidden",
    big
      ? "size-11 rounded-xl border border-primary/30 bg-primary-soft text-primary shadow-sm hover:-translate-y-0.5 hover:border-primary/60 hover:bg-[image:var(--grad)] hover:text-primary-foreground hover:shadow-md"
      : "size-8 rounded-lg",
    !big && (tone === "primary" ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border bg-card/70 text-muted-foreground hover:bg-primary-soft hover:text-primary"),
    className,
  );
  const icon = <Icon className={big ? "size-7" : "size-4"} aria-hidden="true" />;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cls}>
      {icon}
    </button>
  );
}
