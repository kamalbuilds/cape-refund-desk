import type { Lane } from "./types";

export type Tone = "go" | "hold" | "decide" | "stop";
export const LANES: { id: Lane; title: string; sub: string; tone: Tone }[] = [
  { id: "FILE_NOW", title: "Safe to claim", sub: "Customs' checks found nothing wrong. These are ready to include.", tone: "go" },
  { id: "WAIT", title: "Fix first", sub: "A correction, an open appeal or an error has to be sorted out before these can go in.", tone: "hold" },
  { id: "NET_BILL_RISK", title: "Your broker decides", sub: "Claiming could cost you more than it refunds. Your customs broker should make this call.", tone: "decide" },
  { id: "BLOCKED", title: "Leave out", sub: "Customs would reject these. Don't put them in the file.", tone: "stop" },
];
export const laneOf = (id: Lane) => LANES.find((l) => l.id === id)!;
