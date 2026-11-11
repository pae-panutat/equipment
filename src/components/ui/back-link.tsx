import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The way back to the list a page came from: a purple arrow badge and bold purple text, with no box around them. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex min-h-9 items-center gap-2.5 text-[15px] font-bold text-primary print:hidden">
      <span className="grid size-8 place-items-center rounded-full bg-[image:var(--grad)] text-primary-foreground shadow-sm transition-transform group-hover:-translate-x-1">
        <ArrowLeft className="size-4" aria-hidden="true" />
      </span>
      <span className="underline-offset-4 group-hover:underline">{children}</span>
    </Link>
  );
}
