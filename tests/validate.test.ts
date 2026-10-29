import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTRY_ERRORS, FILE_ERRORS, LIMITS } from "../src/lib/cbp-rules";
import { buildCapeFiles, defaultInclude, deadlineCsv, handoffNote } from "../src/lib/export";
import { computeMoney } from "../src/lib/money";
import { normalizeEntryNumber, parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";
import { parseDate } from "../src/lib/dates";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const { entries } = parseEs003(csv);
const opts = { asOf: meta.asOf, filerCodes: meta.filerCodes as string[] };
const pf = validateEntries(entries, opts);
const byNote = (frag: string) => pf.verdicts.find((v, i) => entries.find((e) => e.notes.includes(frag)) && v.key === normalizeEntryNumber(entries.find((e) => e.notes.includes(frag))!.entryNumberRaw) && v.findings.length >= 0);
const lane = (frag: string) => byNote(frag)!;

describe("sample dataset", () => {
  it("has ~60+ entries and every seeded trap lands in the right lane", () => {
    expect(entries.length).toBeGreaterThanOrEqual(60);
    expect(lane("Liquidated early August").lane).toBe("BLOCKED");
    expect(lane("Liquidated early August").findings[0].cbpError).toBe(ENTRY_ERRORS.FINAL_LIQ);
    expect(lane("Protest 2704-26-000123").lane).toBe("WAIT");
    expect(lane("Recon entry already filed").findings.map((f) => f.cbpError)).toContain(ENTRY_ERRORS.RECON_FILED);
    expect(lane("Temporary import under bond").findings.map((f) => f.cbpError)).toContain(ENTRY_ERRORS.TYPE_NOT_ALLOWED);
    expect(lane("Importer says 301 was declared on both lines").lane).not.toBe("FILE_NOW");
  });
  it("leading zero gets an apostrophe; csv value is 11 chars + apostrophe", () => {
    const v = lane("Filer code starts with zero");
    expect(v.leadingZeroFix).toBe(true);
    expect(v.csvValue).toMatch(/^'0P2\d{8}$/);
  });
  it("duplicate (even with dashes) is blocked with the CBP string, first copy kept", () => {
    const dups = pf.verdicts.filter((v) => v.findings.some((f) => f.cbpError === FILE_ERRORS.DUPLICATE));
    expect(dups.length).toBe(1);
    const first = pf.verdicts.filter((v) => v.key === dups[0].key);
    expect(first.length).toBe(2);
    expect(first.filter((v) => v.lane !== "BLOCKED").length).toBe(1);
  });
  it("10-char and wrong-filer entries are file-level blocks", () => {
    expect(pf.verdicts.some((v) => v.findings.some((f) => f.cbpError === FILE_ERRORS.NOT_11))).toBe(true);
    expect(pf.verdicts.some((v) => v.findings.some((f) => f.cbpError === FILE_ERRORS.FILER_CODE))).toBe(true);
  });
  it("filing order: PSC/Recon first, then liquidated by days left, recon, drawback, unliquidated", () => {
    const steps = pf.verdicts.map((v) => v.filingStep.split(":")[0]);
    const first = (s: string) => steps.indexOf(s);
    expect(first("Step 0")).toBe(0);
    expect(first("Step 1")).toBeGreaterThan(first("Step 0"));
    expect(first("Step 2")).toBeGreaterThan(first("Step 1"));
    expect(first("Step 3")).toBeGreaterThan(first("Step 2"));
    expect(first("Step 4")).toBeGreaterThan(first("Step 3"));
    const s1 = pf.verdicts.filter((v) => v.filingStep.startsWith("Step 1")).map((v) => v.deadlines.capeDaysLeft!);
    expect([...s1].sort((a, b) => a - b)).toEqual(s1);
  });
  it("80 days is still in the window, 81 is not", () => {
    const e80 = pf.verdicts.find((v) => v.deadlines.daysSinceLiquidation === 80)!;
    expect(e80.lane).toBe("FILE_NOW");
    expect(e80.deadlines.capeDaysLeft).toBe(0);
    expect(pf.verdicts.find((v) => v.deadlines.daysSinceLiquidation === 81)!.lane).toBe("BLOCKED");
  });
  it("lane counts add up and diversion flags IORs with debt", () => {
    const n = Object.values(pf.lanes).reduce((s, l) => s + l.count, 0);
    expect(n).toBe(pf.verdicts.length);
    expect(pf.iors.map((i) => i.ior).sort()).toEqual(["IOR-0104", "IOR-0107"]);
    for (const i of pf.iors) expect(i.expectedDiversionCents).toBe(Math.min(i.openDebtCents, i.eligibleRefundCents));
  });
});

describe("money", () => {
  it("framework 15% refunds only the IEEPA portion above Column 1", () => {
    const e = entries.find((x) => x.notes.includes("EU Framework"))!;
    const m = computeMoney(e);
    const l = e.lines[0];
    expect(l.frameworkGroup).toBe("EU");
    expect(m.grossIeepaCents).toBe(Math.round(l.enteredValueCents * 0.15));
    expect(m.frameworkCarveOutCents).toBe(Math.round(l.enteredValueCents * 0.05));
    expect(m.ieepaRefundableCents).toBe(m.grossIeepaCents - m.frameworkCarveOutCents);
  });
  it("underpaid other duty nets down and can produce a bill", () => {
    const e = entries.find((x) => x.notes.includes("232 underpaid"))!;
    const m = computeMoney(e);
    expect(m.netCents).toBe(m.ieepaRefundableCents - m.underpaidOtherCents);
    expect(m.billCents).toBe(-m.netCents);
    expect(m.billCents).toBeGreaterThan(0);
    expect(pf.verdicts.find((v) => v.key === normalizeEntryNumber(e.entryNumberRaw))!.lane).toBe("NET_BILL_RISK");
  });
});

describe("file-level limits and CSV export", () => {
  const include = defaultInclude(pf);
  it("exports one column of 11-char entry numbers with a leading-zero apostrophe", () => {
    const [f] = buildCapeFiles(pf.verdicts, include);
    const lines = f.content.trim().split("\r\n");
    expect(lines[0]).toBe("Entry Number");
    expect(lines.length - 1).toBe(pf.lanes.FILE_NOW.count);
    for (const l of lines.slice(1)) expect(l.replace(/^'/, "")).toMatch(/^[A-Z0-9]{11}$/);
    expect(f.ok).toBe(true);
    expect(f.bytes).toBeLessThan(LIMITS.maxFileBytes);
  });
  it("splits into declarations of at most 9,999 entries", () => {
    const fake = Array.from({ length: 10050 }, (_, i) => ({ ...pf.verdicts[0], key: "A7K" + String(i).padStart(8, "0"), csvValue: "A7K" + String(i).padStart(8, "0"), order: i, id: "x" + i }));
    const files = buildCapeFiles(fake, new Set(fake.map((v) => v.id)));
    expect(files.map((f) => f.count)).toEqual([9999, 51]);
  });
  it("handoff note and deadline list render", () => {
    const note = handoffNote(pf, meta.asOf, include);
    expect(note).toContain("Not legal or customs advice");
    expect(note).toContain("cannot be amended");
    expect(deadlineCsv(pf).split("\r\n")[0]).toContain("days_left");
  });
});

describe("parsing", () => {
  it("normalizes entry numbers and dates", () => {
    expect(normalizeEntryNumber("'0p2-1234567-8")).toBe("0P212345678");
    expect(parseDate("10/14/2026").iso).toBe("2026-10-14");
    expect(parseDate("14-Sep-2026").iso).toBe("2026-09-14");
  });
});
