import { runMigrations } from "./migrate";
import { pool } from "./db";

runMigrations()
  .then(() => console.log("Migrations applied"))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
