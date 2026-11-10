// Development seed: FICTITIOUS demo data only. Safe to re-run (skips if already seeded; --reset rebuilds).
import { eq } from "drizzle-orm";
import { assets, assetTypes, locations, maintenancePlans, organizationUnits, users, workOrders } from "../db/schema";
import { hashPassword } from "./auth/password";
import { ensureQrTokens } from "./qr";
import type { AssetStatus } from "../shared";
import { config } from "./config";
import { db, pool } from "./db";
import { runMigrations } from "./migrate";
import { bangkokToday, addDays, addMonths } from "./dates";

// small deterministic PRNG so the demo data is identical on every run
let seedState = 20261109;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

async function main() {
  if (config.isProd) throw new Error("Refusing to seed demo data in production");
  await runMigrations();

  const existing = await db.select({ id: organizationUnits.id }).from(organizationUnits).where(eq(organizationUnits.code, "DEMO-A"));
  if (existing.length && !process.argv.includes("--reset")) {
    console.log("Demo data already present (use --reset to rebuild).");
    await seedDevUsers();
    await ensureQrTokens();
    return;
  }
  if (process.argv.includes("--reset")) {
    for (const t of [workOrders, maintenancePlans, assets, assetTypes, locations, organizationUnits]) await db.delete(t);
    console.log("Existing rows removed");
  }

  const today = bangkokToday();

  // ---- organisation units (fictitious) ----
  const units: { id: number; code: string; short: string }[] = [];
  for (const [code, name, short] of [
    ["DEMO-A", "คณะตัวอย่าง A (ข้อมูลสมมติ)", "A"],
    ["DEMO-B", "คณะตัวอย่าง B (ข้อมูลสมมติ)", "B"],
    ["DEMO-C", "สำนักตัวอย่าง C (ข้อมูลสมมติ)", "C"],
  ] as const) {
    const [u] = await db.insert(organizationUnits).values({ code, name }).$returningId();
    units.push({ id: u.id, code, short });
  }

  // ---- locations: campus > building > floor > room ----
  const [campus] = await db.insert(locations).values({ kind: "campus", code: "DEMO-CAMPUS", name: "วิทยาเขตตัวอย่าง" }).$returningId();
  const roomsByUnit = new Map<number, number[]>();
  for (const u of units) {
    const [b] = await db.insert(locations).values({ kind: "building", code: `DEMO-B-${u.short}`, name: `อาคาร ${u.short}1`, parentId: campus.id }).$returningId();
    const rooms: number[] = [];
    for (const floor of [1, 2]) {
      const [f] = await db.insert(locations).values({ kind: "floor", code: `DEMO-B-${u.short}-F${floor}`, name: `ชั้น ${floor}`, parentId: b.id }).$returningId();
      for (let r = 1; r <= 4; r++) {
        const [room] = await db
          .insert(locations)
          .values({ kind: "room", code: `DEMO-B-${u.short}-F${floor}-R${r}`, name: `ห้อง ${u.short}${floor}0${r}`, parentId: f.id })
          .$returningId();
        rooms.push(room.id);
      }
    }
    roomsByUnit.set(u.id, rooms);
  }

  // ---- asset types ----
  const typeId: Record<string, number> = {};
  for (const [code, name] of [["AC", "เครื่องปรับอากาศ"], ["CHILLER", "Chiller"], ["PUMP", "Pump"]] as const) {
    const [t] = await db.insert(assetTypes).values({ code, name }).$returningId();
    typeId[code] = t.id;
  }

  // ---- assets ----
  const acBrands: [string, string[]][] = [
    ["Daikin", ["FTKM18", "FTKM24", "FTM13"]],
    ["Carrier", ["42TSAA018", "42TSAA024"]],
    ["Mitsubishi Electric", ["MSY-KP18", "MSY-KP24"]],
    ["Samsung", ["AR18TYHQ", "AR24TYHQ"]],
    ["LG", ["IS18", "IS24"]],
  ];
  const statuses: AssetStatus[] = [...Array<AssetStatus>(11).fill("active"), "faulty", "under_repair", "inactive", "active", "under_repair", "active", "faulty", "active"];
  const plan: { unit: (typeof units)[number]; type: string; n: number }[] = [
    ...[6, 5, 4].flatMap((n, i) => Array.from({ length: n }, (_, k) => ({ unit: units[i], type: "AC", n: k + 1 }))),
    { unit: units[0], type: "CHILLER", n: 1 },
    { unit: units[2], type: "CHILLER", n: 2 },
    { unit: units[0], type: "PUMP", n: 1 },
    { unit: units[1], type: "PUMP", n: 2 },
    { unit: units[1], type: "PUMP", n: 3 },
  ];
  const created: { id: number; type: string; status: AssetStatus; unitShort: string; code: string; name: string }[] = [];
  let acIndex = 0;
  for (const p of plan) {
    const isAc = p.type === "AC";
    const [brand, models] = isAc ? pick(acBrands) : p.type === "CHILLER" ? ["Trane", ["CGAM"]] : ["Grundfos", ["CR 15"]];
    const status = isAc ? statuses[acIndex++ % statuses.length] : "active";
    const code = `${p.type}-${p.unit.short}-${String(p.n).padStart(3, "0")}`;
    const name = isAc ? `เครื่องปรับอากาศ ${brand} ห้อง ${p.unit.short}${1 + (p.n % 2)}0${1 + (p.n % 4)}` : `${p.type === "CHILLER" ? "Chiller" : "Pump"} ${p.unit.short}-${p.n}`;
    const installed = addDays(today, -Math.floor(200 + rnd() * 1800));
    const [a] = await db
      .insert(assets)
      .values({
        code,
        name,
        typeId: typeId[p.type],
        brand,
        model: pick(models),
        serialNumber: rnd() > 0.15 ? `DEMO${Math.floor(100000 + rnd() * 899999)}` : null,
        ownerUnitId: p.unit.id,
        locationId: pick(roomsByUnit.get(p.unit.id)!),
        status,
        installDate: installed,
        purchaseDate: addDays(installed, -14),
        notes: "ข้อมูลสมมติสำหรับทดสอบระบบ",
        attributes: isAc ? JSON.stringify({ btu: pick([12000, 18000, 24000]), inverter: rnd() > 0.4 }) : null,
      })
      .$returningId();
    created.push({ id: a.id, type: p.type, status, unitShort: p.unit.short, code, name });
  }

  // ---- maintenance plans (2 ACs deliberately without a plan) + history ----
  const dueOffsets = [-22, -6, 3, 9, 14, 26, 41, 55, 63, 78, 85, 20, -2, 33];
  let woNo = 1;
  const woNumber = () => `WO-${today.slice(0, 4)}-${String(woNo++).padStart(4, "0")}`;
  const money = () => (rnd() > 0.2 ? (Math.round(rnd() * 3000) * 1).toFixed(2) : null); // null = unknown cost
  let planIdx = 0;
  for (const a of created) {
    const isAc = a.type === "AC";
    const skipPlan = isAc && (a.code.endsWith("A-006") || a.code.endsWith("C-004"));
    const months = isAc ? 3 : 12;
    const nextDue = addDays(today, dueOffsets[planIdx++ % dueOffsets.length]);
    let planId: number | null = null;
    if (!skipPlan) {
      const [pl] = await db
        .insert(maintenancePlans)
        .values({ assetId: a.id, title: isAc ? "ล้างทำความสะอาดแอร์" : "ตรวจเช็กตามรอบ", intervalValue: months, intervalUnit: "month", startDate: addMonths(nextDue, -months * 4), nextDueDate: nextDue })
        .$returningId();
      planId = pl.id;
      // completed historical jobs, one per interval going back from the last due
      for (let k = 1; k <= 4; k++) {
        const done = addMonths(nextDue, -months * k);
        if (done > today) continue;
        await db.insert(workOrders).values({
          number: woNumber(), assetId: a.id, planId, kind: "planned", status: "done", priority: "normal", title: isAc ? "ล้างทำความสะอาดแอร์" : "ตรวจเช็กตามรอบ",
          dueDate: done, performedOn: done, completedAt: new Date(`${done}T05:00:00Z`), laborCost: money(), partsCost: rnd() > 0.7 ? money() : null, otherCost: null,
        });
      }
    }
    if (a.status === "under_repair") {
      const opened = addDays(today, -Math.floor(2 + rnd() * 20));
      await db.insert(workOrders).values({
        number: woNumber(), assetId: a.id, kind: "repair", status: "in_progress", priority: pick(["normal", "high", "urgent"] as const),
        title: pick(["ไม่เย็น", "น้ำหยด", "มีเสียงดังผิดปกติ", "คอมเพรสเซอร์ไม่ทำงาน"]), dueDate: addDays(opened, 7),
      });
    }
    if (rnd() > 0.55) {
      const when = addDays(today, -Math.floor(20 + rnd() * 300));
      await db.insert(workOrders).values({
        number: woNumber(), assetId: a.id, kind: "repair", status: "done", priority: "normal", title: pick(["เปลี่ยนคาปาซิเตอร์", "เติมน้ำยาแอร์", "เปลี่ยนแผงวงจร"]),
        dueDate: when, performedOn: when, completedAt: new Date(`${when}T08:00:00Z`), laborCost: money(), partsCost: money(), otherCost: "0.00",
      });
    }
  }
  console.log(`Seeded ${created.length} assets, work orders: ${woNo - 1}`);
  await seedDevUsers();
  await ensureQrTokens();
}

// Development sign-in accounts (local database only; seed refuses to run in production).
async function seedDevUsers() {
  const DEV_PASSWORD = "dev-password-1234";
  const devUsers = [
    { username: "dev-admin", displayName: "ผู้ดูแลระบบ (ทดสอบ)", role: "super_admin" as const, unitId: null },
    { username: "dev-tech", displayName: "ช่างเทคนิค (ทดสอบ)", role: "technician" as const, unitId: null }, // the single technician account: sees every unit, so no unit is assigned
  ];
  for (const u of devUsers) {
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, u.username));
    if (exists) await db.update(users).set({ unitId: u.unitId }).where(eq(users.id, exists.id)); // units are recreated by --reset
    else await db.insert(users).values({ ...u, passwordHash: await hashPassword(DEV_PASSWORD) });
  }
  console.log(`Dev accounts: ${devUsers.map((u) => u.username).join(", ")} (password: ${DEV_PASSWORD})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
