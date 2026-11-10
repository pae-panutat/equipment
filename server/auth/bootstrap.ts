import { eq } from "drizzle-orm";
import { users } from "../../db/schema";
import { PASSWORD_MIN_LENGTH } from "../../shared";
import { config } from "../config";
import { db } from "../db";
import { hashPassword } from "./password";

/** Create the first local Super Admin from environment variables, once. A CMU admin is promoted at CMU login instead. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const { username, password } = config.bootstrap;
  if (!username || !password) return;
  if (password.length < PASSWORD_MIN_LENGTH) {
    console.warn(`BOOTSTRAP_ADMIN_PASSWORD is shorter than ${PASSWORD_MIN_LENGTH} characters; bootstrap admin not created`);
    return;
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing) return;
  await db.insert(users).values({ username, passwordHash: await hashPassword(password), displayName: "ผู้ดูแลระบบ", role: "super_admin" });
  console.log(`Created bootstrap Super Admin "${username}". Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.`);
}
