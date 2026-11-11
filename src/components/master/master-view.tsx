"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { LOCATION_KINDS, LOCATION_KIND_LABEL, type LocationKind, type MasterItem, type MasterKind } from "@shared/index";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ApiError, apiSend } from "@/lib/api";
import { focusField } from "@/lib/focus-field";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { Select } from "@/components/ui/select";

const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";
const btn = "text-sm min-h-9 rounded-xl px-3.5 font-bold disabled:opacity-50";

const TABS: { kind: MasterKind; label: string; noun: string; tree: boolean}[] = [
  { kind: "units", label: "ส่วนงาน", noun: "ส่วนงาน", tree: true },
  { kind: "types", label: "ประเภทอุปกรณ์", noun: "ประเภท", tree: false },
  { kind: "locations", label: "สถานที่", noun: "สถานที่", tree: true },
];

type Flat = MasterItem & { depth: number };

/** Parents first, children indented under them; newest (highest id) first at every level, so a new row is on top. */
function flatten(items: MasterItem[], tree: boolean): Flat[] {
  if (!tree) return items.map((i) => ({ ...i, depth: 0 })).sort((a, b) => b.id - a.id);
  const ids = new Set(items.map((i) => i.id));
  const out: Flat[] = [];
  const walk = (parent: number | null, depth: number) => {
    const kids = items
      .filter((i) => (parent === null ? i.parentId === null || !ids.has(i.parentId) : i.parentId === parent))
      .sort((a, b) => b.id - a.id);
    for (const k of kids) {
      out.push({ ...k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MasterView() {
  const { user } = useAuth();
  const [kind, setKind] = useState<MasterKind>("units");
  const tab = TABS.find((t) => t.kind === kind)!;
  const data = useApi<MasterItem[]>(`/master/${kind}`);
  const [dialog, setDialog] = useState<{ item: MasterItem | null } | null>(null);
  const [deleting, setDeleting] = useState<MasterItem | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const rows = useMemo(() => flatten(data.data ?? [], tab.tree), [data.data, tab.tree]);

  if (user && user.role !== "super_admin") return <ErrorState message="ไม่มีสิทธิ์ใช้งานส่วนนี้" />;

  async function remove(item: MasterItem) {
    setNote(null);
    try {
      await apiSend("DELETE", `/master/${kind}/${item.id}`);
      setNote({ tone: "ok", text: `ลบ "${item.name}" แล้ว` });
      data.reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" });
    }
    setDeleting(null);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">ข้อมูลหลัก</h1>
        <button type="button" onClick={() => setDialog({ item: null })} className="text-sm inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground hover:opacity-90">
          <Plus className="size-5" aria-hidden="true" />
          เพิ่ม{tab.noun}
        </button>
      </div>

      <div role="tablist" aria-label="ประเภทข้อมูลหลัก" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            aria-selected={t.kind === kind}
            onClick={() => (setKind(t.kind), setNote(null))}
            className={`text-sm min-h-9 rounded-xl border px-3.5 font-bold ${t.kind === kind ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {note && (
        <p role="status" className={`rounded-xl px-3 py-2.5 text-sm ${note.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
          {note.text}
        </p>
      )}

      <Card>
        {data.loading && !data.data ? (
          <Skeleton className="h-40" />
        ) : data.error ? (
          <ErrorState message={data.error} onRetry={data.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title={`ยังไม่มี${tab.noun}`} hint={`กด "เพิ่ม${tab.noun}" เพื่อเริ่มต้น`} />
        ) : (
          <>
          {/* phone: one card per row (the table is for tablet and wider) */}
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4" style={{ marginLeft: r.depth * 14 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words font-bold leading-snug">
                      {r.depth > 0 && <span aria-hidden="true" className="mr-1 text-muted-foreground">└</span>}
                      {r.name}
                    </div>
                    <div className="mt-0.5 break-all text-sm text-muted-foreground">
                      {r.code}
                      {kind === "locations" && <> · {LOCATION_KIND_LABEL[r.kind as LocationKind] ?? r.kind}</>}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">อุปกรณ์ {r.assetCount} รายการ</div>
                  </div>
                  <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => setDialog({ item: r })}
                      aria-label={`แก้ไข ${r.name}`}
                      title="แก้ไข"
                      className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-[18px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(r)}
                      aria-label={`ลบ ${r.name}`}
                      title="ลบ"
                      className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-bad-soft hover:text-bad"
                    >
                      <Trash2 className="size-[18px]" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-normal">ชื่อ</th>
                  <th className="py-2 pr-3 font-normal">รหัส</th>
                  {kind === "locations" && <th className="py-2 pr-3 font-normal">ชนิด</th>}
                  <th className="py-2 pr-3 font-normal">อุปกรณ์</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-middle">
                    <td className="py-2 pr-3 font-bold" style={{ paddingLeft: r.depth * 20 }}>
                      {r.depth > 0 && <span aria-hidden="true" className="mr-1 text-muted-foreground">└</span>}
                      {r.name}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.code}</td>
                    {kind === "locations" && <td className="py-2 pr-3">{LOCATION_KIND_LABEL[r.kind as LocationKind] ?? r.kind}</td>}
                    <td className="py-2 pr-3">{r.assetCount}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDialog({ item: r })}
                          aria-label={`แก้ไข ${r.name}`}
                          title="แก้ไข"
                          className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-[18px]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(r)}
                          aria-label={`ลบ ${r.name}`}
                          title="ลบ"
                          className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-bad-soft hover:text-bad"
                        >
                          <Trash2 className="size-[18px]" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {deleting && (
        <Modal title={`ลบ${tab.noun}`} onClose={() => setDeleting(null)}>
          <div className="grid gap-4 px-5 py-4 sm:px-6">
            <p className="text-[15px]">
              ต้องการลบ <b>{deleting.name}</b> ({deleting.code}) ถาวรหรือไม่? การลบ<b>กู้คืนไม่ได้</b>
            </p>
            <p className="text-sm text-muted-foreground">ลบได้เฉพาะรายการที่ไม่มีอุปกรณ์ ผู้ใช้ หรือรายการย่อยอ้างอิงอยู่ (ถ้ายังมี ระบบจะแจ้งและไม่ลบ)</p>
            <div className="flex justify-end gap-3 border-t border-border pt-3">
              <button type="button" data-autofocus onClick={() => setDeleting(null)} className={`${btn} border border-border hover:bg-muted`}>
                ยกเลิก
              </button>
              <button type="button" onClick={() => void remove(deleting)} className={`${btn} bg-bad text-white`}>
                ลบถาวร
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog && (
        <MasterDialog
          key={`${kind}-${dialog.item?.id ?? "new"}`}
          kind={kind}
          tab={tab}
          item={dialog.item}
          all={data.data ?? []}
          onClose={(done) => {
            setDialog(null);
            if (done) {
              setNote({ tone: "ok", text: done });
              data.reload();
            }
          }}
        />
      )}
    </div>
  );
}

function MasterDialog({
  kind, tab, item, all, onClose,
}: {
  kind: MasterKind; tab: (typeof TABS)[number]; item: MasterItem | null; all: MasterItem[]; onClose: (doneMessage: string | null) => void;
}) {
  const editing = item !== null;
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [parentId, setParentId] = useState<string>(item?.parentId ? String(item.parentId) : "");
  const [locKind, setLocKind] = useState<string>(item?.kind ?? "building");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Possible parents: active rows, except the row itself and everything below it.
  const parents = useMemo(() => {
    const blocked = new Set<number>();
    if (item) {
      blocked.add(item.id);
      for (let grew = true; grew; ) {
        grew = false;
        for (const r of all) if (r.parentId !== null && blocked.has(r.parentId) && !blocked.has(r.id)) (blocked.add(r.id), (grew = true));
      }
    }
    return flatten(all.filter((r) => !blocked.has(r.id)), true);
  }, [all, item]);

  const dirty = editing ? name.trim() !== item.name || parentId !== (item.parentId ? String(item.parentId) : "") || locKind !== (item.kind ?? "building") : code !== "" || name !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // show the message and take the person to the field that needs fixing
    if (!editing && !code.trim()) {
      setError("กรุณากรอกรหัส");
      focusField("code");
      return;
    }
    if (!name.trim()) {
      setError("กรุณากรอกชื่อ");
      focusField("name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pid = parentId ? Number(parentId) : null;
      if (editing) {
        const body: Record<string, unknown> = {};
        if (name.trim() !== item.name) body.name = name.trim();
        if (tab.tree && pid !== item.parentId) body.parentId = pid;
        if (kind === "locations" && locKind !== item.kind) body.kind = locKind;
        if (Object.keys(body).length > 0) await apiSend("PATCH", `/master/${kind}/${item.id}`, body);
        onClose(`บันทึก "${name.trim()}" เรียบร้อยแล้ว`);
      } else {
        const body: Record<string, unknown> = { code: code.trim(), name: name.trim() };
        if (tab.tree) body.parentId = pid;
        if (kind === "locations") body.kind = locKind;
        await apiSend("POST", `/master/${kind}`, body);
        onClose(`เพิ่ม "${name.trim()}" เรียบร้อยแล้ว`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      if (!editing && err instanceof ApiError && err.status === 409) focusField("code"); // the code is already taken
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `แก้ไข${tab.noun}` : `เพิ่ม${tab.noun}`} onClose={() => onClose(null)} canDismiss={!dirty}>
      <form onSubmit={submit} className="grid gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        <label data-field="code" className="grid gap-1 text-[13px] text-muted-foreground">
          รหัส *
          <input className={field} value={code} maxLength={32} disabled={editing} onChange={(e) => (setCode(e.target.value), setError(null))} data-autofocus={editing ? undefined : ""} />
        </label>
        <label data-field="name" className="grid gap-1 text-[13px] text-muted-foreground">
          ชื่อ *
          <input className={field} value={name} maxLength={191} onChange={(e) => (setName(e.target.value), setError(null))} data-autofocus={editing ? "" : undefined} />
        </label>
        {kind === "locations" && (
          <label className="grid gap-1 text-[13px] text-muted-foreground">
            ชนิด
            <Select className={field} value={locKind} onChange={(e) => setLocKind(e.target.value)}>
              {LOCATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LOCATION_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {tab.tree && (
          <label className="grid gap-1 text-[13px] text-muted-foreground">
            อยู่ภายใต้
            <Select className={field} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— ระดับบนสุด —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {"— ".repeat(p.depth)}
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-border pt-3">
          <button type="button" onClick={() => onClose(null)} className={`${btn} border border-border hover:bg-muted`}>
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || (editing && !dirty)} className={`${btn} bg-primary text-primary-foreground`}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
