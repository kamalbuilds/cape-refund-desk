"use client";
import { useMemo, useState } from "react";
import { DEADLINE_SOURCES, expiringWithin, leftText, routesFor, weeklyView, type Route } from "@/lib/deadlines";
import { fmtUsd } from "@/lib/money";
import { laneOf } from "@/lib/lanes-ui";
import type { Verdict } from "@/lib/types";
import type { Portfolio } from "@/lib/validate";
import { Id } from "./ui";
import "./deadlines.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const ROUTES = [
  { id: "CAPE" as const, label: "CAPE window", sub: "80 days after liquidation" },
  { id: "PROTEST" as const, label: "Form 19 protest", sub: "180 days after liquidation" },
];

function Links({ ids }: { ids: string[] }) {
  const rows = ids.map((i) => DEADLINE_SOURCES[i]).filter((s) => s && s.url);
  if (!rows.length) return <span className="dl-src">from your file</span>;
  return <span className="dl-src">{rows.map((s, i) => <span key={s.url}>{i ? ", " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</span>;
}

/** By-week view of the dollars whose filing route closes soon. Click a week to list its shipments. */
export default function Deadlines({ portfolio, asOf, onOpen }: { portfolio: Portfolio; asOf: string; onOpen: (id: string) => void }) {
  const [route, setRoute] = useState<"CAPE" | "PROTEST">("CAPE");
  const [picked, setPicked] = useState<number | null>(null);
  const view = useMemo(() => weeklyView(portfolio.verdicts, asOf, route, 12), [portfolio, asOf, route]);
  const four = useMemo(() => expiringWithin(portfolio.verdicts, asOf, route, 28), [portfolio, asOf, route]);
  const first = view.weeks.findIndex((w) => w.entries.length > 0);
  const sel = picked !== null && picked < view.weeks.length ? picked : first;
  const max = Math.max(1, ...view.weeks.map((w) => w.cents));
  const rt = ROUTES.find((r) => r.id === route)!;
  const week = sel >= 0 ? view.weeks[sel] : null;
  const anyDays = view.weeks.some((w) => w.entries.length);

  return (
    <section className="dl" data-testid="dl-tracker" aria-labelledby="dl-h">
      <div className="dl-head">
        <div>
          <h2 id="dl-h" className="dl-title">Deadline tracker</h2>
          <p className="dl-lede" data-testid="dl-summary">
            <b className="dl-money">{fmtUsd(four.cents)}</b> closes in the next 4 weeks across {four.count} shipment{four.count === 1 ? "" : "s"} ({rt.label}).
          </p>
        </div>
        <div className="dl-seg" role="tablist" aria-label="Filing route">
          {ROUTES.map((r) => (
            <button key={r.id} role="tab" aria-selected={route === r.id} data-testid={`dl-route-${r.id.toLowerCase()}`} className="dl-segb" onClick={() => { setRoute(r.id); setPicked(null); }}>
              {r.label}<small>{r.sub}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="dl-fine" data-testid="dl-asof">
        Days are counted from <span className="mono">{asOf}</span>, the date in this data. Amounts are the net refund this tool computed for each shipment if that route is used; Customs decides the real refund.
        {route === "PROTEST" && " A protest is filed with Customs on Form 19 and is a separate step from a CAPE declaration."}
      </p>

      <ol className="dl-weeks" data-testid="dl-weeks">
        {view.weeks.map((w) => {
          const pct = (w.cents / max) * 100;
          const hot = w.index <= 1;
          const empty = w.entries.length === 0;
          return (
            <li key={w.index}>
              <button className={`dl-wk${sel === w.index ? " on" : ""}${empty ? " empty" : ""}`} aria-pressed={sel === w.index} disabled={empty}
                data-testid={`dl-week-${w.index}`}
                aria-label={`Days ${w.startDay} to ${w.endDay}, ${short(w.startIso)} to ${short(w.endIso)}: ${fmtUsd(w.cents)} across ${w.entries.length} shipments`}
                onClick={() => setPicked(w.index)}>
                <span className="dl-wk-l"><b>{w.index === 0 ? "This week" : `Week ${w.index + 1}`}</b><span>{short(w.startIso)} to {short(w.endIso)}</span></span>
                <span className="dl-track" aria-hidden><i className={hot ? "hot" : ""} style={{ width: `${Math.max(pct, w.cents > 0 ? 1.5 : 0)}%` }} /></span>
                <span className="dl-wk-n">{w.entries.length} shipment{w.entries.length === 1 ? "" : "s"}</span>
                <span className="dl-wk-m">{fmtUsd(w.cents)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="dl-fine dl-foot" data-testid="dl-foot">
        {view.beyondCount > 0 && <>Later than 12 weeks: <span className="mono">{fmtUsd(view.beyondCents)}</span> across {view.beyondCount}. </>}
        {view.expiredCount > 0 && <>Already closed on this route (not counted above): {view.expiredCount} shipment{view.expiredCount === 1 ? "" : "s"}. </>}
        {!anyDays && "No shipment on this route closes in the next 12 weeks."}
      </p>

      {week && (
        <div className="dl-list" data-testid="dl-week-list" aria-live="polite">
          <h3 className="dl-sub">{week.index === 0 ? "This week" : `Week ${week.index + 1}`}, {short(week.startIso)} to {short(week.endIso)}: {week.entries.length} shipment{week.entries.length === 1 ? "" : "s"}, <span className="mono">{fmtUsd(week.cents)}</span></h3>
          <div className="dl-scroll">
            <table className="dl-tbl">
              <thead><tr><th>Shipment</th><th>Where it sits now</th><th>Closes</th><th>Left</th><th>Net refund</th></tr></thead>
              <tbody>
                {week.entries.map((e) => (
                  <tr key={e.id}>
                    <td><button className="linkbtn" onClick={() => onOpen(e.id)}><Id>{e.displayNumber}</Id></button></td>
                    <td><span className={`pill ${laneOf(e.lane).tone}`}>{laneOf(e.lane).title}</span></td>
                    <td className="mono">{e.closes}</td>
                    <td className={e.daysLeft <= 7 ? "dl-hotx mono" : "mono"}>{e.daysLeft === 0 ? "today" : `${e.daysLeft}d`}</td>
                    <td className="dl-money">{fmtUsd(e.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="dl-fine dl-cites">
        Sources: {route === "CAPE" ? <Links ids={["FAQ"]} /> : <Links ids={["19USC1514", "19CFR174.12"]} />}. Windows are calendar days; confirm weekend and holiday handling with your broker. Not legal advice.
      </p>
    </section>
  );
}

/** Every route the data supports for one entry, with days left. Shown in the entry drawer. */
export function DrawerRoutes({ v, asOf }: { v: Verdict; asOf: string }) {
  const rs = routesFor(v, asOf);
  if (rs.length === 0) return <p className="d-small" data-testid="dl-drawer-routes">No liquidation or filing date in the data for this shipment, so there are no clocks to count.</p>;
  return (
    <div className="dl-dr" data-testid="dl-drawer-routes">
      {rs.map((r) => <RouteRow key={r.id} r={r} />)}
    </div>
  );
}

const SPAN: Record<string, number> = { CAPE: 80, PROTEST: 180 };
function RouteRow({ r }: { r: Route }) {
  const span = SPAN[r.id];
  const used = span && r.daysLeft !== null ? Math.max(0, Math.min(1, (span - r.daysLeft) / span)) : null;
  const tone = r.urgency === "expired" ? "x" : r.urgency === "today" || r.urgency === "urgent" ? "hot" : r.urgency === "soon" ? "soon" : "";
  return (
    <div className={`dl-r ${r.actionable ? "" : "info"}`} data-route={r.id}>
      <div className="dl-r-h">
        <span>{r.label}{r.closes && <> <span className="d-muted mono">{r.closes}</span></>}</span>
        <b className={`dl-left ${tone}`}>{leftText(r.daysLeft)}</b>
      </div>
      {used !== null && <div className="dl-bar" role="img" aria-label={`${r.label}: ${leftText(r.daysLeft)}`}><i className={tone} style={{ width: `${(r.urgency === "expired" ? 1 : used) * 100}%` }} /></div>}
      <p className="dl-r-b">{r.basis} <Links ids={r.sources} /></p>
    </div>
  );
}
