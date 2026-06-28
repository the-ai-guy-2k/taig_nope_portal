# NOPE Lite — Validation Guide

Repeatable validation proving the Production Artifact functions correctly.

## Prerequisites

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
```

Stop any process on port 3000 before running tests that spawn servers (Windows file locks on `data/`).

## Complete Suite (CI Gate)

```bash
npm run validate:all
```

| Stage | Script | Validates |
|-------|--------|-----------|
| 1 | `validate:structure` | Required paths and artifacts |
| 2 | `validate:syntax` | JavaScript syntax (all `src/`, `scripts/`) |
| 3 | `validate:data` | JSON integrity, schemas, references |
| 4 | `validate:workflow` | Job Order CRUD, read-after-write, errors |
| 5 | `validate:operational` | Operator Actions, Minority Report rotation |
| 6 | `validate:preservation` | Local preservation save/load/restore |
| 7 | `validate:routes` | 13 HTTP routes (port 3099) |
| 8 | `smoke` | E2E HTTP workflows (port 3100) |
| 9 | `validate:operator-visual` | Operator HTML checks (port 3099) |

Timing report: `ci-reports/validate-all.json`

## Individual Scripts

```bash
npm run validate:structure
npm run validate:syntax
npm run validate:data
npm run validate:workflow
npm run validate:operational
npm run validate:preservation
npm run validate:routes
npm run smoke
npm run validate:operator-visual
```

## Operator Port Audit (Running Server)

Requires `npm start` on port 3000:

```bash
npm run audit:routes
```

Checks 9 routes on the operator port; detects stale ACI-001 landing page.

## Docker Validation

### Local build

```bash
npm run validate:docker
```

Builds image, starts container on port 3010, validates health, dashboard, preservation, smoke, operator visual.

### Published image pull

```bash
export DOCKER_HUB_IMAGE=taig2k/taig_nope_portal
export DOCKER_PULL_TAG=deployable
npm run validate:docker-pull
```

Or use npm script defaults:

```bash
npm run validate:docker-pull
```

Pulls `taig2k/taig_nope_portal:deployable`, records digest/size, validates runtime.

## Manual Operator Visual Verification

| Check | How |
|-------|-----|
| Landing page | `GET /` → execution dashboard |
| Navigation | Sidebar links visible |
| Preservation | Banner shows Restoration Status |
| Seed data | `/job-orders/jo-aci-002-seed` loads |
| Health | `curl http://localhost:3000/health` → 200 |

Published container:

```bash
docker pull taig2k/taig_nope_portal:deployable
docker run --rm -p 3000:3000 taig2k/taig_nope_portal:deployable
curl http://localhost:3000/health
```

## CI/CD Validation

Every push to `main` and `deployable` runs `npm run validate:all` and `validate:docker` in GitHub Actions.

`deployable` additionally publishes and runs `validate:docker-pull` against `taig2k/taig_nope_portal:deployable`.

## Expected Results

All scripts exit code `0`. Failures print stage name and error details.

## Reports

| File | Contents |
|------|----------|
| `ci-reports/validate-all.json` | Per-stage timing |
| `ci-reports/validate-docker.json` | Container check results |
| `ci-reports/docker-artifact.json` | Pull validation, digest, size |
| `ci-reports/pipeline-performance.json` | Pipeline timing |

`ci-reports/` is gitignored; generated locally and uploaded as CI artifacts.
