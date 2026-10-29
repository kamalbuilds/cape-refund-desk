const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
export function isoFromDayNumber(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  return isoFromDayNumber(dayNumber(iso) + days);
}
export function diffDays(aIso: string, bIso: string): number {
  return dayNumber(aIso) - dayNumber(bIso);
}
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Accepts yyyy-mm-dd, yyyy/mm/dd, m/d/yyyy, d-Mon-yyyy, "Mon d, yyyy". Returns ISO or null. */
export function parseDate(input: string | undefined | null): { iso: string | null; reformatted: boolean } {
  const s = (input ?? "").trim();
  if (!s) return { iso: null, reformatted: false };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return mk(+m[1], +m[2], +m[3], !/^\d{4}-\d{2}-\d{2}$/.test(s));
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return mk(+m[1], +m[2], +m[3], true);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return mk(+m[3], +m[1], +m[2], true);
  m = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1], true);
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2], true);
  return { iso: null, reformatted: false };
}
function mk(y: number, mo: number, d: number, reformatted: boolean) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return { iso: null, reformatted: false };
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, reformatted };
}
