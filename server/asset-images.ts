import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assetImages } from "../db/schema";
import { ASSET_EDIT_ROLES, IMAGE_MAX_BYTES, MAX_IMAGES_PER_ASSET, THUMB_MAX_BYTES } from "../shared";
import { requireRole } from "./auth/guard";
import { authorizedAsset } from "./asset-access";
import { config } from "./config";
import { db } from "./db";
import { rows } from "./query";

// Photos of an asset. The browser shrinks each photo (and makes a small thumbnail) before sending it as base64 JSON, so the
// server needs no image library. Files live under UPLOAD_DIR/assets/<assetId>/ with random names; the database row keeps the rest.
// Viewing follows the same login + unit scope as the asset itself; only a Super Admin or Technician may add or delete photos.
export const assetImagesRouter = Router();
const idParam = z.coerce.number().int().positive();
const NAME = /^[a-f0-9]{32}(_t)?\.(jpg|png)$/; // the only file names we ever read back

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

const notConfigured = (res: Response) =>
  fail(res, 503, "uploads_not_configured", "ยังไม่ได้ตั้งค่าที่เก็บรูปภาพบนเซิร์ฟเวอร์ (UPLOAD_DIR)");

/** What the bytes really are, from their first bytes (the declared type and the file name are never trusted). */
function detect(buf: Buffer): { type: string; ext: "jpg" | "png" } | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  return null;
}

const dimension = z.number().int().min(1).max(20000);
// replace = true swaps the existing photo for this one (the old one is removed only after the new one is saved)
const uploadBody = z.object({ image: z.string().min(1), thumb: z.string().min(1), width: dimension, height: dimension, replace: z.boolean().optional() }).strict();

class TooMany extends Error {}

const dirOf = (assetId: number) => path.join(config.uploadDir, "assets", String(assetId));

assetImagesRouter.post("/assets/:id/images", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  if (!config.uploadDir) return notConfigured(res);
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return fail(res, 404, "not_found", "ไม่พบอุปกรณ์");
  const parsed = uploadBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "validation_error", "ข้อมูลรูปภาพไม่ถูกต้อง");
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;

  const image = Buffer.from(parsed.data.image, "base64");
  const thumb = Buffer.from(parsed.data.thumb, "base64");
  if (image.length > IMAGE_MAX_BYTES) return fail(res, 413, "too_large", "ไฟล์รูปต้องไม่เกิน 1 MB");
  if (thumb.length > THUMB_MAX_BYTES) return fail(res, 413, "too_large", "รูปย่อใหญ่เกินไป");
  const imageType = detect(image);
  const thumbType = detect(thumb);
  if (!imageType || !thumbType) return fail(res, 400, "bad_image", "รองรับเฉพาะไฟล์ JPG, JPEG หรือ PNG");

  const base = crypto.randomBytes(16).toString("hex");
  const fileName = `${base}.${imageType.ext}`;
  const thumbName = `${base}_t.${thumbType.ext}`;
  const dir = dirOf(asset.id);
  const removeNew = () => Promise.all([fs.rm(path.join(dir, fileName), { force: true }), fs.rm(path.join(dir, thumbName), { force: true })]);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), image, { flag: "wx" });
  try {
    await fs.writeFile(path.join(dir, thumbName), thumb, { flag: "wx" });
    // The asset row is locked while the photos are counted and the new one is saved, so two uploads at once cannot both get in.
    const saved = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM assets WHERE id = ${asset.id} FOR UPDATE`);
      const existing = await tx.select().from(assetImages).where(eq(assetImages.assetId, asset.id));
      if (existing.length >= MAX_IMAGES_PER_ASSET && !parsed.data.replace) throw new TooMany();
      const [row] = await tx
        .insert(assetImages)
        .values({
          assetId: asset.id, fileName, thumbName, contentType: imageType.type, sizeBytes: image.length,
          width: parsed.data.width, height: parsed.data.height, createdBy: req.user!.id,
        })
        .$returningId();
      if (existing.length) await tx.delete(assetImages).where(inArray(assetImages.id, existing.map((e) => e.id)));
      return { id: row.id, replaced: existing };
    });
    // the old photo's files go only after the new one is safely stored
    for (const old of saved.replaced) for (const name of [old.fileName, old.thumbName]) if (NAME.test(name)) await fs.rm(path.join(dir, name), { force: true });
    res.status(201).json({ id: saved.id });
  } catch (err) {
    await removeNew(); // never leave orphan files behind
    if (err instanceof TooMany) return fail(res, 400, "too_many", `อุปกรณ์หนึ่งชิ้นมีรูปได้ ${MAX_IMAGES_PER_ASSET} รูป — กด "เปลี่ยนรูป" หรือลบรูปเดิมก่อน`);
    throw err;
  }
});

async function findImage(assetId: number, imageId: number) {
  const [row] = await db.select().from(assetImages).where(and(eq(assetImages.id, imageId), eq(assetImages.assetId, assetId))).limit(1);
  return row ?? null;
}

assetImagesRouter.get("/assets/:id/images/:imageId", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const imageId = idParam.safeParse(req.params.imageId);
  if (!id.success || !imageId.success || !config.uploadDir) return fail(res, 404, "not_found", "ไม่พบรูปภาพ");
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;
  const row = await findImage(asset.id, imageId.data);
  if (!row) return fail(res, 404, "not_found", "ไม่พบรูปภาพ");
  const name = req.query.size === "thumb" ? row.thumbName : row.fileName;
  if (!NAME.test(name)) return fail(res, 404, "not_found", "ไม่พบรูปภาพ");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-cache"); // the browser may keep it but must ask first, so the login and unit check run on every view (a 304 when unchanged)
  res.sendFile(path.join(dirOf(asset.id), name), (err) => {
    if (err && !res.headersSent) fail(res, 404, "not_found", "ไม่พบไฟล์รูปภาพ");
  });
});

assetImagesRouter.delete("/assets/:id/images/:imageId", requireRole(...ASSET_EDIT_ROLES), async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const imageId = idParam.safeParse(req.params.imageId);
  if (!id.success || !imageId.success) return fail(res, 404, "not_found", "ไม่พบรูปภาพ");
  const asset = await authorizedAsset(res, req.user!, sql`a.id = ${id.data}`);
  if (!asset) return;
  const row = await findImage(asset.id, imageId.data);
  if (!row) return fail(res, 404, "not_found", "ไม่พบรูปภาพ");
  await db.delete(assetImages).where(eq(assetImages.id, row.id));
  if (config.uploadDir) {
    for (const name of [row.fileName, row.thumbName]) if (NAME.test(name)) await fs.rm(path.join(dirOf(asset.id), name), { force: true });
  }
  res.json({ ok: true });
});
