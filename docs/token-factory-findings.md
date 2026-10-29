# Nebius Token Factory: what we measured (2026-10-29)

Probe: `scripts/smoke.mjs` (raw results in `docs/smoke-raw.json`), 14 calls per host, tiny JSON-extraction prompt.

| | Value |
|---|---|
| Base URLs (OpenAI-compatible) | `https://api.tokenfactory.nebius.com/v1` (primary), `https://api.tokenfactory.us-central1.nebius.com/v1` (also works, used as fallback) |
| Models | `nvidia/Nemotron-3-Ultra-550b-a55b` (reasoning, explains and ranks), `nvidia/Nemotron-3_5-Lightning` (fast normalizer) |
| Auth | `Authorization: Bearer $NEBIUS_API_KEY`, `/chat/completions` |
| JSON mode | `response_format: {"type":"json_object"}` and `json_schema` both returned valid JSON on both models |
| Thinking | On by default; the reasoning trace comes back in `message.reasoning_content` and is billed as completion tokens. `chat_template_kwargs: {"enable_thinking": false}` turns it off (0 reasoning tokens; Ultra 420 ms, Lightning 535 ms on the probe vs 726-1838 ms / 1705-2130 ms with thinking) |
| `reasoning_effort` low/high | Accepted, no visible change in token counts on the probe |
| List price (USD per 1M tokens) | Ultra 1.00 in / 3.00 out; Lightning 0.06 in / 0.24 out |

## How the app uses them

- **Lightning, thinking off, JSON mode**: one call per entry to normalize messy columns (entry number, dates, amounts, IOR, HTS, flags) and broker notes. Its output is cross-checked field by field against the deterministic parser; disagreements are shown in the receipt and the deterministic value wins.
- **Ultra, thinking on**: explains and ranks the entries that need judgment and writes the portfolio note. A guard strips any `$` amount that is not in the deterministic packet. Ultra never decides eligibility and never produces a number.

## Recorded real run (data/sample-run.json, 67 synthetic entries, as-of 2026-10-29)

| | Calls | Prompt tok | Completion tok | Est. cost | Avg latency |
|---|---|---|---|---|---|
| Lightning | 67 | 26,420 | 7,879 | $0.0035 | 1,018 ms |
| Ultra | 23 | 41,741 | 13,011 (10,457 reasoning) | $0.081 | 3,345 ms |

Wall clock about 18 s with pools of 10 (Lightning) and 8 (Ultra). Normalization agreement: 600 of 603 fields. A live re-run of the same sample through `/api/run` took about 27 s.
