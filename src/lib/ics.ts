import type { Portfolio } from "./validate";
import { addDays } from "./dates";

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
/** Fold a content line to 75 octets (continuation lines start with one space), CRLF-terminated. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = []; let cur = ""; let bytes = 0; let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { out.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const ymd = (iso: string) => iso.replace(/-/g, "");

export interface IcsOptions { include?: Set<string>; /** only entries in these ids; default all */ }
export interface IcsEvent { uid: string; date: string; summary: string; description: string }

/** Deadline events for the proposed declaration: CAPE window close, reconciliation deadline, protest window close. */
export function icsEvents(p: Portfolio, asOf: string, o: IcsOptions = {}): IcsEvent[] {
  const ev: IcsEvent[] = [];
  for (const v of p.verdicts) {
    if (o.include && !o.include.has(v.id)) continue;
    const d = v.deadlines;
    if (d.capeDaysLeft !== null && d.capeDaysLeft >= 0 && v.lane !== "BLOCKED" && d.capeCutoffDate)
      ev.push({ uid: `${v.key}-cape@cape-refund-desk`, date: d.capeCutoffDate, summary: `CAPE window closes: ${v.displayNumber}`,
        description: `Phase 1 accepts entries liquidated within the preceding 80 days. This shipment's window closes ${d.capeCutoffDate} (${d.capeDaysLeft} days after ${asOf}). Lane: ${v.lane}. Source: CBP IEEPA refunds FAQ. Not legal advice; confirm with your broker.` });
    if (d.reconDeadlineDaysLeft !== null && d.reconDeadlineDaysLeft >= 0 && v.lane !== "BLOCKED")
      ev.push({ uid: `${v.key}-recon@cape-refund-desk`, date: addDays(asOf, d.reconDeadlineDaysLeft), summary: `Reconciliation filing due: ${v.displayNumber}`,
        description: `Reconciliation deadline for a recon-flagged entry. Lane: ${v.lane}. Source: CBP IEEPA refunds FAQ.` });
    if (d.protestDaysLeft !== null && d.protestDaysLeft >= 0 && d.protestDeadlineDate)
      ev.push({ uid: `${v.key}-protest@cape-refund-desk`, date: d.protestDeadlineDate, summary: `Protest window closes: ${v.displayNumber}`,
        description: `Protest deadline under 19 U.S.C. 1514: 180 days from liquidation. Lane: ${v.lane}. Not legal advice; confirm with your broker.` });
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}

/** All-day VEVENTs with a 7-day-before alarm. DTSTAMP is derived from asOf so output is deterministic. */
export function buildIcs(p: Portfolio, asOf: string, o: IcsOptions = {}): string {
  const stamp = `${ymd(asOf)}T000000Z`;
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CAPE Refund Desk//Deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:CAPE refund deadlines"];
  for (const e of icsEvents(p, asOf, o)) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(e.date, 1))}`,
      `SUMMARY:${esc(e.summary)}`, `DESCRIPTION:${esc(e.description)}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`, "TRIGGER:-P7D", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
