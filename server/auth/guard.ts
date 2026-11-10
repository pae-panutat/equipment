import type { NextFunction, Request, Response } from "express";
import type { AuthUser, Role } from "../../shared";
import { config } from "../config";
import { currentUser } from "./session";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function httpError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

/** Origins allowed to send state-changing requests (CSRF defence on top of SameSite=Lax cookies). */
function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  set.add(config.publicUrl || `${req.protocol}://${req.get("host")}`);
  if (!config.isProd) set.add("http://localhost:3000");
  return set;
}

export function checkOrigin(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !allowedOrigins(req).has(origin)) return httpError(res, 403, "bad_origin", "คำขอไม่ได้มาจากเว็บไซต์นี้");
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await currentUser(req);
    if (!user) return httpError(res, 401, "unauthenticated", "กรุณาเข้าสู่ระบบ");
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return httpError(res, 403, "forbidden", "ไม่มีสิทธิ์ใช้งานส่วนนี้");
    next();
  };
}
