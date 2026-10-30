# Deploying CAPE Refund Desk

The app is one Next.js server (`output: "standalone"`) that holds no state. Any host that runs a container or Node 24 works.

> The Docker image builds and serves the full app locally, including a live Token Factory run inside the container. `deploy.sh` carries the Nebius Serverless AI path.

## What every host needs

| Setting | Value |
|---|---|
| Port | `8080` (reads `PORT`) |
| Start | `node server.js` (container) or `npm run build && npm start -p $PORT` |
| Secret `NEBIUS_API_KEY` | required for live runs. Without it the board still works: `/?demo=replay` and the in-browser check |
| Secret `TAVILY_API_KEY` | optional. Rule-watch falls back to a direct cbp.gov fetch, then to the recorded check |
| Env `LIVE_RUNS_MAX` | per-instance cap on live runs (default 40, about $0.10 each) |
| Env `MAX_LIVE_ENTRIES` | per-run entry cap (default 150) |
| Health | `GET /api/health` returns `{"ok":true,"nebius":bool,"tavily":bool}` (never the keys) |
| Timeout | a live run streams for 30 to 160 s. Allow at least 300 s per request, and do not buffer responses (NDJSON) |

Never put the keys in the image, the repo or a `.env` committed to git. `.gitignore` covers `.env*` except `.env.example`.

## Build and test the image locally

```bash
docker build -t cape-refund-desk .
docker run --rm -p 127.0.0.1:18417:8080 -e NEBIUS_API_KEY -e TAVILY_API_KEY cape-refund-desk
curl -s localhost:18417/api/health
curl -s -N -X POST localhost:18417/api/run -H 'content-type: application/json' -d '{"sample":true}' | tail -n 1 | head -c 300
```

`-e NAME` with no value forwards the variable from your shell. For linux/amd64 on an Apple Silicon machine add `--platform linux/amd64` (slower, emulated).

## Nebius Serverless AI (primary)

Needs the `nebius` CLI, Docker with buildx, and `jq`.

```bash
nebius profile create                       # you log in; the script never does
nebius iam whoami
nebius vpc subnet list                      # note a subnet id
export NEBIUS_PROJECT_ID=project-...        # nebius iam project list
export NEBIUS_REGION=eu-north1              # region of that project
export NEBIUS_SUBNET_ID=vpcsubnet-...
zsh -lc 'source ~/.zshrc; source ~/.config/nvdia/tavily.env; DRY_RUN=1 ./deploy.sh'   # review first; keys are redacted
zsh -lc 'source ~/.zshrc; source ~/.config/nvdia/tavily.env; ./deploy.sh'            # real run
```

`deploy.sh` does, in order: find or create the registry `cape`; `nebius iam get-access-token | docker login cr.<region>.nebius.cloud --username iam --password-stdin`; `docker buildx build --platform linux/amd64 --push`; `nebius ai endpoint create --platform cpu-d3 --preset 4vcpu-16gb --public --container-port 8080 --auth none --env ...`; poll for the HTTPS URL.

Keys: a plain `--env` value is stored in the endpoint spec and visible to project admins. To avoid that, create MysteryBox secrets and set `NEBIUS_SECRET_SELECTOR` and `TAVILY_SECRET_SELECTOR`; the script then uses `--env-secret`.

Redeploy: `./deploy.sh` (default `UPDATE_MODE=recreate` deletes and recreates the endpoint, so the URL changes) or, after re-pushing the same tag, `UPDATE_MODE=restart IMAGE_TAG=<tag> ./deploy.sh`. Delete: `nebius ai endpoint delete --id <id>`.

Options: `ENDPOINT_AUTH=token` for a private endpoint, `LIVE_RUNS_MAX`, `MAX_LIVE_ENTRIES`, `PLATFORM`, `PRESET`.

## Vercel

```bash
npm i -g vercel && vercel login
vercel link --yes --project cape-refund-desk
printf %s "$NEBIUS_API_KEY" | vercel env add NEBIUS_API_KEY production --sensitive
printf %s "$TAVILY_API_KEY" | vercel env add TAVILY_API_KEY production --sensitive
vercel deploy --prod
```

`vercel.json` is not needed. `/api/run` sets `maxDuration = 300`, which fits Hobby with Fluid compute; `/api/rulewatch` sets 120. `data/` is traced into the functions by `outputFileTracingIncludes`. `LIVE_RUNS_MAX` is per function instance, so it is a soft cap on Vercel. A team blocked for fair use (HTTP 402) cannot create projects.

## Railway

1. New Project, Deploy from GitHub repo (or `railway up` from the folder). It detects the `Dockerfile`.
2. Variables: `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `PORT=8080`.
3. Settings, Networking, Generate Domain (target port 8080). Healthcheck path `/api/health`.

CLI: `railway login && railway init && railway variables --set "NEBIUS_API_KEY=$NEBIUS_API_KEY" --set "TAVILY_API_KEY=$TAVILY_API_KEY" && railway up && railway domain`.

## Fly.io

```bash
fly launch --no-deploy --name cape-refund-desk --internal-port 8080 --dockerfile Dockerfile
printf 'NEBIUS_API_KEY=%s\nTAVILY_API_KEY=%s\n' "$NEBIUS_API_KEY" "$TAVILY_API_KEY" | fly secrets import --stage
fly deploy
```

In `fly.toml` set `[http_service] internal_port = 8080`, `force_https = true`, `[[http_service.checks]] path = "/api/health"`, and a VM of at least 1 GB (`fly scale memory 1024`). Fly's proxy does not cap streaming responses.

## Render

New, Web Service, connect the repo, Runtime: Docker. Environment: `NEBIUS_API_KEY`, `TAVILY_API_KEY` (mark as secret), `PORT=8080`. Health Check Path `/api/health`. Render allows long streamed responses on paid and free web services.

## Hugging Face Spaces (Docker)

1. Create a Space, SDK Docker, public.
2. Add this block to the top of `README.md` in the Space repo (not the GitHub one), or keep a separate Space README:
   ```yaml
   ---
   title: CAPE Refund Desk
   sdk: docker
   app_port: 8080
   ---
   ```
3. Space Settings, Variables and secrets: add secrets `NEBIUS_API_KEY` and `TAVILY_API_KEY`.
4. `git remote add space https://huggingface.co/spaces/<user>/cape-refund-desk && git push space main`.

The Space runs the same Dockerfile. Spaces runs the container as uid 1000; the image already works as a non-root user.

## After any deploy

1. `curl -s $URL/api/health` shows `nebius:true, tavily:true`.
2. `$URL/` loads; `$URL/?demo=replay` renders the board.
3. Live: `curl -s -N -X POST $URL/api/run -H 'content-type: application/json' -d '{"sample":true}'` returns 200 and ends with a `done` event carrying a Token Factory receipt.
4. `curl -s $URL/api/rulewatch` returns `ok:true`, `liveVia`, and a list of quoted changes.
5. Scan the client bundle for keys: `curl -s $URL/ | grep -o '/_next/static/[^"]*\.js' | sort -u | while read p; do curl -s "$URL$p"; done | grep -cE 'tvly-|NEBIUS_API_KEY=' ` should print `0`.
