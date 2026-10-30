/**
 * Refund-offer check. Pure TypeScript, no network, no AI call.
 * An importer pastes a recovery firm's offer (email or contract text); we extract the commercial terms with plain
 * pattern matching and flag them against what CBP itself has published about IEEPA refund scams and who gets paid.
 *
 * Honest limits: this is pattern matching on English text. It can miss a term that is worded oddly and it can misread
 * one. Every flag quotes the sentence it fired on so the reader can judge. It is not legal advice.
 *
 * Every CBP quote below was copied from the live page on 2026-10-30 (see CBP_CITES). Our own rules (fee thresholds,
 * upfront fees) are labelled as ours, not CBP's.
 */

export type Severity = "high" | "medium" | "info";
export const CHECKED_ON = "2026-10-30";

export interface CbpCite { id: string; source: string; url: string; quote: string }
const FAQ = "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds";
const FRAUD = "https://www.cbp.gov/sites/default/files/2026-07/26_0706_ieepa_cape_fraud_fact_sheet.pdf";
const CSMS = "https://content.govdelivery.com/bulletins/gd/USDHSCBP-41649df";

/** Verbatim CBP wording. Page, section and date are in `source`. */
export const CBP_CITES: Record<string, CbpCite> = {
  "no-fees": { id: "no-fees", source: "CBP IEEPA Duty Refunds page, FAQ: Are there any fees or charges to receive a tariff refund? (updated 5/20/2026)", url: FAQ,
    quote: "No. CBP does not charge any fees for processing tariff refunds. If you are asked to pay a fee or provide financial information by a party claiming to be CBP, it is a scam" },
  "only-ace": { id: "only-ace", source: "CBP Fact Sheet: CAPE Refund Fraud Solicitation (Pub. 5619-0792, July 2026)", url: FRAUD,
    quote: "Submitting your CAPE Declaration in ACE is the only way to submit a request for an IEEPA refund." },
  "no-passwords": { id: "no-passwords", source: "CBP Fact Sheet: CAPE Refund Fraud Solicitation (Pub. 5619-0792, July 2026)", url: FRAUD,
    quote: "Do not share your ACE passwords." },
  "unverified-parties": { id: "unverified-parties", source: "CBP Fact Sheet: CAPE Refund Fraud Solicitation (Pub. 5619-0792, July 2026)", url: FRAUD,
    quote: "Never send your information to unverified parties." },
  "watch-for": { id: "watch-for", source: "CSMS # 68569567: Best Practices for Protecting Your Information Regarding IEEPA Refunds", url: CSMS,
    quote: "Watch out for: Requests for personal or financial information. Offers of refunds in exchange for data. Unsolicited emails, calls, or texts. Pressure to act quickly." },
  "on-your-behalf": { id: "on-your-behalf", source: "CSMS # 68569567: Best Practices for Protecting Your Information Regarding IEEPA Refunds", url: CSMS,
    quote: "If someone you do not know tells you they will file for an IEEPA refund on your behalf if you provide them with your personal information, company information, or banking information, this may be a scam." },
  "no-other-site": { id: "no-other-site", source: "CSMS # 68569567: Best Practices for Protecting Your Information Regarding IEEPA Refunds", url: CSMS,
    quote: "Do not enter any information into a website other than ACE that claims to process IEEPA refunds." },
  "sensitive-info": { id: "sensitive-info", source: "CSMS # 68569567: Best Practices for Protecting Your Information Regarding IEEPA Refunds", url: CSMS,
    quote: "CBP will generally not request sensitive information to process IEEPA refunds, such as Social Security numbers, bank account details, or passwords, via email or text message." },
  "cbp-domain": { id: "cbp-domain", source: "CSMS # 68569567: Best Practices for Protecting Your Information Regarding IEEPA Refunds", url: CSMS,
    quote: "all CBP email addresses end in \u201c@cbp.dhs.gov\u201d" },
  "bank-in-ace": { id: "bank-in-ace", source: "CBP IEEPA Duty Refunds page, summary of actions to request refunds", url: FAQ,
    quote: "Recipients use the ACE Portal account to provide CBP with bank account information" },
  "payee": { id: "payee", source: "CBP IEEPA Duty Refunds page, FAQ: Is CBP sending refunds directly to consumers\u2026? (updated 5/20/2026)", url: FAQ,
    quote: "CBP is only able to refund IEEPA duties to the Importer of Record or the Notify Party (designated on CBP Form 4811) who have their U.S. bank account information in their ACE Portal account." },
  "ach-verified": { id: "ach-verified", source: "CBP IEEPA Duty Refunds page, FAQ: What is CBP doing to make sure that CAPE is not vulnerable to fraud or abuse? (updated 9/2/2026)", url: FAQ,
    quote: "With rare exceptions, all refunds will be made through a secure ACH payment to a verified party, not through a paper check disbursed through the mail to a non-verified address." },
  "who-files": { id: "who-files", source: "CBP IEEPA Duty Refunds page, FAQ: Who can file a CAPE Declaration? (updated 4/10/2026)", url: FAQ,
    quote: "Only the IOR or the licensed customs broker who filed the entries can file a CAPE Declaration." },
  "notify-party": { id: "notify-party", source: "CBP IEEPA Duty Refunds page, FAQ: Who will receive the refund(s) associated with the CAPE Declaration? (updated 4/10/2026)", url: FAQ,
    quote: "The IOR or the party designated by the IOR (the 4811 notify party) on either the CBP Form 4811 (Special Address Notification) or on the ACE Portal account, and on the entry summary will be eligible to receive refunds." },
  "can-be-bill": { id: "can-be-bill", source: "CBP IEEPA Duty Refunds page, FAQ: Can my CAPE Declaration result in a bill? (updated 9/2/2026)", url: FAQ,
    quote: "It is possible to receive a bill after CAPE processing if the amount paid on the entry as a whole is less than the recalculated duty owed at liquidation or reliquidation." },
  "timing": { id: "timing", source: "CBP IEEPA Duty Refunds page, FAQ: How long will it take for me to get my refund? (updated 5/20/2026)", url: FAQ,
    quote: "valid IEEPA refunds will generally be issued within 60 - 90 days following acceptance of the CAPE Declaration, unless a compliance concern requires further CBP review." },
  "no-cancel": { id: "no-cancel", source: "CBP IEEPA Duty Refunds page, FAQ: Can I amend my CAPE Declaration\u2026? / After I filed my CAPE Declaration\u2026 (updated 5/20/2026)", url: FAQ,
    quote: "Once you have filed a CAPE Declaration, you cannot remove entries from the Declaration or cancel the Declaration." },
};

/** Published prices used in the example comparison. Anything not verifiable on the as-of date is left out. */
export const PUBLISHED_FLAT_FEE = {
  name: "Saxum CAPE Refund Preflight (manual specialist service)",
  usd: 499, wording: "From $499 per claim population", asOf: CHECKED_ON,
  url: "https://saxumsystems.com/products/cape-refund-preflight.html",
  note: "Published as a starting price (\u201cindicative\u201d). It is a preflight check, so you still file in ACE yourself.",
} as const;
export const PUBLISHED_CONTINGENCY = {
  name: "Tariffi", tiers: [10, 15, 18], asOf: CHECKED_ON, url: "https://tariffi.io",
  wording: "Contingency fee tiers (10% / 15% / 18%)",
} as const;
/** Our own yardstick, not CBP's: above the top published tier we call the percentage high. */
export const FEE_HIGH_PCT = PUBLISHED_CONTINGENCY.tiers[2];
export const FEE_VERY_HIGH_PCT = 30;

export interface Hit { text: string }
export interface Extracted {
  feePct: { low: number; high: number; all: number[] } | null;
  upfrontUsd: number | null;          // sum of non-negated upfront amounts
  upfrontMentionedNoAmount: boolean;
  noUpfrontStated: boolean;
  flatFeeUsd: number | null;
  perEntryUsd: number | null;
  minimumFeeUsd: number | null;       // a floor on the fee, owed even when the percentage comes to less
  noRecoveryNoFee: boolean;
  credentials: { password: Hit[]; aceAccess: Hit[]; ssn: Hit[]; bankDetails: Hit[]; neverAsks: boolean };
  poa: { mentioned: boolean; limited: boolean; broad: boolean; licensedBroker: boolean; hit?: Hit };
  exclusivity: { exclusive: Hit[]; termMonths: number | null; autoRenew: boolean; tail: Hit[]; noCancel: Hit[]; canCancel: boolean };
  payment: { destination: "firm" | "importer" | "unclear"; firm: Hit[]; importer: Hit[]; notifyParty: Hit[]; debitAuth: Hit[]; changeAch: Hit[] };
  urgency: Hit[];
  guarantees: Hit[];
  noGuarantee: boolean;
  promisedDays: number | null;
  impersonation: Hit[];
  lookalikeDomains: string[];
  ownPortal: Hit[];
}

export interface Flag { id: string; severity: Severity; title: string; detail: string; evidence: string[]; cites: string[] }
export interface GoodSign { id: string; text: string; evidence?: string }
export type Verdict = "high" | "review" | "minor" | "clean";
export interface OfferReport {
  empty: boolean; truncated: boolean; text: string;
  extracted: Extracted; flags: Flag[]; good: GoodSign[];
  verdict: Verdict; verdictLabel: string; verdictLine: string;
}

const MAX_CHARS = 20000;

/** Sentence-ish segments, each kept with its original wording. */
export function sentences(text: string): string[] {
  const DOT = "\u2024"; // protect abbreviations so "U.S. Customs" is not split into two sentences
  const protectedText = text.replace(/\r/g, "").replace(/\b(U\.S|e\.g|i\.e|vs|Inc|Ltd|LLC|Co|No|approx|etc|Mr|Ms|Dr)\./gi, (m) => m.slice(0, -1) + DOT).replace(/\bU\.S\b/g, "U" + DOT + "S");
  return protectedText.split(/(?<=[.!?])\s+|\n+|\s+[\u2022\u2013\-*]\s+/).map((x) => x.replaceAll(DOT, ".").trim()).filter((x) => x.length > 2);
}
const clip = (s: string, n = 240) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s);
const NEG = /\b(never|not|no|nor|neither|without|won'?t|don'?t|doesn'?t|do not|does not|will not|cannot|can'?t|isn'?t|aren'?t)\b/i;
const REQUEST = /\b(provide|send|share|give|need|needs|require[sd]?|submit|hand|email|supply|enter|grant|upload|disclose|forward|text|reply with|authori[sz]e|access to|log ?in)\b/i;

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90 };
const num = (s: string): number | null => { const n = Number(s.replace(/,/g, "")); if (Number.isFinite(n)) return n; return WORD_NUM[s.toLowerCase()] ?? null; };
const usd = (s: string) => Number(s.replace(/[$,\s]/g, ""));

function matching(sents: string[], re: RegExp, skip?: (s: string) => boolean): Hit[] {
  return sents.filter((s) => re.test(s) && !(skip && skip(s))).map((s) => ({ text: clip(s) }));
}

const FEE_WORD = /\b(fees?|contingen\w*|commissions?|success[- ]fee|retain\w*|charge[sd]?|compensation|we (?:take|collect|keep|receive|earn)|our (?:share|cut|percentage)|pay us|cost)\b/i;

function extractFeePcts(sents: string[]): number[] {
  const out: number[] = [];
  for (const s of sents) {
    if (!FEE_WORD.test(s)) continue;
    const re = /(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per ?cent|pct)(?!\s*(?:ieepa|duty|duties|tariff|rate|interest|reciprocal|fentanyl|framework))/gi;
    for (const m of s.matchAll(re)) {
      const v = Number(m[1]);
      if (v > 0 && v <= 100) out.push(v);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

const UP_STRONG = /\b(up-?front|retainer|deposit|prepay\w*|pre-?payment|payable in advance|paid in advance)\b/i;
const UP_TIMING = /\b(onboarding|set-?up|activation|processing|engagement|administrative|admin|registration|application|enrol?lment|verification|filing|due (?:now|today|at signing|on signing|upon signing|before|immediately|within)|payable (?:now|today|at signing|on signing|upon signing)|paid (?:now|today|before)|to begin|to start|to get started|before we (?:file|start|begin))\b/i;
const UP_NEG = /\b(no|zero|without|never|nothing|free of|waive[sd]?)\b[^.]{0,45}\b(up-?front|retainer|deposit|advance|set-?up|onboarding|activation|processing|hidden|out[- ]of[- ]pocket)\b|\b(up-?front|retainer|deposit)\b[^.]{0,25}\b(is |are )?(\$0|waived|none|free)\b/i;

function extractMoney(sents: string[]) {
  let upfront = 0, upfrontAny = false, upfrontNoAmount = false, noUpfront = false, flat: number | null = null, perEntry: number | null = null;
  for (const s of sents) {
    if (UP_NEG.test(s)) { noUpfront = true; continue; }
    const amt = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(s);
    const perEntryM = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:per|\/|each|for every)\s*(?:entry|entries|filing|declaration|shipment)|(?:per|each) (?:entry|filing|declaration)[^.$]{0,25}\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i.exec(s);
    if (perEntryM) { perEntry = usd(perEntryM[1] ?? perEntryM[2]); continue; }
    const flatM = /\bflat\b[^.$]{0,25}\$\s?(\d[\d,]*(?:\.\d{1,2})?)|\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*flat\b/i.exec(s);
    const timing = UP_STRONG.test(s) || (UP_TIMING.test(s) && /\b(fee|charge|payment|cost|pay)\b/i.test(s));
    if (flatM) flat = usd(flatM[1] ?? flatM[2]);
    if (amt && timing && !/%\s*(?:of|on)\s+(?:the\s+)?(?:first\s+)?\$/i.test(s)) { upfront += usd(amt[1]); upfrontAny = true; }
    else if (!amt && UP_STRONG.test(s)) upfrontNoAmount = true;
    else if (flatM && !timing) { /* flat fee with no timing words: priced, but not stated as upfront */ }
  }
  if (flat !== null && upfrontAny && upfront === flat) flat = null; // same number counted twice
  return { upfrontUsd: upfrontAny ? upfront : null, upfrontNoAmount: upfrontNoAmount && !upfrontAny, noUpfront: noUpfront && !upfrontAny, flat, perEntry };
}

const MIN_NEG = /\b(?:no|zero|without|waive[sd]?)\b[^.$]{0,20}\bminimum/i;
const MIN_NOT_FEE = /\bminimum\s+(?:refund|claim|duty|duties|entries|entry|value|order|volume|amount of (?:refund|duty))/i;
/** A fee floor: "minimum fee of $5,000", "$2,500 minimum", "at least $3,000 in fees". The largest one stated wins. */
function extractMinimum(sents: string[]): number | null {
  let best: number | null = null;
  for (const s of sents) {
    if (MIN_NEG.test(s) || MIN_NOT_FEE.test(s) || !/\b(fees?|charge[sd]?|commission|billing|payment|retainer)\b/i.test(s)) continue;
    const m = /\bminimum\b[^.$]{0,40}\$\s?(\d[\d,]*(?:\.\d{1,2})?)|\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*minimum\b|\b(?:no less than|at least)\s*\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i.exec(s);
    const v = m ? usd(m[1] ?? m[2] ?? m[3]) : NaN;
    if (Number.isFinite(v) && v > 0) best = Math.max(best ?? 0, v);
  }
  return best;
}

function extractCredentials(sents: string[]) {
  const ok = (s: string) => REQUEST.test(s) && !NEG.test(s);
  const password = matching(sents, /\b(passwords?|passcodes?|log-?in credentials|login details|usernames?|credentials)\b/i, (s) => !ok(s));
  const aceAccess = matching(sents, /\b(\bace\b[^.]{0,70}\b(?:access|account|log-?in|login|portal|credentials)\b|(?:add|invite|make|designate|set up) (?:us|our \w+(?: \w+)?) (?:as|to)[^.]{0,40}\b(?:user|sub-?account|account|trade account owner|tao)\b|\btrade account owner\b|\bTAO\b)/i, (s) => (!ok(s) && !/\b(add|invite|make|designate|set up) (us|our)/i.test(s)) || (/\b(ach|refund account|routing|bank)\b/i.test(s) && !/\b(password|log-?in|login|credentials|access|username|trade account owner|tao|user)\b/i.test(s)));
  const ssn = matching(sents, /\b(social security|ssn|driver'?s licen[sc]e|passport)\b/i, (s) => !ok(s));
  const bankDetails = matching(sents, /\b(routing number|account number|bank (?:account )?(?:details|information|login|credentials|statements?)|voided check|online banking|banking (?:details|information))\b/i, (s) => !ok(s));
  const neverAsks = sents.some((s) => /\b(never|do not|don'?t|will not|won'?t|no need to)\b[^.]{0,40}\b(ask|request|need|require|share|provide|give)\b[^.]{0,50}\b(password|log-?in|credential|bank|ace)\b/i.test(s));
  return { password, aceAccess, ssn, bankDetails, neverAsks };
}

function extractPoa(sents: string[], full: string) {
  const hits = sents.filter((s) => /\b(power of attorney|POA)\b/i.test(s));
  const all = hits.join(" ");
  return {
    mentioned: hits.length > 0,
    limited: /\blimited (?:power of attorney|POA)\b/i.test(all),
    broad: /\b(general|full|unlimited|irrevocable|durable|broad)\s+(?:power of attorney|POA)\b/i.test(all) || /\bPOA\b[^.]{0,30}\birrevocable\b/i.test(all),
    licensedBroker: /\bcustoms broker\b/i.test(full) || /\b19 CFR (?:part )?111\b/i.test(full),
    hit: hits[0] ? { text: clip(hits[0]) } : undefined,
  };
}

function extractExclusivity(sents: string[]) {
  const exclusive = matching(sents, /\b(exclusive(?:ly)?|sole (?:and exclusive )?(?:right|agent|representative|provider)|lock-?in|locked in|right of first refusal|may not (?:use|engage|hire|work with|retain)[^.]{0,30}(?:other|another|any other)|no other (?:broker|firm|provider|party)|only (?:we|our firm) (?:may|can|will))\b/i, (s) => /\b(not|non-?|no)\s+exclusive/i.test(s) || /\bnon-?exclusive\b/i.test(s));
  let termMonths: number | null = null;
  for (const s of sents) {
    if (!/\b(term|agreement|contract|commit\w*|lock|exclusive|renew\w*|engagement)\b/i.test(s)) continue;
    const m = /(\d{1,3}|one|two|three|six|twelve)[- ](month|year)s?\b/i.exec(s);
    if (m) { const n = num(m[1]); if (n) { const mo = /year/i.test(m[2]) ? n * 12 : n; termMonths = Math.max(termMonths ?? 0, mo); } }
  }
  const autoRenew = sents.some((s) => /\b(auto-?renew\w*|automatically (?:renew|extend)\w*|renews? automatically|evergreen)\b/i.test(s) && !NEG.test(s.split(/auto|automatic|renews/i)[0] ?? ""));
  const tail = matching(sents, /\b(tail (?:period|clause|fee)|(?:fee|commission|obligation)s? (?:shall |will |would )?(?:survive|continue|still appl\w+|remains?)|survive[sd]? (?:termination|cancell?ation)|even if you (?:file|recover|receive|claim|obtain|apply|get)[^.]{0,70}(?:yourself|on your own|directly|through (?:another|other|someone)|without us|elsewhere)|regardless of (?:who files|whether we|who recovers)|for (?:\d{1,3}|six|twelve|eighteen|twenty-four) (?:months|years) (?:after|following) (?:termination|cancell?ation|the end))\b/i);
  const noCancel = matching(sents, /\b(non-?cancell?able|cannot (?:be )?cancel\w*|may not (?:be )?cancel\w*|no (?:right to )?cancell?ation|irrevocable|early termination fee|non-?refundable)\b/i);
  const canCancel = sents.some((s) => /\b(cancel\w*|terminate\w*)\b[^.]{0,60}\b(any ?time|at any time|for any reason|with \d+ days'? (?:written )?notice|upon \d+ days'? (?:written )?notice)\b/i.test(s) || /\bno (?:lock-?in|minimum term|long[- ]term (?:contract|commitment))\b/i.test(s)) && noCancel.length === 0;
  return { exclusive, termMonths, autoRenew, tail, noCancel, canCancel };
}

function extractPayment(sents: string[]) {
  const firmSkip = (s: string) => NEG.test(s.split(/\b(?:our|escrow|trust|fbo|clearing|firm)/i)[0] ?? "") || /\b(no|never|not)\b[^.]{0,40}\b(escrow|fbo|clearing|our (?:bank )?account|money path|route|routed|hold)/i.test(s);
  const firm = [
    ...matching(sents, /\b(refunds?|payments?|funds|proceeds|ach|deposits?|checks?|money|reimbursements?)\b[^.]{0,80}\b(?:to|into|through|via|by|with)\b[^.]{0,25}\b(?:our|the firm'?s|the company'?s|the agency'?s|escrow|trust|fbo|clearing|collection|settlement|lockbox)\b/i, firmSkip),
    ...matching(sents, /\b(?:route|redirect|direct|wire|send|forward|deposit|remit|pay|paid)\w*\b[^.]{0,60}\b(?:to us|our (?:bank |escrow |trust |client |settlement )?(?:account|escrow)|escrow|trust account|fbo|clearing account|lockbox|our address|our p\.?o\.? box)\b/i, firmSkip),
  ];
  const changeAch = matching(sents, /\b(?:change|update|replace|switch|redirect)\b[^.]{0,35}\b(?:your )?(?:ach|bank|refund|banking|deposit)\b[^.]{0,50}\b(?:to|with|instructions|account)\b/i, (s) => NEG.test(s) && /\b(never|do not|don'?t|won'?t|will not)\b/i.test(s));
  const importer = matching(sents, /\b(?:directly|straight|automatically)\b[^.]{0,45}\b(?:to you|into your|your (?:own |company'?s )?(?:bank|account|ach))|\byour own (?:bank|account|ach|designated)|\b(?:paid|deposited|sent|issued)\b[^.]{0,45}\bto (?:the )?(?:importer of record|you)\b|\b(?:cbp|treasury|customs)\b[^.]{0,45}\b(?:pays?|deposit\w*|sends?|issues?|refunds?)\b[^.]{0,45}\b(?:you|your|importer of record)\b/i);
  const notifyParty = matching(sents, /\b(?:4811|notify party|special address notification)\b/i, (s) => /\b(not|no|never)\b[^.]{0,30}\b(4811|notify)/i.test(s));
  const debitAuth = matching(sents, /\b(?:pre-?authori[sz]ed ach|ach debit|auto-?debit|auto-?pay|debit (?:your|the) (?:bank )?account|standing (?:authori[sz]ation|debit)|direct debit|authori[sz]e us to (?:debit|charge|withdraw)|charge your card)\b/i);
  const destination: Extracted["payment"]["destination"] = firm.length || changeAch.length ? "firm" : importer.length ? "importer" : "unclear";
  return { destination, firm, importer, notifyParty, debitAuth, changeAch };
}

const URGENCY = /\b(act (?:now|fast|quickly|immediately|today)|limited[- ]time|time[- ]sensitive|(?:offer|pricing|rate|spots?|slots?|window|opportunity)\b[^.]{0,25}\b(?:expires?|ends?|closes?|closing|limited|running out)|expires? (?:soon|in \d+|today|tonight|friday|monday|this week)|only \d+ (?:days?|hours?|spots?|slots?|clients?) (?:left|remain\w*|available)|before it'?s too late|last chance|don'?t (?:miss|wait|delay)|do not (?:miss|wait|delay)|hurry|urgent\w*|immediately|sign (?:today|now|by|within|before|this week|tonight)|within (?:24|48|72) hours|(?:reply|respond|call|confirm|reserve)\b[^.]{0,20}\b(?:today|now|within|by (?:tonight|friday|monday|midnight|end of day)|asap)|first[- ]come|asap)\b/i;
const GUARANTEE = /\b(guarantee[sd]?|100% (?:refund|recovery|success|of your)|risk[- ]free|no[- ]risk|assured|(?:will )?(?:definitely|certainly|absolutely) (?:recover|get|receive|secure)|we promise|we will (?:recover|get you|secure|obtain)|you will (?:receive|get|recover) (?:the )?(?:full|all|every)|full refund of (?:all|every)|every (?:dollar|penny|cent))\b/i;
const NO_GUARANTEE = /\b(?:no guarantee|cannot guarantee|can'?t guarantee|do(?:es)? not guarantee|don'?t guarantee|not guaranteed|no promises?|cannot promise|can'?t promise|we do not promise)\b/i;

function extractTimeline(sents: string[]): number | null {
  let best: number | null = null;
  for (const s of sents) {
    if (/\b(cancel\w*|terminat\w*|notice|trial|refund of (?:our|the) fee|money-back)\b/i.test(s) && !/\b(you(?:r)? refund|IEEPA|duty|duties)\b/i.test(s)) continue;
    const m = /\b(?:refunds?|paid|pay|funds|money|deposit\w*|recover\w*|receive|back in your)\b[^.]{0,70}\b(?:within|in|inside|under|as (?:little|fast|quick) as)\s+(\d{1,3}|one|two|three|four|five|six|ten|fifteen|thirty|forty|sixty|ninety)[- ]?(business[- ]days?|days?|weeks?)\b/i.exec(s);
    if (!m) continue;
    const n = num(m[1]); if (!n) continue;
    const days = /week/i.test(m[2]) ? n * 7 : n;
    best = best === null ? days : Math.min(best, days);
  }
  return best;
}

const IMPERSONATE = /\b(?:on behalf of (?:u\.?s\.? )?(?:cbp|customs(?: and border protection)?|the government|the u\.?s\.? government)|(?:working|partner(?:ed|ing)?|affiliated|associated|registered|certified|appointed|authori[sz]ed|approved|selected|chosen|endorsed|sanctioned) (?:with|by|through)(?: the)? (?:u\.?s\.? )?(?:cbp|customs(?: and border protection)?|the (?:u\.?s\.? )?government|federal government|treasury)|(?:official|government|federal) (?:refund |recovery |tariff )?(?:program|portal|processing|claims? (?:center|office|desk)|service)|notice from (?:cbp|customs)|(?:cbp|customs) (?:has )?(?:selected|identified|approved|notified|flagged) (?:you|your)|we are (?:the )?(?:cbp|customs))\b/i;
function extractDomains(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
    const d = m[1].toLowerCase();
    const official = d === "cbp.dhs.gov" || d.endsWith(".cbp.dhs.gov") || d === "associates.cbp.dhs.gov";
    if (!official && /(cbp|customs|ieepa|cape|dhs|treasury|tariff-?refund)/.test(d)) out.add(d);
  }
  return [...out];
}
const OWN_PORTAL = [
  /\b(?:refunds?|claims?|cape|declarations?)\b[^.]{0,70}\b(?:our|the firm'?s|the company'?s) (?:secure )?(?:portal|website|web site|site|platform|app)\b/i,
  /\b(?:our|the firm'?s|the company'?s) (?:secure )?(?:portal|website|web site|site|platform)\b[^.]{0,50}\b(?:process\w*|submit\w*|fil(?:e|es|ing))\b[^.]{0,30}\b(?:refunds?|claims?|declarations?)\b/i,
];

export function extractOffer(raw: string): Extracted {
  const text = raw.slice(0, MAX_CHARS);
  const sents = sentences(text);
  const pcts = extractFeePcts(sents);
  const money = extractMoney(sents);
  const poa = extractPoa(sents, text);
  const payment = extractPayment(sents);
  const credentials = extractCredentials(sents);
  const excl = extractExclusivity(sents);
  const impersonation = matching(sents, IMPERSONATE, (s) => /\b(not|no|never|isn'?t|aren'?t)\b[^.]{0,25}\b(affiliated|endorsed|associated|connected|sponsored|approved|partner)/i.test(s));
  return {
    feePct: pcts.length ? { low: pcts[0], high: pcts[pcts.length - 1], all: pcts } : null,
    upfrontUsd: money.upfrontUsd, upfrontMentionedNoAmount: money.upfrontNoAmount, noUpfrontStated: money.noUpfront,
    flatFeeUsd: money.flat, perEntryUsd: money.perEntry, minimumFeeUsd: extractMinimum(sents),
    noRecoveryNoFee: sents.some((s) => /\bno (?:recovery|refund|results?|win|success),? no (?:fee|charge|cost)\b|\bno fee unless\b|\bonly (?:pay|charge|paid)[^.]{0,30}\b(?:if|when|after)\b[^.]{0,40}\b(?:refund|recover|paid|receive)/i.test(s)),
    credentials, poa, exclusivity: excl, payment,
    urgency: matching(sents, URGENCY, (s) => /\b(not|no)\b[^.]{0,20}\b(pressure|rush|urgent)/i.test(s)),
    guarantees: matching(sents, GUARANTEE, (s) => NO_GUARANTEE.test(s)),
    noGuarantee: sents.some((s) => NO_GUARANTEE.test(s)),
    promisedDays: extractTimeline(sents),
    impersonation, lookalikeDomains: extractDomains(text),
    ownPortal: OWN_PORTAL.flatMap((re) => matching(sents, re, (s) => /\b(never|not|no)\b[^.]{0,30}\b(portal|website|site|platform)/i.test(s))),
  };
}

const ev = (hs: Hit[], n = 2) => hs.slice(0, n).map((h) => h.text);

export function buildFlags(x: Extracted): Flag[] {
  const f: Flag[] = [];
  if (x.impersonation.length || x.lookalikeDomains.length) {
    f.push({ id: "impersonation", severity: "high", title: "Implies it is CBP or a government program",
      detail: x.lookalikeDomains.length
        ? `The text uses a sender domain that looks official but is not CBP's (${x.lookalikeDomains.join(", ")}). CBP's own addresses end in @cbp.dhs.gov.`
        : "The wording suggests the firm is CBP, works for CBP, or runs an official refund program. CBP processes refunds itself, in ACE, for free.",
      evidence: ev(x.impersonation).concat(x.lookalikeDomains.map((d) => `sender domain: ${d}`)), cites: ["no-fees", "cbp-domain"] });
  }
  const c = x.credentials;
  if (c.password.length || c.aceAccess.length) {
    f.push({ id: "credentials", severity: "high", title: "Asks for your ACE login or password",
      detail: "A firm that holds your ACE access can file or change things under your account. CBP says not to share ACE passwords, and a licensed broker files under its own filer code, so it has no need of your login.",
      evidence: ev([...c.password, ...c.aceAccess]), cites: ["no-passwords", "sensitive-info"] });
  }
  if (c.ssn.length) {
    f.push({ id: "ssn", severity: "high", title: "Asks for personal identity documents or an SSN",
      detail: "A CAPE Declaration is a list of entry numbers. CBP says it does not need sensitive personal information to process IEEPA refunds.",
      evidence: ev(c.ssn), cites: ["sensitive-info", "unverified-parties"] });
  }
  if (c.bankDetails.length || x.payment.changeAch.length) {
    f.push({ id: "bank-details", severity: "high", title: "Wants your bank details, or wants your refund bank account changed",
      detail: "Bank details for refunds go to CBP inside your own ACE Portal account. Sending routing numbers to a third party, or changing the ACH account on file, is how a refund gets redirected.",
      evidence: ev([...c.bankDetails, ...x.payment.changeAch]), cites: ["bank-in-ace", "watch-for"] });
  }
  if (x.payment.destination === "firm") {
    f.push({ id: "payee-firm", severity: "high", title: "Refund would be paid to the firm, not to you",
      detail: "CBP pays the Importer of Record (or its 4811 notify party) by ACH to a verified account. Money that lands in a firm's, escrow or trust account first is money you are trusting them to pass on.",
      evidence: ev(x.payment.firm.length ? x.payment.firm : x.payment.changeAch), cites: ["payee", "ach-verified"] });
  }
  if (x.ownPortal.length) {
    f.push({ id: "own-portal", severity: "high", title: "Says the claim is filed on the firm's own website",
      detail: "The only way to request an IEEPA refund is a CAPE Declaration in ACE. A firm's portal can prepare data, but anything that claims to process the refund itself is not how CBP works.",
      evidence: ev(x.ownPortal), cites: ["no-other-site", "only-ace"] });
  }
  if (x.payment.notifyParty.length && x.payment.destination !== "firm") {
    f.push({ id: "notify-party", severity: "medium", title: "Mentions making the firm your Form 4811 notify party",
      detail: "CBP allows the IOR to designate a notify party who receives the refund. That is legal, but it moves the money away from you by design. Prefer to leave the notify party as yourself.",
      evidence: ev(x.payment.notifyParty), cites: ["notify-party", "payee"] });
  }
  if (x.payment.debitAuth.length) {
    f.push({ id: "debit-auth", severity: "medium", title: "Takes a standing debit authorisation on your bank account",
      detail: "A pre-authorised debit lets the firm pull its fee from your account. Make sure the amount, the trigger (refund received) and how to revoke are written down. This is our reading, not a CBP rule.",
      evidence: ev(x.payment.debitAuth), cites: ["watch-for"] });
  }
  if (x.upfrontUsd !== null) {
    f.push({ id: "upfront", severity: "high", title: `Upfront fee of ${fmtUsd(x.upfrontUsd)} before any refund exists`,
      detail: "CBP charges nothing to process a refund. A third party may charge for help, but an upfront fee means you carry the risk. Contingency-only firms are paid after the refund lands. (The CBP quote is about CBP's own fees; the rule that upfront fees are a red flag is ours.)",
      evidence: [], cites: ["no-fees", "watch-for"] });
  } else if (x.upfrontMentionedNoAmount) {
    f.push({ id: "upfront", severity: "medium", title: "Mentions a retainer or deposit but gives no amount",
      detail: "Ask for the exact amount and when it is due. CBP charges nothing to process a refund.", evidence: [], cites: ["no-fees"] });
  }
  if (x.minimumFeeUsd !== null) {
    f.push({ id: "minimum-fee", severity: "medium", title: `Minimum fee of ${fmtUsd(x.minimumFeeUsd)}, owed whatever the refund comes to`,
      detail: "A fee floor means a small refund can cost proportionally far more than the headline percentage. Ask whether the minimum is due if nothing is recovered, and compare it with filing yourself, which costs CBP nothing. This is our reading, not a CBP rule.",
      evidence: [], cites: ["no-fees"] });
  }
  if (x.flatFeeUsd !== null) {
    f.push({ id: "flat-fee", severity: "info", title: `Flat fee of ${fmtUsd(x.flatFeeUsd)} stated`,
      detail: "Included in the example cost below. Check when it is due: before filing counts as upfront.", evidence: [], cites: [] });
  }
  if (x.feePct) {
    const hi = x.feePct.high;
    const range = x.feePct.low === hi ? `${hi}%` : `${x.feePct.low}% to ${hi}%`;
    if (hi > FEE_VERY_HIGH_PCT) f.push({ id: "fee-pct", severity: "high", title: `Contingency fee of ${range} is far above the published range`,
      detail: `Our yardstick, not CBP's: published contingency tiers we found top out at ${FEE_HIGH_PCT}% (${PUBLISHED_CONTINGENCY.name}, as of ${CHECKED_ON}). Anything over ${FEE_VERY_HIGH_PCT}% of a refund you could file yourself for free deserves a hard look.`,
      evidence: [], cites: ["no-fees"] });
    else if (hi > FEE_HIGH_PCT) f.push({ id: "fee-pct", severity: "medium", title: `Contingency fee of ${range} is above the published ${PUBLISHED_CONTINGENCY.tiers[0]}% to ${FEE_HIGH_PCT}% range`,
      detail: `Our yardstick, not CBP's. Ask what the fee covers that you could not do yourself in ACE, and whether it applies to interest.`, evidence: [], cites: ["no-fees"] });
  }
  const e = x.exclusivity;
  const hardTerms = e.tail.length > 0 || e.noCancel.length > 0 || (e.termMonths ?? 0) >= 24;
  if (e.exclusive.length || e.tail.length || e.noCancel.length || e.autoRenew || (e.termMonths ?? 0) >= 12) {
    const bits = [e.exclusive.length ? "exclusivity" : "", e.termMonths ? `a ${e.termMonths}-month term` : "", e.autoRenew ? "auto-renewal" : "", e.tail.length ? "a fee that survives termination (tail)" : "", e.noCancel.length ? "no right to cancel" : ""].filter(Boolean);
    f.push({ id: "lock-in", severity: hardTerms || (e.exclusive.length && e.autoRenew) ? "high" : "medium", title: `Lock-in terms: ${bits.join(", ")}`,
      detail: "Once a CAPE Declaration is accepted it cannot be cancelled or amended, so you want the freedom to stop before it is filed. A fee that applies even when you file yourself, or a term you cannot leave, lets the firm earn on a refund it did not recover.",
      evidence: ev([...e.exclusive, ...e.tail, ...e.noCancel]), cites: ["no-cancel"] });
  }
  if (x.poa.mentioned) {
    const bad = x.poa.broad || !x.poa.licensedBroker;
    f.push({ id: "poa", severity: x.poa.broad ? "high" : bad ? "medium" : "info",
      title: x.poa.broad ? "Asks for a broad or irrevocable power of attorney" : bad ? "Asks for a power of attorney without naming a licensed customs broker" : "Power of attorney to a licensed customs broker",
      detail: bad
        ? "Only the importer of record or the licensed customs broker who filed the entries can file a CAPE Declaration. A POA to anyone else does not give them that right, so ask who actually files and for their broker licence number."
        : "A limited POA to a licensed customs broker is how brokers normally act for an importer. Confirm it is limited to CAPE filing and ask for the broker's licence number.",
      evidence: x.poa.hit ? [x.poa.hit.text] : [], cites: ["who-files"] });
  }
  if (x.urgency.length) {
    f.push({ id: "urgency", severity: x.urgency.length >= 2 ? "high" : "medium", title: "Pressure to act quickly",
      detail: "Pressure to sign fast is on CBP's own list of warning signs. Genuine CBP deadlines (the 80-day liquidation window) apply to entries, not to a sales offer.",
      evidence: ev(x.urgency, 3), cites: ["watch-for"] });
  }
  if (x.guarantees.length) {
    f.push({ id: "guarantee", severity: "medium", title: "Guarantees an outcome",
      detail: "No one can guarantee a refund amount. CBP nets over- and under-payments for each entry at liquidation, and a CAPE filing can even produce a bill.",
      evidence: ev(x.guarantees), cites: ["can-be-bill", "timing"] });
  }
  if (x.promisedDays !== null && x.promisedDays < 60) {
    f.push({ id: "timeline", severity: "medium", title: `Promises money in ${x.promisedDays} days, faster than CBP's published 60 to 90`,
      detail: "CBP says valid refunds are generally issued 60 to 90 days after a declaration is accepted. A shorter promise either misstates the process or means the firm pays you out of its own pocket and recovers from the refund.",
      evidence: [], cites: ["timing"] });
  }
  if (x.payment.destination === "unclear" && !x.payment.notifyParty.length && !x.payment.debitAuth.length) {
    f.push({ id: "payee-unclear", severity: "info", title: "Does not say where the refund will be paid",
      detail: "Ask in writing. CBP pays only the Importer of Record or its 4811 notify party, by ACH to a verified bank account.", evidence: [], cites: ["payee"] });
  }
  if (!x.feePct && x.upfrontUsd === null && x.flatFeeUsd === null && x.minimumFeeUsd === null && x.perEntryUsd === null) {
    f.push({ id: "fee-missing", severity: "info", title: "No fee found in the text",
      detail: "We could not find a percentage or a dollar fee. Get the full fee in writing before you sign.", evidence: [], cites: [] });
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  return f.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function goodSigns(x: Extracted): GoodSign[] {
  const g: GoodSign[] = [];
  if (x.noUpfrontStated && x.upfrontUsd === null) g.push({ id: "no-upfront", text: "Says there is no upfront fee" });
  if (x.noRecoveryNoFee) g.push({ id: "no-recovery-no-fee", text: "Fee only if a refund is actually paid" });
  if (x.payment.destination === "importer") g.push({ id: "pays-you", text: "Says CBP pays the refund to you by ACH", evidence: x.payment.importer[0]?.text });
  if (x.poa.mentioned && x.poa.limited && x.poa.licensedBroker && !x.poa.broad) g.push({ id: "limited-poa", text: "Limited power of attorney, tied to a licensed customs broker" });
  if (x.credentials.neverAsks) g.push({ id: "no-logins", text: "Says it never asks for your logins or bank details" });
  if (x.exclusivity.canCancel) g.push({ id: "can-cancel", text: "You can cancel on notice" });
  if (x.noGuarantee) g.push({ id: "no-guarantee", text: "Does not promise a refund amount" });
  if (x.feePct && x.feePct.high <= FEE_HIGH_PCT) g.push({ id: "fee-in-range", text: `Fee of ${x.feePct.low === x.feePct.high ? x.feePct.high + "%" : x.feePct.low + "% to " + x.feePct.high + "%"} is within the published ${PUBLISHED_CONTINGENCY.tiers[0]}% to ${FEE_HIGH_PCT}% range` });
  return g;
}

export const VERDICT_TEXT: Record<Verdict, { label: string; line: string }> = {
  high: { label: "High risk", line: "Several of CBP's own warning signs are present. Do not share logins, bank details or sign anything yet." },
  review: { label: "Needs a closer look", line: "Terms worth negotiating or questioning before you sign. Compare with filing yourself for free." },
  minor: { label: "Minor concerns", line: "One thing to clarify in writing. Otherwise nothing alarming in the text." },
  clean: { label: "No red flags found", line: "That is not an endorsement. Check the firm's licence and read the actual contract." },
};

export function checkOffer(raw: string): OfferReport {
  const trimmed = raw.trim();
  const empty = trimmed.length === 0;
  const text = trimmed.slice(0, MAX_CHARS);
  const extracted = extractOffer(text);
  const flags = empty ? [] : buildFlags(extracted);
  const good = empty ? [] : goodSigns(extracted);
  const high = flags.filter((f) => f.severity === "high").length;
  const med = flags.filter((f) => f.severity === "medium").length;
  const verdict: Verdict = empty ? "clean" : high >= 2 ? "high" : high === 1 || med >= 2 ? "review" : med === 1 ? "minor" : "clean";
  const v = VERDICT_TEXT[verdict];
  return { empty, truncated: trimmed.length > MAX_CHARS, text, extracted, flags, good, verdict, verdictLabel: v.label, verdictLine: v.line };
}

/* ---------- example comparison ---------- */
export interface CostRow {
  id: "offer" | "self" | "flat";
  label: string;
  feeLowCents: number | null; feeHighCents: number | null;
  keepLowCents: number | null; keepHighCents: number | null;
  note: string;
  published?: { wording: string; url: string; asOf: string };
}
export function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export function fmtCents(c: number): string {
  return (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Example comparison on a refund amount in cents. Fee cents are rounded per row; nothing here is a quote. */
export function compareCosts(refundCents: number, x: Extracted): CostRow[] {
  const fixed = Math.round(((x.upfrontUsd ?? 0) + (x.flatFeeUsd ?? 0)) * 100);
  const floor = x.minimumFeeUsd !== null && (x.upfrontUsd === null || x.minimumFeeUsd > x.upfrontUsd) ? Math.round(x.minimumFeeUsd * 100) : 0; // a minimum already counted as upfront is not added twice
  const hasFee = x.feePct !== null || fixed > 0 || floor > 0;
  const lowFee = hasFee ? fixed + Math.max(floor, x.feePct ? Math.round((refundCents * x.feePct.low) / 100) : 0) : null;
  const highFee = hasFee ? fixed + Math.max(floor, x.feePct ? Math.round((refundCents * x.feePct.high) / 100) : 0) : null;
  const offerNote = !hasFee ? "No fee found in the offer text, so no cost is shown."
    : [x.feePct ? (x.feePct.low === x.feePct.high ? `${x.feePct.high}% of the refund` : `${x.feePct.low}% to ${x.feePct.high}% of the refund (tiered)`) : "", x.upfrontUsd ? `${fmtUsd(x.upfrontUsd)} upfront` : "", x.flatFeeUsd ? `${fmtUsd(x.flatFeeUsd)} flat` : "", floor ? `${fmtUsd(x.minimumFeeUsd!)} minimum` : "", x.perEntryUsd ? `plus ${fmtUsd(x.perEntryUsd)} per entry, not counted here` : ""].filter(Boolean).join(", ");
  const flatC = PUBLISHED_FLAT_FEE.usd * 100;
  return [
    { id: "offer", label: "This offer", feeLowCents: lowFee, feeHighCents: highFee,
      keepLowCents: highFee === null ? null : refundCents - highFee, keepHighCents: lowFee === null ? null : refundCents - lowFee, note: offerNote },
    { id: "self", label: "File it yourself in ACE (CAPE)", feeLowCents: 0, feeHighCents: 0, keepLowCents: refundCents, keepHighCents: refundCents,
      note: "CBP charges no fee to process a refund. Needs an ACE Portal account and ACH enrolment, and your own time." },
    { id: "flat", label: "Flat-fee preflight service", feeLowCents: flatC, feeHighCents: flatC, keepLowCents: refundCents - flatC, keepHighCents: refundCents - flatC,
      note: PUBLISHED_FLAT_FEE.note, published: { wording: `${PUBLISHED_FLAT_FEE.name}: ${PUBLISHED_FLAT_FEE.wording}`, url: PUBLISHED_FLAT_FEE.url, asOf: PUBLISHED_FLAT_FEE.asOf } },
  ];
}

/** Parses the dollar box. Accepts "$467,490.84", "467490.84", "12k" is NOT accepted. Returns cents or null. */
export function parseDollarsToCents(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1e13 ? cents : null;
}
