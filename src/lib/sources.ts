/**
 * Every authority the app relies on, with a link. Each URL was fetched and returned HTTP 200 on 2026-10-30
 * (`node scripts/check-sources.mjs` re-checks them), and the two CSMS pages and the CBP page were read for the claim made here.
 */
export interface SourceRow { id: string; kind: "CBP page" | "CBP guide" | "CSMS" | "19 CFR" | "19 U.S.C."; label: string; url: string; use: string }
export const VERIFIED_ON = "2026-10-30";

export const SOURCE_PANEL: SourceRow[] = [
  { id: "FAQ", kind: "CBP page", label: "CBP: IEEPA Duty Refunds (FAQ and error tables)", url: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds",
    use: "The 80-day liquidation window, who is eligible, the CAPE error list. Rule-watch diffs this page." },
  { id: "QRG", kind: "CBP guide", label: "ACE quick reference guide: CAPE Declarations and Error Definitions (May 2026)", url: "https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf",
    use: "CSV format (entry number column, 11 characters, apostrophe for a leading zero), 9,999 entries and 1MB per file." },
  { id: "TIN", kind: "CBP guide", label: "CAPE Trade User Information Notice (updated 10 Jul 2026)", url: "https://www.cbp.gov/sites/default/files/2026-07/26_0723_trade_information_notice_CAPE.pdf",
    use: "How CAPE declarations are accepted and refunded." },
  { id: "CSMS-69127837", kind: "CSMS", label: "CSMS 69127837: CAPE for IEEPA refunds, warehouse entries", url: "https://content.govdelivery.com/bulletins/gd/USDHSCBP-41ece9d",
    use: "From 7 Jul 2026 warehouse entry types 21 and 22 are rejected with ENTRY TYPE NOT ALLOWED. Drives the rule re-score demo." },
  { id: "CSMS-69056483", kind: "CSMS", label: "CSMS 69056483: update to entry-level validations for CAPE declarations", url: "https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41db7e3",
    use: "The HTS and value validations behind the PSC-first rule." },
  { id: "19CFR24.72", kind: "19 CFR", label: "19 CFR 24.72: claims; set-off", url: "https://www.ecfr.gov/current/title-19/section-24.72",
    use: "Why an importer's open debt can absorb a refund (the diversion warning)." },
  { id: "19CFR159.9", kind: "19 CFR", label: "19 CFR 159.9: notice of liquidation and date of liquidation", url: "https://www.ecfr.gov/current/title-19/section-159.9",
    use: "What counts as the liquidation date the 80-day window and protest clock start from." },
  { id: "19CFR174.12", kind: "19 CFR", label: "19 CFR 174.12: filing of protests", url: "https://www.ecfr.gov/current/title-19/section-174.12",
    use: "Protest filing rules for entries that CAPE cannot take." },
  { id: "19USC1514", kind: "19 U.S.C.", label: "19 U.S.C. 1514: protest against decisions of Customs", url: "https://www.law.cornell.edu/uscode/text/19/1514",
    use: "The 180-day protest window shown in the deadline calendar." },
  { id: "19USC1505", kind: "19 U.S.C.", label: "19 U.S.C. 1505: payment of duties and fees", url: "https://www.law.cornell.edu/uscode/text/19/1505",
    use: "Interest on refunds. CBP adds it; this tool never estimates it." },
];
