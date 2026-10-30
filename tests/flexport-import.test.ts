import { describe, expect, it } from "vitest";
import { checkUpload, fromFlexport, parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";

// Flexport's custom ACE report: one row per tariff ordinal, column names exactly as Flexport publishes them (docs/research/flexport-7col.md).
const FLEX = [
  "Entry Summary Number,Entry Date,Entry Summary Line Number,Tariff Ordinal Number,HTS Number - Full,Line Tariff Goods Value Amount,Line Tariff Duty Amount,Entry Type Code,Liquidation Date,Liquidation Status",
  "A7K50232977,2026-03-02,1,2,9903.01.24,0.00,19660.00,01,,Unliquidated",
  "A7K50232977,2026-03-02,1,1,8501.10.2040,98300.00,2457.50,01,,Unliquidated",
  "A7K50232977,2026-03-02,1,3,9903.88.03,0.00,24575.00,01,,Unliquidated",
  "A7K50232977,2026-03-02,2,1,8516.60.4070,59500.00,0.00,01,,Unliquidated",
  "A7K50232977,2026-03-02,2,2,9903.01.25,0.00,11900.00,01,,Unliquidated",
  "A7K23931066,2026-03-05,1,1,8544.42.9090,61200.00,0.00,01,,Unliquidated",
  "A7K23931066,2026-03-05,1,2,9903.81.90,0.00,15300.00,01,,Unliquidated",
  "A7K21937388,2026-02-01,1,1,6403.99.9065,52300.00,1307.50,01,2026-08-10,Liquidated",
  "A7K21937388,2026-02-01,1,2,9903.01.25,0.00,10460.00,01,2026-08-10,Liquidated",
].join("\n");

describe("Flexport 7-column ACE report import", () => {
  it("rolls tariff ordinals into lines: primary HTS carries value and general duty, chapter 99 headings land in the right duty", () => {
    const { entries } = parseEs003(FLEX);
    expect(entries.map((e) => e.entryNumberRaw)).toEqual(["A7K21937388", "A7K23931066", "A7K50232977"]);
    const e = entries.find((x) => x.entryNumberRaw === "A7K50232977")!;
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0]).toMatchObject({ lineNo: 1, hts: "8501.10.2040", enteredValueCents: 9830000, generalDutyCents: 245750, ieepaIndicator: true, ieepaHts: "9903.01.24", ieepaDutyCents: 1966000, s301Cents: 2457500, s232Cents: 0 });
    expect(e.lines[1]).toMatchObject({ lineNo: 2, ieepaDutyCents: 1190000, ieepaIndicator: true });
    const s232 = entries.find((x) => x.entryNumberRaw === "A7K23931066")!;
    expect(s232.lines[0]).toMatchObject({ ieepaIndicator: false, ieepaDutyCents: 0, s232Cents: 1530000 });
  });

  it("the engine sorts the imported file: IEEPA entry safe, no-IEEPA entry and 81-day liquidation left out", () => {
    const { entries } = parseEs003(FLEX);
    const pf = validateEntries(entries, { asOf: "2026-10-30", filerCodes: ["A7K"] });
    const lane = (n: string) => pf.verdicts.find((v) => entries[v.entryIdx].entryNumberRaw === n)!.lane;
    expect(lane("A7K50232977")).toBe("FILE_NOW");
    expect(lane("A7K23931066")).toBe("BLOCKED");
    expect(lane("A7K21937388")).toBe("BLOCKED");
    expect(checkUpload(FLEX)).toEqual({ ok: true, entries: 3 });
  });

  it("leaves the ES-003 layout alone and refuses a file missing a Flexport column", () => {
    expect(fromFlexport("entry_number,ieepa_duty\nA7K50232977,10.00")).toBeNull();
    expect(fromFlexport(FLEX.replace("Tariff Ordinal Number", "Ordinal"))).toBeNull();
  });
});
