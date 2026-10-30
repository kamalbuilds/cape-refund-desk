"use client";
import { buildIcs } from "@/lib/ics";
import { brokerPacket, markdownToPdf } from "@/lib/packet";
import type { Explanation, PortfolioNote, Receipt } from "@/lib/pipeline";
import type { Portfolio } from "@/lib/validate";
import { BTN_SECONDARY, BTN_TERTIARY } from "./ui";

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ExportExtras({ board, include, explanations, portfolioNote, receipt, mode, ack }: { board: { portfolio: Portfolio; asOf: string; label?: string }; include: Set<string>; explanations: Record<string, Explanation>; portfolioNote: PortfolioNote | null; receipt: Receipt | null; mode: string; ack: boolean }) {
  const md = () => brokerPacket({ portfolio: board.portfolio, asOf: board.asOf, label: board.label ?? "", include, explanations, portfolioNote, receipt, mode: receipt?.mode === "replay" ? "replay" : "live" });
  const tip = ack ? undefined : "Tick the box above first";
  return (
    <div className="btnrow" data-testid="export-extras">
      <button className={BTN_SECONDARY} disabled={!ack} title={tip} data-testid="dl-packet-md" onClick={() => save("cape-broker-packet.md", md(), "text/markdown;charset=utf-8")}>Broker packet (.md)</button>
      <button className={BTN_SECONDARY} disabled={!ack} title={tip} data-testid="dl-packet-pdf" onClick={() => save("cape-broker-packet.pdf", markdownToPdf(md()) as BlobPart, "application/pdf")}>Broker packet (.pdf)</button>
      <button className={BTN_TERTIARY} disabled={!ack} title={tip} data-testid="dl-ics" onClick={() => save("cape-deadlines.ics", buildIcs(board.portfolio, board.asOf, { include }), "text/calendar;charset=utf-8")}>Deadlines to calendar (.ics)</button>
    </div>
  );
}
