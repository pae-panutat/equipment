import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ASSET_EDIT_ROLES,
  assetStatusProblem,
  ASSET_STATUSES,
  DUE_SOON_DAYS,
  type LocationOption,
  type AssetDetail,
  type AssetListItem,
  type AssetStatus,
  type DashboardSummary,
  type FilterOptions,
  type IntervalUnit,
  type Priority,
  type Paged,
  type TodayNotifications,
  type WorkOrderKind,
  type WorkOrderStatus,
} from "../shared";
import { assets } from "../db/schema";
import { requireRole } from "./auth/guard";
import { db } from "./db";
import { addDays, addMonths, bangkokToday } from "./dates";
import { allLocations, allowedUnitIds, assetScope, rangeQuery, rows, scopeQuery } from "./query";
import { authorizedAsset, contentVersion } from "./asset-access";
import { newQrToken, qrSvg, scanUrl } from "./qr";
import { assetImagesRouter, relocateAssetImages } from "./asset-images";
import { plansRouter } from "./plans";
import { historyRouter } from "./history";
import { calendarRouter } from "./calendar";
import { reportsRouter } from "./reports";
import { assetImportRouter } from "./asset-import";
import { audit, diff } from "./audit";
import { assetHealth, twelveMonthsAgo } from "./health";
import { WORK_ORDER_VERSION_KEYS, workOrdersRouter } from "./work-orders";

export const dataRouter = Router();
const workOrderVersion = (row: object) => contentVersion(row, WORK_ORDER_VERSION_KEYS);

// Content version of an asset's editable fields. The edit dialog sends back the version it loaded; the save is refused
// if the fields have changed since (someone else saved first). Based on content, not on a timestamp, so two saves
// in the same second cannot slip through.
const VERSION_KEYS = [
  "name", "type_id", "owner_unit_id", "location_id", "status", "brand", "model", "serial_number", "legacy_asset_no",
  "location_detail", "notes", "purchase_date", "install_date", "warranty_end",
] as const;
const VERSION_COLUMNS = sql.raw(VERSION_KEYS.map((k) => `a.${k}`).join(", "));
const versionOf = (row: object) => contentVersion(row, VERSION_KEYS);

/** "campus › building › floor › room" for a location id. */
async function locationPath(): Promise<(id: number | null) => string | null> {
  const locs = await allLocations();
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

// A short token that changes whenever an asset or a job the user may see is added or changed. The browser polls it and
// reloads quietly when it changes (live updates). Cached for a few seconds per scope so many open tabs cost one query.
const pulseCache = new Map<string, { at: number; token: Promise<string> }>();
dataRouter.get("/pulse", async (req, res) => {
  const user = req.user!;
  const scopeKey = user.seesAllUnits ? "all" : `unit:${user.unitId ?? "none"}`;
  let hit = pulseCache.get(scopeKey);
  if (!hit || Date.now() - hit.at > 3000) {
    const where = await assetScope({}, user);
    const token = (async () => {
      const [a] = await rows<{ n: number; id: number; t: number }>(
        sql`SELECT COUNT(*) AS n, COALESCE(MAX(a.id), 0) AS id, COALESCE(UNIX_TIMESTAMP(MAX(a.updated_at)), 0) AS t FROM assets a WHERE ${where}`,
      );
      const [w] = await rows<{ n: number; id: number; t: number; done: number }>(sql`
        SELECT COUNT(*) AS n, COALESCE(MAX(w.id), 0) AS id, COALESCE(UNIX_TIMESTAMP(MAX(COALESCE(w.completed_at, w.created_at))), 0) AS t,
               COALESCE(SUM(w.status = 'done'), 0) AS done
        FROM work_orders w JOIN assets a ON a.id = w.asset_id WHERE ${where}`);
      // plans too (a new plan, a changed due date or an on/off switch moves the bell), plus today's date so the bell
      // updates by itself when the day changes at midnight
      const [p] = await rows<{ n: number; h: string }>(sql`
        SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT(p.id, '|', p.next_due_date, '|', p.active))), 0) AS h
        FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id WHERE ${where}`);
      return `${a.n}.${a.id}.${a.t}|${w.n}.${w.id}.${w.t}.${w.done}|${p.n}.${p.h}|${bangkokToday()}`;
    })();
    hit = { at: Date.now(), token };
    pulseCache.set(scopeKey, hit);
    token.catch(() => pulseCache.delete(scopeKey)); // never keep a failed query
  }
  res.json({ token: await hit.token });
});

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

// The bell in the top bar: plans due today in the units this user may see (same scope rule as the dashboard).
dataRouter.get("/notifications/today", async (req, res) => {
  const today = bangkokToday();
  const where = await assetScope({}, req.user!);
  const list = await rows<{ plan_id: number; asset_id: number; code: string; name: string; unit: string; title: string; due: string; in_progress: number }>(sql`
    SELECT p.id AS plan_id, a.id AS asset_id, a.code, a.name, ou.name AS unit, p.title, p.next_due_date AS due,
           EXISTS(SELECT 1 FROM work_orders w WHERE w.plan_id = p.id AND w.status = 'in_progress') AS in_progress
    FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id JOIN organization_units ou ON ou.id = a.owner_unit_id
    WHERE p.active = 1 AND a.status <> 'disposed' AND p.next_due_date <= ${today} AND ${where}
    ORDER BY in_progress ASC, p.next_due_date ASC, a.code ASC`);
  const body: TodayNotifications = {
    asOf: today,
    items: list.map((u) => ({ planId: u.plan_id, assetId: u.asset_id, assetCode: u.code, assetName: u.name, unitName: u.unit, title: u.title, dueDate: u.due, overdue: u.due < today, inProgress: Number(u.in_progress) === 1 })),
  };
  res.json(body);
});

const MAX_RANGE_MONTHS = 36; // the monthly chart has one point per month, so an unbounded range would be unbounded work

dataRouter.get("/dashboard/summary", async (req, res) => {
  const scope = parse(scopeQuery, req.query, res);
  const range = parse(rangeQuery, req.query, res);
  if (!scope || !range) return;

  const today = bangkokToday();
  const to = range.to ?? today;
  const from = range.from ?? addMonths(to, -11).slice(0, 8) + "01"; // first day of the month, 11 months back
  const spanMonths = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  if (from > to || spanMonths > MAX_RANGE_MONTHS) {
    return void res.status(400).json({ error: { code: "validation_error", message: `ช่วงวันที่ไม่ถูกต้อง (ต้องไม่เกิน ${MAX_RANGE_MONTHS} เดือน)` } });
  }
  const where = await assetScope(scope, req.user!);
  const soonLimit = addDays(today, DUE_SOON_DAYS);

  const q_totals = rows<{ total: number; ac: number | null }>(
    sql`SELECT COUNT(*) AS total, SUM(t.code = 'AC') AS ac FROM assets a JOIN asset_types t ON t.id = a.type_id WHERE ${where}`,
  );
  const q_acType = rows<{ id: number }>(sql`SELECT id FROM asset_types WHERE code = 'AC' LIMIT 1`);
  const q_byType = rows<{ id: number; name: string; count: number }>(
    sql`SELECT t.id, t.name, COUNT(*) AS count FROM assets a JOIN asset_types t ON t.id = a.type_id WHERE ${where} GROUP BY t.id, t.name ORDER BY count DESC`,
  );
  const q_byStatus = rows<{ status: AssetStatus; count: number }>(
    sql`SELECT a.status AS status, COUNT(*) AS count FROM assets a WHERE ${where} GROUP BY a.status ORDER BY count DESC`,
  );
  const q_maint = rows<{ overdue: number; due_soon: number }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN p.next_due_date < ${today} THEN a.id END) AS overdue,
      COUNT(DISTINCT CASE WHEN p.next_due_date >= ${today} AND p.next_due_date <= ${soonLimit} THEN a.id END) AS due_soon
    FROM assets a JOIN maintenance_plans p ON p.asset_id = a.id AND p.active = 1
    WHERE a.status <> 'disposed' AND ${where}`);
  const q_noPlan = rows<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM assets a
    WHERE a.status <> 'disposed' AND ${where}
      AND NOT EXISTS (SELECT 1 FROM maintenance_plans p WHERE p.asset_id = a.id AND p.active = 1)`);
  const q_monthly = rows<{ month: string; count: number }>(sql`
    SELECT DATE_FORMAT(w.performed_on, '%Y-%m') AS month, COUNT(*) AS count
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE w.status = 'done' AND w.performed_on BETWEEN ${from} AND ${to} AND ${where}
    GROUP BY month`);
  const q_upcoming = rows<{ plan_id: number; asset_id: number; code: string; name: string; unit: string; title: string; due: string; in_progress: number }>(sql`
    SELECT p.id AS plan_id, a.id AS asset_id, a.code, a.name, ou.name AS unit, p.title, p.next_due_date AS due,
           EXISTS(SELECT 1 FROM work_orders w WHERE w.plan_id = p.id AND w.status = 'in_progress') AS in_progress
    FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id JOIN organization_units ou ON ou.id = a.owner_unit_id
    WHERE p.active = 1 AND a.status <> 'disposed' AND p.next_due_date <= ${soonLimit} AND ${where}
    ORDER BY (p.next_due_date = ${today} AND NOT EXISTS(SELECT 1 FROM work_orders w WHERE w.plan_id = p.id AND w.status = 'in_progress')) DESC, p.next_due_date ASC LIMIT 8`); // what is due today and nobody has started always makes the list, ahead of older overdue plans
  const q_recent = rows<{ id: number; number: string; asset_id: number; code: string; name: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; at: string }>(sql`
    SELECT w.id, w.number, a.id AS asset_id, a.code, a.name, w.title, w.kind, w.status,
           DATE_FORMAT(COALESCE(w.completed_at, CONVERT_TZ(w.created_at, @@session.time_zone, '+00:00')), '%Y-%m-%dT%H:%i:%sZ') AS at
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE ${where} ORDER BY COALESCE(w.completed_at, w.created_at) DESC, w.id DESC LIMIT 8`);

  // independent queries: send them together instead of one after another
  const all = await Promise.all([q_totals, q_acType, q_byType, q_byStatus, q_maint, q_noPlan, q_monthly, q_upcoming, q_recent]);
  const [[totals], [acType], byType, byStatus, [maint], [noPlan], monthly, upcoming, recent] = all;
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
    maintenance: { overdue: Number(maint?.overdue ?? 0), dueSoon: Number(maint?.due_soon ?? 0), noPlan: Number(noPlan?.n ?? 0) },
    completedByMonth,
    upcoming: upcoming.map((u) => ({ planId: u.plan_id, assetId: u.asset_id, assetCode: u.code, assetName: u.name, unitName: u.unit, title: u.title, dueDate: u.due, overdue: u.due < today, inProgress: Number(u.in_progress) === 1 })),
    recent: recent.map((r) => ({ id: r.id, number: r.number, assetId: r.asset_id, assetCode: r.code, assetName: r.name, title: r.title, kind: r.kind, status: r.status, at: r.at })),
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
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => "\\" + c)}%` : ""; // % and _ typed by the user are text, not wildcards
  const search = q.q ? sql` AND (a.code LIKE ${like} OR a.name LIKE ${like} OR a.brand LIKE ${like} OR a.model LIKE ${like})` : sql``;
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
    id: number; number: string; title: string; kind: WorkOrderKind; status: WorkOrderStatus; priority: Priority; description: string | null;
    plan_id: number | null; due_date: string | null; performed_on: string | null;
    recorded_by: string | null;
  }>(sql`
    SELECT w.id, w.number, w.title, w.kind, w.status, w.priority, w.description, w.plan_id, w.due_date, w.performed_on,
           u.display_name AS recorded_by
    FROM work_orders w LEFT JOIN users u ON u.id = w.created_by
    WHERE w.asset_id = ${id.data}
      AND (w.status = 'in_progress'
           OR w.id IN (SELECT t.id FROM (SELECT id FROM work_orders WHERE asset_id = ${id.data} ORDER BY COALESCE(performed_on, due_date, DATE(created_at)) DESC, id DESC LIMIT 10) t))
    ORDER BY (w.status = 'in_progress') DESC, COALESCE(w.performed_on, w.due_date, DATE(w.created_at)) DESC, w.id DESC`);
  const [counts] = await rows<{ in_progress: string | null }>(
    sql`SELECT SUM(status = 'in_progress') AS in_progress FROM work_orders WHERE asset_id = ${id.data}`,
  );
  const images = await rows<{ id: number; width: number; height: number }>(
    sql`SELECT id, width, height FROM asset_images WHERE asset_id = ${id.data} ORDER BY id`,
  );

  const [repairs] = await rows<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM work_orders WHERE asset_id = ${id.data} AND kind = 'repair' AND status = 'done' AND performed_on >= ${twelveMonthsAgo(bangkokToday())}`,
  );
  const health = assetHealth({
    today: bangkokToday(), status: a.status, installDate: a.install_date, purchaseDate: a.purchase_date, warrantyEnd: a.warranty_end,
    repairsLast12Months: Number(repairs?.n ?? 0), hasOverduePlan: plans.some((p) => p.active === 1 && p.next_due_date !== null && p.next_due_date < bangkokToday()),
  });

  const path = await locationPath();
  const body: AssetDetail = {
    id: a.id, typeId: a.type_id, ownerUnitId: a.owner_unit_id, locationId: a.location_id, version: versionOf(a), code: a.code, legacyAssetNo: a.legacy_asset_no, name: a.name, type: a.type, brand: a.brand, model: a.model,
    serialNumber: a.serial_number, status: a.status, unit: a.unit, location: path(a.location_id), locationDetail: a.location_detail,
    purchaseDate: a.purchase_date, installDate: a.install_date, warrantyEnd: a.warranty_end, notes: a.notes,
    plans: plans.map((p) => ({ id: p.id, title: p.title, intervalValue: p.interval_value, intervalUnit: p.interval_unit, nextDueDate: p.next_due_date, active: p.active === 1 })),
    images, inProgressJobs: Number(counts?.in_progress ?? 0), health,
    workOrders: orders.map((o) => ({
      id: o.id, number: o.number, title: o.title, kind: o.kind, status: o.status, priority: o.priority, description: o.description,
      planId: o.plan_id, dueDate: o.due_date, performedOn: o.performed_on,
      recordedBy: o.recorded_by,
      version: workOrderVersion(o),
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
const assetFields = z.object({
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
const assetPatch = assetFields.partial().extend({ expectedVersion: z.string().min(1) }).strict();

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

  // the status of the asset must agree with its jobs (it follows them automatically; see autoAssetStatus)
  if (changes.status !== undefined) {
    const [c] = await rows<{ n: string | null }>(sql`SELECT SUM(status = 'in_progress') AS n FROM work_orders WHERE asset_id = ${asset.id}`);
    const problem = assetStatusProblem(changes.status, Number(c?.n ?? 0));
    if (problem) return void res.status(400).json({ error: { code: "status_conflict", message: problem } });
  }

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
  let before: Record<string, unknown> = {};
  const result = await db.transaction(async (tx) => {
    // must run on the transaction's own connection (tx), otherwise FOR UPDATE would not hold the row lock
    const [locked] = (await tx.execute(sql`SELECT ${VERSION_COLUMNS} FROM assets a WHERE a.id = ${asset.id} FOR UPDATE`)) as unknown as [object[]];
    if (!locked[0] || versionOf(locked[0]) !== expectedVersion) return "stale" as const;
    before = { ...locked[0] } as Record<string, unknown>;
    await tx.update(assets).set(set).where(eq(assets.id, asset.id));
    return "ok" as const;
  });
  if (result === "stale") {
    return void res.status(409).json({ error: { code: "conflict", message: "ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาปิดหน้าต่างแล้วเปิดใหม่เพื่อดูข้อมูลล่าสุด" } });
  }
  await audit(user, { entity: "asset", entityId: asset.id, assetId: asset.id, action: "update", summary: "แก้ไขข้อมูลอุปกรณ์", changes: diff(before, changes) });
  if (changes.ownerUnitId !== undefined) await relocateAssetImages(asset.id).catch((e) => console.error("photo relocation failed", e)); // photo files follow the asset to its new unit folder
  res.json({ ok: true });
});

// ---- adding an asset (Super Admin / Technician only) ----

const assetCreate = assetFields
  .partial()
  .required({ name: true, typeId: true, ownerUnitId: true })
  .extend({ code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/, "รหัสอุปกรณ์ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - ยาวไม่เกิน 40 ตัว และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข") })
  .strict();

const refActive = async (table: "asset_types" | "organization_units" | "locations", value: number) =>
  (await rows<{ id: number }>(sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${value} AND archived_at IS NULL`)).length > 0;
const isDuplicateKey = (err: unknown) => {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || e?.cause?.code === "ER_DUP_ENTRY" || e?.cause?.errno === 1062;
};

dataRouter.post("/assets", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const user = req.user!;
  const bad = (status: number, code: string, message: string) => void res.status(status).json({ error: { code, message } });
  const parsed = assetCreate.safeParse(req.body);
  if (!parsed.success) return bad(400, "validation_error", parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const b = parsed.data;
  const status = b.status ?? "active";
  const problem = assetStatusProblem(status, 0); // a new asset has no job, so it cannot start as "in progress"
  if (problem) return bad(400, "status_conflict", problem);
  if (!(await refActive("asset_types", b.typeId))) return bad(400, "validation_error", "ไม่พบประเภทอุปกรณ์ที่เลือก");
  if (!(await refActive("organization_units", b.ownerUnitId))) return bad(400, "validation_error", "ไม่พบส่วนงานที่เลือก");
  if (b.locationId != null && !(await refActive("locations", b.locationId))) return bad(400, "validation_error", "ไม่พบสถานที่ที่เลือก");
  const allowed = await allowedUnitIds(user); // a technician signed in with CMU can only add to their own unit
  if (allowed && !allowed.includes(b.ownerUnitId)) return bad(403, "forbidden", "ไม่มีสิทธิ์เพิ่มอุปกรณ์ในส่วนงานนี้");
  try {
    const [row] = await db
      .insert(assets)
      .values({
        code: b.code, name: b.name, typeId: b.typeId, ownerUnitId: b.ownerUnitId, status, locationId: b.locationId ?? null,
        locationDetail: b.locationDetail ?? null, brand: b.brand ?? null, model: b.model ?? null, serialNumber: b.serialNumber ?? null,
        legacyAssetNo: b.legacyAssetNo ?? null, purchaseDate: b.purchaseDate ?? null, installDate: b.installDate ?? null,
        warrantyEnd: b.warrantyEnd ?? null, notes: b.notes ?? null, qrToken: newQrToken(), // its QR code exists from the start
      })
      .$returningId();
    await audit(user, { entity: "asset", entityId: row.id, assetId: row.id, action: "create", summary: `เพิ่มอุปกรณ์ ${b.code}: ${b.name}` });
    res.status(201).json({ id: row.id, code: b.code });
  } catch (err) {
    if (isDuplicateKey(err)) return bad(409, "duplicate", "รหัสอุปกรณ์นี้มีอยู่แล้ว กรุณาใช้รหัสอื่น");
    throw err;
  }
});

// A suggested code for a new asset: <type>-<unit>-<next number>, e.g. AC-ENG-004. The person can still change it.
dataRouter.get("/meta/next-asset-code", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const q = z.object({ typeId: z.coerce.number().int().positive(), unitId: z.coerce.number().int().positive() }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "ต้องเลือกประเภทและส่วนงานก่อน" } });
  const [t] = await rows<{ code: string }>(sql`SELECT code FROM asset_types WHERE id = ${q.data.typeId} AND archived_at IS NULL`);
  const [u] = await rows<{ code: string }>(sql`SELECT code FROM organization_units WHERE id = ${q.data.unitId} AND archived_at IS NULL`);
  if (!t || !u) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบประเภทหรือส่วนงาน" } });
  const allowed = await allowedUnitIds(req.user!);
  if (allowed && !allowed.includes(q.data.unitId)) return void res.status(403).json({ error: { code: "forbidden", message: "ไม่มีสิทธิ์ในส่วนงานนี้" } });
  const clean = (v: string) => v.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
  const prefix = `${clean(t.code)}-${clean(u.code)}`.slice(0, 36);
  const used = await rows<{ code: string }>(sql`SELECT code FROM assets WHERE code LIKE ${prefix + "-%"}`);
  const max = used.reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
  res.json({ code: `${prefix}-${String(max + 1).padStart(3, "0")}` });
});

dataRouter.use(workOrdersRouter);
dataRouter.use(plansRouter);
dataRouter.use(historyRouter);
dataRouter.use(calendarRouter);
dataRouter.use(reportsRouter);
dataRouter.use(assetImportRouter);
dataRouter.use(assetImagesRouter);
