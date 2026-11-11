"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Download, FileUp } from "lucide-react";
import { canEditAssets, type FilterOptions } from "@shared/index";
import { Card, ErrorState } from "@/components/ui/card";
import { ApiError, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { useApi } from "@/lib/use-api";

const COLUMNS = [
  { key: "code", label: "รหัส", alias: ["code", "รหัสอุปกรณ์"] },
  { key: "name", label: "ชื่ออุปกรณ์", alias: ["name", "ชื่อ"] },
  { key: "type", label: "ประเภท", alias: ["type", "ประเภทอุปกรณ์"] },
  { key: "unit", label: "ส่วนงาน", alias: ["unit", "ส่วนงานเจ้าของ"] },
  { key: "location", label: "สถานที่", alias: ["location"] },
  { key: "locationDetail", label: "รายละเอียดที่ตั้ง", alias: ["locationdetail"] },
  { key: "brand", label: "ยี่ห้อ", alias: ["brand"] },
  { key: "model", label: "รุ่น", alias: ["model"] },
  { key: "serialNumber", label: "หมายเลขเครื่อง", alias: ["serialnumber", "serial"] },
  { key: "legacyAssetNo", label: "เลขครุภัณฑ์เดิม", alias: ["legacyassetno"] },
  { key: "installDate", label: "วันที่ติดตั้ง", alias: ["installdate"] },
  { key: "purchaseDate", label: "วันที่ซื้อ", alias: ["purchasedate"] },
  { key: "warrantyEnd", label: "ประกันหมด", alias: ["warrantyend"] },
  { key: "status", label: "สถานะ", alias: ["status"] },
  { key: "notes", label: "หมายเหตุ", alias: ["notes"] },
] as const;
type Key = (typeof COLUMNS)[number]["key"];
type Row = Record<Key, string>;
type Result = { row: number; ok: boolean; code?: string; error?: string };
type Outcome = { dryRun: boolean; imported: number; errors: number; results: Result[] };

const btn = "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50";

/** Add many assets from a CSV file (a spreadsheet saved as CSV). Checked first; nothing is saved until every row is fine. */
export function ImportView() {
  const { user } = useAuth();
  const canEdit = user ? canEditAssets(user.role) : false;
  const { data: opts, error: optsError, reload } = useApi<FilterOptions>("/meta/filters");
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (user && !canEdit) return <ErrorState message="เฉพาะผู้ดูแลระบบและช่างเทคนิคที่นำเข้าข้อมูลได้" />;

  function template() {
    downloadCsv("แม่แบบนำเข้าอุปกรณ์.csv", [
      COLUMNS.map((c) => c.label),
      ["", "เครื่องปรับอากาศ ห้อง 101", opts?.types[0]?.name ?? "เครื่องปรับอากาศ", opts?.units[0]?.name ?? "", "", "ชั้น 1 ห้อง 101", "Daikin", "FTKC18", "SN12345", "", "2024-03-15", "2024-02-20", "2027-02-20", "ปกติ", ""],
    ]);
  }

  async function check(r: Row[]) {
    setBusy(true);
    setProblem(null);
    try {
      setOutcome(await apiSend<Outcome>("POST", "/assets/import", { dryRun: true, rows: r }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "ตรวจไฟล์ไม่สำเร็จ");
      setOutcome(null);
    } finally {
      setBusy(false);
    }
  }

  async function pick(f: File | undefined) {
    setRows(null);
    setOutcome(null);
    setDone(null);
    setProblem(null);
    if (!f) return;
    setName(f.name);
    if (f.size > 2 * 1024 * 1024) return setProblem("ไฟล์ใหญ่เกิน 2 MB");
    if (!/\.csv$/i.test(f.name)) return setProblem("รองรับเฉพาะไฟล์ .csv (ใน Excel เลือก บันทึกเป็น → CSV UTF-8)");
    const table = parseCsv(await f.text());
    if (table.length < 2) return setProblem("ไฟล์ไม่มีข้อมูล (ต้องมีแถวหัวตารางและอย่างน้อย 1 แถวข้อมูล)");
    const header = table[0].map((h) => h.trim().toLowerCase());
    const index = new Map<Key, number>();
    for (const c of COLUMNS) {
      const at = header.findIndex((h) => h === c.label.toLowerCase() || (c.alias as readonly string[]).includes(h));
      if (at >= 0) index.set(c.key, at);
    }
    const missing = (["name", "type", "unit"] as Key[]).filter((k) => !index.has(k));
    if (missing.length) return setProblem(`ไม่พบคอลัมน์: ${missing.map((k) => COLUMNS.find((c) => c.key === k)!.label).join(", ")} — ดาวน์โหลดแม่แบบเพื่อดูหัวตารางที่ถูกต้อง`);
    if (table.length - 1 > 500) return setProblem("นำเข้าได้ครั้งละไม่เกิน 500 รายการ");
    const parsed = table.slice(1).map((cells) => Object.fromEntries(COLUMNS.map((c) => [c.key, (cells[index.get(c.key) ?? -1] ?? "").trim()])) as Row);
    setRows(parsed);
    await check(parsed);
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await apiSend<Outcome>("POST", "/assets/import", { dryRun: false, rows });
      setDone(r.imported);
      setRows(null);
      setOutcome(null);
      if (file.current) file.current.value = "";
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) await check(rows); // show which rows are wrong
      else setProblem(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const bad = outcome?.results.filter((r) => !r.ok) ?? [];
  return (
    <div className="grid gap-5">
      <div>
        <Link href="/assets" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> ทะเบียนอุปกรณ์
        </Link>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">นำเข้าอุปกรณ์จากไฟล์</h1>
        <p className="mt-1 text-muted-foreground">เพิ่มอุปกรณ์หลายรายการพร้อมกันจากไฟล์ CSV (ครั้งละไม่เกิน 500 รายการ)</p>
      </div>

      <Card className="grid gap-3">
        <h2 className="text-lg font-bold">1. เตรียมไฟล์</h2>
        <p className="text-sm text-muted-foreground">
          ดาวน์โหลดแม่แบบ กรอกใน Excel แล้วเลือก บันทึกเป็น → CSV UTF-8 คอลัมน์ที่ต้องมี: ชื่ออุปกรณ์, ประเภท, ส่วนงาน ส่วนรหัสเว้นว่างได้ ระบบจะตั้งรหัสให้เอง วันที่ใช้รูปแบบ ปปปป-ดด-วว (เช่น 2026-03-15)
        </p>
        <div>
          <button type="button" onClick={template} className={`${btn} border border-border hover:bg-muted`}>
            <Download className="size-4" aria-hidden="true" /> ดาวน์โหลดแม่แบบ (CSV)
          </button>
        </div>
        {optsError && <ErrorState message={optsError} onRetry={reload} />}
        {opts && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 text-primary">ดูชื่อประเภทและส่วนงานที่ใช้ได้</summary>
            <p className="mt-1"><b>ประเภท:</b> {opts.types.map((t) => t.name).join(" · ")}</p>
            <p className="mt-1"><b>ส่วนงาน:</b> {opts.units.map((u) => u.name).join(" · ")}</p>
            <p className="mt-1 text-muted-foreground">ใช้ชื่อตามนี้ หรือรหัสในหน้าข้อมูลหลัก ส่วนสถานที่ใช้รหัส หรือชื่อเต็ม เช่น วิทยาเขต › อาคาร › ชั้น › ห้อง</p>
          </details>
        )}
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-bold">2. เลือกไฟล์และตรวจสอบ</h2>
        <div>
          <input ref={file} id="csv-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          <label htmlFor="csv-file" className={`${btn} cursor-pointer border border-border hover:bg-muted`}>
            <FileUp className="size-4" aria-hidden="true" /> เลือกไฟล์ CSV
          </label>
          {name && <span className="ml-3 text-sm text-muted-foreground">{name}</span>}
        </div>
        {problem && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad">{problem}</p>}
        {busy && <p className="text-sm text-muted-foreground">กำลังตรวจสอบ...</p>}
        {outcome && (
          <>
            <p className="text-sm">
              ทั้งหมด <b>{outcome.results.length}</b> แถว · ถูกต้อง <b className="text-ok">{outcome.results.length - bad.length}</b> · มีปัญหา{" "}
              <b className={bad.length ? "text-bad" : ""}>{bad.length}</b>
            </p>
            {bad.length > 0 && (
              <ul className="grid gap-1.5 rounded-xl bg-bad-soft p-3 text-sm text-bad" role="alert">
                {bad.slice(0, 100).map((b) => (
                  <li key={b.row}>แถวที่ {b.row}: {b.error}</li>
                ))}
                {bad.length > 100 && <li>และอีก {bad.length - 100} แถว</li>}
              </ul>
            )}
            {bad.length === 0 && (
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-2 text-primary">ดูรหัสที่จะได้</summary>
                <p className="break-words">{outcome.results.map((r) => r.code).join(", ")}</p>
              </details>
            )}
          </>
        )}
      </Card>

      {done !== null && (
        <p role="status" className="rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
          นำเข้าเรียบร้อย {done} รายการ — <Link href="/assets" className="font-bold underline">ไปที่ทะเบียนอุปกรณ์</Link>
        </p>
      )}

      <div>
        <button type="button" disabled={busy || !outcome || bad.length > 0 || !rows} onClick={() => void run()} className={`${btn} bg-primary text-primary-foreground`}>
          {outcome && bad.length === 0 ? `นำเข้า ${outcome.results.length} รายการ` : "นำเข้า"}
        </button>
        {outcome && bad.length > 0 && <p className="mt-2 text-sm text-muted-foreground">แก้ไฟล์ตามรายการด้านบนแล้วเลือกไฟล์ใหม่ ระบบจะไม่เพิ่มรายการใดเลยจนกว่าทุกแถวจะถูกต้อง</p>}
      </div>
    </div>
  );
}
