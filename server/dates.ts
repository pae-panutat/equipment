// Date helpers. DATE columns are plain "YYYY-MM-DD" strings; "today" is the Asia/Bangkok calendar day.

export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m, day];
}

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const [y, m, day] = parts(d);
  return iso(new Date(Date.UTC(y, m - 1, day + n)));
}

/** Add months; a day that does not exist in the target month moves to that month's last day (e.g. 31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = parts(d);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))));
}
