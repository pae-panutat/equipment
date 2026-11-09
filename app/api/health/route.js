import fs from "node:fs";
import path from "node:path";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const startedAt = new Date().toISOString();

function diag() {
  const out = { cwd: process.cwd() };
  try {
    out.buildId = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8");
    const f = path.join(process.cwd(), ".next", "server", "app", "index.html");
    out.indexMtime = fs.statSync(f).mtime.toISOString();
    out.indexHasMarker = fs.readFileSync(f, "utf8").includes("asdfadfas");
  } catch (e) {
    out.diagError = e.message;
  }
  return out;
}

// GET /api/health -> checks the app and the MySQL connection
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: "up", startedAt, ...diag() });
  } catch (err) {
    return Response.json({ ok: false, db: "down", startedAt, error: err.code || err.message, ...diag() }, { status: 500 });
  }
}
