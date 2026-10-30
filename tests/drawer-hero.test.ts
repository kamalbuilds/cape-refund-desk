import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";
import { amountHeader, drawerHero } from "../src/lib/lanes-ui";
import type { Lane } from "../src/lib/types";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });

describe("drawer hero never shows a green $0.00 (or green anything) for a shipment that is not claimable now", () => {
  it("green is reserved for FILE_NOW, and only with money to claim", () => {
    for (const v of pf.verdicts) {
      const h = drawerHero(v.lane, v.money);
      if (h.tone === "ok") { expect(v.lane, v.displayNumber).toBe("FILE_NOW"); expect(h.cents).toBeGreaterThan(0); expect(h.claimableNowCents).toBe(h.cents); }
      if (v.lane !== "FILE_NOW") expect(h.claimableNowCents, v.displayNumber).toBe(0);
    }
  });
  it("a hero figure of exactly $0.00 never appears with a refund label unless the whole shipment is a true zero", () => {
    for (const v of pf.verdicts.filter((x) => x.lane !== "BLOCKED")) {
      const h = drawerHero(v.lane, v.money);
      expect(h.cents, v.displayNumber).toBe(v.money.netCents); // the headline equals the Net row, always
      if (h.cents === 0) expect(h.tone).not.toBe("ok");
    }
  });
  it("fix-first shipment A7K-5314569-9 shows its potential net in the warn tone and says $0.00 is claimable today", () => {
    const v = pf.verdicts.find((x) => x.displayNumber === "A7K-5314569-9")!;
    expect(v.lane).toBe("WAIT");
    const h = drawerHero(v.lane, v.money);
    expect(v.money.netCents).toBeGreaterThan(0);
    expect(h).toMatchObject({ tone: "hold", cents: v.money.netCents, claimableNowCents: 0 });
    expect(h.label).toBe("Refund once the correction is filed");
    expect(h.note).toMatch(/^Claimable today: \$0\.00\. \$[\d,]+\.\d\d unlocks only after the issue below is fixed and filed\.$/);
  });
  it("every lane gets a lane-specific label, and none of the non-claimable lanes is plain 'Refund'", () => {
    const labels = new Map<Lane, Set<string>>();
    for (const v of pf.verdicts) { const s = labels.get(v.lane) ?? new Set(); s.add(drawerHero(v.lane, v.money).label); labels.set(v.lane, s); }
    for (const [lane, set] of labels) for (const l of set) { if (lane !== "FILE_NOW") expect(l, lane).not.toBe("Refund"); expect(l.length).toBeGreaterThan(8); }
    expect([...(labels.get("FILE_NOW") ?? [])]).toEqual(["Refund you can claim now"]);
  });
  it("net bills stay red and are not called a refund", () => {
    const h = drawerHero("NET_BILL_RISK", { netCents: -262500, underpaidOtherCents: 300000 });
    expect(h).toMatchObject({ tone: "bill", cents: -262500, label: "You\u2019d owe Customs", claimableNowCents: 0 });
    const w = drawerHero("WAIT", { netCents: -100, underpaidOtherCents: 500 });
    expect(w.tone).toBe("bill");
  });
  it("broker-decides with a positive net is warn, not green, and says what could be billed back", () => {
    const h = drawerHero("NET_BILL_RISK", { netCents: 500000, underpaidOtherCents: 120000 });
    expect(h).toMatchObject({ tone: "hold", claimableNowCents: 0 });
    expect(h.note).toMatch(/Claimable today: \$0\.00.*\$1,200\.00/);
  });
  it("board column headers: only claimable-now amounts are headed 'Refund'", () => {
    expect(amountHeader("FILE_NOW")).toBe("Refund");
    for (const l of ["WAIT", "BLOCKED", "NET_BILL_RISK"] as Lane[]) expect(amountHeader(l)).not.toBe("Refund");
  });
});
