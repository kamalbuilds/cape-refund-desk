# Demo video pipeline
Assets live on the SSD: /Volumes/PortableSSD/nvdia/apps/cape-video (vo, clips, timeline.json, qa). Nothing big is in the repo.

Order: `gen-vo.sh` -> `node timeline.mjs` -> `rec.sh B01 ... B10` -> `node render.mjs`.

- `script.json` is the narration (`say` is what the voice reads, `cap` the burned-in caption). Every figure in it traces to a file named in its `_about`.
- `gen-vo.sh` makes one wav per sentence with the `voiceb` clone. A wav is reused only when the text it was made from is unchanged, and a line whose transcript loses a trap word (Cape, Nemotron, Tavily) is retried.
- `timeline.mjs` measures the wavs and fixes each beat's duration, so a clip is never longer than its narration.
- `rec.sh` records beats one at a time under the shared recorder lock (`lockf -t 0 /tmp/deepsurge-rec.lock`) and retries a take that fails.
- `capture.mjs` attaches to the running Brave (deepsurge profile) over CDP (`CDP_URL`, default port 9222 then 9396), opens its own window, records it with a CDP screencast and closes only that window. It never launches a browser and never creates a profile.
  - B03 is a live run on the hosted site: it asserts 92 calls, none failed, 20 to 40 s, then maps the real run onto the narration with time anchors. B06 ends on a live ten-shipment run and asserts 3 of 3 planted conflicts caught.
  - Cards quote real files at record time (`CAPE_SRC` points at a checkout holding `docs/receipts/`, `tests/fixtures/` and `tests/numberguard.test.ts`, default this repo) and refuse to record if the file no longer says what the narration says.
  - The export click is captured in the page so the recording never writes into the operator's Downloads folder; the export code itself still runs.
- `render.mjs` joins the clips, burns captions, mixes the voiceover, normalizes loudness and writes the MP4, an SRT and a teleprompter.
