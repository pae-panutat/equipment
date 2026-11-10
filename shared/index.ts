// Types, enums and labels shared by web/ and server/ (single source of truth).
export const API_PREFIX = "/api/v1";

export const ASSET_STATUSES = ["active", "faulty", "under_repair", "inactive", "disposed"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: "ใช้งานปกติ",
  faulty: "ชำรุด",
  under_repair: "อยู่ระหว่างซ่อม",
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

export const WORK_ORDER_STATUSES = ["open", "assigned", "in_progress", "done", "cancelled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "เปิดงาน",
  assigned: "มอบหมาย",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

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
  /** Repair/maintenance cost of completed work in the selected range. Unknown costs are counted separately. */
  cost: { total: number; ordersWithCost: number; ordersWithUnknownCost: number };
  completedByMonth: { month: string; count: number }[];
  upcoming: { assetId: number; assetCode: string; assetName: string; title: string; dueDate: string; overdue: boolean }[];
  recent: { id: number; number: string; assetCode: string; assetName: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; at: string }[];
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
  plans: { id: number; title: string; intervalValue: number; intervalUnit: IntervalUnit; nextDueDate: string | null; active: boolean }[];
  workOrders: { id: number; number: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; priority: Priority; dueDate: string | null; performedOn: string | null }[];
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
