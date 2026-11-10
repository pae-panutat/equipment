import crypto from "node:crypto";
import type { Request } from "express";
import QRCode from "qrcode";
import { eq, isNull } from "drizzle-orm";
import { assets } from "../db/schema";
import { config } from "./config";
import { db } from "./db";

export const newQrToken = () => crypto.randomBytes(16).toString("hex"); // 128 bits

/** Give every asset that has no QR token one. Runs at startup (and after seeding), so assets created by any path get one. */
export async function ensureQrTokens(): Promise<number> {
  const missing = await db.select({ id: assets.id }).from(assets).where(isNull(assets.qrToken));
  for (const a of missing) await db.update(assets).set({ qrToken: newQrToken() }).where(eq(assets.id, a.id));
  if (missing.length) console.log(`Assigned QR tokens to ${missing.length} asset(s)`);
  return missing.length;
}

/** The address a scan opens. Uses SITE_URL; without it, the address the request came in on. */
export function scanUrl(req: Request, token: string): string {
  return `${config.publicUrl || `${req.protocol}://${req.get("host")}`}/q/${token}`;
}

/** Black on white regardless of the site theme, with a quiet zone, so printed labels scan reliably. width/height are set because Firefox cannot draw an SVG without them onto a canvas (PNG export). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", width: 512, errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
}
