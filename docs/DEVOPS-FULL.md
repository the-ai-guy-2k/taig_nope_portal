# TAIG DevOps — Full Standard (Giggit / taig_nope_portal)

> **Purpose.** This document lets a DevOps engineer who has never seen this
> setup rebuild it exactly from these pages alone — no tribal knowledge.
> The one-page version is `docs/DEVOPS.md`. This is the full standard.
>
> **The bar.** Giggit is the first live production, general public — Uber-level
> care for its software, security included. That is the bar the public launch
> has to clear. (Tee, Nov 26, 2026.)

## 0. The rule, in one line

**Branch → pull request → CI green → staging → merge → auto-deploy.**

Nothing reaches live except through that chain. No direct pushes to main.
No building straight on the live app. No manual pull-and-rebuild deploys.

## 1. System architecture

### 1.1 The pieces

| Piece | Value |
|---|---|
| Repository | `the-ai-guy-2k/taig_nope_portal` on GitHub (private). Default branch `main`. |
| App | NOPE Lite portal (Node 20, Express, EJS). Giggit lives in it: UI `public/giggit/`, API `src/routes/giggit.js`, store `src/services/giggitStore.js`. |
| Server (Droplet) | `138.68.226.24`, 2 vCPU / 2 GB / 60 GB, Ubuntu 24.04. Hostname `taigtsp.duckdns.org`. SSH as `root` with key `nope-droplet` (ed25519). |
| Live container | `nope-portal`, image `taig-nope-portal:local`, host port `3000`, volume `nope-nebula-local:/app/nebula_local`. |
| Staging container | `nope-portal-staging`, image `taig-nope-portal:staging`, host port `3005` bound to `127.0.0.1` only, volume `nope-nebula-staging:/app/nebula_local`. |
| Live URL | `https://taigtsp.duckdns.org/giggit/` |
| Staging URL | `https://taigtsp.duckdns.org:8443/giggit/` |
| Reverse proxy | nginx. Live vhost `taigtsp` (`:80` + `:443`, Certbot cert). Staging vhost `taig-staging` (`:8443`, same cert). |
| TLS | Let's Encrypt via Certbot. Cert: `/etc/letsencrypt/live/taigtsp.duckdns.org/fullchain.pem` + `privkey.pem`. |

### 1.2 How a request flows

```
Browser → https://taigtsp.duckdns.org/giggit/      (live)
       → nginx :443 (taigtsp) → 127.0.0.1:3000 → nope-portal container
Browser → https://taigtsp.duckdns.org:8443/giggit/ (staging)
       → nginx :8443 (taig-staging) → 127.0.0.1:3005 → nope-portal-staging container
```

The Giggit frontend calls the API at absolute paths (`/api/giggit/...`), so
live and staging share the same paths and differ only by port. That is why
staging is a separate port, not a separate path — a path-based staging would
send its API calls to live.

### 1.3 How Giggit data stays separate

Giggit's live data is **not** in the repo and **not** in the image. It lives in
the mounted Docker volume, per `src/services/giggitStore.js`:

| File | Live | Staging |
|---|---|---|
| Live data | `nope-nebula-local` → `/app/nebula_local/giggit.json` | `nope-nebula-staging` → `/app/nebula_local/giggit.json` |
| Seed data (committed) | `data/giggit.json` in the repo — first run seeds from it | Same seed, same rule |
| Web-push (VAPID) keys | `nope-nebula-local` → `/app/nebula_local/giggit-vapid.json`, generated on first use, never committed | Own keys in `nope-nebula-staging` |

Rules that follow from this:

- Staging **never** mounts `nope-nebula-local`. If it did, it would read and
  write live data. The deploy watcher mounts the staging volume and nothing else.
- Rebuilding an image never touches data: data lives in the volume, code lives
  in the image. Replacing a container keeps the volume.
- The seed in `data/giggit.json` is the 3 seed gigs + 3 seed giggers. Test data
  created on staging stays on staging.

### 1.4 Docker setup

- `Dockerfile` (repo root): `node:20-alpine`, `npm ci --omit=dev`, copies
  `src`, `views`, `public`, `data`, `scripts`; runs as user `node`;
  `HEALTHCHECK` hits `/health` every 15 s.
- Live run (exact, from `DEPLOY.md`):
  `docker run -d --name nope-portal --restart unless-stopped -p 3000:3000 -v nope-nebula-local:/app/nebula_local taig-nope-portal:local`
- Staging run (same image, different name/port/volume):
  `docker run -d --name nope-portal-staging --restart unless-stopped -p 127.0.0.1:3005:3000 -v nope-nebula-staging:/app/nebula_local taig-nope-portal:staging`

## 2. Branching strategy + branch protection

### 2.1 Strategy

- All work happens on a feature branch (e.g. `devops/pipeline`,
  `giggit/chat`, `fix/login-redirect`). Branches come off `main`.
- The branch goes up as a pull request to `main`. Nothing merges without a PR.
- A second branch, `deployable`, exists for Docker Hub publishing (see §3).
  It is not the deploy path for live — live deploys from `main` via the
  watcher (§4).

### 2.2 Branch protection on `main` (exact settings, set Nov 26, 2026)

Set with the GitHub API
(`PUT /repos/the-ai-guy-2k/taig_nope_portal/branches/main/protection`).
Verify with:
`gh api repos/the-ai-guy-2k/taig_nope_portal/branches/main/protection`

| Setting | Value | Why |
|---|---|---|
| Required status checks, strict | `Validation + Smoke Tests`, `Docker Build` | A PR cannot merge while a check is red; the branch must be up to date with `main` first. |
| Required pull request reviews | Required, **0 approvals** | A PR must exist — no direct pushes — but no approval is required, because this is a solo repo (only collaborator: `the-ai-guy-2k`). Requiring 1 approval would block every merge, since the author cannot approve their own PR. |
| Enforce admins | `true` | The owner is bound by the same rules. No back door. |
| Allow force pushes | `false` | History is never rewritten on `main`. |
| Allow deletions | `false` | `main` cannot be deleted. |

To change these, the repo owner edits Settings → Branches → `main` rule,
or re-runs the same API call. Only with Tee's word.

## 3. CI pipeline

### 3.1 Workflow file

`.github/workflows/ci.yml` — name: `CI/CD Pipeline`.

**Triggers:** `push` and `pull_request` on branches `main` and `deployable`.
Concurrency: one run per ref; a newer push cancels the in-progress run.
Node version: `20`. Reports land in `ci-reports/` and are uploaded as
artifacts (validate: 14 days; docker/publish/pull: 14–30 days).

### 3.2 Jobs, in order

| Job | Runs when | What it does |
|---|---|---|
| `validate` — Validation + Smoke Tests | Every push/PR | Checks out the code, records build metadata (`scripts/ci-metadata.js`), sets up Node 20, runs `npm run validate:structure`, `npm ci`, then `npm run validate:all` (the 9-stage suite, §3.3). Uploads `ci-reports/`. |
| `docker-build` — Docker Build | After `validate` passes | Builds the image with Buildx + GitHub cache, then runs `npm run validate:docker` (builds/starts a test container on port 3010, checks health, dashboard, preservation, smoke HTTP flows). |
| `publish` — Docker Hub Publish | Only `push` to `deployable` | Logs in to Docker Hub and pushes tags `latest`, `deployable`, `<sha>`. **Requires the `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets — the job exits 1 without them.** Then records publish metadata (`scripts/ci-docker-publish.js`). |
| `docker-pull-validation` | Only `push` to `deployable`, after `publish` | Pulls the published `deployable` image and runs `npm run validate:docker-pull` against it. |
| `pipeline-report` | Always (after all jobs) | Downloads all `ci-reports-*` artifacts, records pipeline performance, writes the workflow summary, and **fails the run if `validate` or `docker-build` failed, or if `publish` / `docker-pull-validation` failed**. |

### 3.3 The 9-stage validation suite (`npm run validate:all`)

Runs `scripts/validate-all.js`, which runs these in order and stops at the
first failure. Each stage writes to `ci-reports/validate-all.json`.

1. Repository structure — `scripts/validate-structure.js`
2. JavaScript syntax — `scripts/validate-syntax.js`
3. Data integrity — `scripts/validate-data.js`
4. Workflow persistence — `scripts/validate-workflow.js`
5. Operational workflows — `scripts/validate-operational.js`
6. Local preservation — `scripts/validate-preservation.js`
7. Route availability — `scripts/validate-routes.js`
8. End-to-end smoke tests — `scripts/smoke-tests.js` (spawns an isolated
   server on port 3100, exercises HTTP workflows, cleans up its test data)
9. Operator visual verification — `scripts/validate-operator-visual.js`

### 3.4 Reproducing CI locally

```bash
npm run validate:all        # the 9-stage suite
npm run validate:docker     # build the image, run a test container, check it
npm run smoke               # the smoke tests alone
```

### 3.5 Reading a run

GitHub → repo → Actions → `CI/CD Pipeline` → the run for the PR or push.
Green means `validate` + `docker-build` passed. `publish` and
`docker-pull-validation` show as skipped on `main` — that is expected; they
only run on `deployable`.

## 4. CD / deploy pipeline

### 4.1 The pull-only rules (locked Nov 3, 2026 — Tee)

From `DEPLOY.md`, still binding:

- **GitHub is the source of truth.** Everything goes through GitHub.
- **The Droplet is pull-only.** It only pulls apps from GitHub. No edits on
  the box, no pushes from the box, no local-only builds that bypass GitHub.
  Change in GitHub first, then the Droplet pulls + rebuilds from what it pulled.
- The one exception: the Business Dashboard snapshot in
  `/var/www/business-dashboard/` is still not in GitHub. Do not hide that gap.

The watcher below obeys these rules: it pulls from GitHub and builds from
what it pulled. It never pushes, never edits code on the box.

### 4.2 The deploy watcher

**Script:** `scripts/deploy-watch.sh` (in the repo, reviewed like any code).
**Runner:** systemd service + timer on the Droplet (see §4.3).
**Cadence:** every 2 minutes. **Log:** `/var/log/taig-deploy.log`.

What one tick does, in order:

1. Takes a lock (`flock`). A second tick exits quietly if one is running.
2. Checks the live checkout (`/root/taig_nope_portal`) is on branch `main`.
   If not, it logs an error and refuses.
3. Refuses if the checkout has local modifications (tracked files). The box
   never edits code.
4. Compares `git ls-remote origin main` with local `HEAD`. If equal, it exits
   quietly — nothing new, nothing logged.
5. On a new SHA: `git pull --ff-only origin main`.
6. Tags the running image as `taig-nope-portal:previous` (rollback spare).
7. `docker build -t taig-nope-portal:local .` — builds **once**. On build
   failure it logs and stops; live is untouched.
8. Tags the same image `taig-nope-portal:staging`.
9. **Staging first:** replaces `nope-portal-staging` with the new image
   (port 3005, staging volume), then health-checks it: `/health` and
   `/giggit/` must return 200 (12 tries × 5 s). If staging is unhealthy,
   it logs an error and stops — **live is never touched**, and the broken
   staging container is left up for inspection.
10. **Live second:** replaces `nope-portal` with the new image (exact
    `DEPLOY.md` run command, port 3000, live volume), then health-checks
    live the same way.
11. If live is unhealthy after deploy, it rolls back: replaces live with
    `taig-nope-portal:previous`, health-checks again, and logs loudly.
    If the rollback is also unhealthy, it logs that a human is needed.
12. Logs `Deployed <sha> — staging OK, live OK`.

### 4.3 Installing the watcher (one-time setup)

Files (in the repo): `deploy/taig-deploy-watch.service`,
`deploy/taig-deploy-watch.timer`, `deploy/nginx-staging-8443.conf`.

```bash
# On the Droplet, as root. Back up nginx first.
cp /etc/nginx/sites-enabled/taigtsp /etc/nginx/sites-enabled/taigtsp.bak-YYYYMMDD-staging
cd /root/taig_nope_portal && git pull --ff-only origin main
cp /root/taig_nope_portal/deploy/nginx-staging-8443.conf /etc/nginx/sites-enabled/taig-staging
cp /root/taig_nope_portal/deploy/taig-deploy-watch.service \
   /root/taig_nope_portal/deploy/taig-deploy-watch.timer /etc/systemd/system/
nginx -t && systemctl reload nginx
chmod +x /root/taig_nope_portal/scripts/deploy-watch.sh
systemctl daemon-reload && systemctl enable --now taig-deploy-watch.timer
systemctl list-timers taig-deploy-watch.timer   # confirm it is listed
```

The timer: `OnBootSec=1min`, `OnUnitActiveSec=2min`, `Persistent=true`.

### 4.4 What the watcher does NOT do

- It does not push to GitHub, and it holds no GitHub credentials.
- It does not deploy the `deployable` branch or Docker Hub images. Live
  always runs the image built from `main` on the box.
- It does not send notifications. Read `/var/log/taig-deploy.log` to see
  what it did. A silent log means no new merges.

## 5. Staging

- **URL:** `https://taigtsp.duckdns.org:8443/giggit/`
- **Container:** `nope-portal-staging`, port `3005` (localhost only).
- **Data:** own volume `nope-nebula-staging`. Seeded from `data/giggit.json`
  on first run. Own VAPID keys. Nothing it does reaches live data.
- **When it exists:** the watcher creates it on the first deploy after the
  timer is installed. Before that, `:8443` returns 502 — expected.
- **Use it for:** proving a merged change before it is live (the watcher
  does this automatically), and manual checks of live behaviour on a copy.

### 5.1 Testing a PR branch on staging (manual)

There is no automatic per-PR staging. To try an unmerged branch on staging:

```bash
# On the Droplet, in a scratch checkout (never the live checkout):
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git /tmp/staging-test
cd /tmp/staging-test && git checkout <branch>
docker build -t taig-nope-portal:branch-test .
docker rm -f nope-portal-staging
docker run -d --name nope-portal-staging --restart unless-stopped \
  -p 127.0.0.1:3005:3000 -v nope-nebula-staging:/app/nebula_local \
  taig-nope-portal:branch-test
curl -fsS http://127.0.0.1:3005/health && curl -fsS http://127.0.0.1:3005/giggit/ -o /dev/null -w '%{http_code}\n'
```

The next watcher tick will replace it with the `main` image again — that is
correct; the branch test is temporary. Delete `/tmp/staging-test` after.

## 6. Rollback

**Automatic.** If a deploy makes live unhealthy, the watcher rolls live back
to `taig-nope-portal:previous` and logs it. No human action needed.

**Manual.** To roll live back by hand:

```bash
docker rm -f nope-portal
docker run -d --name nope-portal --restart unless-stopped \
  -p 3000:3000 -v nope-nebula-local:/app/nebula_local taig-nope-portal:previous
curl -fsS http://127.0.0.1:3000/health
```

To roll back to a specific older commit instead: check that commit out in a
scratch checkout, build it, and run it as live — or simply revert the bad
change on a branch, PR it, merge it, and let the watcher deploy the revert.
The revert-through-PR path is the normal one.

**Pausing auto-deploy.** `systemctl stop taig-deploy-watch.timer` stops new
deploys (the service does not run on its own). `systemctl disable
taig-deploy-watch.timer` stops it across reboots. Re-enable with `enable
--now`. Live keeps running whatever it is running while the timer is stopped.

## 7. Secrets & environment variables

| Secret / variable | Where it lives | Used by | Notes |
|---|---|---|---|
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | GitHub repo secrets | CI `publish` job, `deployable` branch only | Without them the publish job exits 1. Main deploys do not need them. |
| Droplet SSH key `nope-droplet` (ed25519) | Managing Linux box, `/home/hatch/.ssh/nope-droplet` | Human/admin SSH to the Droplet | Never in GitHub, never in the repo. Fingerprint in `DEPLOY.md`. |
| `NODE_VERSION: '20'` | `.github/workflows/ci.yml` env | CI runners | |
| Ports `3000` (live) / `3005` (staging) / `8443` (staging HTTPS) | `scripts/deploy-watch.sh`, `deploy/nginx-staging-8443.conf`, nginx | Watcher + nginx | |
| Volumes `nope-nebula-local` / `nope-nebula-staging` | `scripts/deploy-watch.sh` | Watcher | Live data vs staging data. Never swap them. |
| TLS cert | `/etc/letsencrypt/live/taigtsp.duckdns.org/` | nginx `:443` + `:8443` | Managed by Certbot; both server blocks use the same files. |

**Main deploys need no GitHub secrets.** The watcher pulls over plain git
(the repo is reachable from the Droplet) and builds locally. That is deliberate.

## 8. End-to-end verification (the proof, Nov 26, 2026)

How the pipeline was proved the day it was built. A future engineer can
repeat the same steps to re-prove it.

1. **Branch protection set** via API. Verified by reading it back:
   required checks `Validation + Smoke Tests` + `Docker Build` (strict),
   PRs required (0 approvals), admins enforced, no force pushes, no deletes.
2. **PR #1 — pipeline machinery** (`devops/pipeline` → `main`,
   commit `7414213`, amended `62649c2`, merged as `ef81838`).
   Contents: `scripts/deploy-watch.sh`, `deploy/` units + nginx block,
   PR template, `docs/DEVOPS.md`. CI run `45921586650`, then `45921757815`
   after the amendment — `Validation + Smoke Tests` pass, `Docker Build`
   pass. Merge was blocked until checks passed (protection working).
3. **Watcher + staging installed** on the Droplet (§4.3). Timer listed,
   manual watcher run exited 0 (no-op: no new SHA).
4. **PR #2 — proof change** (`devops/proof` → `main`, commit `a2bd0d7`,
   merged as `94f2c6b`). One-line change: Giggit service-worker cache
   `giggit-v6` → `giggit-v7` in `public/giggit/sw.js`. CI run `45921952675`
   — both required checks pass. Merged Nov 26, 2026.
5. **Auto-deploy observed.** The watcher picked up `94f2c6b` on its next
   tick, built once (image `10990e16850f`), deployed staging first
   (healthy), then live (healthy). Log (`/var/log/taig-deploy.log`):
   `2026-11-27T01:24:37Z Staging healthy on 94f2c6b — promoting to live`
   and `2026-11-27T01:24:43Z Deployed 94f2c6b — staging OK, live OK`.
6. **Verified live + staging serve the new version** (public URLs, from
   outside the box, Nov 27 ~01:25 UTC):
   `curl https://taigtsp.duckdns.org/giggit/sw.js` and
   `curl https://taigtsp.duckdns.org:8443/giggit/sw.js` both return
   `giggit-v7`; `/health` and `/giggit/` return 200 on both;
   `/api/giggit/gigs` returns the 3 seed gigs on both.
   Staging's own volume seeded itself: `nope-nebula-staging` gained its
   own `giggit.json` (6,844 bytes) on first API hit, separate from live.

## 9. Rebuild-from-scratch checklist

To recreate this whole setup on a fresh repo + Droplet:

1. Repo has `.github/workflows/ci.yml`, `Dockerfile`, `scripts/` validators,
   `src/`, `public/`, `data/`.
2. Set branch protection on `main` exactly as §2.2 (API call or Settings).
3. Add `.github/pull_request_template.md`.
4. Add `scripts/deploy-watch.sh`, `deploy/*.service`, `deploy/*.timer`,
   `deploy/nginx-staging-8443.conf`, `docs/DEVOPS.md`.
5. On the Droplet: clone the repo to `/root/taig_nope_portal`, install the
   nginx staging block + systemd units (§4.3), start the timer.
6. Prove it: open a PR with a trivial visible change, watch CI go green,
   merge, watch the log deploy staging then live, verify both URLs.

## 10. Proof record (filled in when the pipeline is proved)

| Item | Value |
|---|---|
| Branch protection verified | Nov 26, 2026 — API read-back (see §2.2) |
| PR #1 merged | `ef81838` — CI runs `45921586650` / `45921757815`, both green |
| PR #2 merged | `94f2c6b` — CI run `45921952675`, green |
| Watcher installed | Nov 26, 2026 — timer listed, manual run exit 0 |
| Auto-deploy observed | Nov 27, 2026 01:24:37–43 UTC — log lines "Staging healthy on 94f2c6b" / "Deployed 94f2c6b — staging OK, live OK" |
| Staging serves v7 | Yes — public `https://taigtsp.duckdns.org:8443/giggit/sw.js` = `giggit-v7`; `/health` 200; `/giggit/` 200; API 3 seed gigs |
| Live serves v7 | Yes — public `https://taigtsp.duckdns.org/giggit/sw.js` = `giggit-v7`; `/health` 200; `/giggit/` 200; API 3 gigs |
| Staging data separate | Yes — `docker inspect`: live mounts `nope-nebula-local`, staging mounts `nope-nebula-staging`; staging seeded its own `giggit.json` (6,844 bytes) in its own volume |

## 11. Emergency procedures

- **Live is down:** check `docker ps`, `docker logs nope-portal`,
  `/var/log/taig-deploy.log`. Restart: `docker restart nope-portal`.
  If the image is bad, roll back (§6). If the watcher keeps redeploying a
  bad `main`, stop the timer (§6), then fix on a branch + PR.
- **CI is red on a PR:** read the failing job's logs in Actions. Fix on the
  branch and push again; the run re-triggers. Do not merge red — protection
  will block it anyway.
- **Staging is broken:** it cannot hurt live — the watcher will not promote
  a broken staging. Fix the code on a branch + PR; the next good merge
  redeploys staging.
- **Timer is down:** `systemctl status taig-deploy-watch.timer`,
  `systemctl start taig-deploy-watch.timer`. Merges made while it was down
  deploy on the next tick after it restarts.
- **Branch protection blocks a legitimate merge:** the block means CI is red
  or the branch is stale — fix that first. Lifting protection is owner-only
  and needs Tee's word.

## 12. Audience layers — the system from each seat

The technical sections above are for the DevOps engineer. These four layers
explain the same system to the four people who live with it. Same facts, no
mechanic knowledge needed. Diagrams do the heavy lifting.

### 12.1 The manager

**What the pipeline guarantees you.** Nothing reaches the live app without
passing the checks, being proved on staging, and leaving a paper trail.
Every change can be traced back to one pull request with one person's name
on it. If a change breaks live, the system rolls it back on its own, and
the log says exactly what it did and when.

```
  an idea            a pull request        the checks          staging
  ────────►  work on a branch  ────────►  pass?  ────────►  prove it
                                                                     │
  live, healthy ◄── auto-deploy ◄── merge ◄── yes ──────────────────┘
  (or rolled back on its own if live goes unhealthy)
```

**What it costs in time.** A change goes from finished code to live in
minutes, with no phone call to a server and no one typing commands on the
live box. That is the point: speed comes from the pipeline doing the
repeating, not from skipping steps.

**What can still go wrong.** The checks only catch what they were written
to catch. A change can pass every check and still be wrong for the business
— that is why staging exists (a human looks at it) and why rollback exists
(a bad live deploy undoes itself). The pipeline is a safety net, not a
guarantee.

**Security, in one line.** The pipeline protects the *code*. The product's
own security features — real money, location, phone calls — are V2, before
the general public (see §12.2). Do not sell the app as secure to the public
until V2 is in.

### 12.2 Musty — the app owner

**Follow one gig from the intake level, through the back end.**

A client posts a gig on their phone. Here is where it goes, step by step:

```
  client phone ──HTTPS──► front door (nginx) ──► the app (container)
        │                                              │
        │                                     the desk (API routes)
        │                                              │
        │                                     the filing cabinet
        │                                     (giggit.json, in the
        │                                      live data volume)
        │                                              │
        ▼                                              ▼
  giggers' phones ◄── push notices ◄── matching: closest 3 first
  (2-minute window), then closest 6, then everyone matching
```

1. **Intake.** The client's gig arrives at the API — the desk that takes
   requests. The desk writes it into the filing cabinet: the live data
   file in the live volume (`nope-nebula-local`). The code never holds
   anyone's data; the volume does.
2. **Matching.** The engine asks the closest 3 giggers first (about 2
   minutes), then the closest 6, then everyone matching in the parish.
3. **Quotes and pick.** Giggers quote. The client picks one. The app
   sends an "escrow-funded" notice to the gigger — the money is held
   (simulated for now: no real money moves in testing).
4. **The work.** The gigger starts, arrives, and asks to complete. The
   app sends a "verify" notice to the client: check the work.
5. **The close.** The client confirms. The money is released after the
   dispute window (1 hour by default). Both sides rate each other.
   Messages, photos, promos, and the wallet all live in the same filing
   cabinet.

**Where everything lives.**

```
  code (the image)          data (the volume)          the door (nginx)
  ─────────────────         ──────────────────         ───────────────
  built from GitHub,        live: nope-nebula-local    live :443 → :3000
  replaced on every         staging: its own copy      staging :8443 → :3005
  deploy                    (never the live one)
```

**Security — what is in place now, and what is V2.**

In place now: the connection is locked (HTTPS, Let's Encrypt); the front
door only lets real web traffic through; the app inside the container runs
as a limited user, not as the server's owner; staging physically cannot
touch live data (separate volumes); no change enters the code except
through a pull request with green checks; the push-notification keys are
made on the server and never written into the code; and no real money
moves — the wallet is simulated, so there is nothing to steal yet.

V2, before the general public: real money rails, location tracking with
the user's permission, masked phone calls, cameras. These are **not in
yet**. The January test runs on pretend money on purpose. The pipeline,
staging, and docs are built to the production standard now; the product's
security features land in V2.

**What you can check yourself.** Staging:
`https://taigtsp.duckdns.org:8443/giggit/` — see a change before it goes
live. The deploy log on the server (`/var/log/taig-deploy.log`) — see
what deployed and when. The health page (`/health`) — 200 means the app
is up.

### 12.3 The gigger

**What happens when you use the app.** You see gigs near you first —
the closest giggers are asked first. You send a quote. If the client
picks you, the app walks you through each step: start, arrived, ask to
complete. The client confirms, and your pay is released after the dispute
window. Your rating is your reputation — it travels with your profile,
with your gallery and your past work.

```
  your phone ──► see gigs near you ──► quote ──► picked ──► do the work
        ▲                                                        │
        │                                            step by step
        │                                            in the app
        └────────── pay released after the client confirms ─────┘
```

**Your data.** Your profile, gallery, ratings, and wallet live in the
app's filing cabinet on the server — not on your phone. If you change
phones, your history is still there. Test data on staging is separate
from live; nothing you do in a test touches the real app.

**Updates reach you on their own.** The app checks for a new version
each time it opens (service-worker cache). When a new version ships
through the pipeline, your phone picks it up — you do nothing.

**Safety.** In-app chat with the client, so you never need to share your
number. An SOS panel in the app. A dispute window if something goes
wrong. Your money is held until the client confirms the work — and in
testing, the money is pretend, so no real cash is at risk.

### 12.4 The client

**What happens when you post a job.** You describe the job and set a
price or ask for quotes. The app asks the closest giggers first, so the
person who comes is near you. You pick from the quotes, then you watch
the job move step by step: accepted, started, arrived, asked to
complete. You confirm when the work is done — only then is the money
released.

```
  your request ──► closest giggers asked first ──► you pick ──► the work
        ▲                                                        │
        │                                            you watch each
        │                                            step in the app
        └────────── money released only after you confirm ──────┘
```

**Your money.** It is held (escrow) from the moment the gig is accepted
until you confirm the work — the gigger is not paid before the job is
done. In testing the money is pretend: no real cash moves, so nothing is
at risk while the app is being proved. The dispute window (1 hour after
completion) is your time to raise a problem.

**Your messages and photos.** They stay inside the app — in the chat on
the gig, in the app's filing cabinet on the server. Your request, your
quotes, and your ratings are yours; the app does not sell them.

**What you see when something changes.** The app updates itself on your
phone. If a new version ships, you get it without doing anything — and
every version was proved on staging before it reached you.
