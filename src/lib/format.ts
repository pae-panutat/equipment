// Display helpers. API/database use ISO dates and Gregorian years; the UI shows Thai dates (Buddhist Era).

const thDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const thMonth = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" });
const thDateTime = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const number = new Intl.NumberFormat("th-TH");

/** "2026-11-09" -> "9 พฤศจิกายน 2569". Plain dates are formatted at UTC so they never shift by timezone. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return thDate.format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
}

/** "2026-11" -> "พฤศจิกายน 2569" */
export function formatMonth(ym: string): string {
  return thMonth.format(new Date(`${ym}-01T00:00:00Z`));
}

export function formatDateTime(iso: string): string {
  return thDateTime.format(new Date(iso));
}

export const formatNumber = (n: number) => number.format(n);
