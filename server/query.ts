import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ASSET_STATUSES } from "../shared";
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

/** A unit filter also matches its sub-units (this is a filter, not a permission rule). */
export async function unitIdsWithDescendants(unitId: number): Promise<number[]> {
  const all = await rows<{ id: number; parent_id: number | null }>(sql`SELECT id, parent_id FROM organization_units`);
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

/** WHERE fragment over the `assets` table aliased as `a`. */
export async function assetScope(scope: Scope): Promise<SQL> {
  const parts: SQL[] = [sql`1 = 1`];
  if (scope.unitId) {
    const ids = await unitIdsWithDescendants(scope.unitId);
    parts.push(sql`a.owner_unit_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (scope.typeId) parts.push(sql`a.type_id = ${scope.typeId}`);
  if (scope.status) parts.push(sql`a.status = ${scope.status}`);
  return sql.join(parts, sql` AND `);
}
