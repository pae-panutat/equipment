import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { addMonths, bangkokToday } from "./dates";
import { allLocations, assetScope, rows, scopeQuery } from "./query";

// Data for the reports page (summary of completed work, and the asset register). The page turns it into tables, CSV and print.
export const reportsRouter = Router();

const MAX_MONTHS = 36;
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const summaryQuery = scopeQuery.extend({ from: ym, to: ym });

// Completed jobs per month, owner unit and kind, by the day the work was actually done.
reportsRouter.get("/reports/work-summary", async (req, res) => {
  const q = summaryQuery.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "ช่วงเดือนไม่ถูกต้อง" } });
  const { from, to } = q.data;
  const first = `${from}-01`;
  const end = addMonths(`${to}-01`, 1); // exclusive
  if (first >= end || addMonths(first, MAX_MONTHS) < end) {
    return void res.status(400).json({ error: { code: "validation_error", message: `เลือกช่วงเวลาได้ไม่เกิน ${MAX_MONTHS} เดือน` } });
  }
  const where = await assetScope(q.data, req.user!);
  const data = await rows<{ month: string; unit: string; kind: string; n: number }>(sql`
    SELECT DATE_FORMAT(w.performed_on, '%Y-%m') AS month, u.name AS unit, w.kind, COUNT(*) AS n
    FROM work_orders w JOIN assets a ON a.id = w.asset_id JOIN organization_units u ON u.id = a.owner_unit_id
    WHERE w.status = 'done' AND w.performed_on >= ${first} AND w.performed_on < ${end} AND ${where}
    GROUP BY month, u.id, u.name, w.kind ORDER BY month, u.name`);
  res.json({ from, to, generatedOn: bangkokToday(), rows: data.map((r) => ({ month: r.month, unit: r.unit, kind: r.kind, count: Number(r.n) })) });
});

// The asset register (what the list shows plus the dates), for export. At most 5,000 rows.
reportsRouter.get("/reports/assets", async (req, res) => {
  const q = scopeQuery.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "ตัวกรองไม่ถูกต้อง" } });
  const where = await assetScope(q.data, req.user!);
  const list = await rows<{
    code: string; name: string; type: string; unit: string; status: string; brand: string | null; model: string | null; serial_number: string | null;
    legacy_asset_no: string | null; location_id: number | null; location_detail: string | null; install_date: string | null;
    purchase_date: string | null; warranty_end: string | null; last_maintenance: string | null; next_due: string | null;
  }>(sql`
    SELECT a.code, a.name, t.name AS type, u.name AS unit, a.status, a.brand, a.model, a.serial_number, a.legacy_asset_no, a.location_id,
      a.location_detail, a.install_date, a.purchase_date, a.warranty_end,
      (SELECT MAX(w.performed_on) FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'done') AS last_maintenance,
      (SELECT MIN(p.next_due_date) FROM maintenance_plans p WHERE p.asset_id = a.id AND p.active = 1) AS next_due
    FROM assets a JOIN asset_types t ON t.id = a.type_id JOIN organization_units u ON u.id = a.owner_unit_id
    WHERE ${where} ORDER BY a.code LIMIT 5000`);
  const locs = await allLocations();
  const byId = new Map(locs.map((l) => [l.id, l]));
  const path = (id: number | null) => {
    const names: string[] = [];
    for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) names.unshift(cur.name);
    return names.join(" › ");
  };
  res.json({
    generatedOn: bangkokToday(),
    rows: list.map((r) => ({
      code: r.code, name: r.name, type: r.type, unit: r.unit, status: r.status, brand: r.brand ?? "", model: r.model ?? "", serialNumber: r.serial_number ?? "",
      legacyAssetNo: r.legacy_asset_no ?? "", location: [path(r.location_id), r.location_detail].filter(Boolean).join(" · "), installDate: r.install_date ?? "",
      purchaseDate: r.purchase_date ?? "", warrantyEnd: r.warranty_end ?? "", lastMaintenance: r.last_maintenance ?? "", nextDue: r.next_due ?? "",
    })),
  });
});

// What a printed QR label needs for the chosen assets (only those the user may see). At most 200.
reportsRouter.get("/labels", async (req, res) => {
  const q = z.object({ ids: z.string().regex(/^\d+(,\d+)*$/).max(2000) }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: { code: "validation_error", message: "รายการที่เลือกไม่ถูกต้อง" } });
  const ids = [...new Set(q.data.ids.split(",").map(Number))].slice(0, 200);
  const where = await assetScope({}, req.user!);
  const list = await rows<{ id: number; code: string; name: string; unit: string }>(sql`
    SELECT a.id, a.code, a.name, u.name AS unit FROM assets a JOIN organization_units u ON u.id = a.owner_unit_id
    WHERE a.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND ${where} ORDER BY a.code`);
  res.json({ items: list });
});
