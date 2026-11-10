import { Router } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { organizationUnits, users } from "../../db/schema";
import { PASSWORD_MIN_LENGTH, ROLES, type ManagedUser } from "../../shared";
import { db } from "../db";
import { httpError, requireRole } from "./guard";
import { hashPassword } from "./password";
import { revokeUserSessions } from "./session";

// Only a Super Admin manages users in this slice.
export const usersRouter = Router();
usersRouter.use(requireRole("super_admin"));

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function listUsers(): Promise<ManagedUser[]> {
  const list = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      cmuEmail: users.cmuEmail,
      role: users.role,
      unitId: users.unitId,
      unitName: organizationUnits.name,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(organizationUnits, eq(organizationUnits.id, users.unitId))
    // super admins first, then by the order of ROLES (technician, viewer), then by name
    .orderBy(sql`FIELD(${users.role}, ${sql.raw(ROLES.map((r) => `'${r}'`).join(", "))})`, users.displayName);
  return list.map((u) => ({ ...u, active: u.active === 1, lastLoginAt: iso(u.lastLoginAt), createdAt: u.createdAt.toISOString() }));
}

usersRouter.get("/", async (_req, res) => {
  res.json(await listUsers());
});

const password = z.string().min(PASSWORD_MIN_LENGTH, `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`).max(256);

const createBody = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,64}$/, "ชื่อผู้ใช้ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - (3-64 ตัว)"),
  password,
  displayName: z.string().trim().min(1).max(191),
  role: z.enum(ROLES),
  unitId: z.number().int().positive().nullable().default(null),
});

const patchBody = z.object({
  displayName: z.string().trim().min(1).max(191).optional(),
  role: z.enum(ROLES).optional(),
  unitId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});

async function unitExists(id: number | null | undefined): Promise<boolean> {
  if (id === null || id === undefined) return true;
  const [u] = await db.select({ id: organizationUnits.id }).from(organizationUnits).where(eq(organizationUnits.id, id)).limit(1);
  return Boolean(u);
}

function validationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
}

usersRouter.post("/", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return httpError(res, 400, "validation_error", validationMessage(parsed.error));
  const b = parsed.data;
  if (!(await unitExists(b.unitId))) return httpError(res, 400, "validation_error", "ไม่พบส่วนงานที่เลือก");
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, b.username)).limit(1);
  if (dup) return httpError(res, 409, "duplicate", "ชื่อผู้ใช้นี้ถูกใช้แล้ว");
  await db.insert(users).values({ username: b.username, passwordHash: await hashPassword(b.password), displayName: b.displayName, role: b.role, unitId: b.unitId });
  res.status(201).json({ ok: true });
});

usersRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = patchBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    return httpError(res, 400, "validation_error", parsed.success ? "ไม่พบผู้ใช้" : validationMessage(parsed.error));
  }
  const b = parsed.data;
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return httpError(res, 404, "not_found", "ไม่พบผู้ใช้");
  if (!(await unitExists(b.unitId))) return httpError(res, 400, "validation_error", "ไม่พบส่วนงานที่เลือก");
  if (b.password && !target.username) return httpError(res, 400, "validation_error", "ผู้ใช้นี้เข้าสู่ระบบด้วย CMU Account เท่านั้น ไม่มีรหัสผ่าน");

  // never lock everyone out: the last active Super Admin can be neither demoted nor deactivated
  const losesAdmin = target.role === "super_admin" && target.active === 1 && ((b.role && b.role !== "super_admin") || b.active === false);
  if (losesAdmin) {
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.active, 1), ne(users.id, id)));
    if (Number(n) === 0) return httpError(res, 409, "last_admin", "ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน");
  }

  const set: Partial<typeof users.$inferInsert> = {};
  if (b.displayName !== undefined) set.displayName = b.displayName;
  if (b.role !== undefined) set.role = b.role;
  if (b.unitId !== undefined) set.unitId = b.unitId;
  if (b.active !== undefined) set.active = b.active ? 1 : 0;
  if (b.password) set.passwordHash = await hashPassword(b.password);
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, id));
  if (b.active === false || b.password) await revokeUserSessions(id); // takes effect immediately
  res.json({ ok: true });
});
