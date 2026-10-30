import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { checkUpload, parseEs003 } from "../src/lib/parse";
import { plainStep } from "../src/lib/plain";
import { applyCodeVeto, vetoSignals, vetoStats, type VetoInfoLike } from "../src/lib/signals";
import { allConflicts, type RunResult } from "../src/lib/pipeline";
import { classifyProbeError, LIVE_NOTES, probeLive } from "../src/lib/health";
import { validateEntries } from "../src/lib/validate";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const mini = fs.readFileSync("data/sample-mini.csv", "utf8");
const run = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8")) as RunResult;
const base = { asOf: meta.asOf as string, filerCodes: meta.filerCodes as string[] };

describe("A: upload check gives a clear error instead of a silent 0 of 0", () => {
  it("accepts the sample and the mini sample", () => {
    expect(checkUpload(csv)).toEqual({ ok: true, entries: 69 });
    expect(checkUpload(mini)).toEqual({ ok: true, entries: 10 });
  });
  it("rejects an empty file, a CBP one-column template, and a random CSV", () => {
    for (const bad of ["", "   \n", "Entry Number\nABC12345678\n", "name,age\nbob,3\n"]) {
      const r = checkUpload(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
    const r = checkUpload("name,age\nbob,3\n");
    if (!r.ok) expect(r.error).toMatch(/entry_number/);
  });
  it("tolerates a BOM", () => { expect(checkUpload("\ufeff" + csv).ok).toBe(true); });
});

describe("A: 'closes today' is tied to the data's as-of date", () => {
  it("names the as-of date when zero days are left", () => {
    expect(plainStep("Step 1: file now, CAPE window closes in 0 days", "2026-10-29")).toContain("2026-10-29");
    expect(plainStep("Step 1: file now, CAPE window closes in 0 days", "2026-10-29")).not.toMatch(/today/i);
    expect(plainStep("Step 1: file now, CAPE window closes in 5 days", "2026-10-29")).toBe("Claim now: the window closes in 5 days");
  });
});

describe("B: live health probes credit", () => {
  it("reports credit exhaustion as not live with an honest note", async () => {
    const h = await probeLive({ keyPresent: true, run: async () => { throw new Error('Nebius 402: {"error":"insufficient_quota"}'); } });
    expect(h.live).toBe(false);
    expect(h.reason).toBe("credit");
    expect(h.note).toBe(LIVE_NOTES.credit);
  });
  it("reports live only when the cheap call succeeds, and disabled without a key", async () => {
    expect((await probeLive({ keyPresent: true, run: async () => ({}) })).live).toBe(true);
    expect((await probeLive({ keyPresent: false })).reason).toBe("disabled");
    expect(classifyProbeError("something odd")).toBe("error");
  });
});

describe("C: code vetoes AI tag false positives", () => {
  it("vetoes drawback on an ES-701 courtesy notice and on TIB", () => {
    expect(vetoSignals("Liquidated per ES-701 courtesy notice; broker flagged as urgent.", ["drawback_claim"]).kept).toEqual([]);
    expect(vetoSignals("Temporary import under bond, TIB.", ["drawback_claim", "drawback_planned"]).vetoed.length).toBe(2);
  });
  it("keeps a tag the note supports, re-tags planned drawback, and vetoes everything on an empty note", () => {
    expect(vetoSignals("Protest 2704-26-000123 still open.", ["protest"]).kept).toEqual(["protest"]);
    const p = vetoSignals("Importer plans a drawback claim in Q1; file CAPE first.", ["drawback_claim"]);
    expect(p.kept).toEqual(["drawback_planned"]);
    expect(p.vetoed[0].why).toMatch(/planned/);
    expect(vetoSignals("", ["protest", "none"]).kept).toEqual(["none"]);
  });
  it("is idempotent and keeps the raw tags", () => {
    const info: VetoInfoLike = { notes: "Temporary import under bond, TIB.", noteSignals: ["drawback_claim"], noteConflicts: [{ signal: "drawback_claim", message: "x" }] };
    const a = applyCodeVeto(info);
    expect(a.noteSignals).toEqual(["none"]);
    expect(a.noteConflicts).toEqual([]);
    expect(a.noteSignalsRaw).toEqual(["drawback_claim"]);
    expect(applyCodeVeto(a)).toEqual(a);
  });
  it("the recorded run: the veto removes the false-positive conflicts; one survives and is reported (a Type 09 'Reconciliation summary entry' note with recon_flag N)", () => {
    const infos = Object.values(run.entryInfo).map(applyCodeVeto);
    const s = vetoStats(infos);
    expect(s.conflictsBefore).toBeGreaterThan(0);
    expect(s.conflictsAfter).toBe(1); // honest result of the 2026-10-30 run: the note really says "Reconciliation", so the veto cannot call it unsupported
    const left = Object.entries(run.entryInfo).filter(([, i]) => applyCodeVeto(i).noteConflicts.length);
    expect(left.map(([id]) => id.split("#")[0])).toEqual(["A7K45051022"]);
    expect(s.vetoed).toBeGreaterThan(0);
    expect(s.vetoed).toBeLessThanOrEqual(s.tagged);
  });
});

describe("C: the 3 seeded entries where the note contradicts the data", () => {
  const { entries } = parseEs003(mini);
  const pf = validateEntries(entries, base);
  const byNote = (re: RegExp) => entries.find((e) => re.test(e.notes))!;
  it("engine alone sees nothing wrong with them (they are plain FILE_NOW)", () => {
    for (const re of [/Protest filed 10\/20/, /recon entry was filed/, /DBK-4410/]) {
      const i = entries.indexOf(byNote(re));
      expect(pf.verdicts.find((v) => v.entryIdx === i)?.lane).toBe("FILE_NOW");
    }
  });
  it("a correct AI tag becomes an 'AI caught' conflict that survives the veto", () => {
    const cases: [RegExp, string][] = [[/Protest filed 10\/20/, "protest"], [/recon entry was filed/, "recon"], [/DBK-4410/, "drawback_claim"]];
    for (const [re, sig] of cases) {
      const e = byNote(re);
      const info = applyCodeVeto({ notes: e.notes, noteSignals: [sig], noteConflicts: allConflicts(e, [sig]) });
      expect(info.noteConflicts.map((c) => c.signal)).toEqual([sig]);
    }
  });
  it("the false-positive traps in the mini file get vetoed", () => {
    for (const re of [/ES-701 courtesy/, /TIB/]) {
      const e = byNote(re);
      const info = applyCodeVeto<VetoInfoLike>({ notes: e.notes, noteSignals: ["drawback_claim"], noteConflicts: allConflicts(e, ["drawback_claim"]) });
      expect(info.noteConflicts).toEqual([]);
      expect(info.noteVetoed?.length).toBe(1);
    }
  });
});

describe("D: Recon-flagged entry offers both paths", () => {
  it("A7K15986055#5 keeps its hold but names both options", () => {
    const { entries } = parseEs003(csv);
    const pf = validateEntries(entries, base);
    const v = pf.verdicts.find((x) => x.findings.some((f) => f.code === "RECON_FIRST"))!;
    const f = v.findings.find((x) => x.code === "RECON_FIRST")!;
    expect(f.fix).toMatch(/broker decides/i);
    expect(f.fix).toMatch(/Recon-flagged entries even when no Type 09/i);
  });
});
