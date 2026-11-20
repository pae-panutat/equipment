import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assets } from "../db/schema";
import { ASSET_EDIT_ROLES, ASSET_STATUSES, ASSET_STATUS_LABEL, type AssetStatus } from "../shared";
import { requireRole } from "./auth/guard";
import { audit } from "./audit";
import { db } from "./db";
import { allLocations, allowedUnitIds, rows } from "./query";
import { newQrToken } from "./qr";

// Adding many assets at once from a spreadsheet saved as CSV. The browser reads the file and sends the rows as text; here every
// row is checked against the master data and the same rules as adding one asset. Nothing is saved unless every row is fine.
export const assetImportRouter = Router();

export const IMPORT_MAX_ROWS = 500;

const cell = z.string().max(5000).default("");
const body = z
  .object({
    dryRun: z.boolean(),
    rows: z
      .array(
        z
          .object({
            code: cell, name: cell, type: cell, unit: cell, location: cell, locationDetail: cell, brand: cell, model: cell, serialNumber: cell,
            legacyAssetNo: cell, installDate: cell, purchaseDate: cell, warrantyEnd: cell, status: cell, notes: cell,
          })
          .strict(),
      )
      .min(1, "ไฟล์ไม่มีข้อมูล")
      .max(IMPORT_MAX_ROWS, `นำเข้าได้ครั้งละไม่เกิน ${IMPORT_MAX_ROWS} รายการ`),
  })
  .strict();

type RowResult = { row: number; ok: boolean; code?: string; error?: string };

const norm = (v: string) => v.trim().toLowerCase();
const clean = (v: string) => v.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/** YYYY-MM-DD, or D/M/YYYY (a Buddhist-era year is converted). Returns undefined for blank, null for something unreadable. */
function toDate(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return undefined;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const th = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (th) [d, m, y] = [Number(th[1]), Number(th[2]), Number(th[3])];
  else return null;
  if (y > 2400) y -= 543;
  const out = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === out && y >= 1900 && y <= 2200 ? out : null;
}

assetImportRouter.post("/assets/import", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: { code: "validation_error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" } });
  const { dryRun, rows: input } = parsed.data;
  const user = req.user!;

  const types = await rows<{ id: number; code: string; name: string }>(sql`SELECT id, code, name FROM asset_types WHERE archived_at IS NULL`);
  const units = await rows<{ id: number; code: string; name: string }>(sql`SELECT id, code, name FROM organization_units WHERE archived_at IS NULL`);
  const locs = (await allLocations()) as { id: number; parent_id: number | null; name: string; code?: string }[];
  const locCodes = await rows<{ id: number; code: string }>(sql`SELECT id, code FROM locations WHERE archived_at IS NULL`);
  const locById = new Map(locs.map((l) => [l.id, l]));
  const pathOf = (id: number) => {
    const names: string[] = [];
    for (let cur = locById.get(id); cur; cur = cur.parent_id ? locById.get(cur.parent_id) : undefined) names.unshift(cur.name);
    return names.join(" › ");
  };
  const allowed = await allowedUnitIds(user);

  const find = <T extends { id: number; code: string; name: string }>(list: T[], v: string) => {
    const k = norm(v);
    const byCode = list.filter((x) => norm(x.code) === k);
    if (byCode.length === 1) return byCode[0];
    const byName = list.filter((x) => norm(x.name) === k);
    return byName.length === 1 ? byName[0] : null;
  };
  const findLoc = (v: string) => {
    const k = norm(v);
    const byCode = locCodes.filter((x) => norm(x.code) === k);
    if (byCode.length === 1) return byCode[0].id;
    const byPath = locs.filter((l) => norm(pathOf(l.id)) === k);
    if (byPath.length === 1) return byPath[0].id;
    const byName = locs.filter((l) => norm(l.name) === k);
    return byName.length === 1 ? byName[0].id : null;
  };
  const statusOf = (v: string): AssetStatus | null => {
    if (!v.trim()) return "active";
    const k = norm(v);
    const hit = ASSET_STATUSES.find((s) => s === k || norm(ASSET_STATUS_LABEL[s]) === k);
    return hit && hit !== "under_repair" ? hit : null; // "in progress" is set by the system from jobs
  };

  const existing = new Set((await rows<{ code: string }>(sql`SELECT code FROM assets`)).map((r) => r.code.toLowerCase()));
  const counters = new Map<string, number>(); // next number per "<type>-<unit>" prefix, for rows with no code
  const nextFor = async (prefix: string) => {
    if (!counters.has(prefix)) {
      const used = await rows<{ code: string }>(sql`SELECT code FROM assets WHERE code LIKE ${prefix + "-%"}`);
      counters.set(prefix, used.reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.code)?.[1] ?? 0)), 0));
    }
    const n = counters.get(prefix)! + 1;
    counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(3, "0")}`;
  };

  const results: RowResult[] = [];
  const ready: (typeof assets.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    const row = i + 2; // spreadsheet line (line 1 is the header)
    const fail = (error: string) => results.push({ row, ok: false, error });
    const name = r.name.trim();
    if (!name) { fail("ไม่มีชื่ออุปกรณ์"); continue; }
    if (name.length > 191) { fail("ชื่อยาวเกิน 191 ตัวอักษร"); continue; }
    const type = find(types, r.type);
    if (!type) { fail(`ไม่พบประเภท "${r.type}" (ใช้รหัสหรือชื่อตามข้อมูลหลัก)`); continue; }
    const unit = find(units, r.unit);
    if (!unit) { fail(`ไม่พบส่วนงาน "${r.unit}" (ใช้รหัสหรือชื่อตามข้อมูลหลัก)`); continue; }
    if (allowed && !allowed.includes(unit.id)) { fail(`ไม่มีสิทธิ์เพิ่มอุปกรณ์ในส่วนงาน "${unit.name}"`); continue; }
    let locationId: number | null = null;
    if (r.location.trim()) {
      locationId = findLoc(r.location);
      if (locationId === null) { fail(`ไม่พบสถานที่ "${r.location}" (ใช้รหัส หรือชื่อเต็ม เช่น วิทยาเขต › อาคาร › ชั้น › ห้อง)`); continue; }
    }
    const status = statusOf(r.status);
    if (!status) { fail(`สถานะ "${r.status}" ใช้ไม่ได้ (ใช้งานได้: ปกติ, ชำรุด, หยุดใช้งาน, จำหน่ายออก)`); continue; }
    const dates: Record<"installDate" | "purchaseDate" | "warrantyEnd", string | undefined> = { installDate: undefined, purchaseDate: undefined, warrantyEnd: undefined };
    let badDate = false;
    for (const k of ["installDate", "purchaseDate", "warrantyEnd"] as const) {
      const d = toDate(r[k]);
      if (d === null) { fail(`วันที่ไม่ถูกต้อง "${r[k]}" (ใช้รูปแบบ ปปปป-ดด-วว เช่น 2026-03-15)`); badDate = true; break; }
      dates[k] = d;
    }
    if (badDate) continue;
    const lim: [string, string, number][] = [["ยี่ห้อ", r.brand, 120], ["รุ่น", r.model, 120], ["หมายเลขเครื่อง", r.serialNumber, 120], ["เลขครุภัณฑ์เดิม", r.legacyAssetNo, 60], ["รายละเอียดที่ตั้ง", r.locationDetail, 255]];
    const over = lim.find(([, v, max]) => v.trim().length > max);
    if (over) { fail(`${over[0]} ยาวเกิน ${over[2]} ตัวอักษร`); continue; }

    let code = r.code.trim();
    if (code) {
      if (!CODE.test(code)) { fail(`รหัส "${code}" ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - ยาวไม่เกิน 40 ตัว และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข`); continue; }
      if (existing.has(code.toLowerCase())) { fail(`รหัส "${code}" มีอยู่ในระบบแล้ว`); continue; }
      if (seen.has(code.toLowerCase())) { fail(`รหัส "${code}" ซ้ำกับแถวก่อนหน้าในไฟล์`); continue; }
    } else {
      code = await nextFor(`${clean(type.code)}-${clean(unit.code)}`.slice(0, 36));
    }
    seen.add(code.toLowerCase());
    results.push({ row, ok: true, code });
    ready.push({
      code, name, typeId: type.id, ownerUnitId: unit.id, status, locationId, locationDetail: r.locationDetail.trim() || null, brand: r.brand.trim() || null,
      model: r.model.trim() || null, serialNumber: r.serialNumber.trim() || null, legacyAssetNo: r.legacyAssetNo.trim() || null,
      installDate: dates.installDate ?? null, purchaseDate: dates.purchaseDate ?? null, warrantyEnd: dates.warrantyEnd ?? null, notes: r.notes.trim() || null,
      qrToken: newQrToken(),
    });
  }

  const errors = results.filter((r) => !r.ok).length;
  if (dryRun || errors > 0) return void res.status(errors > 0 && !dryRun ? 400 : 200).json({ dryRun, imported: 0, errors, results });

  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ready.length; i += 100) await tx.insert(assets).values(ready.slice(i, i + 100));
    });
  } catch (err) {
    const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
    if (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || e?.cause?.code === "ER_DUP_ENTRY" || e?.cause?.errno === 1062) {
      return void res.status(409).json({ error: { code: "duplicate", message: "มีรหัสอุปกรณ์ซ้ำกับที่เพิ่งเพิ่มโดยผู้อื่น กรุณาตรวจสอบไฟล์แล้วลองใหม่" } });
    }
    throw err;
  }
  await audit(user, { entity: "import", action: "create", summary: `นำเข้าอุปกรณ์จากไฟล์ ${ready.length} รายการ (${ready[0].code} ... ${ready[ready.length - 1].code})` });
  res.status(201).json({ dryRun: false, imported: ready.length, errors: 0, results });
});
