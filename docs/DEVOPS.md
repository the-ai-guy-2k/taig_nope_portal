# TAIG DevOps standard — the right software way

Giggit is the first live production, general public — Uber-level care for its software, security included. That is the bar the public launch has to clear.

One rule, in order: **branch → pull request → CI green → staging → merge → auto-deploy.**

1. **Branch.** All work happens on a feature branch, never on main.
2. **Pull request.** The branch goes up as a PR. Main is protected: no direct pushes, not even for the owner.
3. **CI green.** Every push and every PR runs the checks (validation + Docker build). A PR cannot merge while a check is red.
4. **Staging.** Before it touches live, the change is proved on staging: https://taigtsp.duckdns.org:8443/giggit/ — a full copy of the app with its own data. Staging never touches live data.
5. **Merge.** The PR merges to main only after CI is green and staging is proved.
6. **Auto-deploy.** A watcher on the Droplet checks main every 2 minutes. On a new merge it builds once, deploys the image to staging first, health-checks it, then deploys the same image to live and health-checks that. If staging fails, live is never touched. If live fails, it rolls back to the previous image.

## What never happens

- No direct pushes to main. No building straight on the live app. No manual pull-and-rebuild deploys. No edits on the Droplet — GitHub is the source of truth, the Droplet only pulls.

## The pieces

- **Main protection:** PRs required, CI checks required, no force pushes, no deletes. Set in the repo settings.
- **CI:** `.github/workflows/ci.yml` — validation suite + Docker build on every push and PR.
- **Staging:** container `nope-portal-staging` on port 3005, own data volume, served at `:8443`.
- **Deploy watcher:** `scripts/deploy-watch.sh`, run by a systemd timer every 2 minutes. Log: `/var/log/taig-deploy.log`.

## Emergency

If live is broken and a fix cannot wait for the pipeline: fix it on a branch, PR it, CI, staging, merge — the watcher deploys in minutes. Only the repo owner can lift main protection (Settings → Branches), and only with Tee's word.
