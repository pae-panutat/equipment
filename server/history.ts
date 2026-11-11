import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "./auth/guard";
import { authorizedAsset } from "./asset-access";
import { rows } from "./query";

// The edit history: every asset's own history (anyone who may see the asset), and the whole system's (Super Admin only).
export const historyRouter = Router();

type Row = {
  id: number;
  at: string;
  username: string;
  entity: string;
  entity_id: number | null;
  asset_id: number | null;
  asset_code: string | null;
  action: string;
  summary: string;
  detail: string | null;
};

const select = sql`
  SELECT l.id, DATE_FORMAT(l.at, '%Y-%m-%dT%H:%i:%sZ') AS at, l.username, l.entity, l.entity_id, l.asset_id, a.code AS asset_code,
         l.action, l.summary, l.detail
  FROM audit_log l LEFT JOIN assets a ON a.id = l.asset_id`;

const shape = (r: Row) => ({
  id: r.id,
  at: r.at,
  username: r.username,
  entity: r.entity,
  assetId: r.asset_id,
  assetCode: r.asset_code,
  action: r.action,
  summary: r.summary,
  changes: r.detail ? (JSON.parse(r.detail) as Record<string, [unknown, unknown]>) : null,
});

const page = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) });

historyRouter.get("/assets/:id/history", async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
  const q = page.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "พารามิเตอร์ไม่ถูกต้อง" } });
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;
  const [count] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM audit_log WHERE asset_id = ${asset.id}`);
  const items = await rows<Row>(sql`${select} WHERE l.asset_id = ${asset.id} ORDER BY l.id DESC LIMIT ${q.data.pageSize} OFFSET ${(q.data.page - 1) * q.data.pageSize}`);
  res.json({ items: items.map(shape), page: q.data.page, pageSize: q.data.pageSize, total: Number(count.n) });
});

historyRouter.get("/audit", requireRole("super_admin"), async (req, res) => {
  const q = page.extend({ entity: z.enum(["asset", "work_order", "plan", "photo", "import"]).optional() }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "พารามิเตอร์ไม่ถูกต้อง" } });
  const where = q.data.entity ? sql`WHERE l.entity = ${q.data.entity}` : sql``;
  const [count] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM audit_log l ${where}`);
  const items = await rows<Row>(sql`${select} ${where} ORDER BY l.id DESC LIMIT ${q.data.pageSize} OFFSET ${(q.data.page - 1) * q.data.pageSize}`);
  res.json({ items: items.map(shape), page: q.data.page, pageSize: q.data.pageSize, total: Number(count.n) });
});
