import {
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { ASSET_STATUSES, INTERVAL_UNITS, PRIORITIES, ROLES, WORK_ORDER_KINDS, WORK_ORDER_STATUSES } from "../shared";

// Key/value table for app-level metadata
export const appMeta = mysqlTable("app_meta", {
  key: varchar("meta_key", { length: 64 }).primaryKey(),
  value: varchar("meta_value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// Owner organisation tree: university > faculty/office > department
export const organizationUnits = mysqlTable(
  "organization_units",
  {
    id: int("id").autoincrement().primaryKey(),
    parentId: int("parent_id"),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    archivedAt: datetime("archived_at", { mode: "date" }), // datetime, not timestamp: nullable timestamps behave differently on MariaDB 10.4 vs 10.11
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_org_code").on(t.code), index("ix_org_parent").on(t.parentId)],
);

// Physical place tree: campus > building > floor > room (separate from the owner unit)
export const locations = mysqlTable(
  "locations",
  {
    id: int("id").autoincrement().primaryKey(),
    parentId: int("parent_id"),
    kind: varchar("kind", { length: 16 }).notNull(), // campus | building | floor | room
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    archivedAt: datetime("archived_at", { mode: "date" }), // datetime, not timestamp: nullable timestamps behave differently on MariaDB 10.4 vs 10.11
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_loc_code").on(t.code), index("ix_loc_parent").on(t.parentId)],
);

export const assetTypes = mysqlTable(
  "asset_types",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    archivedAt: datetime("archived_at", { mode: "date" }), // datetime, not timestamp: nullable timestamps behave differently on MariaDB 10.4 vs 10.11
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_asset_type_code").on(t.code)],
);

// One row = one physical piece of equipment
export const assets = mysqlTable(
  "assets",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 40 }).notNull(), // system-wide unique asset code
    legacyAssetNo: varchar("legacy_asset_no", { length: 60 }), // old inventory number, optional
    name: varchar("name", { length: 191 }).notNull(),
    typeId: int("type_id").notNull(),
    brand: varchar("brand", { length: 120 }),
    model: varchar("model", { length: 120 }),
    serialNumber: varchar("serial_number", { length: 120 }), // not unique: makers may reuse or omit it
    ownerUnitId: int("owner_unit_id").notNull(),
    locationId: int("location_id"),
    locationDetail: varchar("location_detail", { length: 255 }),
    status: mysqlEnum("status", ASSET_STATUSES).notNull().default("active"),
    purchaseDate: date("purchase_date", { mode: "string" }),
    installDate: date("install_date", { mode: "string" }),
    price: decimal("price", { precision: 12, scale: 2 }),
    vendor: varchar("vendor", { length: 191 }),
    warrantyEnd: date("warranty_end", { mode: "string" }),
    // type-specific values (validated by the API against the type's field definitions)
    attributes: text("attributes"),
    notes: text("notes"),
    // Random, unguessable id printed in the asset's QR code (/q/<token>). Filled in by the app (server/qr.ts), never reused.
    qrToken: varchar("qr_token", { length: 32 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_asset_code").on(t.code),
    uniqueIndex("uq_asset_qr_token").on(t.qrToken),
    index("ix_asset_owner_type_status").on(t.ownerUnitId, t.typeId, t.status),
    index("ix_asset_type").on(t.typeId),
    index("ix_asset_location").on(t.locationId),
  ],
);

// Recurring maintenance plan of one asset (an asset can have several)
export const maintenancePlans = mysqlTable(
  "maintenance_plans",
  {
    id: int("id").autoincrement().primaryKey(),
    assetId: int("asset_id").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    intervalValue: int("interval_value").notNull(),
    intervalUnit: mysqlEnum("interval_unit", INTERVAL_UNITS).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    nextDueDate: date("next_due_date", { mode: "string" }),
    active: int("active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_plan_asset").on(t.assetId), index("ix_plan_due").on(t.active, t.nextDueDate)],
);

// A job to do (planned / repair / inspection). Result and cost live on the same row in this first slice.
export const workOrders = mysqlTable(
  "work_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    number: varchar("number", { length: 32 }).notNull(),
    assetId: int("asset_id").notNull(),
    planId: int("plan_id"),
    kind: mysqlEnum("kind", WORK_ORDER_KINDS).notNull(),
    status: mysqlEnum("status", WORK_ORDER_STATUSES).notNull().default("in_progress"),
    priority: mysqlEnum("priority", PRIORITIES).notNull().default("normal"),
    title: varchar("title", { length: 191 }).notNull(),
    description: text("description"),
    dueDate: date("due_date", { mode: "string" }),
    performedOn: date("performed_on", { mode: "string" }), // actual work date (may be back-dated)
    completedAt: datetime("completed_at", { mode: "date" }), // UTC
    // NULL = unknown, which is different from 0 = no cost
    laborCost: decimal("labor_cost", { precision: 12, scale: 2 }),
    partsCost: decimal("parts_cost", { precision: 12, scale: 2 }),
    otherCost: decimal("other_cost", { precision: 12, scale: 2 }),
    createdBy: int("created_by"), // the user who recorded it
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_wo_number").on(t.number),
    index("ix_wo_asset").on(t.assetId, t.performedOn),
    index("ix_wo_status_due").on(t.status, t.dueDate),
    index("ix_wo_completed").on(t.completedAt),
  ],
);

// Photos of an asset. The files live on disk (see UPLOAD_DIR); this table keeps what is needed to find and show them.
export const assetImages = mysqlTable(
  "asset_images",
  {
    id: int("id").autoincrement().primaryKey(),
    assetId: int("asset_id").notNull(),
    fileName: varchar("file_name", { length: 64 }).notNull(), // random name chosen by the server (never the uploaded name)
    thumbName: varchar("thumb_name", { length: 64 }).notNull(),
    contentType: varchar("content_type", { length: 32 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    width: int("width").notNull(), // as reported by the browser; only a layout hint
    height: int("height").notNull(),
    createdBy: int("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_asset_image_asset").on(t.assetId, t.id)],
);

// People who can sign in. A user has a local username/password, a CMU account (@cmu.ac.th), or both.
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    username: varchar("username", { length: 64 }), // NULL for CMU-only users (unique allows many NULLs)
    passwordHash: varchar("password_hash", { length: 255 }), // NULL = cannot sign in with a password
    cmuEmail: varchar("cmu_email", { length: 191 }), // lower-case, @cmu.ac.th
    displayName: varchar("display_name", { length: 191 }).notNull(),
    role: mysqlEnum("role", ROLES).notNull().default("viewer"),
    unitId: int("unit_id"), // the unit (and its sub-units) this user may see; NULL = none (except super_admin)
    active: int("active").notNull().default(1),
    lastLoginAt: datetime("last_login_at", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_username").on(t.username), uniqueIndex("uq_user_cmu_email").on(t.cmuEmail), index("ix_user_unit").on(t.unitId)],
);

// Server-side sessions. `id` is the SHA-256 of the cookie token, so a leaked table cannot be replayed.
export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull(),
    method: varchar("method", { length: 8 }).notNull().default("local"), // how it was signed in: local | cmu
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(), // UTC
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ix_session_user").on(t.userId), index("ix_session_expires").on(t.expiresAt)],
);
