// Shown by Next.js while a page is being prepared (e.g. the first visit to a page in development, or a slow server).
export default function Loading() {
  return (
    <div role="status" className="grid min-h-[50dvh] place-items-center text-muted-foreground">
      <div className="flex flex-col items-center gap-4">
        <span aria-hidden="true" className="size-14 animate-spin rounded-full border-[5px] border-border border-t-primary" />
        <span className="text-xl font-bold text-foreground">กำลังโหลด...</span>
      </div>
    </div>
  );
}
