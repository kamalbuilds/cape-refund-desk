import type { Deadlines, Entry } from "./types";
import { LIMITS } from "./cbp-rules";

/**
 * CAPE refund phase + remedy lock-out, from what CBP publishes. Nothing here is invented:
 *  - Phase 1 / Phase 2 definitions are quoted from CBP's IEEPA Duty Refunds page (fetched 2026-10-30).
 *  - "Later phase" is CBP's own list under "What types of entries will be included in upcoming deployments of CAPE?".
 *  - Phase 3 is NOT on that CBP page. It comes from CBP's own sworn declaration to the Court of International Trade (Lord, Sept 15,
 *    2026, para. 8) and Phillips Lytle's Oct 12 alert on CBP's Oct 6 filing, and is labelled that way in the app.
 *  - Lock-out wording is the CBP FAQ "Once I have filed a CAPE Declaration, can I submit any PSCs or Protests ...? No." and the
 *    drawback FAQ. Only these three remedies are flagged, as CBP words them.
 */
/** Sources used only by this module; ids match SOURCE_PANEL where the app lists them. */
export const CUSTOMS_SOURCES: Record<string, { label: string; url: string }> = {
  FAQ: { label: "CBP: IEEPA Duty Refunds (FAQ and error tables)", url: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds" },
  QRG: { label: "ACE quick reference guide: CAPE Declarations and Error Definitions", url: "https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf" },
  PHASE3: { label: "CBP declaration to the Court of International Trade, 15 Sep 2026 (Phase 3)", url: "https://capeportalguide.com/docs/cit/cit-lord-declaration-phase-3-october-6-september-15-2026.pdf" },
  PHASE3_LAW: { label: "Phillips Lytle: CBP Opens Phase 3 of CAPE (12 Oct 2026)", url: "https://phillipslytle.com/cbp-opens-phase-3-of-cape-for-ieepa-refunds/" },
};
export type PhaseId = 1 | 2 | 3 | "later" | "none";
export interface PhaseInfo {
  id: PhaseId;
  /** short chip text */
  chip: string;
  /** one plain sentence for the drawer */
  plain: string;
  /** exact CBP (or reported) wording behind it */
  quote: string;
  sourceId: string;
}
export interface Lockout {
  id: "psc" | "protest" | "drawback" | "drawback-claim";
  /** short row marker */
  marker: string;
  title: string;
  plain: string;
  quote: string;
  sourceId: string;
  /** "locks_out" = CAPE acceptance blocks the other remedy; "overlap" = sequencing CBP asks for; "rejects" = CAPE rejects the entry today */
  kind: "locks_out" | "overlap" | "rejects";
}
export interface CustomsInfo { phase: PhaseInfo; lockouts: Lockout[] }

const P1 = "Phase 1: certain unliquidated entries and certain entries within 80 days of liquidation";
const P2 = "Phase 2: entries flagged for reconciliation where the reconciliation entry is not yet on file";
const P3 = "CBP will deploy CAPE Phase 3, which covers finally liquidated entries filed by plaintiffs for which the Court has ordered reliquidation, on October 6, 2026. (Declaration of Brandon Lord, CBP Executive Director of Trade Programs, filed Sept 15, 2026, Freestyle World v. CBP, CIT No. 26-01088, para. 8.) Phillips Lytle adds: available where \"The importer is a plaintiff in a CIT action, and its entries are covered by an order directing reliquidation.\"";
const LATER = "What types of entries will be included in upcoming deployments of CAPE? ... Entries with type Entry Type 09 - Reconciliation Summary; Entries flagged for reconciliation with Entry Type 09 already on file; Entries designated on a drawback claim; Warehouse entries (entry type 21 and 22); Entries covered by an open protest; Entries not filed in ACE ...";

/** The order of checks matters: things CBP lists as a future deployment first, then final liquidation, then Phase 2, then Phase 1. */
export function phaseOf(entry: Entry, deadlines: Deadlines, opts: { windowDays?: number; warehouseBlocked?: boolean } = {}): PhaseInfo {
  const windowDays = opts.windowDays ?? LIMITS.liquidationWindowDays;
  const t = entry.entryType;
  const none = (plain: string, quote: string, sourceId = "FAQ"): PhaseInfo => ({ id: "none", chip: "No phase", plain, quote, sourceId });
  const later = (plain: string): PhaseInfo => ({ id: "later", chip: "Later phase", plain, quote: LATER, sourceId: "FAQ" });
  if (["08", "23", "47"].includes(t))
    return none("This entry type is not accepted in any CAPE phase CBP has published. CBP's list of future deployments does not include it.", "ENTRY TYPE NOT ALLOWED: Entry type cannot be TIB (23), Duty Deferral (08), Reconciliation (09), or Drawback (047)", "QRG");
  if (t === "09") return later("Reconciliation summaries (type 09) are on CBP's list of entries for a later deployment. They cannot go in a declaration yet.");
  if ((t === "21" || t === "22") && opts.warehouseBlocked !== false) return later("Warehouse entries (types 21 and 22) are on CBP's list for a later deployment. File the warehouse withdrawals instead.");
  if (entry.reconFlag && entry.reconEntryFiled) return later("This entry is flagged for reconciliation and the reconciliation entry (type 09) is already on file. CBP says it joins CAPE in a future phase.");
  if (entry.drawbackClaim) return later("This entry is already designated on a drawback claim. CBP lists those for a later deployment.");
  if (entry.summaryStatus === "Not Found") return later("The entry is not found in ACE. CBP lists entries not filed in ACE for a later deployment.");
  if (!entry.lines.some((l) => l.ieepaIndicator && l.ieepaDutyCents > 0))
    return none("No line carries a dutiable IEEPA provision, so there is nothing for CAPE to refund.", "NO IEEPA HTS ON ENTRY: Entry must have at least one IEEPA HTS", "FAQ");
  if (deadlines.daysSinceLiquidation !== null && deadlines.daysSinceLiquidation > windowDays)
    return { id: 3, chip: "Phase 3 · court order", plain: `Customs finalized this entry ${deadlines.daysSinceLiquidation} days ago, past the ${windowDays}-day window of Phases 1 and 2. The only CAPE route reported is Phase 3, and only for importers who sued at the Court of International Trade and hold an order to reliquidate. CBP's own refunds page does not describe Phase 3 yet.`, quote: P3, sourceId: "PHASE3" };
  const ps = entry.protestStatus;
  if (ps === "Open" || ps === "Suspended" || (ps === "Denied" && entry.afrBox)) return later("The entry is covered by an open protest. CBP lists those for a later deployment, and CAPE rejects them today.");
  if (entry.reconFlag && !entry.reconEntryFiled)
    return { id: 2, chip: "Phase 2", plain: "Flagged for reconciliation and the reconciliation entry is not on file yet. CBP's second phase (live since June 29, 2026) accepts these while the entry is unliquidated or within 80 days of liquidation.", quote: P2 + ". Consistent with CAPE Phase 1, the entries flagged for reconciliation will be limited to unliquidated entries and entries within 80 days of liquidation.", sourceId: "FAQ" };
  return { id: 1, chip: "Phase 1", plain: entry.liquidationDate ? `Customs finalized this entry within the last ${windowDays} days, so CBP's first phase covers it.` : "The entry is not finalized yet (unliquidated), so CBP's first phase covers it.", quote: P1, sourceId: "FAQ" };
}

export function lockoutsOf(entry: Entry): Lockout[] {
  const out: Lockout[] = [];
  if (entry.pscNeededNonIeepa) out.push({
    id: "psc", marker: "Locks out PSC", kind: "locks_out", title: "A correction (PSC) must go in before CAPE",
    plain: "A correction (post-summary correction, PSC) is still pending. Once Customs accepts a CAPE file, you cannot file corrections for these shipments. File it first, then add the shipment to CAPE.",
    quote: "Once I have filed a CAPE Declaration, can I submit any PSCs or Protests for the entries included in my Declaration? No. ... If you need to file a PSC for an issue that is not related to IEEPA duties, you should file that PSC prior to filing your CAPE Declaration.", sourceId: "FAQ",
  });
  const ps = entry.protestStatus;
  if (ps === "Open" || ps === "Suspended" || (ps === "Denied" && entry.afrBox)) out.push({
    id: "protest", marker: "Protest blocks CAPE", kind: "rejects", title: "An open protest and CAPE do not mix",
    plain: `This shipment has a protest that is ${ps === "Denied" ? "denied with the AFR box checked" : ps.toLowerCase()}. CAPE rejects it today. Resolve the protest first; your broker decides what to do. After a CAPE file is accepted, new protests on the shipment are blocked.`,
    quote: "PROTEST ON ENTRY: Entry cannot be on an Open or Suspended protest. Entry cannot be in Denied status if AFR box is checked", sourceId: "QRG",
  });
  else if (ps && ps !== "None") out.push({
    id: "protest", marker: "Locks out protest", kind: "locks_out", title: "Filing through CAPE blocks later protests",
    plain: `This shipment has a protest on record (${ps.toLowerCase()}). After Customs accepts a CAPE file you cannot file protests on it. For problems unrelated to the tariff, CBP says to wait until the shipment is finalized and the refund is paid.`,
    quote: "If you need to file a Protest regarding non-IEEPA issues on an entry(ies), you should wait until your entries have been liquidated/reliquidated for the applicable entries from your CAPE Declaration. Once the refunds have been issued, you can file a Protest for the non-IEEPA issues you wish to pursue.", sourceId: "FAQ",
  });
  if (entry.drawbackClaim) out.push({
    id: "drawback-claim", marker: "On a drawback claim", kind: "rejects", title: "Already on a drawback claim",
    plain: "This shipment is already designated on a drawback claim, so CAPE rejects it today.",
    quote: "ENTRY ON DRAWBACK: Entry cannot be on a drawback entry", sourceId: "QRG",
  });
  else if (entry.drawbackPlanned) out.push({
    id: "drawback", marker: "Drawback overlap", kind: "overlap", title: "Drawback has to come after CAPE",
    plain: "A drawback claim is planned on this shipment. CBP asks you to put it on a CAPE file first, and the shipment must be finalized (or re-finalized) before it can go on a drawback claim.",
    quote: "You are encouraged to place entry summaries that are eligible for drawback on your CAPE Declaration and submit them prior to filing a drawback claim. Your entry must be in liquidation/reliquidation status (it does not have to be in your ACH account) before it is included on a drawback claim for the imports covered by your CAPE Declaration.", sourceId: "FAQ",
  });
  return out;
}

export function customsFor(entry: Entry, deadlines: Deadlines, opts: { windowDays?: number; warehouseBlocked?: boolean } = {}): CustomsInfo {
  return { phase: phaseOf(entry, deadlines, opts), lockouts: lockoutsOf(entry) };
}
