"use client";
export default function WhyLlm() {
  return (
    <section className="panel" aria-label="Why an AI model" data-testid="why-llm">
      <h2>Why not just a spreadsheet?</h2>
      <p className="text-sm text-zinc-600">A spreadsheet can check columns. It cannot read the broker&apos;s note that says &ldquo;protest filed 10/20&rdquo; on a row whose protest column is blank, or notice that &ldquo;TIB&rdquo; and &ldquo;courtesy notice&rdquo; are not the same thing as a drawback claim.</p>
      <ul className="mt-2 text-sm text-zinc-600 list-disc pl-5 space-y-1">
        <li><b className="font-medium text-zinc-900">Fast AI</b> reads the free text of every row and flags notes that disagree with the data.</li>
        <li><b className="font-medium text-zinc-900">Code vetoes it</b> when the note does not actually say what the AI claims, and does all the money and dates.</li>
        <li><b className="font-medium text-zinc-900">Reasoning AI</b> explains the hard cases in plain English with Customs&apos; own rules and writes the memo for your broker.</li>
      </ul>
    </section>
  );
}
