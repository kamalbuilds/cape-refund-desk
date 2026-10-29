#!/usr/bin/env bash
# Deploy CAPE Refund Desk to Nebius Serverless AI (Container Registry + public endpoint).
# Same shape as latch/web/deploy.sh.
#
#   NEBIUS_PROJECT_ID=project-... NEBIUS_REGION=eu-north1 NEBIUS_SUBNET_ID=vpcsubnet-... \
#   NEBIUS_API_KEY=... TAVILY_API_KEY=... ./deploy.sh [deploy|build]
#
# Keys are read from the environment only. From the usual files on the Mac:
#   zsh -lc 'source ~/.zshrc; source ~/.config/nvdia/tavily.env; ./deploy.sh'
# This script NEVER logs you in. Run `nebius profile create` yourself first.
# DRY_RUN=1 prints every mutating command (keys redacted) instead of running it.
# The image is built with no secrets; keys go to the endpoint as env or MysteryBox secrets.
set -euo pipefail

CMD="${1:-deploy}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${NEBIUS_REGION:=eu-north1}"
: "${REGISTRY_NAME:=cape}"
: "${IMAGE_NAME:=cape-refund-desk}"
: "${ENDPOINT_NAME:=cape-refund-desk}"
: "${PLATFORM:=cpu-d3}"
: "${PRESET:=4vcpu-16gb}"
: "${ENDPOINT_AUTH:=none}"            # none = public for judges; token = private
: "${UPDATE_MODE:=recreate}"          # recreate (delete+create, new tag) | restart (same tag re-pushed)
: "${LIVE_RUNS_MAX:=40}"              # per-instance cap on live Token Factory runs (~$0.10 each)
: "${MAX_LIVE_ENTRIES:=150}"
: "${NEBIUS_SECRET_SELECTOR:=}"       # optional MysteryBox selector for NEBIUS_API_KEY
: "${TAVILY_SECRET_SELECTOR:=}"       # optional MysteryBox selector for TAVILY_API_KEY
: "${DRY_RUN:=0}"
: "${IMAGE_TAG:=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

say() { printf '\n==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY_RUN" = "1" ]; then printf 'DRY_RUN:'; printf ' %q' "$@"; printf '\n'; else "$@"; fi; }
need() { command -v "$1" >/dev/null 2>&1 || { [ "$DRY_RUN" = "1" ] && echo "note: $1 not on PATH (dry run continues)" >&2 || die "$1 is required but not on PATH"; }; }
redact() { local s="$*"; for v in "${NEBIUS_API_KEY:-}" "${TAVILY_API_KEY:-}"; do [ -n "$v" ] && s="${s//$v/<redacted>}"; done; printf '%s' "$s"; }

[ "$CMD" = "deploy" ] || [ "$CMD" = "build" ] || die "usage: deploy.sh [deploy|build]"
need docker; need nebius; need jq
: "${NEBIUS_PROJECT_ID:?set NEBIUS_PROJECT_ID (project that owns the registry and endpoint)}"
if [ "$CMD" = "deploy" ]; then
  : "${NEBIUS_SUBNET_ID:?set NEBIUS_SUBNET_ID (nebius vpc subnet list)}"
  [ -n "$NEBIUS_SECRET_SELECTOR" ] || : "${NEBIUS_API_KEY:?set NEBIUS_API_KEY or NEBIUS_SECRET_SELECTOR}"
  [ -n "$TAVILY_SECRET_SELECTOR" ] || : "${TAVILY_API_KEY:?set TAVILY_API_KEY or TAVILY_SECRET_SELECTOR}"
fi
LOGGED_IN=0
if command -v nebius >/dev/null 2>&1 && nebius iam whoami >/dev/null 2>&1; then LOGGED_IN=1; fi
if [ "$LOGGED_IN" = "0" ] && [ "$DRY_RUN" != "1" ]; then
  die "the Nebius CLI is not logged in. Run 'nebius profile create' yourself, then re-run."
fi
[ "$LOGGED_IN" = "0" ] && echo "note: Nebius CLI not logged in; dry run uses placeholder ids" >&2

# Guard: refuse to build if a key value appears in the build context.
for v in "${NEBIUS_API_KEY:-}" "${TAVILY_API_KEY:-}"; do
  if [ -n "$v" ] && git -C "$ROOT" grep -qF -- "$v" 2>/dev/null; then die "a key value appears in tracked files; aborting"; fi
done

# ---------------- registry
REGISTRY_HOST="cr.${NEBIUS_REGION}.nebius.cloud"
if [ "$LOGGED_IN" = "0" ]; then
  REGISTRY_ID="registry-DRYRUN"
else
  say "Looking for container registry '$REGISTRY_NAME' in $NEBIUS_PROJECT_ID"
  REGISTRY_ID="$(nebius registry list --parent-id "$NEBIUS_PROJECT_ID" --format json \
    | jq -r --arg n "$REGISTRY_NAME" '.items // [] | map(select(.metadata.name == $n)) | .[0].metadata.id // empty')"
  if [ -z "$REGISTRY_ID" ]; then
    say "Creating registry '$REGISTRY_NAME'"
    if [ "$DRY_RUN" = "1" ]; then run nebius registry create --name "$REGISTRY_NAME" --parent-id "$NEBIUS_PROJECT_ID" --format json; REGISTRY_ID="registry-DRYRUN"
    else REGISTRY_ID="$(nebius registry create --name "$REGISTRY_NAME" --parent-id "$NEBIUS_PROJECT_ID" --format json | jq -r '.metadata.id')"; fi
  fi
fi
REGISTRY_PATH="$(printf '%s' "$REGISTRY_ID" | cut -d- -f2)"
IMAGE="${REGISTRY_HOST}/${REGISTRY_PATH}/${IMAGE_NAME}:${IMAGE_TAG}"
say "Image: $IMAGE"

# ---------------- login, build, push (linux/amd64)
say "Logging Docker in to $REGISTRY_HOST (token piped from the authenticated CLI)"
if [ "$DRY_RUN" = "1" ]; then echo "DRY_RUN: nebius iam get-access-token | docker login $REGISTRY_HOST --username iam --password-stdin"
else nebius iam get-access-token | docker login "$REGISTRY_HOST" --username iam --password-stdin; fi
say "Building linux/amd64 and pushing (no secrets in the image)"
run docker buildx build --platform linux/amd64 -t "$IMAGE" --push "$ROOT"
[ "$CMD" = "build" ] && { echo "$IMAGE"; exit 0; }

# ---------------- endpoint
EXISTING_ID=""
if [ "$LOGGED_IN" = "1" ]; then
  EXISTING_ID="$(nebius ai endpoint get-by-name --name "$ENDPOINT_NAME" --parent-id "$NEBIUS_PROJECT_ID" --format json 2>/dev/null | jq -r '.metadata.id // empty' || true)"
fi
if [ -n "$EXISTING_ID" ]; then
  if [ "$UPDATE_MODE" = "restart" ]; then
    say "Restarting $EXISTING_ID (re-pushed same tag)"; run nebius ai endpoint restart --id "$EXISTING_ID"; ENDPOINT_ID="$EXISTING_ID"
  else
    say "Deleting old endpoint $EXISTING_ID (its URL will change)"; run nebius ai endpoint delete --id "$EXISTING_ID"; EXISTING_ID=""
  fi
fi
if [ -z "$EXISTING_ID" ]; then
  say "Creating endpoint '$ENDPOINT_NAME' on $PLATFORM / $PRESET"
  ARGS=(ai endpoint create --name "$ENDPOINT_NAME" --parent-id "$NEBIUS_PROJECT_ID"
        --image "$IMAGE" --platform "$PLATFORM" --preset "$PRESET"
        --public --container-port 8080 --subnet-id "$NEBIUS_SUBNET_ID"
        --auth "$ENDPOINT_AUTH"
        --env "PORT=8080" --env "LIVE_RUNS_MAX=$LIVE_RUNS_MAX" --env "MAX_LIVE_ENTRIES=$MAX_LIVE_ENTRIES"
        --format json)
  # A plain --env value is stored in the endpoint spec (visible to project admins). Prefer MysteryBox selectors.
  if [ -n "$NEBIUS_SECRET_SELECTOR" ]; then ARGS+=(--env-secret "NEBIUS_API_KEY=$NEBIUS_SECRET_SELECTOR"); else ARGS+=(--env "NEBIUS_API_KEY=${NEBIUS_API_KEY}"); fi
  if [ -n "$TAVILY_SECRET_SELECTOR" ]; then ARGS+=(--env-secret "TAVILY_API_KEY=$TAVILY_SECRET_SELECTOR"); else ARGS+=(--env "TAVILY_API_KEY=${TAVILY_API_KEY}"); fi
  if [ "$DRY_RUN" = "1" ]; then printf 'DRY_RUN: nebius %s\n' "$(redact "${ARGS[*]}")"; exit 0; fi
  ENDPOINT_ID="$(nebius "${ARGS[@]}" | jq -r '.metadata.id // .resource_id // empty')"
  [ -n "$ENDPOINT_ID" ] || die "endpoint create returned no id; check 'nebius ai endpoint list'"
fi

say "Waiting for the public HTTPS URL of $ENDPOINT_ID"
URL=""
for _ in $(seq 1 60); do
  URL="$(nebius ai endpoint get "$ENDPOINT_ID" --format json | jq -r '.status.public_endpoints[]? | select(startswith("https://"))' | head -1)"
  [ -n "$URL" ] && break; sleep 10
done
[ -n "$URL" ] || die "no HTTPS URL yet; check: nebius ai endpoint get $ENDPOINT_ID --format json"
echo "$URL"
echo "Health: curl -s $URL/api/health   Replay: $URL/?demo=replay" >&2
