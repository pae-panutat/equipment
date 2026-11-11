import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assets, maintenancePlans, workOrders } from "../db/schema";
import { ASSET_EDIT_ROLES, ASSET_STATUSES, assetStatusProblem, autoAssetStatus, type AssetStatus, PRIORITIES, WORK_ORDER_KINDS, WORK_ORDER_STATUSES, WORK_ORDER_TERMINAL, type WorkOrderStatus } from "../shared";
import { requireRole } from "./auth/guard";
import { authorizedAsset, contentVersion } from "./asset-access";
import { addDays, addMonths, bangkokToday } from "./dates";
import { db } from "./db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Columns whose content makes up a work order's version (see contentVersion). */
export const WORK_ORDER_VERSION_KEYS = ["title", "kind", "status", "priority", "description", "due_date", "performed_on", "plan_id"] as const;
const VERSION_COLUMNS = sql.raw(WORK_ORDER_VERSION_KEYS.map((k) => `w.${k}`).join(", "));

// Only a Super Admin or a Technician may record maintenance work (same people who may edit assets).
export const workOrdersRouter = Router();
const idParam = z.coerce.number().int().positive();

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

const validDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const optText = (max: number) => z.string().trim().max(max, `ยาวเกิน ${max} ตัวอักษร`).transform((v) => (v === "" ? null : v)).nullable();
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").refine(validDate, "วันที่ไม่ถูกต้อง").nullable();

const fields = {
  kind: z.enum(WORK_ORDER_KINDS),
  title: z.string().trim().min(1, "กรุณากรอกหัวข้องาน").max(191, "หัวข้อยาวเกิน 191 ตัวอักษร"),
  description: optText(5000),
  priority: z.enum(PRIORITIES),
  status: z.enum(WORK_ORDER_STATUSES),
  dueDate: optDate,
  performedOn: optDate,
  planId: z.number().int().positive().nullable(),
  assetStatus: z.enum(ASSET_STATUSES), // optionally change the asset's own status in the same save (e.g. repaired -> normal)
};

const createBody = z.object({ ...fields, assetStatus: fields.assetStatus.optional() }).strict();
const patchBody = z.object(fields).partial().extend({ expectedVersion: z.string().min(1) }).strict();

/** Rules that look at several fields together. Returns a message, or null when fine. */
function crossCheck(state: { status: WorkOrderStatus; performedOn: string | null }): string | null {
  if (state.status === "done" && !state.performedOn) return "งานที่เสร็จสิ้นต้องระบุวันที่ดำเนินการ";
  if (state.performedOn && state.performedOn > bangkokToday()) return "วันที่ดำเนินการต้องไม่เป็นวันในอนาคต";
  return null;
}

const isDuplicate = (err: unknown) => {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || e?.cause?.code === "ER_DUP_ENTRY" || e?.cause?.errno === 1062;
};

/** Next free "WO-<year>-<4 digits>". Runs inside the insert transaction; the unique index on `number` is the final guard. */
async function nextNumber(tx: Tx): Promise<string> {
  const year = bangkokToday().slice(0, 4);
  const [result] = (await tx.execute(sql`SELECT MAX(number) AS m FROM work_orders WHERE number LIKE ${`WO-${year}-%`}`)) as unknown as [{ m: string | null }[]];
  const last = result[0]?.m ? Number(result[0].m.slice(-4)) : 0;
  return `WO-${year}-${String(last + 1).padStart(4, "0")}`;
}

/** A plan must belong to the asset being recorded. */
async function planOf(assetId: number, planId: number) {
  const [res] = (await db.execute(sql`SELECT id, interval_value, interval_unit, next_due_date, active FROM maintenance_plans WHERE id = ${planId} AND asset_id = ${assetId}`)) as unknown as [
    { id: number; interval_value: number; interval_unit: "day" | "month"; next_due_date: string | null; active: number }[],
  ];
  return res[0] ?? null;
}

class StatusConflict extends Error {}

/**
 * Keep the asset's status in agreement with its jobs (see autoAssetStatus). Runs inside the save's transaction, after the work
 * order itself has been written, so it sees the jobs as they will be. An explicit status from the form must not contradict them.
 */
async function syncAssetStatus(tx: Tx, assetId: number, explicit: AssetStatus | undefined) {
  const [cnt] = (await tx.execute(
    sql`SELECT SUM(status = 'in_progress') AS ip FROM work_orders WHERE asset_id = ${assetId}`,
  )) as unknown as [{ ip: string | null }[]];
  const inProgress = Number(cnt[0]?.ip ?? 0);
  if (explicit) {
    const problem = assetStatusProblem(explicit, inProgress);
    if (problem) throw new StatusConflict(problem);
    await tx.update(assets).set({ status: explicit }).where(eq(assets.id, assetId));
    return;
  }
  const [cur] = (await tx.execute(sql`SELECT status FROM assets WHERE id = ${assetId} FOR UPDATE`)) as unknown as [{ status: AssetStatus }[]];
  const next = autoAssetStatus({ current: cur[0].status, inProgress });
  if (next) await tx.update(assets).set({ status: next }).where(eq(assets.id, assetId));
}

/** A finished planned job moves the plan's next due date forward (never backwards, so back-dated records do no harm). */
async function advancePlan(tx: Tx, planId: number, performedOn: string) {
  const [res] = (await tx.execute(sql`SELECT interval_value, interval_unit, next_due_date, active FROM maintenance_plans WHERE id = ${planId} FOR UPDATE`)) as unknown as [
    { interval_value: number; interval_unit: "day" | "month"; next_due_date: string | null; active: number }[],
  ];
  const plan = res[0];
  if (!plan || plan.active !== 1) return;
  const next = plan.interval_unit === "month" ? addMonths(performedOn, plan.interval_value) : addDays(performedOn, plan.interval_value);
  if (!plan.next_due_date || next > plan.next_due_date) await tx.update(maintenancePlans).set({ nextDueDate: next }).where(eq(maintenancePlans.id, planId));
}

// Record a new job for an asset.
workOrdersRouter.post("/assets/:id/work-orders", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "not_found", "ไม่พบอุปกรณ์");
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "validation_error", parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const b = parsed.data;
  const problem = crossCheck(b);
  if (problem) return fail(res, 400, "validation_error", problem);
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;
  if (b.planId !== null && !(await planOf(asset.id, b.planId))) return fail(res, 400, "validation_error", "ไม่พบแผนบำรุงรักษาที่เลือกของอุปกรณ์นี้");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await db.transaction(async (tx) => {
        const number = await nextNumber(tx);
        const [row] = await tx
          .insert(workOrders)
          .values({
            number, assetId: asset.id, planId: b.planId, kind: b.kind, status: b.status, priority: b.priority, title: b.title,
            description: b.description, dueDate: b.dueDate, performedOn: b.performedOn, completedAt: b.status === "done" ? new Date() : null,
            createdBy: req.user!.id,
          })
          .$returningId();
        if (b.status === "done" && b.planId !== null && b.performedOn) await advancePlan(tx, b.planId, b.performedOn);
        await syncAssetStatus(tx, asset.id, b.assetStatus);
        return { id: row.id, number };
      });
      return void res.status(201).json(created);
    } catch (err) {
      if (err instanceof StatusConflict) return fail(res, 400, "status_conflict", err.message);
      if (!isDuplicate(err) || attempt === 2) throw err; // two people took the same number at once: try the next one
    }
  }
});

// Update a job: change its status (e.g. record the result), correct details or costs.
workOrdersRouter.patch("/work-orders/:id", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "not_found", "ไม่พบรายการงาน");
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "validation_error", parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const { expectedVersion, assetStatus, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0 && !assetStatus) return fail(res, 400, "validation_error", "ไม่มีข้อมูลที่เปลี่ยนแปลง");

  const [cur] = ((await db.execute(sql`SELECT w.asset_id, w.status, w.performed_on, w.plan_id FROM work_orders w WHERE w.id = ${id.data}`)) as unknown as [
    { asset_id: number; status: WorkOrderStatus; performed_on: string | null; plan_id: number | null }[],
  ])[0];
  if (!cur) return fail(res, 404, "not_found", "ไม่พบรายการงาน");
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${cur.asset_id}`);
  if (!asset) return;

  // a finished or cancelled job keeps its status (its details can still be corrected)
  if (changes.status !== undefined && changes.status !== cur.status && WORK_ORDER_TERMINAL.includes(cur.status)) {
    return fail(res, 400, "validation_error", "งานที่เสร็จสิ้นแล้วเปลี่ยนสถานะกลับไม่ได้ (แก้ไขรายละเอียดได้)");
  }
  const merged = { status: changes.status ?? cur.status, performedOn: changes.performedOn !== undefined ? changes.performedOn : cur.performed_on };
  const problem = crossCheck(merged);
  if (problem) return fail(res, 400, "validation_error", problem);
  const planId = changes.planId !== undefined ? changes.planId : cur.plan_id;
  if (changes.planId != null && !(await planOf(asset.id, changes.planId))) return fail(res, 400, "validation_error", "ไม่พบแผนบำรุงรักษาที่เลือกของอุปกรณ์นี้");

  const set: Partial<typeof workOrders.$inferInsert> = {};
  for (const k of ["kind", "title", "description", "priority", "status", "dueDate", "performedOn", "planId"] as const) if (changes[k] !== undefined) (set as Record<string, unknown>)[k] = changes[k];
  const becomesDone = merged.status === "done" && cur.status !== "done";
  if (becomesDone) set.completedAt = new Date();

  let result: "ok" | "stale";
  try {
    result = await db.transaction(async (tx) => {
    const [locked] = (await tx.execute(sql`SELECT ${VERSION_COLUMNS} FROM work_orders w WHERE w.id = ${id.data} FOR UPDATE`)) as unknown as [object[]];
    if (!locked[0] || contentVersion(locked[0], WORK_ORDER_VERSION_KEYS) !== expectedVersion) return "stale" as const;
    if (Object.keys(set).length) await tx.update(workOrders).set(set).where(eq(workOrders.id, id.data));
    if (becomesDone && planId !== null && merged.performedOn) await advancePlan(tx, planId, merged.performedOn);
    await syncAssetStatus(tx, asset.id, assetStatus);
    return "ok" as const;
    });
  } catch (err) {
    if (err instanceof StatusConflict) return fail(res, 400, "status_conflict", err.message);
    throw err;
  }
  if (result === "stale") return fail(res, 409, "conflict", "รายการนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาปิดหน้าต่างแล้วเปิดใหม่เพื่อดูข้อมูลล่าสุด");
  res.json({ ok: true });
});
