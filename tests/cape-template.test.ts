import { describe, expect, it } from "vitest";
import { buildDeclarations, byteLength, CAPE_TEMPLATE, cleanEntry, csvCell, validateEntryNumbers, zipFiles } from "../src/lib/cape-template";

const mk = (n: number) => Array.from({ length: n }, (_, i) => "A7K" + String(i).padStart(8, "0"));

describe("CAPE template (CBP QRG 5552-0526 + IEEPA FAQ)", () => {
  it("header is exactly 'Entry Number', one column, UTF-8 no BOM, CRLF", () => {
    const r = buildDeclarations(mk(3));
    if (!r.ok) throw new Error("should build");
    expect(r.files[0].content).toBe("Entry Number\r\nA7K00000000\r\nA7K00000001\r\nA7K00000002\r\n");
    expect(r.files[0].content.charCodeAt(0)).toBe("E".charCodeAt(0)); // no BOM
    expect(CAPE_TEMPLATE.header).toBe("Entry Number");
  });
  it("9,999 entries make 1 file, 10,000 make 2", () => {
    const a = buildDeclarations(mk(9999)); const b = buildDeclarations(mk(10000));
    if (!a.ok || !b.ok) throw new Error("should build");
    expect(a.files.map((f) => f.count)).toEqual([9999]);
    expect(b.files.map((f) => f.count)).toEqual([9999, 1]);
    expect(b.files.map((f) => f.name)).toEqual(["cape-declaration-1-of-2.csv", "cape-declaration-2-of-2.csv"]);
    expect(a.files[0].name).toBe("cape-declaration-1-of-1.csv");
    expect(b.note).toMatch(/split into 2 files/);
  });
  it("preserves leading zeros with CBP's apostrophe and keeps 11 characters", () => {
    expect(csvCell(cleanEntry("000-1234567-8"))).toBe("'00012345678");
    expect(csvCell(cleanEntry("'00012345678"))).toBe("'00012345678");
    expect(csvCell("A7K15986055")).toBe("A7K15986055");
    const r = buildDeclarations(["000-1234567-8", "a7k-1598605-5"]);
    if (!r.ok) throw new Error("should build");
    expect(r.files[0].content.split("\r\n").slice(1, 3)).toEqual(["'00012345678", "A7K15986055"]);
    expect(r.files[0].entries).toEqual(["00012345678", "A7K15986055"]);
  });
  it("rejects duplicates, even when written differently", () => {
    const r = buildDeclarations(["A7K15986055", "a7k-1598605-5"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].cbpError).toBe("Duplicate Entry");
    expect(r.message).toMatch(/listed twice/);
  });
  it("rejects bad length, bad characters, formula starters and empty input, with CBP's wording", () => {
    expect(validateEntryNumbers(["A7K1598605"])[0].cbpError).toBe("Not 11 characters long");
    expect(validateEntryNumbers(["A7K159860555"])[0].cbpError).toBe("Not 11 characters long");
    expect(validateEntryNumbers(["A7K1598605!"])[0].cbpError).toBe("The file is deemed unsafe");
    expect(validateEntryNumbers(["=A7K1598605"])[0].cbpError).toBe("The file is deemed unsafe");
    expect(validateEntryNumbers([""])[0].cbpError).toBe("Not 11 characters long");
    const e = buildDeclarations([]);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.message).toMatch(/empty/i);
  });
  it("never exports when anything is invalid (refuses the whole file)", () => {
    const r = buildDeclarations([...mk(5), "BAD"]);
    expect(r.ok).toBe(false);
  });
  it("respects the 1 MB byte limit by splitting on size too", () => {
    const r = buildDeclarations(mk(500), { maxBytes: 1000 });
    if (!r.ok) throw new Error("should build");
    expect(r.files.length).toBeGreaterThan(1);
    for (const f of r.files) { expect(f.bytes).toBeLessThanOrEqual(1000); expect(f.bytes).toBe(byteLength(f.content)); }
    expect(r.files.reduce((s, f) => s + f.count, 0)).toBe(500);
    // default cap is under both readings of "1mb"
    const big = buildDeclarations(mk(9999));
    if (!big.ok) throw new Error("should build");
    expect(big.files[0].bytes).toBeLessThan(CAPE_TEMPLATE.maxBytes);
    expect(CAPE_TEMPLATE.maxBytes).toBeLessThanOrEqual(1024 * 1024);
  });
  it("zip is a valid store-only archive containing every file", () => {
    const z = zipFiles([{ name: "a.csv", content: "Entry Number\r\nA7K00000000\r\n" }, { name: "b.csv", content: "x" }]);
    expect(Array.from(z.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(2);
  });
});
