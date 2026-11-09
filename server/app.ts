import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { config } from "./config";
import { dataRouter } from "./routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const api = express.Router();

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

  api.use(dataRouter);

  api.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  app.use("/api/v1", api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
  });

  return app;
}
