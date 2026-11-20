import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { addMonths } from "./dates";
import { assetScope, rows, scopeQuery } from "./query";

// The maintenance calendar: plans and open jobs that fall due in one month, for the assets the user may see.
export const calendarRouter = Router();

const query = scopeQuery.extend({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

calendarRouter.get("/calendar", async (req, res) => {
  const q = query.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "เดือนไม่ถูกต้อง" } });
  const first = `${q.data.month}-01`;
  const last = addMonths(first, 1); // exclusive
  const where = await assetScope(q.data, req.user!);
  const plans = await rows<{ id: number; asset_id: number; code: string; name: string; title: string; due: string }>(sql`
    SELECT p.id, a.id AS asset_id, a.code, a.name, p.title, p.next_due_date AS due
    FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id
    WHERE p.active = 1 AND a.status <> 'disposed' AND p.next_due_date >= ${first} AND p.next_due_date < ${last} AND ${where}
    ORDER BY p.next_due_date, a.code LIMIT 500`);
  const jobs = await rows<{ id: number; asset_id: number; code: string; name: string; title: string; due: string; status: string }>(sql`
    SELECT w.id, a.id AS asset_id, a.code, a.name, w.title, w.due_date AS due, w.status
    FROM work_orders w JOIN assets a ON a.id = w.asset_id
    WHERE w.status = 'in_progress' AND w.due_date >= ${first} AND w.due_date < ${last} AND ${where}
    ORDER BY w.due_date, a.code LIMIT 500`);
  res.json({
    month: q.data.month,
    items: [
      ...plans.map((p) => ({ kind: "plan" as const, id: p.id, assetId: p.asset_id, assetCode: p.code, assetName: p.name, title: p.title, date: p.due })),
      ...jobs.map((j) => ({ kind: "job" as const, id: j.id, assetId: j.asset_id, assetCode: j.code, assetName: j.name, title: j.title, date: j.due })),
    ],
  });
});
