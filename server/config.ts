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
  // Public base URL of the site (https://equiplog.ddns.net). Used for the OAuth redirect URI and the CSRF origin check.
  // Empty in production = derive it from the request.
  publicUrl: (process.env.SITE_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000")).replace(/\/+$/, ""),
  // First Super Admin(s). CMU emails (comma separated) are promoted on CMU login; a local account is created at startup if missing.
  bootstrap: {
    cmuEmails: (process.env.BOOTSTRAP_ADMIN_CMU_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || "",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  },
  // CMU Account OAuth. Disabled until CMU_OAUTH_CLIENT_ID/SECRET are set. The endpoints must be confirmed against the
  // registration CMU gives you, so every one of them can be overridden.
  cmuOAuth: {
    clientId: process.env.CMU_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.CMU_OAUTH_CLIENT_SECRET || "",
    authorizeUrl: process.env.CMU_OAUTH_AUTHORIZE_URL || "https://oauth.cmu.ac.th/v1/Authorize.aspx",
    tokenUrl: process.env.CMU_OAUTH_TOKEN_URL || "https://oauth.cmu.ac.th/v1/GetToken.aspx",
    userInfoUrl: process.env.CMU_OAUTH_USERINFO_URL || "https://misapi.cmu.ac.th/cmuitaccount/v1/api/cmuitaccount/basicinfo",
    scope: process.env.CMU_OAUTH_SCOPE || "cmuitaccount.basicinfo",
    emailField: process.env.CMU_OAUTH_EMAIL_FIELD || "cmuitaccount",
    // Fields of the account info that hold the person's faculty/office name; used to pick their unit on first sign-in
    orgFields: (process.env.CMU_OAUTH_ORG_FIELDS || "organization_name_TH,organization_name_EN").split(",").map((f) => f.trim()).filter(Boolean),
  },
  // Where uploaded photos are stored (files on disk, not in the database).
  // On the host this MUST be set to a folder OUTSIDE the app folder: the FTP deploy deletes every file in the app folder
  // that is not part of the build, so photos kept there would disappear on the next deploy. Unset in production = uploads off.
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : process.env.NODE_ENV === "production"
      ? ""
      : path.resolve(__dirname, "..", "..", "uploads"),
  migrationsDir: path.resolve(__dirname, "..", "..", "db", "migrations"),
};
