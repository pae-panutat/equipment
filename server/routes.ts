import crypto from "node:crypto";
import { Router, type Response } from "express";
import { eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ASSET_EDIT_ROLES,
  ASSET_STATUSES,
  DUE_SOON_DAYS,
  type LocationOption,
  type AssetDetail,
  type AuthUser,
  type AssetListItem,
  type AssetStatus,
  type DashboardSummary,
  type FilterOptions,
  type IntervalUnit,
  type Priority,
  type Paged,
  type WorkOrderKind,
  type WorkOrderStatus,
} from "../shared";
import { assets } from "../db/schema";
import { requireRole } from "./auth/guard";
import { db } from "./db";
import { addDays, addMonths, bangkokToday } from "./dates";
import { allowedUnitIds, assetScope, rangeQuery, rows, scopeQuery } from "./query";
import { qrSvg, scanUrl } from "./qr";

export const dataRouter = Router();

// Content version of an asset's editable fields. The edit dialog sends back the version it loaded; the save is refused
// if the fields have changed since (someone else saved first). Based on content, not on a timestamp, so two saves
// in the same second cannot slip through.
const VERSION_KEYS = [
  "name", "type_id", "owner_unit_id", "location_id", "status", "brand", "model", "serial_number", "legacy_asset_no",
  "location_detail", "notes", "purchase_date", "install_date", "warranty_end",
] as const;
const VERSION_COLUMNS = sql.raw(VERSION_KEYS.map((k) => `a.${k}`).join(", "));
const versionOf = (row: object) =>
  crypto.createHash("sha1").update(JSON.stringify(VERSION_KEYS.map((k) => (row as Record<string, unknown>)[k] ?? null))).digest("hex");

/** "campus › building › floor › room" for a location id. */
async function locationPath(): Promise<(id: number | null) => string | null> {
  const locs = await rows<{ id: number; parent_id: number | null; name: string }>(sql`SELECT id, parent_id, name FROM locations`);
  const byId = new Map(locs.map((l) => [l.id, l]));
  return (id) => {
    const names: string[] = [];
    for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) names.unshift(cur.name);
    return names.length ? names.join(" › ") : null;
  };
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown, res: Response): z.infer<T> | null {
  const r = schema.safeParse(input);
  if (!r.success) {
    res.status(400).json({ error: { code: "validation_error", message: "พารามิเตอร์ไม่ถูกต้อง", details: z.flattenError(r.error).fieldErrors } });
    return null;
  }
  return r.data;
}

dataRouter.get("/meta/filters", async (req, res) => {
  const all = await rows<{ id: number; name: string; parent_id: number | null }>(
    sql`SELECT id, name, parent_id FROM organization_units WHERE archived_at IS NULL ORDER BY name`,
  );
  const allowed = await allowedUnitIds(req.user!);
  const units = allowed ? all.filter((u) => allowed.includes(u.id)) : all;
  const types = await rows<{ id: number; name: string }>(sql`SELECT id, name FROM asset_types WHERE archived_at IS NULL ORDER BY name`);
  const body: FilterOptions = { units: units.map((u) => ({ id: u.id, name: u.name, parentId: u.parent_id !== null && units.some((p) => p.id === u.parent_id) ? u.parent_id : null })), types };
  res.json(body);
});

dataRouter.get("/dashboard/summary", async (req, res) => {
  const scope = parse(scopeQuery, req.query, res);
  const range = parse(rangeQuery, req.query, res);
  if (!scope || !range) return;

  const today = bangkokToday();
  const to = range.to ?? today;
  const from = range.from ?? addMonths(to, -11).slice(0, 8) + "01"; // first day of the month, 11 months back
  const where = await assetScope(scope, req.user!);
  const soonLimit = addDays(today, DUE_SOON_DAYS);

  const [totals] = await rows<{ total: number; ac: number | null }>(
    sql`SELECT COUNT(*) AS total, SUM(t.code = 'AC') AS ac FROM assets a JOIN asset_types t ON t.id = a.type_id WHERE ${where}`,
  );
  const [acType] = await rows<{ id: number }>(sql`SELECT id FROM asset_types WHERE code = 'AC' LIMIT 1`);
  const byType = await rows<{ id: number; name: string; count: number }>(
    sql`SELECT t.id, t.name, COUNT(*) AS count FROM assets a JOIN asset_types t ON t.id = a.type_id WHERE ${where} GROUP BY t.id, t.name ORDER BY count DESC`,
  );
  const byStatus = await rows<{ status: AssetStatus; count: number }>(
    sql`SELECT a.status AS status, COUNT(*) AS count FROM assets a WHERE ${where} GROUP BY a.status ORDER BY count DESC`,
  );
  const [maint] = await rows<{ overdue: number; due_soon: number; no_plan: number }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN p.next_due_date < ${today} THEN a.id END) AS overdue,
      COUNT(DISTINCT CASE WHEN p.next_due_date >= ${today} AND p.next_due_date <= ${soonLimit} THEN a.id END) AS due_soon,
      (SELECT COUNT(*) FROM assets a2 WHERE a2.status <> 'disposed' AND NOT EXISTS
        (SELECT 1 FROM maintenance_plans p2 WHERE p2.asset_id = a2.id AND p2.active = 1)
        AND a2.id IN (SELECT a.id FROM assets a WHERE ${where})) AS no_plan
    FROM assets a JOIN maintenance_plans p ON p.asset_id = a.id AND p.active = 1
    WHERE a.status <> 'disposed' AND ${where}`);
  const [cost] = await rows<{ total: string | null; with_cost: number; unknown: number }>(sql`
    SELECT
      SUM(COALESCE(w.labor_cost,0) + COALESCE(w.parts_cost,0) + COALESCE(w.other_cost,0)) AS total,
      SUM(w.labor_cost IS NOT NULL OR w.parts_cost IS NOT NULL OR w.other_cost IS NOT NULL) AS with_cost,
      SUM(w.labor_cost IS NULL AND w.parts_cost IS NULL AND w.other_cost IS NULL) AS unknown
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE w.status = 'done' AND w.performed_on BETWEEN ${from} AND ${to} AND ${where}`);
  const monthly = await rows<{ month: string; count: number }>(sql`
    SELECT DATE_FORMAT(w.performed_on, '%Y-%m') AS month, COUNT(*) AS count
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE w.status = 'done' AND w.performed_on BETWEEN ${from} AND ${to} AND ${where}
    GROUP BY month`);
  const upcoming = await rows<{ asset_id: number; code: string; name: string; title: string; due: string }>(sql`
    SELECT a.id AS asset_id, a.code, a.name, p.title, p.next_due_date AS due
    FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id
    WHERE p.active = 1 AND a.status <> 'disposed' AND p.next_due_date <= ${soonLimit} AND ${where}
    ORDER BY p.next_due_date ASC LIMIT 8`);
  const recent = await rows<{ id: number; number: string; code: string; name: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; at: string }>(sql`
    SELECT w.id, w.number, a.code, a.name, w.title, w.kind, w.status,
           DATE_FORMAT(COALESCE(w.completed_at, w.created_at), '%Y-%m-%dT%H:%i:%sZ') AS at
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE ${where} ORDER BY COALESCE(w.completed_at, w.created_at) DESC, w.id DESC LIMIT 8`);

  // every month in the range, including months with no completed jobs
  const counts = new Map(monthly.map((m) => [m.month, Number(m.count)]));
  const completedByMonth: DashboardSummary["completedByMonth"] = [];
  for (let m = from.slice(0, 7) + "-01"; m.slice(0, 7) <= to.slice(0, 7); m = addMonths(m, 1)) {
    completedByMonth.push({ month: m.slice(0, 7), count: counts.get(m.slice(0, 7)) ?? 0 });
  }

  const body: DashboardSummary = {
    asOf: today,
    filters: { unitId: scope.unitId ?? null, typeId: scope.typeId ?? null, status: scope.status ?? null, from, to },
    totals: { assets: Number(totals.total), airConditioners: Number(totals.ac ?? 0), airConditionerTypeId: acType?.id ?? null },
    byType: byType.map((t) => ({ ...t, count: Number(t.count) })),
    byStatus: byStatus.map((s) => ({ ...s, count: Number(s.count) })),
    maintenance: { overdue: Number(maint?.overdue ?? 0), dueSoon: Number(maint?.due_soon ?? 0), noPlan: Number(maint?.no_plan ?? 0) },
    cost: { total: Number(cost?.total ?? 0), ordersWithCost: Number(cost?.with_cost ?? 0), ordersWithUnknownCost: Number(cost?.unknown ?? 0) },
    completedByMonth,
    upcoming: upcoming.map((u) => ({ assetId: u.asset_id, assetCode: u.code, assetName: u.name, title: u.title, dueDate: u.due, overdue: u.due < today })),
    recent: recent.map((r) => ({ id: r.id, number: r.number, assetCode: r.code, assetName: r.name, title: r.title, kind: r.kind, status: r.status, at: r.at })),
  };
  res.json(body);
});

const listQuery = scopeQuery.extend({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["code", "name", "status", "nextDue"]).default("code"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

const SORT_SQL = { code: sql`a.code`, name: sql`a.name`, status: sql`a.status`, nextDue: sql`next_due IS NULL, next_due` } as const;

dataRouter.get("/assets", async (req, res) => {
  const q = parse(listQuery, req.query, res);
  if (!q) return;
  const scopeWhere = await assetScope(q, req.user!);
  const search = q.q ? sql` AND (a.code LIKE ${`%${q.q}%`} OR a.name LIKE ${`%${q.q}%`} OR a.brand LIKE ${`%${q.q}%`} OR a.model LIKE ${`%${q.q}%`})` : sql``;
  const order = q.dir === "desc" ? sql`DESC` : sql`ASC`;

  const [{ total }] = await rows<{ total: number }>(sql`SELECT COUNT(*) AS total FROM assets a WHERE ${scopeWhere}${search}`);
  const list = await rows<{
    id: number; code: string; name: string; type: string; brand: string | null; model: string | null; status: AssetStatus;
    unit: string; location_id: number | null; last_maintenance: string | null; next_due: string | null;
  }>(sql`
    SELECT a.id, a.code, a.name, t.name AS type, a.brand, a.model, a.status, u.name AS unit, a.location_id,
      (SELECT MAX(w.performed_on) FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'done') AS last_maintenance,
      (SELECT MIN(p.next_due_date) FROM maintenance_plans p WHERE p.asset_id = a.id AND p.active = 1) AS next_due
    FROM assets a
    JOIN asset_types t ON t.id = a.type_id
    JOIN organization_units u ON u.id = a.owner_unit_id
    WHERE ${scopeWhere}${search}
    ORDER BY ${SORT_SQL[q.sort]} ${order}, a.id ASC
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);

  const path = await locationPath();

  const items: AssetListItem[] = list.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, brand: r.brand, model: r.model, status: r.status, unit: r.unit,
    location: path(r.location_id), lastMaintenance: r.last_maintenance, nextDue: r.next_due,
  }));
  const body: Paged<AssetListItem> = { items, page: q.page, pageSize: q.pageSize, total: Number(total) };
  res.json(body);
});

// ---- one asset: detail page, QR image, and QR scan ----

type AssetRow = { id: number; owner_unit_id: number };

/** Finds one asset and checks the signed-in user may see it. 404 = no such asset, 403 = exists but outside the user's scope. */
async function authorizedAsset(res: Response, user: AuthUser, where: SQL): Promise<AssetRow | null> {
  const [asset] = await rows<AssetRow>(sql`SELECT a.id, a.owner_unit_id FROM assets a WHERE ${where} LIMIT 1`);
  if (!asset) {
    res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
    return null;
  }
  const allowed = await allowedUnitIds(user);
  if (allowed && !allowed.includes(asset.owner_unit_id)) {
    res.status(403).json({ error: { code: "forbidden", message: "อุปกรณ์นี้อยู่นอกส่วนงานของคุณ จึงไม่สามารถดูข้อมูลได้" } });
    return null;
  }
  return asset;
}

const idParam = z.coerce.number().int().positive();

dataRouter.get("/assets/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
  if (!(await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`))) return;

  const [a] = await rows<{
    id: number; code: string; legacy_asset_no: string | null; name: string; type: string; brand: string | null; model: string | null;
    serial_number: string | null; status: AssetStatus; unit: string; location_id: number | null; location_detail: string | null;
    purchase_date: string | null; install_date: string | null; warranty_end: string | null; notes: string | null;
    type_id: number; owner_unit_id: number;
  }>(sql`
    SELECT a.id, a.code, a.legacy_asset_no, a.name, t.name AS type, a.brand, a.model, a.serial_number, a.status, u.name AS unit,
           a.location_id, a.location_detail, a.purchase_date, a.install_date, a.warranty_end, a.notes,
           a.type_id, a.owner_unit_id
    FROM assets a JOIN asset_types t ON t.id = a.type_id JOIN organization_units u ON u.id = a.owner_unit_id
    WHERE a.id = ${id.data}`);
  const plans = await rows<{ id: number; title: string; interval_value: number; interval_unit: IntervalUnit; next_due_date: string | null; active: number }>(
    sql`SELECT id, title, interval_value, interval_unit, next_due_date, active FROM maintenance_plans WHERE asset_id = ${id.data} ORDER BY active DESC, next_due_date IS NULL, next_due_date`,
  );
  const orders = await rows<{
    id: number; number: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; priority: Priority; due_date: string | null; performed_on: string | null;
  }>(sql`
    SELECT id, number, title, kind, status, priority, due_date, performed_on FROM work_orders
    WHERE asset_id = ${id.data} ORDER BY COALESCE(performed_on, due_date, DATE(created_at)) DESC, id DESC LIMIT 10`);

  const path = await locationPath();
  const body: AssetDetail = {
    id: a.id, typeId: a.type_id, ownerUnitId: a.owner_unit_id, locationId: a.location_id, version: versionOf(a), code: a.code, legacyAssetNo: a.legacy_asset_no, name: a.name, type: a.type, brand: a.brand, model: a.model,
    serialNumber: a.serial_number, status: a.status, unit: a.unit, location: path(a.location_id), locationDetail: a.location_detail,
    purchaseDate: a.purchase_date, installDate: a.install_date, warrantyEnd: a.warranty_end, notes: a.notes,
    plans: plans.map((p) => ({ id: p.id, title: p.title, intervalValue: p.interval_value, intervalUnit: p.interval_unit, nextDueDate: p.next_due_date, active: p.active === 1 })),
    workOrders: orders.map((o) => ({
      id: o.id, number: o.number, title: o.title, kind: o.kind, status: o.status, priority: o.priority, dueDate: o.due_date, performedOn: o.performed_on,
    })),
  };
  res.json(body);
});

// The QR image itself. It encodes /q/<token>, so scanning always goes through the login and scope checks above.
dataRouter.get("/assets/:id/qr.svg", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
  if (!(await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`))) return;
  const [row] = await rows<{ qr_token: string | null }>(sql`SELECT qr_token FROM assets WHERE id = ${id.data}`);
  if (!row?.qr_token) return void res.status(409).json({ error: { code: "no_qr", message: "อุปกรณ์นี้ยังไม่มี QR Code (รีสตาร์ทระบบเพื่อสร้าง)" } });
  res.type("image/svg+xml").send(await qrSvg(scanUrl(req, row.qr_token)));
});

// What the app calls when a QR is scanned: token -> asset id (only if the signed-in user may see that asset).
dataRouter.get("/q/:token", async (req, res) => {
  const token = String(req.params.token);
  if (!/^[a-f0-9]{32}$/.test(token)) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์จาก QR Code นี้" } });
  const asset = await authorizedAsset(res, req.user!, sql`a.qr_token = ${token}`);
  if (asset) res.json({ assetId: asset.id });
});

// ---- editing an asset ----

dataRouter.get("/meta/locations", async (_req, res) => {
  const locs = await rows<{ id: number; parent_id: number | null; name: string }>(sql`SELECT id, parent_id, name FROM locations WHERE archived_at IS NULL`);
  const path = await locationPath();
  const body: LocationOption[] = locs
    .map((l) => ({ id: l.id, label: path(l.id) ?? l.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));
  res.json(body);
});

const validDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const optText = (max: number) =>
  z.string().trim().max(max, `ยาวเกิน ${max} ตัวอักษร`).transform((v) => (v === "" ? null : v)).nullable();
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").refine(validDate, "วันที่ไม่ถูกต้อง").nullable();
const refId = z.number().int().positive();

// Every editable field, all optional (send only what changed). `code` and the QR token are deliberately not editable:
// .strict() rejects them. `expectedUpdatedAt` is the version the user was looking at.
const assetPatch = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่ออุปกรณ์").max(191, "ชื่อยาวเกิน 191 ตัวอักษร"),
    typeId: refId,
    ownerUnitId: refId,
    locationId: refId.nullable(),
    status: z.enum(ASSET_STATUSES),
    brand: optText(120),
    model: optText(120),
    serialNumber: optText(120),
    legacyAssetNo: optText(60),
    locationDetail: optText(255),
    notes: optText(5000),
    purchaseDate: optDate,
    installDate: optDate,
    warrantyEnd: optDate,
  })
  .partial()
  .extend({ expectedVersion: z.string().min(1) })
  .strict();

dataRouter.patch("/assets/:id", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
  const user = req.user!;
  const parsed = assetPatch.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: { code: "validation_error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" } });
  }
  const { expectedVersion, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return void res.status(400).json({ error: { code: "validation_error", message: "ไม่มีข้อมูลที่เปลี่ยนแปลง" } });

  const asset = await authorizedAsset(res, user, sql`a.id = ${id.data}`);
  if (!asset) return;

  const exists = async (table: "asset_types" | "organization_units" | "locations", value: number) =>
    (await rows<{ id: number }>(sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${value} AND archived_at IS NULL`)).length > 0;
  if (changes.typeId !== undefined && !(await exists("asset_types", changes.typeId))) {
    return void res.status(400).json({ error: { code: "validation_error", message: "ไม่พบประเภทอุปกรณ์ที่เลือก" } });
  }
  if (changes.locationId != null && !(await exists("locations", changes.locationId))) {
    return void res.status(400).json({ error: { code: "validation_error", message: "ไม่พบสถานที่ที่เลือก" } });
  }
  if (changes.ownerUnitId !== undefined) {
    if (!(await exists("organization_units", changes.ownerUnitId))) {
      return void res.status(400).json({ error: { code: "validation_error", message: "ไม่พบส่วนงานที่เลือก" } });
    }
    // an asset can only be moved to a unit the editor is allowed to see
    const allowed = await allowedUnitIds(user);
    if (allowed && !allowed.includes(changes.ownerUnitId)) {
      return void res.status(403).json({ error: { code: "forbidden", message: "ไม่มีสิทธิ์ย้ายอุปกรณ์ไปยังส่วนงานนี้" } });
    }
  }

  // Optimistic lock: refuse if the editable fields changed after the editor opened the record.
  const set: Partial<typeof assets.$inferInsert> = { ...changes };
  const result = await db.transaction(async (tx) => {
    // must run on the transaction's own connection (tx), otherwise FOR UPDATE would not hold the row lock
    const [locked] = (await tx.execute(sql`SELECT ${VERSION_COLUMNS} FROM assets a WHERE a.id = ${asset.id} FOR UPDATE`)) as unknown as [object[]];
    if (!locked[0] || versionOf(locked[0]) !== expectedVersion) return "stale" as const;
    await tx.update(assets).set(set).where(eq(assets.id, asset.id));
    return "ok" as const;
  });
  if (result === "stale") {
    return void res.status(409).json({ error: { code: "conflict", message: "ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาปิดหน้าต่างแล้วเปิดใหม่เพื่อดูข้อมูลล่าสุด" } });
  }
  res.json({ ok: true });
});
