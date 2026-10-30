"use client";
import { SOURCE_PANEL, VERIFIED_ON } from "@/lib/sources";

export default function Sources() {
  return (
    <section className="panel" aria-label="Sources" data-testid="sources">
      <h2>Where every rule comes from</h2>
      <p className="fine">Each link was opened and returned HTTP 200 on {VERIFIED_ON}. Rule-watch re-checks the CBP FAQ page for changes.</p>
      <ul className="mt-3 space-y-2">
        {SOURCE_PANEL.map((s) => (
          <li key={s.id} className="text-sm text-zinc-600"><span className="inline-block rounded-full border border-zinc-200 px-2 text-xs mr-2">{s.kind}</span><a className="src" data-testid="source-link" href={s.url} target="_blank" rel="noreferrer">{s.label}</a>. {s.use}</li>))}
      </ul>
    </section>
  );
}
