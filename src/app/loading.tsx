// Shown by Next.js while a page is being prepared (e.g. the first visit to a page in development, or a slow server).
export default function Loading() {
  return (
    <div role="status" className="grid min-h-[40dvh] place-items-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        กำลังโหลด...
      </div>
    </div>
  );
}
