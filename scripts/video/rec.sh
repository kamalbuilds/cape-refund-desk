#!/usr/bin/env bash
# Record beats one at a time under the shared deepsurge recorder lock, retrying a take that fails (slow live service, busy lock).
# Usage: scripts/video/rec.sh B03 [B06 ...]      env: TRIES=5  CAPE_SRC=<checkout with data/ docs/ tests/>  V=<video dir>
cd "$(dirname "$0")"
for id in "$@"; do
  ok=0
  for i in $(seq 1 "${TRIES:-3}"); do
    lockf -t 0 /tmp/deepsurge-rec.lock node capture.mjs "$id"; rc=$?
    if [ $rc -eq 0 ]; then ok=1; break; fi
    if [ $rc -eq 75 ]; then echo "$id: recorder lock busy, waiting"; sleep 30; else echo "$id: take $i failed (exit $rc), retrying"; sleep 20; fi
  done
  [ $ok -eq 1 ] || { echo "$id: GAVE UP"; exit 1; }
done
