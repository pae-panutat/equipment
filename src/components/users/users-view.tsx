"use client";

import { useState } from "react";
import { Check, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { PASSWORD_MIN_LENGTH, ROLES, ROLE_LABEL, type FilterOptions, type ManagedUser, type Role } from "@shared/index";
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, apiSend } from "@/lib/api";
import { focusField } from "@/lib/focus-field";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { Select } from "@/components/ui/select";

const field = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-foreground";

type Units = FilterOptions["units"];

function unitOptions(units: Units) {
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const u of units.filter((x) => x.parentId === parent)) {
      out.push({ id: u.id, label: `${"— ".repeat(depth)}${u.name}` });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function UsersView() {
  const { user: me } = useAuth();
  const users = useApi<ManagedUser[]>("/users");
  const filters = useApi<FilterOptions>("/meta/filters");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [statusFor, setStatusFor] = useState<ManagedUser | null>(null); // the user whose status is being chosen
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [adding, setAdding] = useState(false);

  if (me && me.role !== "super_admin") return <ErrorState message="ไม่มีสิทธิ์ใช้งานส่วนนี้" />;

  const units = unitOptions(filters.data?.units ?? []);

  async function patch(id: number, body: Record<string, unknown>) {
    setMessage(null);
    try {
      await apiSend("PATCH", `/users/${id}`, body);
      users.reload();
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
      users.reload(); // put the controls back to what the server has
    }
  }

  async function remove(u: ManagedUser) {
    setMessage(null);
    try {
      await apiSend("DELETE", `/users/${u.id}`);
      setMessage({ tone: "ok", text: `ลบผู้ใช้ ${u.displayName} แล้ว` });
      users.reload();
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" });
    }
    setDeleting(null);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">ผู้ใช้งาน</h1>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground hover:opacity-90"
        >
          <UserPlus className="size-5" aria-hidden="true" />
          เพิ่มผู้ใช้
        </button>
      </div>

      {message && (
        <p role="status" className={`rounded-xl px-3 py-2.5 text-sm ${message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
          {message.text}
        </p>
      )}

      <Card>
        <CardTitle>รายชื่อผู้ใช้</CardTitle>
        <div className="mt-4">
          {users.loading && !users.data ? (
            <Skeleton className="h-40" />
          ) : users.error ? (
            <ErrorState message={users.error} onRetry={users.reload} />
          ) : !users.data?.length ? (
            <EmptyState title="ยังไม่มีผู้ใช้" />
          ) : (
            <>
            {/* phone and tablet: one card per user (the table is for wide screens) */}
            <ul className="grid gap-3 xl:hidden">
              {users.data.map((u) => (
                <li key={u.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words font-bold leading-snug">{u.displayName}</div>
                      <div className="mt-0.5 break-all text-sm text-muted-foreground">{u.username ?? u.cmuEmail}</div>
                      {u.username && u.cmuEmail && <div className="break-all text-sm text-muted-foreground">{u.cmuEmail}</div>}
                    </div>
                    <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => setStatusFor(u)}
                        aria-label={`สถานะของ ${u.displayName}: ${u.active ? "ใช้งานอยู่" : "ปิดการใช้งาน"} (กดเพื่อเปลี่ยน)`}
                        title={u.active ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                        className={`grid size-9 place-items-center rounded-xl hover:bg-muted ${u.active ? "text-ok" : "text-bad"}`}
                      >
                        {u.active ? <UserCheck className="size-5" aria-hidden="true" /> : <UserX className="size-5" aria-hidden="true" />}
                      </button>
                      {u.id !== me?.id ? (
                        <button
                          type="button"
                          onClick={() => setDeleting(u)}
                          aria-label={`ลบผู้ใช้ ${u.displayName}`}
                          title="ลบผู้ใช้"
                          className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-bad-soft hover:text-bad"
                        >
                          <Trash2 className="size-[18px]" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="size-9" aria-hidden="true" /> // keeps the status icon in the same place on every card
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      บทบาท
                      <Select aria-label={`บทบาทของ ${u.displayName}`} className={field} value={u.role} onChange={(e) => void patch(u.id, { role: e.target.value as Role })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      ส่วนงาน
                      <Select
                        aria-label={`ส่วนงานของ ${u.displayName}`}
                        className={field}
                        value={String(u.unitId ?? "")}
                        onChange={(e) => void patch(u.id, { unitId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">{u.role === "super_admin" || (u.role === "technician" && u.username) ? "ทุกส่วนงาน" : "— ยังไม่กำหนด —"}</option>
                        {units.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="text-sm text-muted-foreground">เข้าล่าสุด {u.lastLoginAt ? formatDate(u.lastLoginAt.slice(0, 10)) : "ยังไม่เคย"}</div>
                    {u.username && (
                      <button type="button" onClick={() => setResetting(u)} className="min-h-9 shrink-0 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted">
                        ตั้งรหัสผ่านใหม่
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-normal">ชื่อ</th>
                    <th className="py-2 pr-3 font-normal">บัญชี</th>
                    <th className="py-2 pr-3 font-normal">บทบาท</th>
                    <th className="py-2 pr-3 font-normal">ส่วนงาน</th>
                    <th className="py-2 pr-3 font-normal">เข้าล่าสุด</th>
                    <th className="py-2 font-normal">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id} className="border-t border-border align-middle">
                      <td className="py-2 pr-3 font-bold">{u.displayName}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {u.username && <div>{u.username}</div>}
                        {u.cmuEmail && <div>{u.cmuEmail}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        <Select aria-label={`บทบาทของ ${u.displayName}`} className={field} value={u.role} onChange={(e) => void patch(u.id, { role: e.target.value as Role })}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          aria-label={`ส่วนงานของ ${u.displayName}`}
                          className={field}
                          value={String(u.unitId ?? "")}
                          onChange={(e) => void patch(u.id, { unitId: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">{u.role === "super_admin" || (u.role === "technician" && u.username) ? "ทุกส่วนงาน" : "— ยังไม่กำหนด —"}</option>
                          {units.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{u.lastLoginAt ? formatDate(u.lastLoginAt.slice(0, 10)) : "ยังไม่เคย"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setStatusFor(u)}
                            aria-label={`สถานะของ ${u.displayName}: ${u.active ? "ใช้งานอยู่" : "ปิดการใช้งาน"} (กดเพื่อเปลี่ยน)`}
                            title={u.active ? "ใช้งานอยู่" : "ปิดการใช้งาน"}
                            className={`grid size-9 place-items-center rounded-xl hover:bg-muted ${u.active ? "text-ok" : "text-bad"}`}
                          >
                            {u.active ? <UserCheck className="size-5" aria-hidden="true" /> : <UserX className="size-5" aria-hidden="true" />}
                          </button>
                          {u.username && (
                            <button type="button" onClick={() => setResetting(u)} className="text-sm min-h-9 rounded-xl border border-border px-3 text-muted-foreground hover:bg-muted">
                              ตั้งรหัสผ่านใหม่
                            </button>
                          )}
                          {u.id !== me?.id && (
                            <button
                              type="button"
                              onClick={() => setDeleting(u)}
                              aria-label={`ลบผู้ใช้ ${u.displayName}`}
                              title="ลบผู้ใช้"
                              className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-bad-soft hover:text-bad"
                            >
                              <Trash2 className="size-[18px]" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </Card>

      {deleting && (
        <Modal title="ลบผู้ใช้" onClose={() => setDeleting(null)}>
          <div className="grid gap-4 px-5 py-4 sm:px-6">
            <p className="text-[15px]">
              ต้องการลบผู้ใช้ <b>{deleting.displayName}</b> ({deleting.username ?? deleting.cmuEmail}) ถาวรหรือไม่? การลบ<b>กู้คืนไม่ได้</b>
            </p>
            <p className="text-sm text-muted-foreground">ลบบัญชีนี้ออกจากระบบ ส่วนงานซ่อมบำรุง รูป และข้อมูลที่ผู้ใช้เคยบันทึกจะไม่ถูกลบ (แค่ไม่แสดงชื่อผู้บันทึก)</p>
            <div className="flex justify-end gap-3 border-t border-border pt-3">
              <button type="button" data-autofocus onClick={() => setDeleting(null)} className="text-sm min-h-9 rounded-xl border border-border px-3.5 font-bold hover:bg-muted">
                ยกเลิก
              </button>
              <button type="button" onClick={() => void remove(deleting)} className="text-sm min-h-9 rounded-xl bg-bad px-3.5 font-bold text-white">
                ลบถาวร
              </button>
            </div>
          </div>
        </Modal>
      )}

      {statusFor && (
        <Modal title={`สถานะของ ${statusFor.displayName}`} onClose={() => setStatusFor(null)}>
          <div className="grid gap-3 px-5 py-4 sm:px-6">
            {([
              { active: true, label: "ใช้งานอยู่", hint: "เข้าสู่ระบบและใช้งานได้ตามปกติ", Icon: UserCheck, tone: "text-ok" },
              { active: false, label: "ปิดการใช้งาน", hint: "เข้าสู่ระบบไม่ได้ และจะถูกออกจากระบบทุกเครื่อง", Icon: UserX, tone: "text-bad" },
            ] as const).map((o) => {
              const current = statusFor.active === o.active;
              return (
                <button
                  key={o.label}
                  type="button"
                  data-autofocus={current ? "" : undefined}
                  aria-pressed={current}
                  onClick={() => {
                    const target = statusFor;
                    setStatusFor(null);
                    if (!current) void patch(target.id, { active: o.active });
                  }}
                  className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-left text-sm ${current ? "border-primary bg-muted" : "border-border hover:bg-muted"}`}
                >
                  <o.Icon className={`size-5 shrink-0 ${o.tone}`} aria-hidden="true" />
                  <span className="grid flex-1">
                    <b>{o.label}</b>
                    <span className="text-sm text-muted-foreground">{o.hint}</span>
                  </span>
                  {current && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {adding && (
        <CreateUserDialog
          units={units}
          onClose={(createdName) => {
            setAdding(false);
            if (createdName) {
              setMessage({ tone: "ok", text: `เพิ่มผู้ใช้ ${createdName} เรียบร้อยแล้ว` });
              users.reload();
            }
          }}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={(done) => {
            setResetting(null);
            if (done) {
              setMessage({ tone: "ok", text: `เปลี่ยนรหัสผ่านของ ${resetting.displayName} แล้ว ผู้ใช้ต้องเข้าสู่ระบบใหม่ทุกเครื่อง` });
              users.reload();
            }
          }}
        />
      )}
    </div>
  );
}

/** Add a user who signs in with Username / Password. Opens as a popup over a dimmed, blurred page. */
function CreateUserDialog({ units, onClose }: { units: { id: number; label: string }[]; onClose: (createdName: string | null) => void }) {
  const empty = { username: "", displayName: "", password: "", role: "viewer" as Role, unitId: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(empty); // Esc must not throw away typed data

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", "/users", { ...form, unitId: form.unitId ? Number(form.unitId) : null });
      onClose(form.displayName.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "สร้างผู้ใช้ไม่สำเร็จ";
      setError(message);
      // take the person to the field the server complained about
      if ((err instanceof ApiError && err.status === 409) || message.startsWith("ชื่อผู้ใช้")) focusField("username");
      else if (message.includes("รหัสผ่าน")) focusField("password");
      else if (message.includes("ชื่อ")) focusField("displayName");
      setBusy(false);
    }
  }

  return (
    <Modal title="เพิ่มผู้ใช้ (Username / Password)" onClose={() => onClose(null)} canDismiss={!busy && !dirty} className="max-w-[560px]">
      <form onSubmit={submit} className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2 sm:px-6">
        <label data-field="username" className="grid gap-1 text-[13px] text-muted-foreground">
          ชื่อผู้ใช้ (Username)
          <input data-autofocus className={field} value={form.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </label>
        <label data-field="displayName" className="grid gap-1 text-[13px] text-muted-foreground">
          ชื่อที่แสดง
          <input className={field} value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} required />
        </label>
        <label data-field="password" className="grid gap-1 text-[13px] text-muted-foreground sm:col-span-2">
          รหัสผ่านเริ่มต้น (อย่างน้อย {PASSWORD_MIN_LENGTH} ตัวอักษร)
          <PasswordInput value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        </label>
        <label className="grid gap-1 text-[13px] text-muted-foreground">
          บทบาท
          <Select className={field} value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-[13px] text-muted-foreground">
          ส่วนงาน
          <Select className={field} value={form.unitId} onChange={(e) => set({ unitId: e.target.value })}>
            <option value="">— ยังไม่กำหนด —</option>
            {units.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 sm:col-span-2">
          <button type="button" disabled={busy} onClick={() => onClose(null)} className="text-sm min-h-9 rounded-xl border border-border px-3.5 font-bold hover:bg-muted disabled:opacity-50">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy} className="text-sm min-h-9 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "เพิ่มผู้ใช้"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Set a new password for a user. The password is masked; the eye button shows it. A second field catches typos. */
function ResetPasswordDialog({ user, onClose }: { user: ManagedUser; onClose: (done: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
      focusField("password"); // take the person to the field that needs fixing
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      focusField("confirm");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiSend("PATCH", `/users/${user.id}`, { password });
      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <Modal title={`ตั้งรหัสผ่านใหม่ให้ ${user.displayName}`} onClose={() => onClose(false)} canDismiss={!busy} className="max-w-[460px]">
      <form onSubmit={submit} className="grid gap-4 px-5 py-4 sm:px-6">
        <label data-field="password" className="grid gap-1 text-[13px] text-muted-foreground">
          รหัสผ่านใหม่ (อย่างน้อย {PASSWORD_MIN_LENGTH} ตัวอักษร)
          <PasswordInput data-autofocus value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} autoComplete="new-password" required />
        </label>
        <label data-field="confirm" className="grid gap-1 text-[13px] text-muted-foreground">
          พิมพ์รหัสผ่านใหม่อีกครั้ง
          <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} autoComplete="new-password" required />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => onClose(false)} className="text-sm min-h-9 rounded-xl border border-border px-3.5 font-bold hover:bg-muted disabled:opacity-50">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy} className="text-sm min-h-9 rounded-xl bg-primary px-3.5 font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
