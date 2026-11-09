import { ASSET_STATUS_LABEL, type AssetStatus } from "@shared/index";
import { cn } from "@/lib/utils";

// Status is conveyed by text AND colour (never colour alone).
const TONE: Record<AssetStatus, string> = {
  active: "bg-ok-soft text-ok",
  faulty: "bg-bad-soft text-bad",
  under_repair: "bg-warn-soft text-warn",
  inactive: "bg-muted text-muted-foreground",
  disposed: "bg-muted text-muted-foreground line-through",
};

const DOT: Record<AssetStatus, string> = {
  active: "bg-ok",
  faulty: "bg-bad",
  under_repair: "bg-warn",
  inactive: "bg-muted-foreground",
  disposed: "bg-muted-foreground",
};

export const STATUS_DOT = DOT;

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", TONE[status])}>
      <i className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden="true" />
      {ASSET_STATUS_LABEL[status]}
    </span>
  );
}
