import { cn } from "@/lib/utils";

/** A minimal outline user icon (head and shoulders). Drawn with currentColor, so it follows the theme. */
export function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5", className)}
    >
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.75 20c.35-3.6 3.4-5.75 7.25-5.75s6.9 2.15 7.25 5.75" />
    </svg>
  );
}

/** The icon in a soft round badge: the signed-in person in the page header. */
export function UserAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary", className)} aria-hidden="true">
      <UserIcon className="size-[18px]" />
    </span>
  );
}
