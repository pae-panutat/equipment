import { sql } from "drizzle-orm";
import type { AuthUser } from "../shared";
import { auditLog } from "../db/schema";
import { db } from "./db";
import { rows } from "./query";

export type Changes = Record<string, [unknown, unknown]>;

type Entry = {
  entity: "asset" | "work_order" | "plan" | "photo" | "import";
  entityId?: number | null;
  assetId?: number | null;
  action: "create" | "update" | "delete";
  summary: string;
  changes?: Changes;
};

/** Who is shown in the history: the username, or the CMU e-mail / display name for people who signed in with CMU Account. */
const who = (u: AuthUser) => u.username ?? u.cmuEmail ?? u.displayName;

/**
 * Add one line to the edit history. Best effort: a failure to write the history is logged but never blocks the change the
 * person just made (the change itself has already been saved).
 */
export async function audit(user: AuthUser, e: Entry): Promise<void> {
  try {
    const changes = e.changes && Object.keys(e.changes).length > 0 ? await readable(e.changes) : null;
    await db.insert(auditLog).values({
      userId: user.id,
      username: who(user).slice(0, 191),
      entity: e.entity,
      entityId: e.entityId ?? null,
      assetId: e.assetId ?? null,
      action: e.action,
      summary: e.summary.slice(0, 255),
      detail: changes ? JSON.stringify(changes) : null,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}

const snakeToCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The fields of `after` (camelCase) that differ from `before` (any case), as { field: [before, after] }. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Changes {
  const was = new Map(Object.entries(before).map(([k, v]) => [snakeToCamel(k), v]));
  const out: Changes = {};
  for (const [k, now] of Object.entries(after)) {
    if (now === undefined) continue;
    const old = was.get(k) ?? null;
    const a = old instanceof Date ? old.toISOString().slice(0, 10) : old;
    if (String(a ?? "") !== String(now ?? "")) out[k] = [a, now ?? null];
  }
  return out;
}

// Ids are turned into names so the history reads "ประเภท: Pump → Chiller" instead of "typeId: 3 → 2".
const LOOKUP: Record<string, string> = { typeId: "asset_types", ownerUnitId: "organization_units", locationId: "locations" };

async function readable(changes: Changes): Promise<Changes> {
  const out: Changes = {};
  for (const [k, [a, b]] of Object.entries(changes)) {
    const table = LOOKUP[k];
    if (!table) {
      out[k] = [a, b];
      continue;
    }
    const names = async (v: unknown) => {
      if (v === null || v === undefined || v === "") return null;
      const [r] = await rows<{ name: string }>(sql`SELECT name FROM ${sql.raw(table)} WHERE id = ${Number(v)}`);
      return r?.name ?? String(v);
    };
    out[k] = [await names(a), await names(b)];
  }
  return out;
}
