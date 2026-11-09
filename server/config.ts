import path from "node:path";
import dotenv from "dotenv";

// Local development reads .env.local; on the host the values come from DirectAdmin env vars.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local"), quiet: true });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  isProd: process.env.NODE_ENV === "production",
  apiPort: Number(process.env.API_PORT || 4000),
  db: {
    host: process.env.DB_HOST || "localhost",
    user: required("DB_USER"),
    password: process.env.DB_PASSWORD ?? "",
    database: required("DB_NAME"),
  },
  // Shared secret for internal endpoints called by the deploy pipeline
  restartToken: process.env.RESTART_TOKEN || "",
  // Business endpoints have no login yet: closed in production unless this is set (never set it on a real deployment)
  allowUnauthenticatedDemo: process.env.ALLOW_DEMO_DATA === "true",
  migrationsDir: path.resolve(__dirname, "..", "..", "db", "migrations"),
};
