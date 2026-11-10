import { IMAGE_MAX_BYTES, THUMB_MAX_BYTES } from "@shared/index";

export type PreparedImage = { image: string; thumb: string; width: number; height: number };

/** The file picker only offers these; the check below is the real rule (a user can still pick "all files"). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
const MAX_PICKED_BYTES = 25 * 1024 * 1024; // the original may be large (a phone photo): it is shrunk to fit IMAGE_MAX_BYTES (1 MB)

/** Only JPG, JPEG and PNG files. A file name's extension and the reported type must both agree with that (a phone may report no type). */
export function checkPhotoFile(file: File): void {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const extOk = ext === undefined || ext === "jpg" || ext === "jpeg" || ext === "png";
  const typeOk = file.type === "image/jpeg" || file.type === "image/png" || (file.type === "" && ext !== undefined);
  if (!extOk || !typeOk) throw new Error("รองรับเฉพาะไฟล์ JPG, JPEG หรือ PNG เท่านั้น");
  if (file.size > MAX_PICKED_BYTES) throw new Error("ไฟล์ใหญ่เกินไป (เลือกไฟล์ที่เล็กกว่า 25 MB)");
}

const FULL_SIDE = 1600; // longest side of the stored photo
const THUMB_SIDE = 400; // longest side of the thumbnail

type Source = { bitmap: CanvasImageSource; width: number; height: number; close: () => void };

/** Decode a picked file. The camera's rotation (EXIF) is applied so photos taken on a phone are not sideways. */
async function decode(file: File): Promise<Source> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { bitmap: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    /* older browsers: fall back to an <img> element, which applies the rotation itself */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } catch {
    throw new Error("เปิดรูปนี้ไม่ได้ (รองรับ JPG, PNG, WebP — รูปแบบ HEIC ให้บันทึกเป็น JPG ก่อน)");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src: Source, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height)); // never enlarge
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปภาพไม่ได้");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white instead of black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src.bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("สร้างไฟล์รูปไม่สำเร็จ"))), "image/jpeg", quality),
  );
}

/** Shrink until the file fits the limit: lower the quality first, then the size. */
async function fit(src: Source, side: number, quality: number, limit: number) {
  let s = side;
  let q = quality;
  for (let i = 0; i < 8; i++) {
    const out = await render(src, s, q);
    if (out.blob.size <= limit) return out;
    if (q > 0.55) q -= 0.1;
    else s = Math.round(s * 0.75);
  }
  throw new Error("ย่อรูปให้ไม่เกิน 1 MB ไม่ได้ ลองใช้รูปอื่น");
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

/** Turn a picked photo (JPG, JPEG or PNG) into a shrunken JPEG of at most 1 MB and a thumbnail, ready to upload. (Re-encoding also drops GPS and other metadata.) */
export async function prepareImage(file: File): Promise<PreparedImage> {
  checkPhotoFile(file);
  const src = await decode(file);
  try {
    const full = await fit(src, FULL_SIDE, 0.82, IMAGE_MAX_BYTES);
    const thumb = await fit(src, THUMB_SIDE, 0.75, THUMB_MAX_BYTES);
    return { image: await toBase64(full.blob), thumb: await toBase64(thumb.blob), width: full.width, height: full.height };
  } finally {
    src.close();
  }
}
