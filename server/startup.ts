import { sql } from "drizzle-orm";
import { ensureBootstrapAdmin } from "./auth/bootstrap";
import { db } from "./db";
import { runMigrations } from "./migrate";
import { ensureQrTokens } from "./qr";

/**
 * Make every asset's status agree with its jobs (same rule as autoAssetStatus in shared/index.ts), for data that was
 * written before the rule existed or imported by hand. Safe to run any number of times: it only touches contradictions.
 */
export async function reconcileAssetStatuses(): Promise<number> {
  const running = await db.execute(sql`
    UPDATE assets a SET a.status = 'under_repair'
    WHERE a.status IN ('active', 'faulty') AND EXISTS (SELECT 1 FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'in_progress')`);
  const idle = await db.execute(sql`
    UPDATE assets a SET a.status = 'active'
    WHERE a.status = 'under_repair' AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'in_progress')`);
  const changed = [running, idle].reduce((n, r) => n + Number((r as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0), 0);
  if (changed) console.log(`Corrected the status of ${changed} asset(s) to agree with their jobs`);
  return changed;
}

/** Everything that must happen before the API accepts requests. */
export async function prepare(): Promise<void> {
  await runMigrations();
  await ensureBootstrapAdmin();
  await ensureQrTokens();
  await reconcileAssetStatuses();
}
