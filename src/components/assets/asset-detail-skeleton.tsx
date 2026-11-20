import { Card, Skeleton } from "@/components/ui/card";

/** Placeholder shaped like the asset page (title, photos, information, QR), so opening it from a scan causes no jump in layout. */
export function AssetDetailSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <div>
        <Skeleton className="h-8 w-40 rounded-full" />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="grid gap-2.5">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-5 w-48 max-w-full" />
          </div>
          <Skeleton className="h-12 w-28 rounded-2xl" />
        </div>
      </div>

      <Skeleton className="h-52 rounded-[28px] sm:h-60" />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <Skeleton className="h-6 w-36" />
          <div className="mt-4 grid gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[130px_1fr] gap-3 sm:grid-cols-[160px_1fr]">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="hidden h-fit sm:block">
          <Skeleton className="mx-auto h-6 w-32" />
          <Skeleton className="mx-auto mt-4 size-[240px] max-w-full" />
        </Card>
      </div>
    </div>
  );
}
