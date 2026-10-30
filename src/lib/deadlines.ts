/**
 * Deadline tracker: one pure module that owns every filing-window date shown in the app
 * (drawer, by-week view, .ics export). No clock reads: all day counts run from the `asOf` date passed in.
 *
 * Windows used (nothing here is invented; each has a link below):
 *  - CAPE window: 80 days after liquidation (CBP IEEPA refunds FAQ). Overridable by rule-watch scenarios, so
 *    the close date is taken from the validated verdict, not recomputed.
 *  - Form 19 protest: 180 days after the date of liquidation or reliquidation (19 U.S.C. 1514; 19 CFR 174.12(e)).
 *  - Reliquidation limit: CBP may reliquidate on its own within 90 days of the original liquidation (19 U.S.C. 1501).
 *    That is CBP's window, not the importer's, so it is shown as information and never counted as dollars expiring.
 *  - Reconciliation filing date and projected liquidation date: dates read straight from the uploaded file.
 */
import { addDays, diffDays } from "./dates";
import type { Verdict } from "./types";

export type RouteId = "CAPE" | "PROTEST" | "RECON" | "RELIQ" | "PROJECTED";
export type Urgency = "expired" | "today" | "urgent" | "soon" | "open";

export interface DeadlineSource { label: string; url: string }
export const DEADLINE_SOURCES: Record<string, DeadlineSource> = {
  FAQ: { label: "CBP: IEEPA Duty Refunds FAQ (80-day CAPE window)", url: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds" },
  "19USC1514": { label: "19 U.S.C. 1514 (protests)", url: "https://www.law.cornell.edu/uscode/text/19/1514" },
  "19CFR174.12": { label: "19 CFR 174.12(e) (time of filing a protest)", url: "https://www.ecfr.gov/current/title-19/section-174.12" },
  "19USC1501": { label: "19 U.S.C. 1501 (CBP reliquidation, 90 days)", url: "https://www.law.cornell.edu/uscode/text/19/1501" },
  FILE: { label: "Date read from your uploaded file", url: "" },
};

export interface Route {
  id: RouteId;
  label: string;
  /** Short label for chips and tables. */
  short: string;
  closes: string | null;
  daysLeft: number | null;
  urgency: Urgency | null;
  /** True when it is a route the importer or broker can use (counted in the by-week dollars). */
  actionable: boolean;
  basis: string;
  sources: string[];
}

export const URGENT_DAYS = 7;
export const SOON_DAYS = 30;

/** Last day of a window that opens at `startIso` and lasts `days` calendar days. */
export function windowCloses(startIso: string, days: number): string { return addDays(startIso, days); }
/** Calendar days from asOf to `closesIso`. 0 = closes today, negative = already closed. */
export function daysLeftFrom(closesIso: string, asOfIso: string): number { return diffDays(closesIso, asOfIso); }
export function urgencyOf(daysLeft: number | null): Urgency | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return "expired";
  if (daysLeft === 0) return "today";
  if (daysLeft <= URGENT_DAYS) return "urgent";
  if (daysLeft <= SOON_DAYS) return "soon";
  return "open";
}
/** "12 days left", "closes today", "closed 3 days ago". */
export function leftText(daysLeft: number | null): string {
  if (daysLeft === null) return "n/a";
  if (daysLeft < 0) return `closed ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "closes today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

function mk(id: RouteId, label: string, short: string, closes: string | null, asOf: string, actionable: boolean, basis: string, sources: string[]): Route {
  const daysLeft = closes ? daysLeftFrom(closes, asOf) : null;
  return { id, label, short, closes, daysLeft, urgency: urgencyOf(daysLeft), actionable, basis, sources };
}

/** Every filing route the data supports for one entry. Close dates come from the verdict's validated deadlines, so they agree with the rest of the app. */
export function routesFor(v: Verdict, asOf: string): Route[] {
  const d = v.deadlines, out: Route[] = [];
  const protested = v.findings.some((f) => f.code === "PROTEST");
  if (d.capeCutoffDate)
    out.push(mk("CAPE", "CAPE declaration window", "CAPE", d.capeCutoffDate, asOf, true,
      "80 days after liquidation: ACE accepts entries liquidated within the preceding 80 days.", ["FAQ"]));
  if (d.protestDeadlineDate)
    out.push(mk("PROTEST", "Form 19 protest (refund amount)", "Protest", d.protestDeadlineDate, asOf, !protested,
      protested
        ? "180 days after liquidation. This entry already shows a protest on file, so check its status with your broker before relying on this date."
        : "180 days after the date of liquidation or reliquidation (counted in calendar days; a received date is the filing date).", ["19USC1514", "19CFR174.12"]));
  if (d.reliquidationLimitDate)
    out.push(mk("RELIQ", "CBP's own reliquidation limit", "CBP reliquidates", d.reliquidationLimitDate, asOf, false,
      "CBP may reliquidate on its own within 90 days of the original liquidation. Information only: it is CBP's window, not yours.", ["19USC1501"]));
  if (d.reconDeadlineDaysLeft !== null)
    out.push(mk("RECON", "Related (reconciliation) filing", "Recon", addDays(asOf, d.reconDeadlineDaysLeft), asOf, true,
      "Reconciliation filing date as recorded in your file.", ["FILE"]));
  if (d.projectedLiquidationDaysLeft !== null && !d.capeCutoffDate)
    out.push(mk("PROJECTED", "Projected liquidation", "Liquidates", addDays(asOf, d.projectedLiquidationDaysLeft), asOf, false,
      "Not yet liquidated. CAPE accepts it now; the 80-day and 180-day clocks start when Customs liquidates it. Date is CBP's projection, read from your file.", ["FAQ", "FILE"]));
  return out;
}

export function nextRoute(rs: Route[]): Route | null {
  const open = rs.filter((r) => r.actionable && r.daysLeft !== null && r.daysLeft >= 0);
  return open.sort((a, b) => (a.daysLeft! - b.daysLeft!))[0] ?? null;
}

export interface ExpiringEntry { id: string; displayNumber: string; lane: Verdict["lane"]; daysLeft: number; closes: string; cents: number }
export interface Week { index: number; startDay: number; endDay: number; startIso: string; endIso: string; cents: number; entries: ExpiringEntry[] }
export interface WeeklyView { route: "CAPE" | "PROTEST"; weeks: Week[]; beyondCents: number; beyondCount: number; expiredCount: number; expiredCents: number; totalCents: number }

/** Dollars at stake by week of expiry. Amount = the net refund after other duties (what the app calls claimable), never gross. Week 0 starts on asOf. */
export function weeklyView(verdicts: Verdict[], asOf: string, route: "CAPE" | "PROTEST", weeks = 12): WeeklyView {
  const buckets: Week[] = Array.from({ length: weeks }, (_, i) => ({
    index: i, startDay: i * 7, endDay: i * 7 + 6, startIso: addDays(asOf, i * 7), endIso: addDays(asOf, i * 7 + 6), cents: 0, entries: [],
  }));
  const view: WeeklyView = { route, weeks: buckets, beyondCents: 0, beyondCount: 0, expiredCount: 0, expiredCents: 0, totalCents: 0 };
  for (const v of verdicts) {
    if (route === "CAPE" && v.lane === "BLOCKED") continue;
    const r = routesFor(v, asOf).find((x) => x.id === route);
    if (!r || !r.actionable || r.daysLeft === null || r.closes === null) continue;
    const cents = v.money.netRefundCents;
    if (r.daysLeft < 0) { view.expiredCount++; view.expiredCents += cents; continue; }
    const wk = Math.floor(r.daysLeft / 7);
    if (wk >= weeks) { view.beyondCount++; view.beyondCents += cents; continue; }
    buckets[wk].cents += cents; view.totalCents += cents;
    buckets[wk].entries.push({ id: v.id, displayNumber: v.displayNumber, lane: v.lane, daysLeft: r.daysLeft, closes: r.closes, cents });
  }
  for (const b of buckets) b.entries.sort((a, c) => a.daysLeft - c.daysLeft || c.cents - a.cents || a.id.localeCompare(c.id));
  return view;
}

/** Sum and count for entries whose route closes within `days` days from asOf (0 = today counts). */
export function expiringWithin(verdicts: Verdict[], asOf: string, route: "CAPE" | "PROTEST", days: number): { cents: number; count: number } {
  let cents = 0, count = 0;
  for (const v of verdicts) {
    if (route === "CAPE" && v.lane === "BLOCKED") continue;
    const r = routesFor(v, asOf).find((x) => x.id === route);
    if (!r || !r.actionable || r.daysLeft === null || r.daysLeft < 0 || r.daysLeft >= days) continue;
    cents += v.money.netRefundCents; count++;
  }
  return { cents, count };
}
