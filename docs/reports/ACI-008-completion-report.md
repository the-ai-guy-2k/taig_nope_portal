# ACI-008 Completion Report — Docker Foundation

**ACI:** ACI-008  
**Title:** Docker Foundation  
**Status:** Complete  
**Date:** 2026-06-28

## Summary

ACI-008 packaged the validated NOPE Lite application into a production-ready Docker image using Node.js 20 Alpine. The image is the canonical deployment artifact. Container validation covers build, startup, health, dashboard, preservation, smoke HTTP flows, and operator visual parity. No business functionality was added or modified.

## Docker Architecture Overview

```
Host
 └── docker run -p 3000:3000 [-v nope-nebula-local:/app/nebula_local]
      └── node:20-alpine
           WORKDIR /app
           USER node
           NODE_ENV=production
           CMD node src/server.js
           ├── src/     Express application
           ├── views/   EJS templates
           ├── public/  Static assets
           ├── data/    Seed execution JSON (image layer)
           └── nebula_local/  Writable preservation (volume recommended)
```

| Concern | Implementation |
|---------|----------------|
| Base image | `node:20-alpine` |
| Dependencies | `npm ci --omit=dev` |
| Port | `3000` exposed |
| Health | `HEALTHCHECK` → `GET /health` |
| Shutdown | `SIGTERM` / `SIGINT` graceful close in `src/server.js` |
| Preservation | `mkdir nebula_local` + `chown node:node` for runtime writes |

## Work Performed

1. Updated `Dockerfile` — production install, writable preservation dir, non-root user, HEALTHCHECK
2. Updated `.dockerignore` — exclude test temp dirs and local artifacts
3. Added graceful shutdown to `src/server.js`
4. Created `scripts/validate-docker.js` — build, run, health, dashboard, preservation, smoke, visual parity
5. Extended `.github/workflows/ci.yml` — `docker` job runs `validate:docker` after `validate:all`
6. Updated `package.json` — `docker:build`, `docker:run`, `validate:docker`
7. Updated version markers to `Docker Foundation (ACI-008)`
8. Updated README with Docker build/run instructions and architecture
9. Updated `nebula_local/minority_report_previous.md` with ACI-007 Minority Report

## Files Created

| Path | Purpose |
|------|---------|
| `scripts/validate-docker.js` | Docker build and container validation |

## Files Modified

| Path | Change |
|------|--------|
| `Dockerfile` | Production Alpine image, HEALTHCHECK, node user permissions |
| `.dockerignore` | Test artifact exclusions |
| `package.json` | Docker scripts and description |
| `src/app.js`, `src/services/localPreservation.js` | Version marker |
| `src/server.js` | Graceful shutdown, startup logging |
| `scripts/smoke-tests.js`, `validate-operator-visual.js` | ACI-008 version checks |
| `.github/workflows/ci.yml` | Docker Foundation CI job |
| `README.md`, `docs/aci_history/README.md` | Docker docs and ACI index |

## Container Validation Evidence

### Local (`npm run validate:all`)

```
Validation suite PASSED (9 stages, ~4s)
```

### Docker (`npm run validate:docker`)

Validated in GitHub Actions ([Run 28308291227](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308291227)): build, startup, HEALTHCHECK, health, dashboard, preservation, smoke flows, operator visual parity — all passed.

CI job `Docker Foundation Validation` runs:

- `docker build -t taig-nope-portal:ci .`
- Container start on port 3010
- Docker HEALTHCHECK → healthy
- `GET /health` → HTTP 200, `Docker Foundation (ACI-008)`
- Dashboard, seed Job Order, preservation artifacts in `/app/nebula_local`
- HTTP smoke: create Job Order, operator action, minority report
- Operator visual parity checks

## GitHub Actions Results

CI triggered on push to `main` and `deployable`.

| Job | Gate |
|-----|------|
| Validation + Smoke Tests | `npm run validate:all` |
| Docker Foundation Validation | `npm run validate:docker` |

| Branch | Actions |
|--------|---------|
| `main` | [Run 28308291227](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308291227) | **success** |
| `deployable` | [Actions](https://github.com/the-ai-guy-2k/taig_nope_portal/actions?query=branch%3Adeployable) | **success** (commit `a1e77b2`) |

## OPERATOR VISUAL VERIFICATION

**Result:** PASS (via `validate-docker` operator parity checks)

| Check | Result |
|-------|--------|
| Container UI matches local dashboard shell | PASS |
| Navigation visible (`sidebar`, `nav-list`) | PASS |
| Preservation banner and Restoration Status | PASS |
| Seed Job Order execution data | PASS |
| No ACI-001 legacy markers | PASS |

**Observations:** Container serves identical HTML structure and execution data as `npm start`. Named volume `nope-nebula-local` preserves continuity across container restarts.

**Corrective actions taken:** Dockerfile `chown -R node:node /app` so Local Preservation can write inside container. Graceful `SIGTERM` handling added for orchestrator shutdown.

## Risks Discovered

| Risk | Severity | Mitigation |
|------|----------|------------|
| `data/` writes in container are ephemeral without volume | Medium | Document volume mount; ACI-010 publish with volume guidance |
| Port 3000 conflict between local Node and Docker | Low | README: stop local server before `docker run` |
| Windows file lock if `npm start` runs during `validate:all` | Low | Stop local server before validation on Windows |

## Recommendations for ACI-009

Per approved AEP, ACI-009 is **CI/CD Hardening**:

1. Add image tagging strategy and build metadata labels
2. Cache Docker layers in CI for faster builds
3. Parallelize or gate merge on both jobs with branch protection
4. Prepare registry credentials scaffolding (without publishing until ACI-010)

## Commit IDs

| Commit | Branch | Message |
|--------|--------|---------|
| `b39f206` | `main`, `deployable` | ACI-008: Docker Foundation for production container deployment. |
| `612a22e` | `main`, `deployable` | docs: finalize ACI-008 completion report with commit evidence. |
| `a1e77b2` | `main`, `deployable` | fix: Docker HEALTHCHECK and container validation resilience for CI. |

## Governance Note

Not implemented: Docker Hub publishing, AWS deployment, Terraform, new features, authentication.
