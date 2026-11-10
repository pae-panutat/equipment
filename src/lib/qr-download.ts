import { API_PREFIX } from "@shared/index";

export const qrSvgUrl = (assetId: number) => `${API_PREFIX}/assets/${assetId}/qr.svg`;

/** Asset codes can contain characters that are not safe in file names. */
export const safeFileName = (code: string) => code.replace(/[^\w.-]+/g, "_");

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Save a PNG label: the QR with the asset code and name underneath. Drawn on a canvas, so it works in every browser. */
export async function downloadQrPng(asset: { id: number; code: string; name: string }): Promise<void> {
  const img = new Image();
  img.src = qrSvgUrl(asset.id);
  await img.decode();
  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้สร้างรูปภาพไม่ได้");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  const family = getComputedStyle(document.body).fontFamily;
  ctx.font = `700 46px ${family}`;
  ctx.fillText(asset.code, size / 2, size + 50, size - 40);
  ctx.font = `400 28px ${family}`;
  ctx.fillText(asset.name, size / 2, size + 95, size - 40);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("สร้างไฟล์รูปภาพไม่สำเร็จ");
  saveBlob(blob, `${safeFileName(asset.code)}.png`);
}
