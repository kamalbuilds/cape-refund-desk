import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";
import { phaseOf, lockoutsOf, customsFor, CUSTOMS_SOURCES } from "../src/lib/customs-checks";
import { CAUSES, coverage } from "../src/lib/coverage";
import { ENTRY_ERRORS, FILE_ERRORS } from "../src/lib/cbp-rules";
import { computeDeadlines } from "../src/lib/validate";
import { SOURCE_PANEL } from "../src/lib/sources";
import { withCustoms } from "../src/lib/customs-sample";
import type { Entry } from "../src/lib/types";
import type { RunResult } from "../src/lib/pipeline";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const { entries } = parseEs003(csv);
const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
const base = entries.find((e) => e.entryType === "01" && e.summaryStatus === "Accepted" && e.lines.some((l) => l.ieepaIndicator && l.ieepaDutyCents > 0) && !e.liquidationDate && !e.reconFlag && !e.drawbackClaim && !e.drawbackPlanned && !e.pscNeededNonIeepa && e.protestStatus === "None")!;
const mk = (o: Partial<Entry>): Entry => ({ ...base, ...o });
const ph = (o: Partial<Entry>) => { const e = mk(o); return phaseOf(e, computeDeadlines(e, meta.asOf)); };

describe("phase classification, one condition at a time", () => {
  it("unliquidated is Phase 1", () => expect(ph({}).id).toBe(1));
  it("liquidated 10 days ago is Phase 1", () => expect(ph({ liquidationStatus: "Liquidated", liquidationDate: "2026-10-19" }).id).toBe(1));
  it("liquidated more than 80 days ago is Phase 3 (court-ordered plaintiffs only)", () => {
    const p = ph({ liquidationStatus: "Liquidated", liquidationDate: "2026-03-01" });
    expect(p.id).toBe(3); expect(p.sourceId).toBe("PHASE3"); expect(p.plain).toMatch(/Court of International Trade/); expect(p.quote).toMatch(/Court has ordered reliquidation/);
  });
  it("recon flag with no type 09 is Phase 2; with type 09 filed it is a later phase", () => {
    expect(ph({ reconFlag: true, reconEntryFiled: false }).id).toBe(2);
    expect(ph({ reconFlag: true, reconEntryFiled: true }).id).toBe("later");
  });
  it("type 09, warehouse 21/22, drawback-designated, open protest are later-phase; types 08, 23, 47 have no phase", () => {
    expect(ph({ entryType: "09" }).id).toBe("later");
    expect(ph({ entryType: "21" }).id).toBe("later");
    expect(ph({ drawbackClaim: true }).id).toBe("later");
    expect(ph({ protestStatus: "Open" }).id).toBe("later");
    for (const t of ["08", "23", "47"]) expect(ph({ entryType: t }).id).toBe("none");
  });
  it("no IEEPA duty line means no phase", () => expect(ph({ lines: base.lines.map((l) => ({ ...l, ieepaDutyCents: 0 })) }).id).toBe("none"));
  it("every phase carries a CBP/court quote and a known source", () => {
    for (const v of pf.verdicts) { expect(v.customs!.phase.quote.length).toBeGreaterThan(20); expect(CUSTOMS_SOURCES[v.customs!.phase.sourceId] ?? SOURCE_PANEL.find((s) => s.id === v.customs!.phase.sourceId)).toBeTruthy(); }
  });
  it("phase 3 sources are in the visible source panel", () => { for (const id of ["PHASE3", "PHASE3_LAW"]) expect(SOURCE_PANEL.some((s) => s.id === id)).toBe(true); });
});

describe("remedy lock-outs", () => {
  it("PSC pending locks out PSC after CAPE, quoting CBP", () => {
    const l = lockoutsOf(mk({ pscNeededNonIeepa: true }));
    expect(l.map((x) => x.id)).toEqual(["psc"]);
    expect(l[0].quote).toContain("you should file that PSC prior to filing your CAPE Declaration");
  });
  it("a protest on record warns of the lock-out; an open one is a CAPE rejection", () => {
    expect(lockoutsOf(mk({ protestStatus: "Granted" }))[0]).toMatchObject({ id: "protest", kind: "locks_out" });
    expect(lockoutsOf(mk({ protestStatus: "Open" }))[0]).toMatchObject({ id: "protest", kind: "rejects" });
    expect(lockoutsOf(mk({ protestStatus: "Denied", afrBox: true }))[0].kind).toBe("rejects");
    expect(lockoutsOf(mk({ protestStatus: "Denied", afrBox: false }))[0].kind).toBe("locks_out");
  });
  it("drawback planned is sequencing; already on a drawback claim is a rejection", () => {
    expect(lockoutsOf(mk({ drawbackPlanned: true }))[0]).toMatchObject({ id: "drawback", kind: "overlap" });
    expect(lockoutsOf(mk({ drawbackClaim: true }))[0]).toMatchObject({ id: "drawback-claim", kind: "rejects" });
  });
  it("a clean entry has none", () => expect(customsFor(base, computeDeadlines(base, meta.asOf)).lockouts).toEqual([]));
});

describe("on the sample file", () => {
  const ids = (id: string | number) => pf.verdicts.filter((v) => String(v.customs!.phase.id) === String(id));
  it("every verdict has customs, and every phase shows up", () => {
    expect(pf.verdicts.every((v) => v.customs)).toBe(true);
    for (const id of [1, 2, 3, "later", "none"]) expect(ids(id).length, `phase ${id}`).toBeGreaterThan(0);
  });
  it("Phase 3 entries are exactly the finally-liquidated blocks, and the engine still blocks them (CBP's page lists them as upcoming)", () => {
    for (const v of ids(3)) expect(v.findings.some((f) => f.code === "FINAL_LIQ")).toBe(true);
    for (const v of pf.verdicts.filter((v) => v.findings.some((f) => f.code === "FINAL_LIQ") && v.customs!.phase.id !== "none" && v.customs!.phase.id !== "later")) expect(v.customs!.phase.id).toBe(3);
  });
  it("lock-outs appear for every PSC, protest, and drawback case in the file", () => {
    for (const e of entries) {
      const v = pf.verdicts.find((x) => entries[x.entryIdx] === e) ?? undefined;
      expect(v, "verdict for entry").toBeTruthy();
      if (!v) continue;
      const got = v.customs!.lockouts.map((l) => l.id);
      if (e.pscNeededNonIeepa) expect(got).toContain("psc");
      if (e.protestStatus !== "None") expect(got).toContain("protest");
      if (e.drawbackPlanned) expect(got).toContain("drawback");
    }
  });
  it("the cached recorded run gets customs merged at serve time without changing anything else", () => {
    const run = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8")) as RunResult;
    const before = JSON.stringify(run.portfolio.verdicts.map((v) => [v.id, v.lane, v.money]));
    withCustoms(run);
    expect(run.portfolio.verdicts.every((v) => v.customs)).toBe(true);
    expect(JSON.stringify(run.portfolio.verdicts.map((v) => [v.id, v.lane, v.money]))).toBe(before);
  });
});

describe("coverage of CBP's published rejection causes", () => {
  const c = coverage();
  it("counts M from CBP's two tables: 10 file + 19 entry, one shared, so 28", () => {
    expect(Object.keys(FILE_ERRORS).length).toBe(10);
    expect(Object.keys(ENTRY_ERRORS).length).toBe(19);
    expect(c.total).toBe(28);
    expect(CAUSES.length).toBe(28);
    for (const m of [...Object.values(FILE_ERRORS), ...Object.values(ENTRY_ERRORS)]) expect(CAUSES.some((x) => x.cbp.toLowerCase() === m.toLowerCase()), m).toBe(true);
  });
  it("says 23 of 28 and lists 5 that are not checkable", () => {
    expect(c.covered).toBe(23); expect(c.byData).toBe(19); expect(c.byExport).toBe(4);
    expect(c.line).toBe("Catches 23 of 28 published CAPE rejection causes");
    expect(c.notCheckable.map((x) => x.id).sort()).toEqual(["ACCOUNT_MISMATCH", "SPI_OR_HTS", "UNABLE_CALC", "UNEXPECTED", "UNSAFE"]);
  });
  it("every cause marked as checked from data really exists in the engine", () => {
    const src = fs.readFileSync("src/lib/validate.ts", "utf8");
    for (const x of CAUSES.filter((x) => x.status === "data")) expect(src, x.id).toContain(`"${x.code}"`);
  });
  it("README states the same coverage line", () => expect(fs.readFileSync("README.md", "utf8")).toContain(c.line));
});
