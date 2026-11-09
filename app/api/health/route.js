import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const startedAt = new Date().toISOString();

// GET /api/health -> checks the app and the MySQL connection
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: "up", startedAt });
  } catch (err) {
    return Response.json({ ok: false, db: "down", startedAt, error: err.code || err.message }, { status: 500 });
  }
}
