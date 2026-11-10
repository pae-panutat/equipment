"use client";

import { useRef, useState } from "react";
import { Camera, Maximize2, Trash2 } from "lucide-react";
import { API_PREFIX, type AssetImage } from "@shared/index";
import { Modal } from "@/components/ui/modal";
import { Card, CardTitle } from "@/components/ui/card";
import { apiSend } from "@/lib/api";
import { PHOTO_ACCEPT, prepareImage } from "@/lib/image-resize";

const src = (assetId: number, imageId: number) => `${API_PREFIX}/assets/${assetId}/images/${imageId}`;
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 hover:bg-muted disabled:opacity-50";

/**
 * The photo of an asset (one photo, at most 1 MB, JPG/JPEG/PNG). Everyone who can see the asset can look at it;
 * only a Super Admin or Technician (canEdit) can add, replace or delete it. The browser shrinks the photo before it is uploaded.
 */
export function AssetPhotos({ assetId, images, canEdit, onChanged }: { assetId: number; images: AssetImage[]; canEdit: boolean; onChanged: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [large, setLarge] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = images[0] ?? null;

  if (!canEdit && !photo) return null; // nothing to show, nothing to add

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setWorking("กำลังย่อและอัปโหลดรูป...");
    try {
      // an existing photo is swapped only after the new one is saved (replace), so a failed upload never loses the old photo
      await apiSend("POST", `/assets/${assetId}/images`, { ...(await prepareImage(file)), replace: photo !== null });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setWorking(null);
      if (picker.current) picker.current.value = ""; // allow picking the same file again
    }
  }

  async function remove() {
    if (!photo) return;
    setError(null);
    setWorking("กำลังลบรูป...");
    try {
      await apiSend("DELETE", `/assets/${assetId}/images/${photo.id}`);
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Card className="print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>
          รูปอุปกรณ์ <span className="text-sm font-normal text-muted-foreground">({photo ? 1 : 0}/1)</span>
        </CardTitle>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={picker} type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => void upload(e.target.files)} />
            <button type="button" disabled={working !== null} onClick={() => picker.current?.click()} className={btn}>
              <Camera className="size-4" aria-hidden="true" />
              {photo ? "เปลี่ยนรูป" : "เพิ่มรูป"}
            </button>
            {photo && (
              <button type="button" disabled={working !== null} onClick={() => (setError(null), setConfirmDelete(true))} className={`${btn} text-bad`}>
                <Trash2 className="size-4" aria-hidden="true" />
                ลบรูป
              </button>
            )}
          </div>
        )}
      </div>

      {working && (
        <p role="status" className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-sm">
          {working}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
          {error}
        </p>
      )}

      {photo ? (
        <button type="button" onClick={() => setLarge(true)} aria-label="ดูรูปขนาดใหญ่" className="group relative mt-3 block max-w-full overflow-hidden rounded-2xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(assetId, photo.id)} alt="รูปอุปกรณ์" className="max-h-72 w-auto max-w-full object-contain" />
          <span className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-black/55 text-white opacity-90" aria-hidden="true">
            <Maximize2 className="size-4" />
          </span>
        </button>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          ยังไม่มีรูป กด &quot;เพิ่มรูป&quot; เพื่อถ่ายหรือเลือกรูปอุปกรณ์ (JPG, JPEG หรือ PNG ไฟล์ที่เก็บไม่เกิน 1 MB, 1 รูปต่ออุปกรณ์)
        </p>
      )}

      {confirmDelete && photo && (
        <Modal title="ลบรูปอุปกรณ์" onClose={() => setConfirmDelete(false)} canDismiss={working === null}>
          <div className="grid gap-4 px-5 py-4 sm:px-6">
            <p className="text-[15px]">
              ต้องการลบรูปนี้ถาวรหรือไม่? การลบ<b>กู้คืนไม่ได้</b>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(assetId, photo.id)} alt="รูปที่จะลบ" className="max-h-48 w-auto max-w-full justify-self-center rounded-lg object-contain" />
            {error && (
              <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3 border-t border-border pt-3">
              <button type="button" data-autofocus disabled={working !== null} onClick={() => setConfirmDelete(false)} className={btn}>
                ยกเลิก
              </button>
              <button type="button" disabled={working !== null} onClick={() => void remove()} className="min-h-11 rounded-xl bg-bad px-4 font-bold text-white disabled:opacity-50">
                {working ? "กำลังลบ..." : "ลบถาวร"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {large && photo && (
        <Modal title="รูปอุปกรณ์" onClose={() => setLarge(false)} className="max-w-[960px]">
          <div className="grid min-h-0 place-items-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(assetId, photo.id)} alt="รูปอุปกรณ์" className="max-h-[68dvh] w-auto max-w-full rounded-lg object-contain" />
          </div>
          <div className="flex shrink-0 justify-end border-t border-border px-4 py-3 sm:px-6">
            <button type="button" data-autofocus onClick={() => setLarge(false)} className={btn}>
              ปิด
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
