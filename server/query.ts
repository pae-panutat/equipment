import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ASSET_STATUSES, type AuthUser } from "../shared";
import { db } from "./db";

/** Run raw SQL and return the rows as plain objects. */
export async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as [T[]])[0];
}

const int = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Filters shared by the dashboard and the asset list, so cards and rows always use the same scope. */
export const scopeQuery = z.object({
  unitId: int.optional(),
  typeId: int.optional(),
  status: z.enum(ASSET_STATUSES).optional(),
});
export type Scope = z.infer<typeof scopeQuery>;

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// The unit and location trees are tiny and change only when a Super Admin edits master data, yet almost every request reads
// them. Keep them in memory for a short time (and drop them on every master-data change) instead of querying each time.
const TREE_TTL_MS = 30_000;
type Node = { id: number; parent_id: number | null };
type LocNode = Node & { name: string };

function memo<T>(load: () => Promise<T>) {
  let slot: { at: number; value: Promise<T> } | null = null;
  return {
    get(): Promise<T> {
      if (slot && Date.now() - slot.at < TREE_TTL_MS) return slot.value;
      const mine = { at: Date.now(), value: load() };
      slot = mine;
      mine.value.catch(() => {
        if (slot === mine) slot = null; // never keep a failed load
      });
      return mine.value;
    },
    clear() {
      slot = null;
    },
  };
}

const unitRows = memo(() => rows<Node>(sql`SELECT id, parent_id FROM organization_units`));
const locationRows = memo(() => rows<LocNode>(sql`SELECT id, parent_id, name FROM locations`));
export const allUnits = () => unitRows.get();
export const allLocations = () => locationRows.get();
/** Call after any master-data change so the next request sees it at once. */
export function invalidateTreeCache(): void {
  unitRows.clear();
  locationRows.clear();
}

/** A unit and all of its sub-units. */
export async function unitIdsWithDescendants(unitId: number): Promise<number[]> {
  const all = await allUnits();
  const ids = new Set<number>([unitId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of all) {
      if (u.parent_id !== null && ids.has(u.parent_id) && !ids.has(u.id)) {
        ids.add(u.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** Units the user may see (their own unit and its sub-units). null = no restriction. [] = none. */
export async function allowedUnitIds(user: AuthUser): Promise<number[] | null> {
  if (user.seesAllUnits) return null;
  return user.unitId ? unitIdsWithDescendants(user.unitId) : [];
}

/** WHERE fragment over the `assets` table aliased as `a`. Always limited to what the user is allowed to see. */
export async function assetScope(scope: Scope, user: AuthUser): Promise<SQL> {
  const parts: SQL[] = [sql`1 = 1`];
  let ids = await allowedUnitIds(user);
  if (scope.unitId) {
    const wanted = await unitIdsWithDescendants(scope.unitId);
    ids = ids ? wanted.filter((i) => ids!.includes(i)) : wanted; // a filter can narrow the permission, never widen it
  }
  if (ids) parts.push(ids.length ? sql`a.owner_unit_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`1 = 0`);
  if (scope.typeId) parts.push(sql`a.type_id = ${scope.typeId}`);
  if (scope.status) parts.push(sql`a.status = ${scope.status}`);
  return sql.join(parts, sql` AND `);
}
