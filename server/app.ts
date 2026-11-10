import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { config } from "./config";
import { authRouter } from "./auth/routes";
import { usersRouter } from "./auth/users-routes";
import { checkOrigin, requireAuth } from "./auth/guard";
import { dataRouter } from "./routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Apache/Passenger sits in front on the host (real client IP, https)
  const smallJson = express.json({ limit: "1mb" });
  const photoJson = express.json({ limit: "3mb" }); // base64 of one photo (max 1 MB) + thumbnail
  app.use((req, res, next) => (req.method === "POST" && /^\/api\/v1\/assets\/\d+\/images\/?$/.test(req.path) ? photoJson(req, res, next) : smallJson(req, res, next)));
  app.use("/api/v1", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const api = express.Router();
  api.use(checkOrigin);

  api.get("/health", async (_req, res) => {
    try {
      const result = await db.execute(sql`SELECT VERSION() AS version`);
      const version = (result as unknown as [{ version: string }[]])[0]?.[0]?.version;
      res.json({ ok: true, db: "up", dbVersion: version });
    } catch (err) {
      console.error("health check failed", err);
      res.status(500).json({ ok: false, db: "down" });
    }
  });

  // Called by the deploy pipeline. Exits so Passenger starts a fresh process.
  api.post("/internal/restart", (req, res) => {
    const given = Buffer.from(String(req.header("x-restart-token") ?? ""));
    const expected = Buffer.from(config.restartToken);
    if (!expected.length || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      res.status(403).json({ error: { code: "forbidden", message: "Forbidden" } });
      return;
    }
    res.json({ ok: true, restarting: true });
    setTimeout(() => process.exit(0), 500);
  });

  api.use("/auth", authRouter);
  api.use("/users", requireAuth, usersRouter);
  api.use(requireAuth, dataRouter);

  api.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  app.use("/api/v1", api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // a client mistake (bad JSON, body too large) is a 4xx, not a server error
    const status = (err as { status?: number })?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: { code: status === 413 ? "too_large" : "bad_request", message: status === 413 ? "ข้อมูลที่ส่งมาใหญ่เกินไป" : "คำขอไม่ถูกต้อง" } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
  });

  return app;
}
