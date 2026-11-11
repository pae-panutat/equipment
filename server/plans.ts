import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { maintenancePlans } from "../db/schema";
import { ASSET_EDIT_ROLES, INTERVAL_UNITS } from "../shared";
import { requireRole } from "./auth/guard";
import { authorizedAsset } from "./asset-access";
import { bangkokToday } from "./dates";
import { audit, diff } from "./audit";
import { db } from "./db";
import { rows } from "./query";

// Maintenance plans: only a Super Admin or a Technician may add or change them (same people who may edit assets).
// There is no delete: a plan that is no longer needed is switched off, so the jobs recorded against it keep their link.
export const plansRouter = Router();
const idParam = z.coerce.number().int().positive();

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

const validDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").refine(validDate, "วันที่ไม่ถูกต้อง");

const fields = {
  title: z.string().trim().min(1, "กรุณากรอกชื่อแผน").max(191, "ชื่อแผนยาวเกิน 191 ตัวอักษร"),
  intervalValue: z.number().int("รอบต้องเป็นจำนวนเต็ม").min(1, "รอบต้องมากกว่า 0").max(999, "รอบต้องไม่เกิน 999"),
  intervalUnit: z.enum(INTERVAL_UNITS),
  nextDueDate: date,
  active: z.boolean(),
};

const createBody = z.object({ title: fields.title, intervalValue: fields.intervalValue, intervalUnit: fields.intervalUnit, nextDueDate: fields.nextDueDate }).strict();
const patchBody = z.object(fields).partial().strict();

plansRouter.post("/assets/:id/plans", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "not_found", "ไม่พบอุปกรณ์");
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "validation_error", parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;
  const b = parsed.data;
  if (b.nextDueDate < bangkokToday()) return fail(res, 400, "validation_error", "วันครบกำหนดต้องไม่เป็นวันที่ผ่านมาแล้ว");
  const [row] = await db
    .insert(maintenancePlans)
    .values({ assetId: asset.id, title: b.title, intervalValue: b.intervalValue, intervalUnit: b.intervalUnit, startDate: bangkokToday(), nextDueDate: b.nextDueDate })
    .$returningId();
  await audit(req.user!, { entity: "plan", entityId: row.id, assetId: asset.id, action: "create", summary: `เพิ่มแผนบำรุงรักษา: ${b.title}` });
  res.status(201).json({ id: row.id });
});

plansRouter.patch("/plans/:id", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "not_found", "ไม่พบแผน");
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "validation_error", parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const [plan] = await rows<{ asset_id: number; title: string; interval_value: number; interval_unit: string; next_due_date: string | null; active: number }>(
    sql`SELECT asset_id, title, interval_value, interval_unit, next_due_date, active FROM maintenance_plans WHERE id = ${id.data}`,
  );
  if (!plan) return fail(res, 404, "not_found", "ไม่พบแผน");
  if (!(await authorizedAsset(res, req.user!, sql`a.id = ${plan.asset_id}`))) return;
  const b = parsed.data;
  // a date may be moved forward, not back into the past (a plan that is already overdue can keep its own date)
  if (b.nextDueDate !== undefined && b.nextDueDate !== plan.next_due_date && b.nextDueDate < bangkokToday()) {
    return fail(res, 400, "validation_error", "วันครบกำหนดต้องไม่เป็นวันที่ผ่านมาแล้ว");
  }
  const set: Partial<typeof maintenancePlans.$inferInsert> = {};
  if (b.title !== undefined) set.title = b.title;
  if (b.intervalValue !== undefined) set.intervalValue = b.intervalValue;
  if (b.intervalUnit !== undefined) set.intervalUnit = b.intervalUnit;
  if (b.nextDueDate !== undefined) set.nextDueDate = b.nextDueDate;
  if (b.active !== undefined) set.active = b.active ? 1 : 0;
  if (Object.keys(set).length > 0) {
    await db.update(maintenancePlans).set(set).where(eq(maintenancePlans.id, id.data));
    await audit(req.user!, { entity: "plan", entityId: id.data, assetId: plan.asset_id, action: "update", summary: `แก้ไขแผนบำรุงรักษา: ${plan.title}`, changes: diff(plan, set) });
  }
  res.json({ ok: true });
});
