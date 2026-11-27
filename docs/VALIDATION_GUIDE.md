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
| 9 | `giggit:smoke` | Giggit full lifecycle, human-logic (port 3102) |
| 10 | `giggit:policy` | Musty policy criteria P1–P16 (port 3103) |
| 11 | `giggit:dispute` | Dispute scenarios D1–D8 (port 3104) |
| 12 | `giggit:security` | Security chart T1–T12 (port 3105, throttle probe 3106) |
| 13 | `validate:operator-visual` | Operator HTML checks (port 3099) |

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
npm run giggit:smoke
npm run giggit:policy
npm run giggit:dispute
npm run giggit:security
npm run validate:operator-visual
```

## Giggit Tests

The Giggit scripts (`scripts/giggit-*.js`) implement
`docs/giggit-testing-spec.md`: the full gig lifecycle the way a person uses
it, one pass/fail check per Musty policy (P1–P16), dispute scenarios D1–D8
(D7, dispute-resolve, is a recorded known gap — no resolve path exists yet),
and the security chart T1–T12. Each script spawns its own isolated server
with a fresh seed; the live data dir (`nebula_local/`) is moved aside before
the run and restored after, so no test data survives. Time-travel (release
windows, ring widening) is done by editing the live store file between
requests — the store re-reads it on every call.

```bash
npm run giggit:test   # all four Giggit scripts in order
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
