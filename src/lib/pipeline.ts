import { applyCodeVeto, vetoSignals } from "./signals";
import { MONEY_RE, figuresFor, guardCounts, guardDays, guardEntryText, portfolioDays } from "./numberguard";
import { ERROR_DEFINITIONS, FILING_ORDER_RULES, LIMITS, SOURCES } from "./cbp-rules";
import { fmtUsd } from "./money";
import { ModelUnavailableError, chat, costFor, hasKey, modelId, modelErrorKind, parseJson, type ChatResult, type ModelKey } from "./nebius";
import { providerName, providerStamp, OPENROUTER_LABEL } from "./provider";
import { normalizeEntryNumber, parseEs003 } from "./parse";
import { validateEntries, type Portfolio } from "./validate";
import type { Entry, Verdict } from "./types";

/* ---------- types ---------- */
export interface NormDisagreement { entry: string; field: string; lightning: string; deterministic: string }
export interface NoteConflict { signal: string; message: string }
export interface EntryInfo {
  notes: string; parseNotes: string[]; ior: string; entryType: string; liquidationStatus: string; liquidationDate: string | null;
  lines: { lineNo: number; hts: string; country: string; value: string; ieepaDuty: string; framework: string }[];
  noteSignals: string[]; noteSummary: string; noteConflicts: NoteConflict[];
  /** What the fast model tagged before the code veto, and what the veto removed (see signals.ts). Absent on runs logged before the veto. */
  noteSignalsRaw?: string[]; noteConflictsRaw?: NoteConflict[]; noteVetoed?: { signal: string; why: string }[];
}
export interface Explanation {
  summary: string; brokerAction: string; whyThisOrder: string; citations: string[]; reasoning: string;
  guardStripped: number; completionId: string; ms: number;
}
export interface PortfolioNote { headline: string; priorities: { id: string; reason: string }[]; brokerQuestions: string[]; guardStripped: number; completionId: string }
export interface ModelReceipt { model: string; calls: number; failed: number; promptTokens: number; completionTokens: number; reasoningTokens: number; costUsd: number; avgMs: number; ids: string[]; firstError?: string }
export interface Receipt { lightning: ModelReceipt; ultra: ModelReceipt; /** Ultra calls that wrote the broker memo, a subset of `ultra`. Absent on runs logged before per-stage tracking. */ memo?: ModelReceipt; wallMs: number; host: string; mode: "live" | "replay"; ranAt: string;
  /** Absent on recorded Token Factory runs. "openrouter" = DEV-ONLY free-tier fallback, never a Nebius run. */
  provider?: "tokenfactory" | "openrouter"; providerLabel?: string; devOnly?: true }
export interface RunResult {
  asOf: string; filerCodes: string[]; label: string; parseIssues: string[];
  portfolio: Portfolio;
  entryInfo: Record<string, EntryInfo>;
  normalization: { checked: number; agree: number; disagreements: NormDisagreement[] };
  explanations: Record<string, Explanation>;
  portfolioNote: PortfolioNote | null;
  receipt: Receipt;
}
export type RunEvent =
  | { type: "start"; entries: number; lightningTotal: number }
  | { type: "lightning"; done: number; total: number; lastMs: number }
  | { type: "board"; result: Omit<RunResult, "receipt" | "explanations" | "portfolioNote"> }
  | { type: "ultra-plan"; total: number }
  | { type: "ultra"; id: string; done: number; total: number; explanation: Explanation }
  | { type: "portfolio-note"; note: PortfolioNote }
  | { type: "error"; message: string; code?: "credit" | "auth" }
  | { type: "done"; result: RunResult };

/* ---------- helpers ---------- */
async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}
/** Short error text for the receipt. Token Factory errors never include the key. */
const errText = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 200);
const emptyReceipt = (model: string): ModelReceipt => ({ model, calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, avgMs: 0, ids: [] });
function track(r: ModelReceipt, key: ModelKey, c: ChatResult) {
  r.calls++; r.promptTokens += c.promptTokens; r.completionTokens += c.completionTokens; r.reasoningTokens += c.reasoningTokens;
  r.costUsd += costFor(key, c.promptTokens, c.completionTokens); r.avgMs += c.ms; if (c.id) r.ids.push(c.id);
}
const fin = (r: ModelReceipt) => { r.avgMs = r.calls ? Math.round(r.avgMs / r.calls) : 0; r.costUsd = Math.round(r.costUsd * 1e6) / 1e6; return r; };

/** Grounding handed to Ultra: CBP's own words, nothing else. */
export function rulesContext(): string {
  const L: string[] = ["CBP CAPE RULES (quoted from CBP; cite by source id)", ""];
  for (const r of FILING_ORDER_RULES) L.push(`[${r.id}] (${r.sourceId}) ${r.rule}\n   CBP: "${r.quote}"`);
  L.push("", "CBP ERROR DEFINITIONS:");
  for (const [k, v] of Object.entries(ERROR_DEFINITIONS)) L.push(`- ${k}: ${v}`);
  L.push("", `LIMITS: ${LIMITS.maxEntriesPerDeclaration} entries per declaration; 1MB file; Phase 1 accepts entries unliquidated or liquidated within the preceding ${LIMITS.liquidationWindowDays} days; protest window ${LIMITS.protestDays} days from liquidation (19 USC 1514); excluded entry types 08, 09, 23, 047.`);
  L.push("Framework agreements (EU/JP/KR/CH): the 15% combined rate may sit on one line; the refund is only the IEEPA portion above the Column 1 rate. Underpaid Section 232/301/201 duty is netted against the refund on the entry and can produce a bill. Refunds can be diverted to existing debts (19 CFR 24.72). Interest (19 USC 1505) is added by CBP.");
  L.push("", "SOURCE IDS: " + Object.keys(SOURCES).join(", ") + ", plus rule ids above.");
  return L.join("\n");
}

const SIGNALS = ["protest", "recon", "recon_deadline_soon", "drawback_claim", "drawback_planned", "psc_pending", "underpaid_duty", "suspension", "injunction", "other_filer", "none"] as const;

/* ---------- Lightning: normalize ---------- */
const LIGHTNING_SYSTEM = `You normalize one row of a customs broker's entry-summary export into canonical JSON. You only normalize and tag. You never compute money and never decide eligibility.
Return ONLY a JSON object:
{"entry_number": "11 uppercase alphanumeric characters, no dashes, no apostrophe",
 "liquidation_date": "YYYY-MM-DD or null", "recon_deadline": "YYYY-MM-DD or null",
 "liquidation_status": "Unliquidated|Liquidated|Extended|Suspended|Pending|Not Liquidated",
 "protest_status": "None|Open|Suspended|Denied|Granted",
 "suspension_record": true|false, "court_injunction": true|false, "drawback_claim": true|false, "recon_flag": true|false, "recon_entry_filed": true|false,
 "note_signals": [zero or more of: ${SIGNALS.join(", ")}],
 "note_summary": "max 15 words restating the broker note, or empty"}
Tag note_signals ONLY from words that appear in broker_note. Never tag a signal because a structured column says so, and use ["none"] when broker_note is empty.
Tag meanings: protest = the note says a protest was filed/opened/denied; recon = the note says Recon or reconciliation; recon_deadline_soon = the note gives a Recon due date or time left; drawback_claim = the note says the entry IS designated on a drawback claim; drawback_planned = the note says a drawback claim is planned but not filed; psc_pending = the note says a post-summary correction is needed or filed; underpaid_duty = the note says duty was underpaid or underdeclared; suspension = the note mentions a suspension; injunction = the note mentions a court injunction; other_filer = the note says another filer or broker handles it.
Do NOT tag drawback for: "ES-701" or "courtesy notice" (that is a liquidation notice), "TIB" or "temporary import under bond" (a different entry type), or "extended" liquidation. Do NOT tag underpaid_duty for an end-dated HTS or a plain duty mention.
Use "none" in note_signals when the note carries no filing-relevant signal. Dates: copy the date, reformat only.`;

function lightningInput(e: Entry) {
  const keep = ["entry_number", "entry_type", "liquidation_status", "liquidation_date", "recon_deadline", "protest_status", "suspension_record", "court_injunction", "drawback_claim", "recon_flag", "recon_entry_filed", "broker_note"];
  return JSON.stringify(Object.fromEntries(keep.map((k) => [k, e.raw[k] ?? ""])));
}
interface LightningOut {
  entry_number?: string; liquidation_date?: string | null; recon_deadline?: string | null; liquidation_status?: string; protest_status?: string;
  suspension_record?: boolean; court_injunction?: boolean; drawback_claim?: boolean; recon_flag?: boolean; recon_entry_filed?: boolean;
  note_signals?: string[]; note_summary?: string;
}
function compare(e: Entry, o: LightningOut): NormDisagreement[] {
  const key = normalizeEntryNumber(e.entryNumberRaw);
  const pairs: [string, unknown, unknown][] = [
    ["entry_number", normalizeEntryNumber(String(o.entry_number ?? "")), key],
    ["liquidation_date", o.liquidation_date ?? null, e.liquidationDate],
    ["recon_deadline", o.recon_deadline ?? null, e.reconDeadline],
    ["protest_status", o.protest_status, e.protestStatus],
    ["suspension_record", o.suspension_record, e.suspensionRecord],
    ["court_injunction", o.court_injunction, e.injunction],
    ["drawback_claim", o.drawback_claim, e.drawbackClaim],
    ["recon_flag", o.recon_flag, e.reconFlag],
    ["recon_entry_filed", o.recon_entry_filed, e.reconEntryFiled],
  ];
  return pairs.filter(([, a, b]) => String(a ?? "") !== String(b ?? "")).map(([field, a, b]) => ({ entry: key, field, lightning: String(a ?? "null"), deterministic: String(b ?? "null") }));
}
/** Deterministic cross-check of Lightning's tags against the structured columns (flags notes that contradict the data). */
function conflicts(e: Entry, signals: string[]): NoteConflict[] {
  const out: NoteConflict[] = [];
  const has = (s: string) => signals.includes(s);
  const protestSeen = ["Open", "Suspended", "Denied"].includes(e.protestStatus);
  const ieepaFix = e.lines.some((l) => !l.htsValid || !l.htsRelationshipOk || l.ch99GoodsValueCents > 0);
  const under = e.lines.some((l) => l.underpaidOtherCents > 0);
  if (has("protest") && !protestSeen) out.push({ signal: "protest", message: "Note mentions a protest but protest_status is not Open/Suspended/Denied." });
  if (has("recon") && !e.reconFlag) out.push({ signal: "recon", message: "Note mentions Recon but recon_flag is N." });
  if (has("drawback_claim") && !e.drawbackClaim) out.push({ signal: "drawback_claim", message: "Note says on a drawback claim but drawback_claim is N." });
  if (has("drawback_planned") && !e.drawbackPlanned) out.push({ signal: "drawback_planned", message: "Note mentions a planned drawback claim but drawback_planned is N." });
  if (has("psc_pending") && !e.pscNeededNonIeepa && !ieepaFix) out.push({ signal: "psc_pending", message: "Note mentions a pending PSC but psc_needed_non_ieepa is N." });
  if (has("underpaid_duty") && !under) out.push({ signal: "underpaid_duty", message: "Note mentions underpaid duty but no line carries an underpayment." });
  if (has("suspension") && !e.suspensionRecord) out.push({ signal: "suspension", message: "Note mentions a suspension but suspension_record is N." });
  if (has("injunction") && !e.injunction) out.push({ signal: "injunction", message: "Note mentions an injunction but court_injunction is N." });
  return out;
}

/** Conflicts from the model's raw tags plus the tags code re-derives (e.g. "plans a drawback claim" becomes drawback_planned). The veto then drops unsupported ones. */
export function allConflicts(e: Entry, signals: string[]): NoteConflict[] {
  const seen = new Set<string>();
  return [...conflicts(e, signals), ...conflicts(e, vetoSignals(e.notes, signals).kept)].filter((c) => !seen.has(c.signal) && !!seen.add(c.signal));
}

/* ---------- Ultra: explain + rank (never compute) ---------- */
const ULTRA_SYSTEM = (ctx: string) => `You explain results to a small business owner who has never heard of customs jargon. The tool is a pre-flight check for a one-time, irreversible tariff refund upload to US Customs (the program is called CAPE; the struck-down tariffs are called IEEPA tariffs).
HARD RULES:
- All eligibility decisions, dollar amounts, dates and day counts are already computed by plain code and given to you. Never calculate, estimate, or invent a number. Quote dollar amounts only exactly as given.
- Write plain English at about an 8th-grade reading level. Short sentences. Say "shipment" (not "entry"), "importer" (not "IOR"), "finalized by Customs" (not "liquidated"), "correction" (not "PSC"), "appeal" (not "protest"). If you must use a customs term, explain it in a few words the first time. No acronyms you have not explained.
- Say what to do and why it matters in money or risk. Say "your customs broker" for the licensed professional. Never say "claim your refund" as a promise, and never give legal advice; say what Customs' published rules say and what the broker should check.
- Cite only from the rule ids / source ids in the context (put them in "citations", not in the prose).
- Output ONLY JSON.

${ctx}`;

const ENTRY_SCHEMA = `{"summary": "<=45 words, plain English: why this shipment is in its group and what it means for the owner's money",
 "broker_action": "<=30 words, plain English: the one thing to do next",
 "why_this_order": "<=30 words, plain English: why it sits at this point in the filing order",
 "citations": ["rule ids or source ids, e.g. psc-first, FAQ, QRG"]}`;

function entryPacket(v: Verdict, info: EntryInfo) {
  const m = v.money;
  return {
    entry: v.displayNumber, lane: v.lane, filing_order_position: v.order, filing_step: v.filingStep,
    findings: v.findings.map((f) => ({ cbp_error: f.cbpError, code: f.code, detail: f.detail, fix: f.fix })),
    money: {
      ieepa_refundable: fmtUsd(m.ieepaRefundableCents), framework_carve_out_stays_owed: fmtUsd(m.frameworkCarveOutCents),
      other_duty_underpaid: fmtUsd(m.underpaidOtherCents), net: fmtUsd(m.netCents), possible_bill: fmtUsd(m.billCents),
    },
    deadlines: v.deadlines, ior_has_open_debt_that_may_offset_refund: v.diversionRisk,
    broker_note: info.notes, note_conflicts: info.noteConflicts.map((c) => c.message),
  };
}


function allowedMoney(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.match(MONEY_RE) ?? []) set.add(m.replace(/[\s,$]/g, "").replace(/\.00$/, ""));
  return set;
}
/** Number guard: any dollar figure in model text that is not in the deterministic packet is removed. */
export function guardText(text: string, allowed: Set<string>): { text: string; stripped: number } {
  let stripped = 0;
  const out = text.replace(MONEY_RE, (m) => {
    const norm = m.replace(/[\s,$]/g, "").replace(/\.00$/, "");
    if (allowed.has(norm)) return m;
    stripped++; return "(amount on board)";
  });
  return { text: out, stripped };
}

const VALID_CITES = new Set<string>([...Object.keys(SOURCES), ...FILING_ORDER_RULES.map((r) => r.id)]);

/** Ultra is a reasoning model: on a hard prompt the thinking can eat the whole token budget and leave `content` empty (seen live on the broker memo).
 *  Retry once with a doubled budget. The cut-off first attempt stays in the receipt as a failed call. */
type UltraArgs = Parameters<typeof chat>[0];
async function ultraJson<T>(args: UltraArgs, receipt: ModelReceipt): Promise<{ c: ChatResult; j: T | null }> {
  let a = args;
  for (let attempt = 0; ; attempt++) {
    const c = await chat(a);
    track(receipt, "ultra", c);
    const j = parseJson<T>(c.content);
    if (j) return { c, j };
    receipt.failed++;
    const cutOff = c.completionTokens >= (a.maxTokens ?? 0) - 8;
    if (attempt >= 1 || !cutOff) return { c, j: null };
    a = { ...a, maxTokens: (a.maxTokens ?? 3000) * 2, timeoutMs: (a.timeoutMs ?? 150000) * 2 };
  }
}

async function explainEntry(v: Verdict, info: EntryInfo, ctx: string, receipt: ModelReceipt): Promise<Explanation | null> {
  const packet = JSON.stringify(entryPacket(v, info));
  try {
    const { c, j } = await ultraJson<{ summary?: string; broker_action?: string; why_this_order?: string; citations?: string[] }>({
      model: "ultra", thinking: true, json: true, maxTokens: 3000, timeoutMs: 150000,
      system: ULTRA_SYSTEM(ctx),
      user: `Explain this entry. Return JSON exactly like:\n${ENTRY_SCHEMA}\n\nENTRY (deterministic results):\n${packet}`,
    }, receipt);
    if (!j) return null;
    const figs = figuresFor(v);
    let stripped = 0;
    const g = (s?: string) => { const r = guardEntryText(String(s ?? ""), figs); stripped += r.stripped; return r.text; };
    return {
      summary: g(j.summary), brokerAction: g(j.broker_action), whyThisOrder: g(j.why_this_order),
      citations: (j.citations ?? []).filter((x) => VALID_CITES.has(x)),
      reasoning: c.reasoning.slice(0, 2500), guardStripped: stripped, completionId: c.id, ms: c.ms,
    };
  } catch (e) {
    receipt.failed++; receipt.firstError ??= errText(e); return null;
  }
}

async function portfolioNote(p: Portfolio, ctx: string, receipt: ModelReceipt): Promise<PortfolioNote | null> {
  const top = p.verdicts.filter((v) => v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK" || /Step 0/.test(v.filingStep)).slice(0, 12)
    .map((v) => ({ id: v.id, entry: v.displayNumber, step: v.filingStep, lane: v.lane, net: fmtUsd(v.money.netCents), cape_days_left: v.deadlines.capeDaysLeft }));
  const packet = JSON.stringify({
    lanes: Object.fromEntries(Object.entries(p.lanes).map(([k, l]) => [k, { entries: l.count, refund: fmtUsd(l.refundCents), possible_bills: fmtUsd(l.billCents) }])),
    iors_with_open_debt: p.iors.map((i) => ({ ior: i.ior, open_debt: fmtUsd(i.openDebtCents), eligible_refund: fmtUsd(i.eligibleRefundCents), expected_diversion: fmtUsd(i.expectedDiversionCents) })),
    candidates_in_filing_order: top,
  });
  try {
    const { c, j } = await ultraJson<{ headline?: string; priorities?: { id: string; reason: string }[]; broker_questions?: string[] }>({
      model: "ultra", thinking: true, json: true, maxTokens: 3500, timeoutMs: 150000,
      system: ULTRA_SYSTEM(ctx),
      user: `Give the broker a short portfolio read. Return JSON exactly like:\n{"headline": "<=40 words, plain English, for a small business owner: what to do first and what must not be uploaded blindly",\n "priorities": [{"id": "an id from candidates_in_filing_order", "reason": "<=25 words, plain English"}] (max 5),\n "broker_questions": ["3 short plain-English questions to ask the importer before upload"]}\n\nPORTFOLIO (deterministic results):\n${packet}`,
    }, receipt);
    if (!j) return null;
    const allowed = allowedMoney(packet);
    const dayOk = portfolioDays(top.map((t) => p.verdicts.find((v) => v.id === t.id)!).filter(Boolean));
    let stripped = 0;
    const g = (s?: string) => { const r = guardText(String(s ?? ""), allowed); const d = guardDays(r.text, dayOk); const c = guardCounts(d.text, p.verdicts); stripped += r.stripped + d.stripped + c.stripped; return c.text; };
    const ids = new Set(top.map((t) => t.id));
    return {
      headline: g(j.headline),
      priorities: (j.priorities ?? []).filter((x) => ids.has(x.id)).slice(0, 5).map((x) => ({ id: x.id, reason: g(x.reason) })),
      brokerQuestions: (j.broker_questions ?? []).slice(0, 4).map((x) => g(x)),
      guardStripped: stripped, completionId: c.id,
    };
  } catch (e) { receipt.failed++; receipt.firstError ??= errText(e); return null; }
}

/** Which entries get an Ultra deep-dive: the ones where a broker's decision matters. */
export function pickUltraTargets(p: Portfolio, max: number): Verdict[] {
  const v = p.verdicts;
  const pick: Verdict[] = [];
  pick.push(...v.filter((x) => x.lane === "NET_BILL_RISK"));
  pick.push(...v.filter((x) => x.lane === "WAIT"));
  pick.push(...v.filter((x) => x.lane === "BLOCKED" && !x.findings.some((f) => f.code === "DUPLICATE")).sort((a, b) => b.money.ieepaRefundableCents - a.money.ieepaRefundableCents).slice(0, 4));
  pick.push(...v.filter((x) => x.lane === "FILE_NOW" && ((x.deadlines.capeDaysLeft ?? 99) <= 14 || x.money.frameworkGroups.length || x.diversionRisk || x.leadingZeroFix)).slice(0, 6));
  return [...new Map(pick.map((x) => [x.id, x])).values()].slice(0, max);
}

/* ---------- main ---------- */
export interface RunOptions { asOf: string; filerCodes: string[]; label?: string; ultraMax?: number; lightningConcurrency?: number; ultraConcurrency?: number }

export async function runPipeline(csv: string, o: RunOptions, emit: (e: RunEvent) => void = () => {}): Promise<RunResult> {
  const t0 = Date.now();
  const { entries, issues } = parseEs003(csv);
  const lr = emptyReceipt(modelId("lightning"));
  const ur = emptyReceipt(modelId("ultra"));
  const mr = emptyReceipt(modelId("ultra")); // broker memo only; merged into `ur` at the end
  const live = hasKey();
  emit({ type: "start", entries: entries.length, lightningTotal: live ? entries.length : 0 });

  // 1. Lightning fan-out (normalize + tag notes)
  const normal: { checked: number; agree: number; disagreements: NormDisagreement[] } = { checked: 0, agree: 0, disagreements: [] };
  const signals = new Map<number, { signals: string[]; summary: string }>();
  if (live) {
    let done = 0;
    let fatal: ModelUnavailableError | null = null;
    await pool(entries.map((e, i) => ({ e, i })), o.lightningConcurrency ?? 10, async ({ e, i }) => {
      if (fatal) return; // out of credit or bad key: stop calling, do not burn through 69 doomed requests
      try {
        const c = await chat({ model: "lightning", thinking: false, json: true, system: LIGHTNING_SYSTEM, user: lightningInput(e), maxTokens: 500 });
        track(lr, "lightning", c);
        const j = parseJson<LightningOut>(c.content);
        if (j) {
          const d = compare(e, j);
          normal.checked += 9; normal.agree += 9 - d.length; normal.disagreements.push(...d);
          signals.set(i, { signals: (j.note_signals ?? []).filter((s) => (SIGNALS as readonly string[]).includes(s)), summary: String(j.note_summary ?? "") });
        } else lr.failed++;
        done++; emit({ type: "lightning", done, total: entries.length, lastMs: c.ms });
      } catch (e) {
        lr.failed++; lr.firstError ??= errText(e); done++;
        const kind = modelErrorKind(errText(e));
        if (kind) fatal ??= new ModelUnavailableError(kind, errText(e));
        emit({ type: "lightning", done, total: entries.length, lastMs: 0 });
      }
    });
    // Nothing was explained or normalized. Say so plainly instead of showing a board that looks complete.
    if (fatal) throw fatal;
  }

  // 2. Deterministic validation + money
  const portfolio = validateEntries(entries, { asOf: o.asOf, filerCodes: o.filerCodes });
  const entryInfo: Record<string, EntryInfo> = {};
  for (const v of portfolio.verdicts) {
    const e = entries[v.entryIdx];
    const s = signals.get(v.entryIdx);
    entryInfo[v.id] = {
      notes: e.notes, parseNotes: e.parseNotes, ior: e.ior, entryType: e.entryType, liquidationStatus: e.liquidationStatus, liquidationDate: e.liquidationDate,
      lines: e.lines.map((l) => ({ lineNo: l.lineNo, hts: l.hts, country: l.country, value: fmtUsd(l.enteredValueCents), ieepaDuty: fmtUsd(l.ieepaDutyCents), framework: l.frameworkGroup })),
      noteSignals: s?.signals ?? [], noteSummary: s?.summary ?? "", noteConflicts: s ? allConflicts(e, s.signals) : [],
    };
    entryInfo[v.id] = applyCodeVeto(entryInfo[v.id]);
  }
  const base = { asOf: o.asOf, filerCodes: o.filerCodes, label: providerName() === "openrouter" ? `${OPENROUTER_LABEL}. ${o.label ?? ""}`.trim() : (o.label ?? ""), parseIssues: issues, portfolio, entryInfo, normalization: normal };
  emit({ type: "board", result: base });

  // 3. Ultra (reasoning, CBP rules in context)
  const explanations: Record<string, Explanation> = {};
  let pNote: PortfolioNote | null = null;
  if (live) {
    const ctx = rulesContext();
    const targets = pickUltraTargets(portfolio, o.ultraMax ?? Number(process.env.ULTRA_MAX ?? 22));
    emit({ type: "ultra-plan", total: targets.length });
    let done = 0;
    const portfolioPromise = portfolioNote(portfolio, ctx, mr).then((n) => { pNote = n; if (n) emit({ type: "portfolio-note", note: n }); });
    await pool(targets, o.ultraConcurrency ?? 8, async (v) => {
      const ex = await explainEntry(v, entryInfo[v.id], ctx, ur);
      done++;
      if (ex) { explanations[v.id] = ex; emit({ type: "ultra", id: v.id, done, total: targets.length, explanation: ex }); }
    });
    await portfolioPromise;
  }

  ur.calls += mr.calls; ur.failed += mr.failed; ur.promptTokens += mr.promptTokens; ur.completionTokens += mr.completionTokens;
  ur.reasoningTokens += mr.reasoningTokens; ur.costUsd += mr.costUsd; ur.avgMs += mr.avgMs; ur.ids.push(...mr.ids); ur.firstError ??= mr.firstError;
  const result: RunResult = {
    ...base, explanations, portfolioNote: pNote,
    receipt: { lightning: fin(lr), ultra: fin(ur), memo: fin(mr), wallMs: Date.now() - t0, host: providerName() === "openrouter" ? "openrouter.ai" : "api.tokenfactory.nebius.com", mode: "live", ranAt: new Date().toISOString(), ...(providerName() === "openrouter" ? providerStamp() : {}) },
  };
  emit({ type: "done", result });
  return result;
}
