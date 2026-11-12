// Types, enums and labels shared by web/ and server/ (single source of truth).
export const API_PREFIX = "/api/v1";

export const ASSET_STATUSES = ["active", "faulty", "under_repair", "inactive", "disposed"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: "ปกติ",
  faulty: "ชำรุด",
  under_repair: "กำลังดำเนินการ",
  inactive: "หยุดใช้งาน",
  disposed: "จำหน่ายออก",
};

export const WORK_ORDER_KINDS = ["planned", "repair", "inspection"] as const;
export type WorkOrderKind = (typeof WORK_ORDER_KINDS)[number];
export const WORK_ORDER_KIND_LABEL: Record<WorkOrderKind, string> = {
  planned: "บำรุงรักษาตามแผน",
  repair: "ซ่อมแก้ไข",
  inspection: "ตรวจสอบ",
};

// A job is either being worked on or finished.
export const WORK_ORDER_STATUSES = ["in_progress", "done"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จสิ้น",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "ต่ำ", normal: "ปกติ", high: "สูง", urgent: "เร่งด่วน" };

export const INTERVAL_UNITS = ["day", "month"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

/** Days ahead that count as "due soon" on the dashboard (configurable later). */
export const DUE_SOON_DAYS = 30;

// ---- API response shapes ----

export type DashboardSummary = {
  asOf: string; // YYYY-MM-DD, Asia/Bangkok
  filters: { unitId: number | null; typeId: number | null; status: AssetStatus | null; from: string | null; to: string | null };
  totals: { assets: number; airConditioners: number; airConditionerTypeId: number | null };
  byType: { id: number; name: string; count: number }[];
  byStatus: { status: AssetStatus; count: number }[];
  maintenance: { overdue: number; dueSoon: number; noPlan: number };
  completedByMonth: { month: string; count: number }[];
  upcoming: { planId: number; assetId: number; assetCode: string; assetName: string; unitName: string; title: string; dueDate: string; overdue: boolean }[];
  recent: { id: number; number: string; assetId: number; assetCode: string; assetName: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; at: string }[];
};

export type AssetListItem = {
  id: number;
  code: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  status: AssetStatus;
  unit: string;
  location: string | null;
  lastMaintenance: string | null;
  nextDue: string | null;
};

/** A maintenance / repair record of one asset, as shown in its history. */
export type WorkOrderItem = {
  id: number;
  number: string;
  title: string;
  kind: WorkOrderKind;
  status: WorkOrderStatus;
  priority: Priority;
  description: string | null;
  planId: number | null;
  dueDate: string | null;
  performedOn: string | null;
  recordedBy: string | null;
  /** Content version for the edit dialog (see AssetDetail.version). */
  version: string;
};

/**
 * The asset's own status always agrees with its jobs. Judged from the jobs that exist AFTER a save, not from the change itself:
 *  - any job in progress -> the asset is "in progress" (an asset that is normal or faulty is moved there);
 *  - no job in progress and the asset is "in progress" -> back to "normal";
 *  - inactive and disposed assets are never changed; every other status is left as it is.
 * Returns the new status, or null for "no change". An explicit choice by the user must still pass assetStatusProblem().
 */
export function autoAssetStatus(a: { current: AssetStatus; inProgress: number }): AssetStatus | null {
  if (a.current === "inactive" || a.current === "disposed") return null;
  if (a.inProgress > 0) return a.current === "under_repair" ? null : "under_repair";
  if (a.current === "under_repair") return "active";
  return null;
}

/** Why a status chosen by hand would contradict the jobs (null = fine). inProgress = jobs in progress once the change is made. */
export function assetStatusProblem(status: AssetStatus, inProgress: number): string | null {
  if (status === "under_repair" && inProgress === 0) {
    return "ตั้งเป็น \"กำลังดำเนินการ\" ไม่ได้ เพราะไม่มีงานที่กำลังดำเนินการ — บันทึกงานซ่อมแล้วระบบจะเปลี่ยนสถานะให้เอง";
  }
  if (inProgress > 0 && (status === "active" || status === "faulty")) {
    return `มีงานที่กำลังดำเนินการอยู่ ${inProgress} รายการ สถานะต้องเป็น "กำลังดำเนินการ" — บันทึกผลงานให้เสร็จก่อน ระบบจะเปลี่ยนสถานะให้เอง`;
  }
  return null;
}

/** A finished record keeps its status; their details can still be corrected. */
export const WORK_ORDER_TERMINAL: readonly WorkOrderStatus[] = ["done"];

/** One photo of an asset; the picture itself is fetched from /assets/:id/images/:imageId. */
export type AssetImage = { id: number; width: number; height: number };

/** Photo limits (also enforced by the server). The browser shrinks photos before uploading. */
export const MAX_IMAGES_PER_ASSET = 1;
export const IMAGE_MAX_BYTES = 1024 * 1024; // 1 MB
export const THUMB_MAX_BYTES = 400 * 1024;

export type AssetDetail = {
  id: number;
  /** Raw ids and a content version, used by the edit dialog. Saving is refused if the editable fields changed since this version. */
  typeId: number;
  ownerUnitId: number;
  locationId: number | null;
  version: string;
  code: string;
  legacyAssetNo: string | null;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  unit: string;
  location: string | null;
  locationDetail: string | null;
  purchaseDate: string | null;
  installDate: string | null;
  warrantyEnd: string | null;
  notes: string | null;
  images: AssetImage[];
  /** Jobs of this asset that are in progress: what the asset's status must agree with. */
  inProgressJobs: number;
  plans: { id: number; title: string; intervalValue: number; intervalUnit: IntervalUnit; nextDueDate: string | null; active: boolean }[];
  workOrders: WorkOrderItem[];
  /** null for an asset that has been disposed of. */
  health: AssetHealth | null;
};

/** A 0-100 score for how much attention an asset needs, with the reasons it lost points. */
export type AssetHealth = { score: number; level: "good" | "fair" | "watch" | "replace"; factors: { label: string; points: number }[] };

/** Something that falls due on a calendar day: a maintenance plan, or a job that is still open. */
export type CalendarItem = { kind: "plan" | "job"; id: number; assetId: number; assetCode: string; assetName: string; title: string; date: string };

/** One line of the edit history. `changes` maps a field to [before, after]. */
export type HistoryItem = {
  id: number;
  at: string;
  username: string;
  entity: string;
  assetId: number | null;
  assetCode: string | null;
  action: string;
  summary: string;
  changes: Record<string, [unknown, unknown]> | null;
};

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type FilterOptions = {
  units: { id: number; name: string; parentId: number | null }[];
  types: { id: number; name: string }[];
};

// ---- auth ----

export const ROLES = ["super_admin", "technician", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "ผู้ดูแลระบบ",
  technician: "ช่างเทคนิค",
  viewer: "ผู้ชมข้อมูล",
};

export const LOGIN_METHODS = ["local", "cmu"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export const PASSWORD_MIN_LENGTH = 10;

/** "Remember me" keeps a sign-in for one year. (Chrome limits any cookie to 400 days, so 365 is the most that works everywhere.) */
export const REMEMBER_DAYS = 365;

export type AuthUser = {
  id: number;
  displayName: string;
  username: string | null;
  cmuEmail: string | null;
  role: Role;
  unitId: number | null;
  unitName: string | null;
  /** How this session signed in. */
  loginMethod: LoginMethod;
  /**
   * Data scope of this session: Super Admin always sees every unit; a Technician sees every unit only when signed in
   * with username/password; everyone else (and everyone signed in with CMU Account) sees only their own unit.
   */
  seesAllUnits: boolean;
};

/** Who may edit asset records (Technician only within the units they can see). */
export const ASSET_EDIT_ROLES: readonly Role[] = ["super_admin", "technician"];
export const canEditAssets = (role: Role) => ASSET_EDIT_ROLES.includes(role);

export type LocationOption = { id: number; label: string };

export type AuthConfig = { cmuEnabled: boolean };

export type ManagedUser = Omit<AuthUser, "loginMethod" | "seesAllUnits"> & { active: boolean; lastLoginAt: string | null; createdAt: string };

/** A same-site path that is safe to redirect to after login ("/q/abc"), or "/" for anything else (open-redirect guard). */
export function safeNextPath(value: string | null | undefined): string {
  return typeof value === "string" && /^\/(?!\/)[^\\\s]*$/.test(value) && value.length <= 300 ? value : "/";
}

// ---- master data (Super Admin): organization units, asset types, locations ----

export type MasterKind = "units" | "types" | "locations";
export const LOCATION_KINDS = ["campus", "building", "floor", "room"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];
export const LOCATION_KIND_LABEL: Record<LocationKind, string> = { campus: "วิทยาเขต", building: "อาคาร", floor: "ชั้น", room: "ห้อง" };

export type MasterItem = {
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  kind: string | null; // locations only
  archived: boolean;
  assetCount: number; // assets that point at it (any status)
  childCount: number; // active rows directly under it
  userCount: number; // active users assigned to it (units only)
};
