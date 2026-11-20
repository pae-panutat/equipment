import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assetTypes, locations, organizationUnits } from "../db/schema";
import { LOCATION_KINDS, type MasterItem, type MasterKind } from "../shared";
import { requireRole } from "./auth/guard";
import { db } from "./db";
import { invalidateTreeCache, rows } from "./query";

/**
 * Master data a Super Admin maintains: organization units (faculties), asset types and locations.
 * A row can be deleted only when nothing points at it (no asset, sub-row or user).
 */
export const masterRouter = Router();
masterRouter.use(requireRole("super_admin"));

type Cfg = {
  table: typeof organizationUnits | typeof assetTypes | typeof locations;
  name: string; // table name, for raw SQL
  tree: boolean; // has parent_id
  /** SQL that counts the assets pointing at a row (any status) */
  assetCol: string;
  label: string; // Thai noun for messages
  codeRe: RegExp;
  codeHint: string;
};

const CFG: Record<MasterKind, Cfg> = {
  units: {
    table: organizationUnits, name: "organization_units", tree: true, assetCol: "owner_unit_id", label: "ส่วนงาน",
    // a unit code is also its photo folder name, so it must be safe as a folder name
    codeRe: /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/, codeHint: "รหัสใช้ได้เฉพาะ A-Z a-z 0-9 _ - ยาวไม่เกิน 32 ตัว (ใช้เป็นชื่อโฟลเดอร์รูปด้วย)",
  },
  types: {
    table: assetTypes, name: "asset_types", tree: false, assetCol: "type_id", label: "ประเภทอุปกรณ์",
    codeRe: /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, codeHint: "รหัสใช้ได้เฉพาะ A-Z a-z 0-9 . _ - ยาวไม่เกิน 32 ตัว",
  },
  locations: {
    table: locations, name: "locations", tree: true, assetCol: "location_id", label: "สถานที่",
    codeRe: /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, codeHint: "รหัสใช้ได้เฉพาะ A-Z a-z 0-9 . _ - ยาวไม่เกิน 32 ตัว",
  },
};

const fail = (res: import("express").Response, status: number, code: string, message: string) => void res.status(status).json({ error: { code, message } });
const kindOf = (v: unknown): MasterKind | null => (v === "units" || v === "types" || v === "locations" ? v : null);
const isDuplicateKey = (err: unknown) => {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || e?.cause?.code === "ER_DUP_ENTRY" || e?.cause?.errno === 1062;
};

type Row = { id: number; parent_id: number | null; code: string; name: string; kind: string | null; archived: number; assets: number; children: number; users: number };

async function list(kind: MasterKind): Promise<MasterItem[]> {
  const c = CFG[kind];
  const t = sql.raw(c.name);
  const parent = c.tree ? sql.raw("x.parent_id") : sql.raw("NULL");
  const children = c.tree ? sql`(SELECT COUNT(*) FROM ${t} k WHERE k.parent_id = x.id AND k.archived_at IS NULL)` : sql`0`;
  const kindCol = kind === "locations" ? sql.raw("x.kind") : sql.raw("NULL");
  const usersCol = kind === "units" ? sql`(SELECT COUNT(*) FROM users u WHERE u.unit_id = x.id AND u.active = 1)` : sql`0`;
  const out = await rows<Row>(sql`
    SELECT x.id, ${parent} AS parent_id, x.code, x.name, ${kindCol} AS kind, (x.archived_at IS NOT NULL) AS archived,
           (SELECT COUNT(*) FROM assets a WHERE a.${sql.raw(c.assetCol)} = x.id) AS assets, ${children} AS children, ${usersCol} AS users
    FROM ${t} x ORDER BY x.name`);
  return out.map((r) => ({
    id: r.id, parentId: r.parent_id, code: r.code, name: r.name, kind: r.kind, archived: Boolean(Number(r.archived)),
    assetCount: Number(r.assets), childCount: Number(r.children), userCount: Number(r.users),
  }));
}

masterRouter.get("/:kind", async (req, res) => {
  const kind = kindOf(req.params.kind);
  if (!kind) return fail(res, 404, "not_found", "ไม่พบข้อมูล");
  res.json(await list(kind));
});

const name = z.string().trim().min(1, "กรุณากรอกชื่อ").max(191, "ชื่อยาวเกิน 191 ตัวอักษร");
const parentId = z.number().int().positive().nullable();
const locKind = z.enum(LOCATION_KINDS);

/** The row `id` and everything under it (so a row cannot be moved below itself). */
async function subtreeIds(cfg: Cfg, id: number): Promise<number[]> {
  const all = await rows<{ id: number; parent_id: number | null }>(sql`SELECT id, parent_id FROM ${sql.raw(cfg.name)}`);
  const found = new Set<number>([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of all) if (r.parent_id !== null && found.has(r.parent_id) && !found.has(r.id)) (found.add(r.id), (grew = true));
  }
  return [...found];
}

async function parentProblem(cfg: Cfg, pid: number | null, selfId?: number): Promise<string | null> {
  if (pid === null) return null;
  const [p] = await rows<{ archived_at: unknown }>(sql`SELECT archived_at FROM ${sql.raw(cfg.name)} WHERE id = ${pid}`);
  if (!p) return `ไม่พบ${cfg.label}ต้นสังกัดที่เลือก`;
  if (p.archived_at) return `${cfg.label}ต้นสังกัดถูกเก็บถาวรแล้ว`;
  if (selfId !== undefined && (await subtreeIds(cfg, selfId)).includes(pid)) return "ย้ายไปอยู่ใต้ตัวเองหรือใต้รายการลูกของตัวเองไม่ได้";
  return null;
}

masterRouter.post("/:kind", async (req, res) => {
  const kind = kindOf(req.params.kind);
  if (!kind) return fail(res, 404, "not_found", "ไม่พบข้อมูล");
  const c = CFG[kind];
  const schema = z
    .object({
      code: z.string().trim().regex(c.codeRe, c.codeHint),
      name,
      parentId: parentId.optional(),
      kind: locKind.optional(),
    })
    .strict();
  const p = schema.safeParse(req.body);
  if (!p.success) return fail(res, 400, "validation_error", p.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const b = p.data;
  if (!c.tree && b.parentId !== undefined) return fail(res, 400, "validation_error", "ประเภทอุปกรณ์ไม่มีต้นสังกัด");
  if (kind === "locations" && !b.kind) return fail(res, 400, "validation_error", "กรุณาเลือกชนิดของสถานที่");
  if (kind !== "locations" && b.kind) return fail(res, 400, "validation_error", "ข้อมูลไม่ถูกต้อง");
  const problem = await parentProblem(c, b.parentId ?? null);
  if (problem) return fail(res, 400, "validation_error", problem);
  try {
    let id: number;
    if (kind === "units") [{ id }] = await db.insert(organizationUnits).values({ code: b.code, name: b.name, parentId: b.parentId ?? null }).$returningId();
    else if (kind === "types") [{ id }] = await db.insert(assetTypes).values({ code: b.code, name: b.name }).$returningId();
    else [{ id }] = await db.insert(locations).values({ code: b.code, name: b.name, parentId: b.parentId ?? null, kind: b.kind! }).$returningId();
    invalidateTreeCache();
    res.status(201).json({ id });
  } catch (err) {
    if (isDuplicateKey(err)) return fail(res, 409, "duplicate", "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น");
    throw err;
  }
});

// The code never changes after creation (asset codes and photo folders are built from it); name, parent and kind do.
masterRouter.patch("/:kind/:id", async (req, res) => {
  const kind = kindOf(req.params.kind);
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!kind || !id.success) return fail(res, 404, "not_found", "ไม่พบข้อมูล");
  const c = CFG[kind];
  const p = z.object({ name: name.optional(), parentId: parentId.optional(), kind: locKind.optional() }).strict().safeParse(req.body);
  if (!p.success) return fail(res, 400, "validation_error", p.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const b = p.data;
  if (Object.keys(b).length === 0) return fail(res, 400, "validation_error", "ไม่มีข้อมูลที่จะแก้ไข");
  if (!c.tree && b.parentId !== undefined) return fail(res, 400, "validation_error", "ประเภทอุปกรณ์ไม่มีต้นสังกัด");
  if (kind !== "locations" && b.kind !== undefined) return fail(res, 400, "validation_error", "ข้อมูลไม่ถูกต้อง");

  const [cur] = (await list(kind)).filter((x) => x.id === id.data);
  if (!cur) return fail(res, 404, "not_found", "ไม่พบข้อมูล");

  if (b.parentId !== undefined && b.parentId !== cur.parentId) {
    const problem = await parentProblem(c, b.parentId, cur.id);
    if (problem) return fail(res, 400, "validation_error", problem);
  }

  const set: Record<string, unknown> = {};
  if (b.name !== undefined) set.name = b.name;
  if (b.parentId !== undefined) set.parentId = b.parentId;
  if (b.kind !== undefined) set.kind = b.kind;
  if (Object.keys(set).length > 0) await db.update(c.table as typeof organizationUnits).set(set).where(eq(c.table.id, id.data));
  invalidateTreeCache();
  res.json({ ok: true });
});

// Permanent delete: only for a row nothing points at (no asset, no sub-row of any kind, no user).
masterRouter.delete("/:kind/:id", async (req, res) => {
  const kind = kindOf(req.params.kind);
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!kind || !id.success) return fail(res, 404, "not_found", "ไม่พบข้อมูล");
  const c = CFG[kind];
  const [cur] = (await list(kind)).filter((x) => x.id === id.data);
  if (!cur) return fail(res, 404, "not_found", "ไม่พบข้อมูล");
  const [{ kids }] = c.tree
    ? await rows<{ kids: number }>(sql`SELECT COUNT(*) AS kids FROM ${sql.raw(c.name)} WHERE parent_id = ${cur.id}`)
    : [{ kids: 0 }];
  const [{ people }] =
    kind === "units" ? await rows<{ people: number }>(sql`SELECT COUNT(*) AS people FROM users WHERE unit_id = ${cur.id}`) : [{ people: 0 }];
  const why =
    cur.assetCount > 0 ? `มีอุปกรณ์ใช้อยู่ ${cur.assetCount} รายการ`
    : Number(kids) > 0 ? `ยังมี${c.label}ย่อยอยู่ ${Number(kids)} รายการ`
    : Number(people) > 0 ? `ยังมีผู้ใช้งานสังกัดอยู่ ${Number(people)} คน`
    : null;
  if (why) return fail(res, 409, "in_use", `ลบไม่ได้: ${why}`);
  await db.delete(c.table as typeof organizationUnits).where(eq(c.table.id, cur.id));
  invalidateTreeCache();
  res.json({ ok: true });
});
