#!/usr/bin/env bash
# Generate one wav per sentence with the pinned voiceb clone (default clone b7af9f2a).
# A line may carry "speak" (a respelling that forces a pronunciation, e.g. "Kayp" for "Cape") and "speed"; "say" stays the text the film means.
# Every take is read back with an independent local Whisper (readback.py, mlx large-v3-turbo, no prompt). A trap word (Cape, Nemotron, Tavily) in "say" must come back from the wav with probability >= MINP (default 0.3), else the take is thrown away and retried (up to TRIES, default 8).
# A wav is reused only when the text it was made from (id.txt beside it) is identical to the current spoken text, so an edited line always regenerates. 2 in flight.
# Usage: scripts/video/gen-vo.sh [VIDEO_DIR]
set -euo pipefail
V="${1:-${VIDEO_DIR:-/Volumes/PortableSSD/nvdia/apps/cape-video}}"; mkdir -p "$V/vo"
cd "$(dirname "$0")"; HERE="$PWD"
node -e '
const s=require("./script.json");const o=[];for(const b of s.beats)b.sentences.forEach((t,i)=>o.push([`${b.id}_${String(i+1).padStart(2,"0")}`,t.speak||t.say,t.say,t.speed||1.0].join("\t")));console.log(o.join("\n"))' > /tmp/cape-vo-lines.tsv
gen() { id="$1"; text="$2"; intended="$3"; speed="$4"
  [ -s "$V/vo/$id.wav" ] && [ "$(cat "$V/vo/$id.txt" 2>/dev/null)" = "$text" ] && return 0; rm -f "$V/vo/$id.wav"
  req=""; for w in Cape Nemotron Tavily; do case "$intended" in *"$w"*) req="${req:+$req,}$w";; esac; done
  for try in $(seq 1 "${TRIES:-8}"); do
    voiceb say "$text" -t "$intended" -s "$speed" -o "$V/vo/$id.wav" >"$V/vo/$id.heard" 2>"$V/vo/$id.err" || { sleep 2; continue; }
    [ "$(stat -f%z "$V/vo/$id.wav")" -gt 10000 ] || { sleep 2; continue; }
    if "$HERE/readback.py" ${req:+--require "$req"} --min "${MINP:-0.3}" "$V/vo/$id.wav" >"$V/vo/$id.rb" 2>&1; then printf "%s" "$text" > "$V/vo/$id.txt"; echo "ok $id (take $try) $(grep -v -i -E '^Args|fetching' "$V/vo/$id.rb" | head -1)"; return 0; fi
  done
  echo "FAIL $id: $(grep -v -i -E '^Args|fetching' "$V/vo/$id.rb" | tail -1)"; rm -f "$V/vo/$id.wav"; return 1; }
export -f gen; export V HERE
while IFS=$'\t' read -r id text intended speed; do printf '%s\0%s\0%s\0%s\0' "$id" "$text" "$intended" "$speed"; done < /tmp/cape-vo-lines.tsv | xargs -0 -n4 -P2 bash -c 'gen "$0" "$1" "$2" "$3"'
