import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "./db";
import { config } from "./config";

const LOCK = "equiplog_migrate";

/** Apply pending migrations. A DB-level lock keeps concurrent Passenger workers from racing. */
export async function runMigrations(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SELECT GET_LOCK(?, 60) AS got", [LOCK]);
    if ((rows as { got: number }[])[0]?.got !== 1) throw new Error("Could not acquire migration lock");
    await migrate(db, { migrationsFolder: config.migrationsDir });
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [LOCK]).catch(() => undefined);
    conn.release();
  }
}
