import { ensureBootstrapAdmin } from "./auth/bootstrap";
import { runMigrations } from "./migrate";
import { ensureQrTokens } from "./qr";

/** Everything that must happen before the API accepts requests. */
export async function prepare(): Promise<void> {
  await runMigrations();
  await ensureBootstrapAdmin();
  await ensureQrTokens();
}
