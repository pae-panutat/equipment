import crypto from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { sessions, users, organizationUnits } from "../../db/schema";
import { REMEMBER_DAYS, type AuthUser, type LoginMethod } from "../../shared";
import { config } from "../config";
import { db } from "../db";

export const SESSION_COOKIE = "equiplog_session";
const HOUR = 3600_000;
const SHORT_TTL = 12 * HOUR; // browser-session cookie; also capped on the server
const REMEMBER_TTL = REMEMBER_DAYS * 24 * HOUR;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setCookie(res: Response, name: string, value: string, opts: { maxAgeMs?: number } = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (config.isProd) attrs.push("Secure");
  if (opts.maxAgeMs !== undefined) {
    // Max-Age is what current browsers use; Expires is sent too for older ones
    attrs.push(`Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`, `Expires=${new Date(Date.now() + opts.maxAgeMs).toUTCString()}`);
  }
  res.append("Set-Cookie", attrs.join("; "));
}

export function clearCookie(res: Response, name: string) {
  const attrs = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (config.isProd) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

/**
 * Create a session for the user and set the cookie. `remember` = a persistent session that lasts one year from the last time it
 * was used (see refreshSession: every day of use pushes the end a year ahead, so a regular user is never signed out);
 * otherwise a browser-session cookie that also ends on the server after 12 hours.
 */
export async function startSession(res: Response, userId: number, remember: boolean, method: LoginMethod): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const ttl = remember ? REMEMBER_TTL : SHORT_TTL;
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())); // opportunistic cleanup
  await db.insert(sessions).values({ id: sha256(token), userId, method, expiresAt: new Date(Date.now() + ttl) });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  setCookie(res, SESSION_COOKIE, token, remember ? { maxAgeMs: ttl } : {});
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  clearCookie(res, SESSION_COOKIE);
}

/** The signed-in user for this request, or null (no cookie, unknown/expired session, or deactivated user). */
export async function currentUser(req: Request): Promise<AuthUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      cmuEmail: users.cmuEmail,
      role: users.role,
      unitId: users.unitId,
      unitName: organizationUnits.name,
      expiresAt: sessions.expiresAt,
      method: sessions.method,
    })
    .from(sessions)
    .innerJoin(users, and(eq(users.id, sessions.userId), eq(users.active, 1)))
    .leftJoin(organizationUnits, eq(organizationUnits.id, users.unitId))
    .where(eq(sessions.id, sha256(token)))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  const { expiresAt: _expiresAt, method, ...user } = row;
  const loginMethod: LoginMethod = method === "cmu" ? "cmu" : "local";
  const seesAllUnits = user.role === "super_admin" || (user.role === "technician" && loginMethod === "local");
  return { ...user, loginMethod, seesAllUnits };
}

// When each session was last pushed forward (in memory), so a busy user costs one small update a few hours, not one per request.
const lastRefresh = new Map<string, number>();
const REFRESH_EVERY_MS = 6 * HOUR;

/**
 * Sliding expiry for persistent sessions: if the person is using the site, move the end of the session (and the cookie) a full
 * year ahead; if they stop, it ends a year after their last visit. Browser-session logins (12 hours) are never extended.
 */
export async function refreshSession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return;
  const id = sha256(token);
  const now = Date.now();
  if (now - (lastRefresh.get(id) ?? 0) < REFRESH_EVERY_MS) return;
  lastRefresh.set(id, now);
  if (lastRefresh.size > 5000) for (const [k, t] of lastRefresh) if (now - t > REFRESH_EVERY_MS) lastRefresh.delete(k);
  // only a persistent session (more than a day left) that has not been pushed forward for a while
  const [done] = (await db.execute(
    sql`UPDATE sessions SET expires_at = ${new Date(now + REMEMBER_TTL)} WHERE id = ${id} AND expires_at > ${new Date(now + 24 * HOUR)} AND expires_at < ${new Date(now + REMEMBER_TTL - HOUR)}`,
  )) as unknown as [{ affectedRows: number }];
  if (done.affectedRows > 0) setCookie(res, SESSION_COOKIE, token, { maxAgeMs: REMEMBER_TTL });
}

/** Remove every session of a user (used when a user is deactivated or their password changes). */
export async function revokeUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
