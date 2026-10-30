/**
 * CBP's CAPE Declaration upload template, as published. Pure functions, no I/O.
 *
 * Sources (fetched 2026-10-30; quoted again in docs/research/cape-template.md):
 *  [FAQ] https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds
 *  [QRG] https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf
 *        (Publication No. 5552-0526, May 2026)
 *
 * What CBP publishes:
 *  - File: "ACEP_CapeEntryNumberUploadTemplate" CSV, one column, header row "Entry Number" in row 1,
 *    entries from row 2. [QRG Topic 1 step 4a] "Enter the applicable entry number(s) in the first column,
 *    vertically, beginning in the second row below the Entry Number title row ... do not delete the Entry Number
 *    title in the first row." [FAQ] "CBP does not require any other information in the .CSV file."
 *  - Type: [QRG] "must be saved with the CSV (Comma delimited) (*.csv) file type". Error "Not a CSV file".
 *    Encoding is not published. We write UTF-8 with no BOM (a BOM would glue itself to the header and CBP
 *    would see a missing "Entry Number" header) and CRLF line ends, which is what Excel's CSV save writes.
 *  - Count: [FAQ] "Each individual CAPE Declaration has a limit of 9,999 entries." [QRG] says 10,000 per file.
 *    Both are quoted; we use the stricter 9,999.
 *  - Size: [QRG] "file size is limited to 1mb". "1mb" is not defined as 1,000,000 or 1,048,576 bytes, so we use
 *    the smaller one, 1,000,000.
 *  - Entry number: [QRG Topic 2] "11 alphanumeric characters. Dash is optional (any special characters will be
 *    stripped prior to 11-character validation)"; [QRG Topic 3] "Not 11 characters long: Entry Number must be 11
 *    characters without dashes"; "Duplicate Entry: CSV file has duplicate Entry Numbers".
 *  - Leading zero: [FAQ, updated 6/9/2026] "In order to preserve the beginning zero (0) on an entry summary
 *    number, insert an apostrophe (') directly before the zero (Example: '000-XXXXXX-XX or '000XXXXXXXX)".
 *  - "The file is deemed unsafe": we refuse anything outside [A-Za-z0-9], which also rules out spreadsheet
 *    formula starters (= + - @).
 */
export const CAPE_TEMPLATE = {
  /** Download name of CBP's template; ours are numbered variants of the same shape. */
  cbpTemplateName: "ACEP_CapeEntryNumberUploadTemplate",
  header: "Entry Number",
  encoding: "UTF-8, no BOM",
  eol: "\r\n",
  /** [FAQ] 9,999 per declaration. ([QRG] 10,000 per file; we stay under both.) */
  maxEntries: 9999,
  /** [QRG] "1mb"; we read it as 1,000,000 bytes (the smaller reading). */
  maxBytes: 1_000_000,
  entryLength: 11,
  sources: {
    faq: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds",
    qrg: "https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf",
  },
} as const;

export interface CapeEntryProblem { index: number; value: string; error: string; cbpError: string }
export interface CapeDeclarationFile { name: string; content: string; bytes: number; count: number; entries: string[]; ok: true; problems: string[] }
export type CapeBuild =
  | { ok: true; files: CapeDeclarationFile[]; total: number; note: string }
  | { ok: false; problems: CapeEntryProblem[]; message: string };

const enc = new TextEncoder();
export const byteLength = (s: string) => enc.encode(s).length;

/** Strip the one apostrophe CBP tells you to put before a leading zero, and any dashes, for checking. */
export function cleanEntry(raw: string): string {
  return raw.trim().replace(/^['\u2018\u2019]/, "").replace(/-/g, "").toUpperCase();
}

/** What goes in the file: 11 characters, with an apostrophe before a leading zero (CBP's FAQ). */
export function csvCell(clean: string): string {
  return clean.startsWith("0") ? `'${clean}` : clean;
}

/** Refuse, with CBP's own error wording, anything CBP would reject at "Failed initial validation". */
export function validateEntryNumbers(values: string[]): CapeEntryProblem[] {
  const problems: CapeEntryProblem[] = [];
  const seen = new Map<string, number>();
  values.forEach((raw, index) => {
    const c = cleanEntry(raw);
    if (!c) { problems.push({ index, value: raw, error: "Blank entry number.", cbpError: "Not 11 characters long" }); return; }
    if (c.length !== CAPE_TEMPLATE.entryLength) problems.push({ index, value: raw, error: `Entry number ${raw} has ${c.length} characters; it must have exactly 11, with no dashes.`, cbpError: "Not 11 characters long" });
    else if (!/^[A-Z0-9]{11}$/.test(c)) problems.push({ index, value: raw, error: `Entry number ${raw} has characters other than letters and digits.`, cbpError: "The file is deemed unsafe" });
    const first = seen.get(c);
    if (first !== undefined) problems.push({ index, value: raw, error: `Entry number ${c} is listed twice (rows ${first + 2} and ${index + 2}).`, cbpError: "Duplicate Entry" });
    else seen.set(c, index);
  });
  return problems;
}

export const declarationName = (n: number, of: number) => `cape-declaration-${n}-of-${of}.csv`;

function render(cells: string[]): string {
  return [CAPE_TEMPLATE.header, ...cells].join(CAPE_TEMPLATE.eol) + CAPE_TEMPLATE.eol;
}

/**
 * Validate, then split into declarations that each respect BOTH the entry cap and the byte cap.
 * Refuses (ok:false) instead of producing a file CBP would reject.
 */
export function buildDeclarations(values: string[], limits: { maxEntries?: number; maxBytes?: number } = {}): CapeBuild {
  const maxEntries = limits.maxEntries ?? CAPE_TEMPLATE.maxEntries;
  const maxBytes = limits.maxBytes ?? CAPE_TEMPLATE.maxBytes;
  if (!values.length) return { ok: false, problems: [], message: "Nothing is selected. Customs rejects an empty file (\"CSV content is empty or missing the header\"), so no file was made." };
  const problems = validateEntryNumbers(values);
  if (problems.length) {
    const first = problems.slice(0, 3).map((p) => p.error).join(" ");
    return { ok: false, problems, message: `${problems.length} problem${problems.length === 1 ? "" : "s"} Customs would reject, so no file was made. ${first}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ""}` };
  }
  const cells = values.map((v) => csvCell(cleanEntry(v)));
  const headBytes = byteLength(render([]));
  const groups: string[][] = [];
  let cur: string[] = [], curBytes = headBytes;
  for (const cell of cells) {
    const add = byteLength(cell) + CAPE_TEMPLATE.eol.length;
    if (cur.length && (cur.length >= maxEntries || curBytes + add > maxBytes)) { groups.push(cur); cur = []; curBytes = headBytes; }
    cur.push(cell); curBytes += add;
  }
  groups.push(cur);
  const files = groups.map((g, i): CapeDeclarationFile => {
    const content = render(g);
    return { name: declarationName(i + 1, groups.length), content, bytes: byteLength(content), count: g.length, entries: g.map((c) => c.replace(/^'/, "")), ok: true, problems: [] };
  });
  const note = files.length === 1
    ? `One file with ${cells.length.toLocaleString("en-US")} shipments. Upload it in the CAPE tab of the ACE Portal.`
    : `Customs allows at most ${maxEntries.toLocaleString("en-US")} shipments and 1 MB per file, so your ${cells.length.toLocaleString("en-US")} shipments are split into ${files.length} files. Upload each one separately; the zip holds all of them.`;
  return { ok: true, files, total: cells.length, note };
}

/* ---------- minimal store-only zip (no dependency) ---------- */
let CRC: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipFiles(files: { name: string; content: string }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true);
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.content), crc = crc32(data);
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21);
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, 0); u16(cv, 14, 0x21);
    u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length); u32(cv, 42, offset); ch.set(name, 46);
    parts.push(lh, data); central.push(ch); offset += lh.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
