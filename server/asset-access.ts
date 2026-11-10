import crypto from "node:crypto";
import type { Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import type { AuthUser } from "../shared";
import { allowedUnitIds, rows } from "./query";

export type AssetRow = { id: number; owner_unit_id: number };

/** Finds one asset and checks the signed-in user may see it. 404 = no such asset, 403 = exists but outside the user's scope. */
export async function authorizedAsset(res: Response, user: AuthUser, where: SQL): Promise<AssetRow | null> {
  const [asset] = await rows<AssetRow>(sql`SELECT a.id, a.owner_unit_id FROM assets a WHERE ${where} LIMIT 1`);
  if (!asset) {
    res.status(404).json({ error: { code: "not_found", message: "ไม่พบอุปกรณ์" } });
    return null;
  }
  const allowed = await allowedUnitIds(user);
  if (allowed && !allowed.includes(asset.owner_unit_id)) {
    res.status(403).json({ error: { code: "forbidden", message: "อุปกรณ์นี้อยู่นอกส่วนงานของคุณ จึงไม่สามารถดูข้อมูลได้" } });
    return null;
  }
  return asset;
}

/**
 * Content version of a record: a hash of the given columns. A form sends back the version it loaded; saving is refused
 * if the columns have changed since (someone else saved first). Content-based, so two saves in one second cannot slip through.
 */
export function contentVersion(row: object, keys: readonly string[]): string {
  return crypto.createHash("sha1").update(JSON.stringify(keys.map((k) => (row as Record<string, unknown>)[k] ?? null))).digest("hex");
}
