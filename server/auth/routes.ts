import { Router, type Request, type Response } from "express";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { organizationUnits, users } from "../../db/schema";
import { safeNextPath, type AuthConfig } from "../../shared";
import { config } from "../config";
import { db } from "../db";
import { authorizeUrl, cmuEnabled, fetchProfile, newState } from "./cmu";
import { httpError, requireAuth } from "./guard";
import { verifyPassword } from "./password";
import { clearCookie, endSession, readCookie, setCookie, startSession } from "./session";
import { clearFailures, isLocked, recordFailure } from "./throttle";

export const authRouter = Router();

const normalize = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** The unit whose name or code equals the faculty name CMU reports. Exact match only: a wrong guess would expose another faculty's data. */
async function matchUnit(organization: string[]): Promise<number | null> {
  const wanted = new Set(organization.map(normalize).filter(Boolean));
  if (!wanted.size) return null;
  const units = await db.select({ id: organizationUnits.id, name: organizationUnits.name, code: organizationUnits.code }).from(organizationUnits).where(isNull(organizationUnits.archivedAt));
  const hits = units.filter((u) => wanted.has(normalize(u.name)) || wanted.has(normalize(u.code)));
  return hits.length === 1 ? hits[0].id : null; // ambiguous = no guess
}
const OAUTH_COOKIE = "equiplog_oauth";

authRouter.get("/config", (_req, res) => {
  const body: AuthConfig = { cmuEnabled: cmuEnabled() };
  res.json(body);
});

const loginBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional().default(false),
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return httpError(res, 400, "validation_error", "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
  const { username, password, remember } = parsed.data;

  const key = `${req.ip}|${username.toLowerCase()}`;
  if (isLocked(key)) return httpError(res, 429, "too_many_attempts", "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่");

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok || !user.active) {
    recordFailure(key);
    return httpError(res, 401, "invalid_credentials", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); // same message for every cause
  }
  clearFailures(key);
  await startSession(res, user.id, remember, "local");
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// ---- CMU Account (OAuth authorization-code flow) ----

authRouter.get("/cmu/start", (req, res) => {
  if (!cmuEnabled()) return res.redirect("/login?error=cmu_disabled");
  const state = newState();
  const remember = req.query.remember === "1";
  const next = safeNextPath(typeof req.query.next === "string" ? req.query.next : null); // e.g. the /q/<token> page that was scanned
  setCookie(res, OAUTH_COOKIE, JSON.stringify({ state, remember, next }), { maxAgeMs: 10 * 60_000 });
  res.redirect(authorizeUrl(req, state));
});

authRouter.get("/cmu/callback", async (req, res) => {
  const fail = (code: string) => {
    clearCookie(res, OAUTH_COOKIE);
    res.redirect(`/login?error=${code}`);
  };
  if (!cmuEnabled()) return fail("cmu_disabled");

  let saved: { state?: string; remember?: boolean; next?: string } = {};
  try {
    saved = JSON.parse(readCookie(req, OAUTH_COOKIE) ?? "{}");
  } catch {
    /* treated as a state mismatch below */
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !saved.state || state !== saved.state) return fail("cmu_state");

  let profile;
  try {
    profile = await fetchProfile(req, code);
  } catch (err) {
    console.error("CMU login failed", err);
    return fail("cmu_failed");
  }
  if (!/^[^@\s]+@cmu\.ac\.th$/.test(profile.email)) return fail("cmu_domain");

  const promote = config.bootstrap.cmuEmails.includes(profile.email);
  let [user] = await db.select().from(users).where(eq(users.cmuEmail, profile.email)).limit(1);
  if (!user) {
    // First CMU sign-in: a Viewer in the faculty CMU reports (if it matches a unit exactly). With no match the user
    // sees nothing until a Super Admin assigns a unit.
    const [created] = await db
      .insert(users)
      .values({
        cmuEmail: profile.email,
        displayName: profile.displayName,
        role: promote ? "super_admin" : "viewer",
        unitId: await matchUnit(profile.organization),
      })
      .$returningId();
    [user] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
  } else {
    const set: Partial<typeof users.$inferInsert> = {};
    if (promote && user.role !== "super_admin") set.role = "super_admin";
    if (user.unitId === null) set.unitId = await matchUnit(profile.organization); // never overrides a unit an admin chose
    if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, user.id));
  }
  if (!user.active) return fail("inactive");

  clearCookie(res, OAUTH_COOKIE);
  await startSession(res, user.id, saved.remember === true, "cmu");
  res.redirect(safeNextPath(saved.next));
});
