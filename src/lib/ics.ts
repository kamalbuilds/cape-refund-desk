import type { Portfolio } from "./validate";
import { addDays } from "./dates";
import { DEADLINE_SOURCES, routesFor } from "./deadlines";

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

/** Deadline events for the proposed declaration. Dates come from the shared deadline module so the calendar, drawer and by-week view always agree. */
export function icsEvents(p: Portfolio, asOf: string, o: IcsOptions = {}): IcsEvent[] {
  const ev: IcsEvent[] = [];
  for (const v of p.verdicts) {
    if (o.include && !o.include.has(v.id)) continue;
    for (const r of routesFor(v, asOf)) {
      if (r.closes === null || r.daysLeft === null || r.daysLeft < 0) continue;
      const src = r.sources.map((s) => DEADLINE_SOURCES[s]).filter((s) => s && s.url).map((s) => s.url).join(" ");
      const tail = `Counted from ${asOf}, the date in this data. ${src ? `Source: ${src}. ` : ""}Not legal advice; confirm with your broker.`;
      if (r.id === "CAPE" && v.lane !== "BLOCKED")
        ev.push({ uid: `${v.key}-cape@cape-refund-desk`, date: r.closes, summary: `CAPE window closes: ${v.displayNumber}`,
          description: `Phase 1 accepts entries liquidated within the preceding 80 days. This shipment's window closes ${r.closes} (${r.daysLeft} days after ${asOf}). Lane: ${v.lane}. ${tail}` });
      else if (r.id === "RECON" && v.lane !== "BLOCKED")
        ev.push({ uid: `${v.key}-recon@cape-refund-desk`, date: r.closes, summary: `Reconciliation filing due: ${v.displayNumber}`,
          description: `Reconciliation deadline for a recon-flagged entry. Lane: ${v.lane}. ${tail}` });
      else if (r.id === "PROTEST")
        ev.push({ uid: `${v.key}-protest@cape-refund-desk`, date: r.closes, summary: `Protest window closes: ${v.displayNumber}`,
          description: `Form 19 protest deadline under 19 U.S.C. 1514 and 19 CFR 174.12(e): 180 days from liquidation. Lane: ${v.lane}. ${tail}` });
    }
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
