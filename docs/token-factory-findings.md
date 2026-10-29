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
- **Ultra, thinking on**: explains and ranks the entries that need judgment and writes the portfolio note. A number guard replaces or strips any dollar figure, day count or portfolio count that does not match the engine. Ultra never decides eligibility and never produces a number.

## Recorded real run (data/sample-run.json, 69 synthetic entries, as-of 2026-10-29, host api.tokenfactory.nebius.com)

| | Calls | Failed | Prompt tok | Completion tok | Est. cost | Avg latency |
|---|---|---|---|---|---|---|
| Lightning | 69 | 1 | 26,813 | 7,996 | $0.0035 | 3,672 ms |
| Ultra | 23 (22 entries + 1 portfolio note) | 0 | 42,017 | 17,613 (15,139 reasoning) | $0.0949 | 5,534 ms |

Wall clock for the whole run: 157 s. Normalization agreement: 609 of 612 fields (the 3 disagreements are shown in the receipt and the deterministic value won each time). Estimated cost uses list prices above.
