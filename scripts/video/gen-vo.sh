#!/usr/bin/env bash
# Generate one wav per sentence with the pinned voiceb clone (default clone b7af9f2a). Skips files that exist. 2 in flight.
# Usage: scripts/video/gen-vo.sh [VIDEO_DIR]
set -euo pipefail
V="${1:-${VIDEO_DIR:-/Volumes/PortableSSD/nvdia/apps/cape-video}}"; mkdir -p "$V/vo"
cd "$(dirname "$0")"
node -e '
const s=require("./script.json");const o=[];for(const b of s.beats)b.sentences.forEach((t,i)=>o.push(`${b.id}_${String(i+1).padStart(2,"0")}\t${t.say}`));console.log(o.join("\n"))' > /tmp/cape-vo-lines.tsv
gen() { id="$1"; text="$2"; [ -s "$V/vo/$id.wav" ] && return 0; for try in 1 2 3; do voiceb say "$text" -o "$V/vo/$id.wav" >/dev/null 2>"$V/vo/$id.err" && { echo "ok $id"; return 0; }; sleep 2; done; echo "FAIL $id: $(tail -2 "$V/vo/$id.err")"; rm -f "$V/vo/$id.wav"; return 1; }
export -f gen; export V
while IFS=$'\t' read -r id text; do printf '%s\0%s\0' "$id" "$text"; done < /tmp/cape-vo-lines.tsv | xargs -0 -n2 -P2 bash -c 'gen "$0" "$1"'
