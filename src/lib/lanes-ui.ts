import type { Lane } from "./types";

export type Tone = "go" | "hold" | "decide" | "stop";
export const LANES: { id: Lane; title: string; sub: string; tone: Tone }[] = [
  { id: "FILE_NOW", title: "Safe to claim", sub: "Customs' checks found nothing wrong. These are ready to include.", tone: "go" },
  { id: "WAIT", title: "Fix first", sub: "A correction, an open appeal or an error has to be sorted out before these can go in.", tone: "hold" },
  { id: "NET_BILL_RISK", title: "Your broker decides", sub: "Other duties Customs may bill could cancel the refund or turn it into a bill. Your customs broker should make this call.", tone: "decide" },
  { id: "BLOCKED", title: "Leave out", sub: "Customs would reject these. Don't put them in the file.", tone: "stop" },
];
export const laneOf = (id: Lane) => LANES.find((l) => l.id === id)!;

export type HeroTone = "ok" | "hold" | "bill";
export interface DrawerHero {
  label: string;
  tone: HeroTone;
  /** The figure shown big. For lanes that are not claimable yet this is the potential net, never a bare $0. */
  cents: number;
  /** One line saying why the figure is, or is not, claimable today. null when it is claimable now. */
  note: string | null;
  /** Dollars Customs would pay if filed today. Only FILE_NOW is non-zero. */
  claimableNowCents: number;
}

/** What the shipment drawer shows as its headline money. Green only ever means claimable now. */
export function drawerHero(lane: Lane, m: { netCents: number; underpaidOtherCents: number }): DrawerHero {
  const net = m.netCents;
  const fmt = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (lane === "FILE_NOW") return { label: "Refund you can claim now", tone: net < 0 ? "bill" : "ok", cents: net, note: null, claimableNowCents: Math.max(0, net) };
  if (net < 0) return {
    label: "You\u2019d owe Customs", tone: "bill", cents: net, claimableNowCents: 0,
    note: lane === "WAIT" ? "Not claimable yet: sort out the issues below first. Even then, claiming would cost you money." : "Claiming this would cost you money, so nothing is claimable.",
  };
  if (lane === "WAIT") return {
    label: "Refund once the correction is filed", tone: "hold", cents: net, claimableNowCents: 0,
    note: `Claimable today: $0.00. ${fmt(net)} unlocks only after the issue below is fixed and filed.`,
  };
  return {
    label: "Net refund, if your broker goes ahead", tone: "hold", cents: net, claimableNowCents: 0,
    note: `Claimable today: $0.00. Customs may bill back ${fmt(m.underpaidOtherCents)} in other duties, so your broker decides first.`,
  };
}

/** Board column header for the amount, per lane, so a not-yet-claimable amount is never headed "Refund". */
export const amountHeader = (lane: Lane): string =>
  lane === "NET_BILL_RISK" ? "You\u2019d get or owe" : lane === "WAIT" ? "Refund once fixed" : lane === "BLOCKED" ? "Paid, not claimable" : "Refund";
