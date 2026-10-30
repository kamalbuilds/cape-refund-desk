/**
 * Code veto for the fast model's note tags.
 *
 * Lightning reads the broker's free-text note and tags it ("protest", "drawback_claim", ...). A model can over-tag, so plain code
 * checks every tag against the note text. A tag survives only if the note contains words that support it. Tags that do not are
 * "vetoed": they are not shown as findings and cannot raise a conflict. The tags the model returned are never deleted from the
 * record, they are listed as vetoed with the reason.
 */
export interface Veto { signal: string; why: string }
export interface VetoInfoLike { notes: string; noteSignals: string[]; noteConflicts: { signal: string; message: string }[]; noteVetoed?: Veto[]; noteSignalsRaw?: string[] }

const PLANNED = /\b(plan(s|ned|ning)?|will file|going to|intend|intends|later|next quarter|q[1-4])\b/i;
const EVIDENCE: Record<string, { re: RegExp; missing: string }> = {
  protest: { re: /protest/i, missing: 'The note never mentions a protest.' },
  recon: { re: /recon/i, missing: 'The note never mentions Recon.' },
  recon_deadline_soon: { re: /recon[\s\S]*\b(due|deadline|weeks?|days?|by\s)|\b(due|deadline)[\s\S]*recon/i, missing: 'The note gives no Recon deadline.' },
  drawback_claim: { re: /drawback|\bdbk\b/i, missing: 'The note says nothing about drawback.' },
  drawback_planned: { re: /drawback|\bdbk\b/i, missing: 'The note says nothing about drawback.' },
  psc_pending: { re: /\bpsc\b|post.?summary|correction/i, missing: 'The note never mentions a PSC or correction.' },
  underpaid_duty: { re: /under.?(paid|pay|declar|stat)|short.?paid|owes? (more|additional)/i, missing: 'The note never says duty was underpaid.' },
  suspension: { re: /suspen/i, missing: 'The note never mentions a suspension.' },
  injunction: { re: /injunct|court order|\bcit\b/i, missing: 'The note never mentions a court injunction.' },
  other_filer: { re: /(other|another|different|second|prior)\s+(filer|broker|party)|filed by (the )?(importer|broker)/i, missing: 'The note does not say another party filed.' },
};

/** Which of the model's tags does the note text actually support? */
export function vetoSignals(note: string, signals: string[]): { kept: string[]; vetoed: Veto[] } {
  const kept: string[] = []; const vetoed: Veto[] = [];
  const text = note ?? "";
  for (const s of signals) {
    if (s === "none") { kept.push(s); continue; }
    const rule = EVIDENCE[s];
    if (!rule) { vetoed.push({ signal: s, why: "Not a tag this tool uses." }); continue; }
    if (!text.trim()) { vetoed.push({ signal: s, why: "The note is empty, so there is no text to support this tag." }); continue; }
    if (!rule.re.test(text)) { vetoed.push({ signal: s, why: rule.missing }); continue; }
    if (s === "drawback_claim" && PLANNED.test(text) && !/\bdbk-?\d|designated|already/i.test(text)) { vetoed.push({ signal: s, why: 'The note says a drawback claim is planned, not filed. "Planned" is a different tag.' }); if (!signals.includes("drawback_planned") && !kept.includes("drawback_planned")) kept.push("drawback_planned"); continue; }
    kept.push(s);
  }
  return { kept, vetoed };
}

/** Idempotent: re-derives the shown tags and conflicts from the model's raw tags. Safe on recorded runs. */
export function applyCodeVeto<T extends VetoInfoLike>(info: T): T {
  const raw = info.noteSignalsRaw ?? info.noteSignals;
  const { kept, vetoed } = vetoSignals(info.notes, raw);
  const gone = new Set(vetoed.map((v) => v.signal));
  const rawConflicts = (info as { noteConflictsRaw?: VetoInfoLike["noteConflicts"] }).noteConflictsRaw ?? info.noteConflicts;
  return { ...info, noteSignalsRaw: raw, noteConflictsRaw: rawConflicts, noteSignals: kept.length ? kept : raw.length ? ["none"] : [], noteConflicts: rawConflicts.filter((c) => !gone.has(c.signal)), noteVetoed: vetoed };
}

export interface VetoStats { tagged: number; vetoed: number; conflictsBefore: number; conflictsAfter: number; entriesTouched: number }
export function vetoStats(infos: Iterable<VetoInfoLike & { noteConflictsRaw?: VetoInfoLike["noteConflicts"] }>): VetoStats {
  let tagged = 0, vetoed = 0, before = 0, after = 0, touched = 0;
  for (const i of infos) {
    const raw = (i.noteSignalsRaw ?? i.noteSignals).filter((s) => s !== "none");
    tagged += raw.length; vetoed += i.noteVetoed?.length ?? 0;
    before += (i.noteConflictsRaw ?? i.noteConflicts).length; after += i.noteConflicts.length;
    if (i.noteVetoed?.length) touched++;
  }
  return { tagged, vetoed, conflictsBefore: before, conflictsAfter: after, entriesTouched: touched };
}
