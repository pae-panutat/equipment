import crypto from "node:crypto";
import type { Request } from "express";
import QRCode from "qrcode";
import { eq, isNull } from "drizzle-orm";
import { assets } from "../db/schema";
import { config } from "./config";
import { db } from "./db";
import { QR_LOGO_PNG_BASE64, QR_LOGO_RATIO } from "./qr-logo";

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

/** Brand colour of the QR (same as the site's primary, dark enough to scan reliably). */
const QR_COLOR = "#5644d2";

/**
 * Rounded QR: rounded-square modules, rounded finder eyes, and the CMU Carbon One logo on a white rounded plate in the middle
 * (error correction H leaves room for it). width/height are set because Firefox cannot draw an SVG without them onto a canvas (PNG export).
 */
export function qrSvg(url: string): Promise<string> {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const margin = 2, total = n + margin * 2;
  const bit = (r: number, c: number) => qr.modules.get(r, c) === 1;
  const inEye = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);

  // logo plate: ~26% of the width, centred; modules under it are skipped
  const pw = Math.round(n * 0.26) | 1;
  const plate0 = (n - pw) / 2;
  const underPlate = (r: number, c: number) => r >= plate0 - 0.5 && r < plate0 + pw + 0.5 && c >= plate0 - 0.5 && c < plate0 + pw + 0.5;

  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!bit(r, c) || inEye(r, c) || underPlate(r, c)) continue;
      const x = c + margin + 0.06, y = r + margin + 0.06, w = 0.88, k = 0.26, s = w - 2 * k;
      d += `M${x + k} ${y}h${s}a${k} ${k} 0 0 1 ${k} ${k}v${s}a${k} ${k} 0 0 1 ${-k} ${k}h${-s}a${k} ${k} 0 0 1 ${-k} ${-k}v${-s}a${k} ${k} 0 0 1 ${k} ${-k}z`;
    }

  const eye = (r0: number, c0: number) => {
    const x = c0 + margin, y = r0 + margin;
    return `<path fill-rule="evenodd" d="M${x + 2} ${y}h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zM${x + 2} ${y + 1}a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9"/>`;
  };

  const px = plate0 + margin;
  const logoW = pw * 0.8, logoH = logoW / QR_LOGO_RATIO;
  const href = `data:image/png;base64,${QR_LOGO_PNG_BASE64}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 ${total} ${total}">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<g fill="${QR_COLOR}"><path d="${d}"/>${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}</g>` +
    `<rect x="${px}" y="${px}" width="${pw}" height="${pw}" rx="${pw * 0.2}" fill="#ffffff" stroke="#e6e2f7" stroke-width="0.08"/>` +
    `<image x="${px + (pw - logoW) / 2}" y="${px + (pw - logoH) / 2}" width="${logoW}" height="${logoH}" xlink:href="${href}"/>` +
    `</svg>`;
  return Promise.resolve(svg);
}
