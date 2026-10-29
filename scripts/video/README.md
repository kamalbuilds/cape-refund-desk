# Demo video pipeline (WIP, paused)
Assets live on the SSD: /Volumes/PortableSSD/nvdia/apps/cape-video (vo, clips, timeline.json). Nothing big is in the repo.
Order: gen-vo.sh -> node timeline.mjs -> node capture.mjs [B01..B10] -> make_captions.py -> node render.mjs.
Live segment: node capture-live.mjs (needs Token Factory credit; exits with a message on 402), then set L1.enabled in edit-list.json and re-run render.mjs.
Status: render.mjs has not been run. B08 capture failed on a goto timeout and needs a re-run. B02_01 narration needs a re-check of how "Cape" is pronounced.
