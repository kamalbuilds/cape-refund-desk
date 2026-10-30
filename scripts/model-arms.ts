// Model-alone arms for the Scored test: Nemotron Ultra alone and Nemotron Lightning alone, on the same 69 sample entries and the same
// hand-labelled answer key as the rules engine. Each model gets one entry (its raw ES-003 rows) plus the fixed rulebook prompt in
// scripts/model-arms-prompt.ts and must return the lane and the days left in CBP's 80-day window, with no engine output.
//   zsh -ic 'cd <repo> && npx tsx scripts/model-arms.ts'            full run, writes docs/receipts/model-arms-2026-10-30.json
//   zsh -ic 'cd <repo> && npx tsx scripts/model-arms.ts --limit 3'  pilot: first N entries, writes only to .dev-runs/
// Token Factory only (same client as the live path). Never prints or stores the key. Resumable: finished calls are cached in .dev-runs/.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { chat, costUsd, hasKey, MODELS, parseJson, startCallLog, takeCallLog, type ModelKey } from "../src/lib/nebius";
import { providerName } from "../src/lib/provider";
import { normalizeEntryNumber, parseCsv, parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";
import { LANE_ORDER, type Truth } from "../src/lib/score-metrics";
import type { Lane } from "../src/lib/types";
import { PROMPTS, USER_PREFIX, promptSha256 } from "./model-arms-prompt";

const OUT = "docs/receipts/model-arms-2026-10-30.json";
const CACHE = ".dev-runs/model-arms-cache.json";
const BUDGET_USD = 1.25; // hard stop for dispatching new calls; the task budget is 1.50
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 0;

if ((process.env.NEMOTRON_PROVIDER ?? "tokenfactory").toLowerCase() !== "tokenfactory" || providerName() !== "tokenfactory") { console.error("Token Factory only. Unset NEMOTRON_PROVIDER."); process.exit(1); }
if (!hasKey()) { console.error("NEBIUS_API_KEY is not set"); process.exit(1); }

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8")) as { asOf: string; filerCodes: string[] };
const truth = JSON.parse(fs.readFileSync("data/sample-truth.json", "utf8")) as Truth;
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const { entries } = parseEs003(csv);

// ---- group the raw CSV rows into the same entry blocks the parser makes (a repeated line number starts a new block) ----
const table = parseCsv(csv);
const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
const blocks: { raw: string; rows: Record<string, string>[] }[] = [];
{
  const cur = new Map<string, { block: (typeof blocks)[number]; lines: Set<number> }>();
  for (const r of table.slice(1)) {
    const g: Record<string, string> = {};
    headers.forEach((h, i) => { const v = (r[i] ?? "").trim(); if (v !== "") g[h] = v; });
    const raw = g.entry_number;
    const lineNo = Number(g.line_no) || 1;
    let slot = cur.get(raw);
    if (!slot || slot.lines.has(lineNo)) { slot = { block: { raw, rows: [] }, lines: new Set() }; cur.set(raw, slot); blocks.push(slot.block); }
    slot.lines.add(lineNo);
    slot.block.rows.push(g);
  }
}
if (blocks.length !== entries.length || blocks.some((b, i) => b.raw !== entries[i].entryNumberRaw)) throw new Error("row grouping disagrees with the parser");
if (truth.entries.some((t, i) => t.entryNumber !== blocks[i].raw)) throw new Error("answer key order disagrees with the file");

// ---- the days-left answer key: plain date arithmetic on the raw liquidation_date, independent of src/lib/validate.ts ----
const dayNo = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const keyDaysLeft = entries.map((e) => (e.liquidationDate ? 80 - (dayNo(meta.asOf) - dayNo(e.liquidationDate)) : null));

const inputFor = (i: number) => {
  const earlier = blocks.slice(0, i).filter((b) => normalizeEntryNumber(b.raw) === normalizeEntryNumber(blocks[i].raw)).length;
  return USER_PREFIX + JSON.stringify({ as_of: meta.asOf, filer_codes: meta.filerCodes, earlier_entries_in_file_with_same_number: earlier, rows: blocks[i].rows });
};

// ---- arm (a): the rules engine ----
const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
const engine = new Map<number, { lane: Lane; daysLeft: number | null }>();
for (const v of pf.verdicts) engine.set(v.entryIdx, { lane: v.lane, daysLeft: v.deadlines.capeDaysLeft });

// ---- arms (b) and (c): the models ----
interface Answer { lane: Lane | null; daysLeft: number | null; checks: string }
interface CallRec { n: number; entryNumber: string; id: string; model: string; ms: number; promptTokens: number; completionTokens: number; reasoningTokens: number; costUsd: number; finish?: string; answer: Answer; error?: string }
type Cache = Record<string, CallRec>;
const cache: Cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const save = () => { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); };
let spent = Object.values(cache).reduce((a, c) => a + c.costUsd, 0);
let stop: string | null = null;
const ck = (arm: ModelKey, i: number) => `${arm}:${promptSha256(PROMPTS[arm]).slice(0, 8)}:${i}`;

function parseAnswer(text: string): Answer {
  const j = parseJson<{ lane?: unknown; cape_days_left?: unknown; checks?: unknown }>(text);
  const lane = j && typeof j.lane === "string" && (LANE_ORDER as string[]).includes(j.lane) ? (j.lane as Lane) : null;
  const d = j?.cape_days_left;
  const daysLeft = typeof d === "number" && Number.isInteger(d) ? d : null;
  return { lane, daysLeft, checks: typeof j?.checks === "string" ? j.checks.slice(0, 400) : "" };
}

async function runArm(arm: ModelKey, count: number) {
  const p = PROMPTS[arm];
  let next = 0;
  const worker = async () => {
    while (next < count && !stop) {
      const i = next++;
      const k = ck(arm, i);
      if (cache[k] && !cache[k].error) continue;
      if (spent >= BUDGET_USD) { stop = `budget guard hit at $${spent.toFixed(4)}`; return; }
      try {
        const c = await chat({ model: arm, system: p.system, user: inputFor(i), json: true, thinking: p.thinking, maxTokens: p.maxTokens, timeoutMs: p.timeoutMs });
        const cost = costUsd(arm, c.promptTokens, c.completionTokens);
        spent += cost;
        cache[k] = { n: i + 1, entryNumber: blocks[i].raw, id: c.id, model: c.model, ms: c.ms, promptTokens: c.promptTokens, completionTokens: c.completionTokens, reasoningTokens: c.reasoningTokens, costUsd: cost, answer: parseAnswer(c.content) };
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
        cache[k] = { n: i + 1, entryNumber: blocks[i].raw, id: "", model: MODELS[arm], ms: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, answer: { lane: null, daysLeft: null, checks: "" }, error: msg };
        if (/HTTP 40[123]\b/.test(msg)) { stop = "account error (credit or key): " + msg.slice(0, 60); return; }
      }
      save();
      if ((i + 1) % 10 === 0) console.error(arm, i + 1, "/", count, "spent $" + spent.toFixed(4));
    }
  };
  await Promise.all(Array.from({ length: arm === "ultra" ? 4 : 6 }, worker));
}

async function main() {
  const count = limit > 0 ? Math.min(limit, entries.length) : entries.length;
  const startedAt = new Date().toISOString();
  startCallLog();
  await runArm("lightning", count);
  await runArm("ultra", count);
  const callLog = takeCallLog();
  if (stop) console.error("STOPPED:", stop);
  const done = (arm: ModelKey) => Array.from({ length: count }, (_, i) => cache[ck(arm, i)]);
  if (done("ultra").some((c) => !c) || done("lightning").some((c) => !c)) { console.error("incomplete; rerun to resume"); process.exit(2); }

  const nLiq = keyDaysLeft.filter((d) => d !== null).length;
  const armSummary = (id: string, label: string, pick: (i: number) => { lane: Lane | null; daysLeft: number | null; costUsd: number; promptTokens: number; completionTokens: number }, extra: object) => {
    let strict = 0, lenient = 0, unparsed = 0, exact = 0, exactN = 0, nullOk = 0, nullN = 0, cost = 0, pt = 0, ct = 0;
    for (let i = 0; i < count; i++) {
      const a = pick(i), t = truth.entries[i];
      if (a.lane === null) unparsed++;
      if (a.lane === t.lane) strict++;
      if (a.lane === t.lane || (t.alsoDefensible && a.lane === t.alsoDefensible)) lenient++;
      if (keyDaysLeft[i] === null) { nullN++; if (a.daysLeft === null) nullOk++; } else { exactN++; if (a.daysLeft === keyDaysLeft[i]) exact++; }
      cost += a.costUsd; pt += a.promptTokens; ct += a.completionTokens;
    }
    return {
      id, label, n: count, ...extra,
      lane: { strictCorrect: strict, strictAccuracy: strict / count, lenientCorrect: lenient, lenientAccuracy: lenient / count, unparsed },
      deadline: { liquidatedN: exactN, exactCorrect: exact, exactRate: exactN ? exact / exactN : null, notLiquidatedN: nullN, nullCorrect: nullOk },
      tokens: { prompt: pt, completion: ct }, costUsd: Math.round(cost * 1e6) / 1e6,
    };
  };

  const engineAt = (i: number) => ({ ...engine.get(i)!, costUsd: 0, promptTokens: 0, completionTokens: 0 });
  const modelAt = (arm: ModelKey) => (i: number) => { const c = cache[ck(arm, i)]; return { ...c.answer, costUsd: c.costUsd, promptTokens: c.promptTokens, completionTokens: c.completionTokens }; };
  const arms = {
    rules: armSummary("rules", "Rules engine", engineAt, { kind: "code", model: null }),
    ultra: armSummary("ultra", "Nemotron Ultra alone", modelAt("ultra"), { kind: "model", model: MODELS.ultra, thinking: PROMPTS.ultra.thinking, promptSha256: promptSha256(PROMPTS.ultra), maxTokens: PROMPTS.ultra.maxTokens }),
    lightning: armSummary("lightning", "Nemotron Lightning alone", modelAt("lightning"), { kind: "model", model: MODELS.lightning, thinking: PROMPTS.lightning.thinking, promptSha256: promptSha256(PROMPTS.lightning), maxTokens: PROMPTS.lightning.maxTokens }),
  };
  const totalCost = Math.round((arms.ultra.costUsd + arms.lightning.costUsd) * 1e6) / 1e6;
  const perEntry = Array.from({ length: count }, (_, i) => ({
    n: i + 1, entryNumber: blocks[i].raw, truthLane: truth.entries[i].lane, keyDaysLeft: keyDaysLeft[i],
    rules: engine.get(i),
    ultra: { lane: cache[ck("ultra", i)].answer.lane, daysLeft: cache[ck("ultra", i)].answer.daysLeft },
    lightning: { lane: cache[ck("lightning", i)].answer.lane, daysLeft: cache[ck("lightning", i)].answer.daysLeft },
  }));
  const calls = (arm: ModelKey) => done(arm).map((c) => ({ n: c.n, entryNumber: c.entryNumber, completionId: c.id, model: c.model, ms: c.ms, promptTokens: c.promptTokens, completionTokens: c.completionTokens, reasoningTokens: c.reasoningTokens, costUsd: Math.round(c.costUsd * 1e6) / 1e6, answer: c.answer, ...(c.error ? { error: c.error } : {}) }));

  const receipt = {
    provider: "nebius-token-factory",
    providerLabel: "Real run on Nebius Token Factory (default provider). Not OpenRouter, not replayed.",
    startedAt, ranAt: new Date().toISOString(), asOf: meta.asOf,
    inputs: { csv: "data/sample-es003.csv (69 synthetic shipments, 79 rows)", answerKey: "data/sample-truth.json (lane labels, hand-labelled)", n: count },
    task: "Each arm gets one entry and must return its lane and the days left in CBP's 80-day Phase 1 window. The two model arms get the fixed prompt in scripts/model-arms-prompt.ts (a plain-English rulebook plus the entry's raw CSV rows) and no engine output.",
    deadlineKey: { definition: "80 minus the calendar days from liquidation_date to asOf; null when the entry has no liquidation_date. Computed by plain date arithmetic in scripts/model-arms.ts, not by src/lib/validate.ts.", liquidatedEntries: nLiq, notLiquidatedEntries: count === entries.length ? entries.length - nLiq : keyDaysLeft.filter((d) => d === null).length, headlineRate: "exact days-left over the liquidated entries only" },
    prompts: { ultra: { sha256: promptSha256(PROMPTS.ultra), thinking: PROMPTS.ultra.thinking, maxTokens: PROMPTS.ultra.maxTokens, system: PROMPTS.ultra.system, userPrefix: USER_PREFIX }, lightning: { sha256: promptSha256(PROMPTS.lightning), thinking: PROMPTS.lightning.thinking, maxTokens: PROMPTS.lightning.maxTokens, system: PROMPTS.lightning.system, userPrefix: USER_PREFIX } },
    modelsRequested: { ultra: MODELS.ultra, lightning: MODELS.lightning },
    modelsReturnedByApi: { ultra: [...new Set(done("ultra").map((c) => c.model))], lightning: [...new Set(done("lightning").map((c) => c.model))] },
    arms,
    totals: { calls: count * 2, failedCalls: [...done("ultra"), ...done("lightning")].filter((c) => c.error).length, costUsd: totalCost, budgetUsd: 1.5, callLogEntriesThisSession: callLog.length },
    priceNote: "costUsd = usage x Nebius list price per 1M tokens in src/lib/nebius.ts PRICES (Ultra $1.00 in / $3.00 out, Lightning $0.06 in / $0.24 out). Ultra completion tokens include its reasoning tokens.",
    perEntry,
    perCall: { ultra: calls("ultra"), lightning: calls("lightning") },
  };
  const dest = limit > 0 ? ".dev-runs/model-arms-pilot.json" : OUT;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(receipt, null, 1) + "\n");
  const brief = (a: (typeof arms)[keyof typeof arms]) => `${a.label}: lane ${a.lane.strictCorrect}/${a.n} (${(a.lane.strictAccuracy * 100).toFixed(1)}%), unparsed ${a.lane.unparsed}, days-left exact ${a.deadline.exactCorrect}/${a.deadline.liquidatedN}, null ok ${a.deadline.nullCorrect}/${a.deadline.notLiquidatedN}, $${a.costUsd}`;
  console.log(brief(arms.rules)); console.log(brief(arms.ultra)); console.log(brief(arms.lightning));
  console.log("total model cost $" + totalCost, "failed calls", receipt.totals.failedCalls, "wrote", dest, "sha", createHash("sha256").update(fs.readFileSync(dest)).digest("hex").slice(0, 12));
}
main();
