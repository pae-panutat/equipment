"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { HistoryItem, Paged } from "@shared/index";
import { Card, CardTitle, ErrorState, Skeleton } from "@/components/ui/card";
import { useApi } from "@/lib/use-api";
import { HistoryList } from "./history-list";

const PAGE = 15;

function Body({ assetId }: { assetId: number }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<HistoryItem>>(`/assets/${assetId}/history`, { page, pageSize: PAGE }, { live: true });
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-32" />;
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  return (
    <>
      <HistoryList items={data.items} />
      {data.total > PAGE && (
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-11 rounded-xl border border-border px-4 hover:bg-muted disabled:opacity-40">
            ก่อนหน้า
          </button>
          <span className="text-muted-foreground">
            หน้า {page} / {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="min-h-11 rounded-xl border border-border px-4 hover:bg-muted disabled:opacity-40">
            ถัดไป
          </button>
        </div>
      )}
    </>
  );
}

/** The asset's edit history, loaded only when opened. */
export function AssetHistory({ assetId }: { assetId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="print:hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <CardTitle>ประวัติการแก้ไข</CardTitle>
        <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2">
          <Body assetId={assetId} />
        </div>
      )}
    </Card>
  );
}
