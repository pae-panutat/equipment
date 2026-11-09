import { Router, type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  DUE_SOON_DAYS,
  type AssetListItem,
  type AssetStatus,
  type DashboardSummary,
  type FilterOptions,
  type Paged,
  type WorkOrderKind,
  type WorkOrderStatus,
} from "../shared";
import { config } from "./config";
import { addDays, addMonths, bangkokToday } from "./dates";
import { assetScope, rangeQuery, rows, scopeQuery } from "./query";

export const dataRouter = Router();

// There is no login yet, so business data is only served outside production unless explicitly enabled.
dataRouter.use((_req: Request, res: Response, next: NextFunction) => {
  if (config.isProd && !config.allowUnauthenticatedDemo) {
    res.status(403).json({ error: { code: "forbidden", message: "ยังไม่เปิดใช้งาน: ต้องมีระบบเข้าสู่ระบบก่อน" } });
    return;
  }
  next();
});

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown, res: Response): z.infer<T> | null {
  const r = schema.safeParse(input);
  if (!r.success) {
    res.status(400).json({ error: { code: "validation_error", message: "พารามิเตอร์ไม่ถูกต้อง", details: z.flattenError(r.error).fieldErrors } });
    return null;
  }
  return r.data;
}

dataRouter.get("/meta/filters", async (_req, res) => {
  const units = await rows<{ id: number; name: string; parent_id: number | null }>(
    sql`SELECT id, name, parent_id FROM organization_units WHERE archived_at IS NULL ORDER BY name`,
  );
  const types = await rows<{ id: number; name: string }>(sql`SELECT id, name FROM asset_types WHERE archived_at IS NULL ORDER BY name`);
  const body: FilterOptions = { units: units.map((u) => ({ id: u.id, name: u.name, parentId: u.parent_id })), types };
  res.json(body);
});

dataRouter.get("/dashboard/summary", async (req, res) => {
  const scope = parse(scopeQuery, req.query, res);
  const range = parse(rangeQuery, req.query, res);
  if (!scope || !range) return;

  const today = bangkokToday();
  const to = range.to ?? today;
  const from = range.from ?? addMonths(to, -11).slice(0, 8) + "01"; // first day of the month, 11 months back
  const where = await assetScope(scope);
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
  const scopeWhere = await assetScope(q);
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

  const locs = await rows<{ id: number; parent_id: number | null; name: string }>(sql`SELECT id, parent_id, name FROM locations`);
  const byId = new Map(locs.map((l) => [l.id, l]));
  const path = (id: number | null) => {
    const names: string[] = [];
    for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) names.unshift(cur.name);
    return names.length ? names.join(" › ") : null;
  };

  const items: AssetListItem[] = list.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, brand: r.brand, model: r.model, status: r.status, unit: r.unit,
    location: path(r.location_id), lastMaintenance: r.last_maintenance, nextDue: r.next_due,
  }));
  const body: Paged<AssetListItem> = { items, page: q.page, pageSize: q.pageSize, total: Number(total) };
  res.json(body);
});
