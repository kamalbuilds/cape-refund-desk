// Token Factory smoke test. Never prints the key. Usage: export the Nebius key in your shell, then run: node scripts/smoke.mjs > docs/smoke-raw.json
const KEY = process.env.NEBIUS_API_KEY;
if (!KEY) { console.error("NEBIUS_API_KEY missing"); process.exit(1); }
const HOSTS = ["https://api.tokenfactory.nebius.com/v1", "https://api.tokenfactory.us-central1.nebius.com/v1"];
const MODELS = ["nvidia/Nemotron-3-Ultra-550b-a55b", "nvidia/Nemotron-3_5-Lightning"];
const prompt = [{ role: "user", content: 'Return JSON with keys "entry" (string "0123456789A") and "ok" (boolean true). JSON only.' }];
const tests = {
  plain: { messages: prompt },
  json_object: { messages: prompt, response_format: { type: "json_object" } },
  json_schema: { messages: prompt, response_format: { type: "json_schema", json_schema: { name: "t", strict: true, schema: { type: "object", properties: { entry: { type: "string" }, ok: { type: "boolean" } }, required: ["entry", "ok"], additionalProperties: false } } } },
  thinking_off_kwargs: { messages: prompt, chat_template_kwargs: { enable_thinking: false } },
  reasoning_effort_low: { messages: prompt, reasoning_effort: "low" },
  reasoning_effort_high: { messages: prompt, reasoning_effort: "high" },
  json_object_thinking_off: { messages: prompt, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false } },
};
const out = [];
for (const host of HOSTS) for (const model of MODELS) for (const [name, extra] of Object.entries(tests)) {
  const t0 = Date.now();
  let rec = { host: host.replace("https://", ""), model, test: name };
  try {
    const r = await fetch(host + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1500, temperature: 0, ...extra }), signal: AbortSignal.timeout(90000) });
    const j = await r.json().catch(() => ({}));
    rec.http = r.status; rec.ms = Date.now() - t0;
    if (r.ok) {
      const m = j.choices?.[0]?.message ?? {};
      rec.content = (m.content ?? "").slice(0, 160);
      rec.has_reasoning = !!(m.reasoning_content || m.reasoning);
      rec.reasoning_chars = (m.reasoning_content || m.reasoning || "").length;
      rec.usage = { p: j.usage?.prompt_tokens, c: j.usage?.completion_tokens, reasoning: j.usage?.completion_tokens_details?.reasoning_tokens };
      try { JSON.parse(m.content); rec.valid_json = true; } catch { rec.valid_json = false; }
    } else rec.error = JSON.stringify(j).slice(0, 200);
  } catch (e) { rec.error = String(e).slice(0, 150); rec.ms = Date.now() - t0; }
  out.push(rec); console.error(rec.host.slice(14, 30), model.split("/")[1].slice(0, 16), name, rec.http, rec.ms + "ms", "json", rec.valid_json, "reas", rec.reasoning_chars);
}
console.log(JSON.stringify(out, null, 1));
