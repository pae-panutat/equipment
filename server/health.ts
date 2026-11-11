import type { AssetHealth } from "../shared";
import { addMonths } from "./dates";

type Input = {
  today: string;
  status: string;
  installDate: string | null;
  purchaseDate: string | null;
  warrantyEnd: string | null;
  repairsLast12Months: number;
  hasOverduePlan: boolean;
};

/**
 * A simple 0-100 health score that says which equipment deserves attention. It starts at 100 and loses points for age
 * (3 per year, at most 30), repairs in the last 12 months (10 each, at most 30), a maintenance plan that is overdue (20),
 * a finished warranty (5) and a faulty status (25). It is a guide, not a measurement.
 */
export function assetHealth(i: Input): AssetHealth | null {
  if (i.status === "disposed") return null;
  const factors: AssetHealth["factors"] = [];
  const since = i.installDate ?? i.purchaseDate;
  if (since) {
    const years = Math.max(0, (Date.parse(`${i.today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / (365.25 * 86_400_000));
    const lost = Math.min(30, Math.round(years * 3));
    if (lost > 0) factors.push({ label: `อายุการใช้งาน ${years.toFixed(1)} ปี`, points: -lost });
  }
  if (i.repairsLast12Months > 0) factors.push({ label: `ซ่อมแซม ${i.repairsLast12Months} ครั้งใน 12 เดือน`, points: -Math.min(30, i.repairsLast12Months * 10) });
  if (i.hasOverduePlan) factors.push({ label: "มีแผนบำรุงรักษาเกินกำหนด", points: -20 });
  if (i.warrantyEnd && i.warrantyEnd < i.today) factors.push({ label: "หมดประกันแล้ว", points: -5 });
  if (i.status === "faulty") factors.push({ label: "สถานะชำรุด", points: -25 });
  const score = Math.max(0, 100 - factors.reduce((s, f) => s - f.points, 0));
  const level: AssetHealth["level"] = score >= 80 ? "good" : score >= 60 ? "fair" : score >= 40 ? "watch" : "replace";
  return { score, level, factors };
}

export const twelveMonthsAgo = (today: string) => addMonths(today, -12);
