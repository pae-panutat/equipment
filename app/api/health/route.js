import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/health -> checks the app and the MySQL connection
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    return Response.json({ ok: false, db: "down", error: err.code || err.message }, { status: 500 });
  }
}
