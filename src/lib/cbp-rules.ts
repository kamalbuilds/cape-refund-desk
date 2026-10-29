/**
 * Rules mirrored from CBP's published CAPE material. Every string below that is
 * a CBP error message is copied verbatim from the "Entry Validation Errors" /
 * "File Validation Errors" tables.
 *
 * Sources (fetched 2026-10-29):
 *  [FAQ]  CBP IEEPA Duty Refunds page (FAQ + error tables, entries "Updated" 4/10/2026 - 10/28/2026)
 *         https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds
 *  [QRG]  ACE Portal Quick Reference Guide "CAPE Declarations and Error Definitions", Pub. 5552-0526 (May 2026)
 *         https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf
 *  [TIN]  CAPE Trade User Information Notice, Pub# 1009-1119 (last updated July 10, 2026)
 *         https://www.cbp.gov/sites/default/files/2026-07/26_0723_trade_information_notice_CAPE.pdf
 *  [CSMS-69056483] Update to Entry-Level Validations for CAPE Declarations
 *         https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41db7e3
 */

export const SOURCES: Record<string, { label: string; url: string }> = {
  FAQ: {
    label: "CBP IEEPA Duty Refunds page (FAQ + error tables)",
    url: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds",
  },
  QRG: {
    label: "ACE QRG: CAPE Declarations and Error Definitions (Pub. 5552-0526, May 2026)",
    url: "https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf",
  },
  TIN: {
    label: "CAPE Trade User Information Notice (Pub# 1009-1119, updated July 10, 2026)",
    url: "https://www.cbp.gov/sites/default/files/2026-07/26_0723_trade_information_notice_CAPE.pdf",
  },
  "CSMS-69056483": {
    label: "CSMS # 69056483 - Update to Entry-Level Validations for CAPE Declarations",
    url: "https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41db7e3",
  },
};

/** File Validation Errors table, verbatim */
export const FILE_ERRORS = {
  EMPTY: "CSV content is empty or missing the header",
  NOT_CSV: "Not a CSV file",
  TOO_BIG: "The file size exceeds 1mb. Please split the data into smaller files before reuploading",
  UNSAFE: "The file is deemed unsafe. Please correct the file data before reuploading",
  TOO_MANY: "The file exceeds the maximum 10,000 allowed entry numbers per file",
  FILER_CODE: "Filer Code not matching",
  DUPLICATE: "Duplicate Entry",
  NOT_11: "Not 11 characters long",
  ACCOUNT_MISMATCH: "Account Mismatch",
  NOT_FOUND: "Entry Summary Not Found or Archived in ACE",
} as const;

/** Entry Validation Errors table, verbatim */
export const ENTRY_ERRORS = {
  DRAWBACK: "Entry on Drawback",
  RECON_FILED: "Recon Already Filed for Entry Summary",
  CANCELLED: "Entry Summary is Cancelled/Rejected",
  FINAL_LIQ: "Entry Summary is in Final Liquidation Status",
  TRADE_CONTROL: "Entry Summary is in Trade Control",
  INJUNCTION: "Entry Summary is Subject to Court Injunction",
  NOT_FOUND: "Entry Summary Not Found or Archived in Ace",
  SUSPENSION: "Entry Summary Pending Liquidation or Not Liquidated and Has Suspension Record",
  UNDER_REVIEW: "Entry Summary Under Review",
  TYPE_NOT_ALLOWED: "Entry Type Not Allowed",
  VALUE_ON_HTS: "Value Not Allowed on HTS",
  NO_IEEPA: "No IEEPA HTS on Entry",
  PROTEST: "Protest on Entry",
  STATEMENT: "Statement Processing Not Complete",
  INVALID_HTS: "Invalid HTS",
  HTS_RELATIONSHIP: "HTS Relationship Mismatch",
  UNABLE_CALC: "Unable to Calculate Duty-'X' Duty Comp Code",
  UNEXPECTED: "Unexpected Error-try Again",
  SPI_OR_HTS: "SPI or Additional HTS Required",
} as const;

/** Definitions, verbatim, so the UI can show what CBP says the error means */
export const ERROR_DEFINITIONS: Record<string, string> = {
  [ENTRY_ERRORS.DRAWBACK]: "Entry cannot be on a drawback entry",
  [ENTRY_ERRORS.RECON_FILED]:
    "Entry has Reconciliation entry on file and is currently not allowed for CAPE processing",
  [ENTRY_ERRORS.CANCELLED]: "Entry summary status must be \u201cAccepted\u201d",
  [ENTRY_ERRORS.FINAL_LIQ]: "Entry summary liquidated/reliquidated more than 80 days ago",
  [ENTRY_ERRORS.TRADE_CONTROL]: "Control status for the entry summary must be with CBP",
  [ENTRY_ERRORS.INJUNCTION]: "Entry summary cannot be flagged for injunction",
  [ENTRY_ERRORS.NOT_FOUND]: "Entry must exist",
  [ENTRY_ERRORS.SUSPENSION]:
    "Entry summary has a liquidation status of \u201cPending\u201d or \u201cNot Liquidated\u201d and has a Suspension record",
  [ENTRY_ERRORS.UNDER_REVIEW]: "Entry cannot be in adjusted status",
  [ENTRY_ERRORS.TYPE_NOT_ALLOWED]:
    "Entry type cannot be TIB (23), Duty Deferral (08), Reconciliation (09), or Drawback (047)",
  [ENTRY_ERRORS.VALUE_ON_HTS]: "A goods value amount greater than $0.00 on any chapter 99 HTS code is not permitted",
  [ENTRY_ERRORS.NO_IEEPA]: "Entry must have at least one IEEPA HTS",
  [ENTRY_ERRORS.PROTEST]:
    "Entry cannot be on an Open or Suspended protest. Entry cannot be in Denied status if AFR box is checked",
  [ENTRY_ERRORS.STATEMENT]:
    "Entry cannot be on a statement that is authorized for payment, but the payment has not yet processed",
  [ENTRY_ERRORS.INVALID_HTS]:
    "The line action date is not within the begin date and the end date of at least one HTS code on the entry",
  [ENTRY_ERRORS.HTS_RELATIONSHIP]:
    "An HTS code designated as an add/replace/derived HTS code exists on the entry, but the corresponding HTS code has not been provided",
  [FILE_ERRORS.FILER_CODE]:
    "For Filer and Organizational Broker, first 3 characters of Entry Number must match Filer Code of account",
  [FILE_ERRORS.DUPLICATE]: "CSV file has duplicate Entry Numbers",
  [FILE_ERRORS.NOT_11]: "Entry Number must be 11 characters without dashes",
};

/** Hard numbers from CBP, each with its source */
export const LIMITS = {
  /** [FAQ] "Each individual CAPE Declaration has a limit of 9,999 entries." */
  maxEntriesPerDeclaration: 9999,
  /** [QRG]/[FAQ error table] "exceeds the maximum 10,000 allowed entry numbers per file" */
  hardFileEntryError: 10000,
  /** [QRG] "exceed 1mb size limit" */
  maxFileBytes: 1024 * 1024,
  /** [FAQ] "ACE accepts CAPE Declarations containing entries liquidated within the preceding 80 days" */
  liquidationWindowDays: 80,
  /** [FAQ] "reliquidate entries by the 90th day ... 19 U.S.C. 1501" */
  reliquidationLimitDays: 90,
  /** [FAQ] protest contesting refund amount "within 180 days after the date of liquidation or reliquidation" (19 U.S.C. 1514) */
  protestDays: 180,
  /** [FAQ] "If the reconciliation filing deadline is close to expiring (e.g., less than 30 days) ... prioritize the filing of the reconciliation" */
  reconPriorityDays: 30,
  /** [FAQ] entry types excluded: Duty Deferral (08), Reconciliation (09), TIB (23), Drawback (047) */
  excludedEntryTypes: ["08", "09", "23", "47"],
} as const;

export const FRAMEWORK_GROUPS: Record<string, string> = {
  EU: "European Union",
  JP: "Japan",
  KR: "South Korea",
  CH: "Switzerland/Liechtenstein",
};

/** Condensed, quoted rule text handed to Ultra as grounding context (see data/cbp-rules.md) */
export const FILING_ORDER_RULES = [
  {
    id: "psc-first",
    rule: "File any PSC for non-IEEPA issues BEFORE the CAPE Declaration.",
    quote:
      "If you need to file a PSC for an issue that is not related to IEEPA duties, you should file that PSC prior to filing your CAPE Declaration.",
    sourceId: "FAQ",
  },
  {
    id: "recon-before-09",
    rule: "Recon-flagged entries (01/02/06) go on CAPE before the Type 09 is filed; once the Type 09 is filed they are not eligible in this phase.",
    quote:
      "Once the entries flagged for reconciliation are accepted on a CAPE declaration, the trade may file the reconciliation entry... Once a reconciliation entry is filed, the underlying entries will not be eligible to be filed on a CAPE Declaration in this phase",
    sourceId: "FAQ",
  },
  {
    id: "recon-deadline",
    rule: "If a reconciliation filing deadline is under 30 days away, file the Recon first (deposit duties without the increased IEEPA duties).",
    quote:
      "If the reconciliation filing deadline is close to expiring (e.g., less than 30 days), the trade will need to prioritize the filing of the reconciliation.",
    sourceId: "FAQ",
  },
  {
    id: "cape-before-drawback",
    rule: "Put drawback-eligible entries on CAPE before filing the drawback claim.",
    quote:
      "You are encouraged to place entry summaries that are eligible for drawback on your CAPE Declaration and submit them prior to filing a drawback claim.",
    sourceId: "FAQ",
  },
  {
    id: "protest-after-liq",
    rule: "Non-IEEPA protests wait until the entries from the CAPE Declaration have liquidated/reliquidated and refunds are issued.",
    quote:
      "If you need to file a Protest regarding non-IEEPA issues on an entry(ies), you should wait until your entries have been liquidated/reliquidated for the applicable entries from your CAPE Declaration.",
    sourceId: "FAQ",
  },
  {
    id: "irreversible",
    rule: "An accepted declaration cannot be amended, cancelled, or have entries removed; each entry can be on only one accepted declaration.",
    quote:
      "Once you have filed a CAPE Declaration, you cannot remove entries from the Declaration or cancel the Declaration.",
    sourceId: "FAQ",
  },
  {
    id: "no-psc-protest-after",
    rule: "After filing, no PSCs or Protests may be submitted for the entries on the Declaration.",
    quote:
      "Once I have filed a CAPE Declaration, can I submit any PSCs or Protests for the entries included in my Declaration? No.",
    sourceId: "FAQ",
  },
] as const;
