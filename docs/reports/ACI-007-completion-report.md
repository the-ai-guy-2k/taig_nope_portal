# ACI-007 Completion Report — Validation + Smoke Tests

**ACI:** ACI-007  
**Title:** Validation + Smoke Tests  
**Status:** Complete  
**Date:** 2026-06-28

## Summary

ACI-007 hardened the NOPE Lite Production Artifact with a repeatable validation suite and end-to-end smoke tests. CI now runs the complete suite on every push to `main` and `deployable`. No new business capabilities were introduced.

## Work Performed

1. Created `scripts/validate-all.js` — orchestrates the complete validation suite in dependency order
2. Created `scripts/smoke-tests.js` — end-to-end HTTP smoke tests (startup, dashboard, CRUD, operator actions, minority report, restoration, health)
3. Created `scripts/validate-operator-visual.js` — operator HTML verification against a fresh server instance
4. Created `scripts/lib/test-server.js` — shared HTTP and test-server utilities
5. Created `scripts/audit-routes.js` — operator-port route audit with stale-server detection
6. Removed orphaned ACI-001 artifacts (`views/index.ejs`, `public/css/main.css`, `public/js/main.js`)
7. Hardened `src/server.js` with `EADDRINUSE` guidance and `validate-routes.js` legacy-marker rejection
8. Extended `.github/workflows/ci.yml` — single `npm run validate:all` gate after `npm ci`
9. Updated README with validation procedures and operator visual verification steps
10. Updated application version markers to `Validation + Smoke Tests (ACI-007)`
11. Updated `nebula_local/minority_report_previous.md` with ACI-006 Minority Report content

## Files Created

| Path | Purpose |
|------|---------|
| `scripts/validate-all.js` | Complete validation suite orchestrator |
| `scripts/smoke-tests.js` | End-to-end HTTP smoke tests |
| `scripts/validate-operator-visual.js` | Operator visual verification |
| `scripts/lib/test-server.js` | Shared test server and HTTP helpers |
| `scripts/audit-routes.js` | Operator port 3000 route audit |

## Files Modified

| Path | Change |
|------|--------|
| `.github/workflows/ci.yml` | Complete validation suite CI gate |
| `package.json` | `validate:all`, `smoke`, `validate:operator-visual`, `audit:routes` |
| `scripts/validate-routes.js` | Legacy ACI-001 marker rejection |
| `scripts/validate-structure.js` | Required validation script paths |
| `src/app.js`, `src/server.js` | Version and stale-server handling |
| `src/services/localPreservation.js` | Application version marker |
| `README.md`, `docs/aci_history/README.md` | Validation docs and ACI index |
| `views/index.ejs`, `public/css/main.css`, `public/js/main.js` | Removed (orphaned ACI-001) |

## Validation Coverage

| Area | Script | Validates |
|------|--------|-----------|
| Repository structure | `validate:structure` | Required paths and artifacts |
| JSON integrity | `validate:data` | Syntax, schemas, unique IDs, references |
| Job Order CRUD | `validate:workflow` | Create, update, read-after-write, error handling |
| Operator Actions | `validate:operational` | Create, complete, validation failures |
| Minority Report rotation | `validate:operational` | Current/previous rotation and supersede |
| Local Preservation | `validate:preservation` | Save, load, validate, restore, gitignore |
| Restoration | `smoke` | Dashboard preservation banner and `restore_status.json` |
| Route availability | `validate:routes` | 13 HTTP routes on port 3099 |
| Read-after-write | `validate:workflow`, `smoke` | Persistence layer and HTTP workflows |
| Error handling | `validate:workflow`, `validate:operational` | Invalid input rejection |

## Smoke Test Scenarios

| Scenario | Method |
|----------|--------|
| Application startup | Health endpoint version and status |
| Dashboard load | `GET /` with workspace shell markers |
| Seed Job Order | `GET /job-orders/jo-aci-002-seed` |
| Create Job Order | `POST /job-orders` |
| Edit Job Order | `POST /job-orders/:id` |
| Operator Actions | `POST` create and complete |
| Minority Report | `POST /job-orders/:id/minority-report` |
| Restoration | Preservation banner and artifact files |
| Health endpoint | JSON `status: ok` |

## Validation Evidence

### Local

```
npm run validate:all — passed (9 stages, ~4s)
  - Repository structure
  - JavaScript syntax (29 files)
  - Data integrity (6 JSON files, seed Job Order)
  - Workflow persistence (CRUD, read-after-write, failures)
  - Operational workflows (operator actions, minority rotation)
  - Local preservation (save/load/restore, gitignore)
  - Route availability (13 routes)
  - Smoke tests (9 scenarios on port 3100)
  - Operator visual verification (6 checks on port 3099)
```

## OPERATOR VISUAL VERIFICATION

**Result:** PASS

**Checks performed:**

| Check | Result |
|-------|--------|
| Correct landing page (`GET /` shows execution dashboard) | PASS |
| Navigation visible (sidebar with all nav links) | PASS |
| Expected UI rendered (`workspace-main`, preservation banner) | PASS |
| Correct execution data displayed (seed Job Order title) | PASS |
| Restoration status correct (`Restoration Status` in banner) | PASS |
| No stale application instance (no ACI-001 legacy markers) | PASS |

**Observations:** `validate:operator-visual` spawns a fresh server on port 3099 and verifies HTML markers an operator would see. Legacy ACI-001 content (`MVP Foundation`, `Repository foundation established`) is explicitly rejected. Operator port 3000 audit remains available via `npm run audit:routes` when a local server is running.

**Corrective actions taken:** Route audit identified stale port-3000 processes serving ACI-001 content; removed orphaned landing-page files, added `audit:routes` and `EADDRINUSE` handler. CI validation uses fresh servers on ports 3099/3100.

## Risks Discovered

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stale process on port 3000 masks current UI | Medium | `audit:routes`, README troubleshooting, `EADDRINUSE` handler |
| CI ports (3099/3100) differ from operator port (3000) | Low | Documented; `audit:routes` for local verification |
| Smoke tests modify `data/` transiently | Low | Cleanup in `finally` blocks; isolated test Job Order ID |

## Recommendations for ACI-008

Per approved AEP, ACI-008 is **Docker Foundation**:

1. Validate Docker image serves the same routes and health endpoint as local `npm start`
2. Run smoke tests against containerized application
3. Align Dockerfile with validation suite entry points
4. Document container startup and operator access URLs

## GitHub Actions Results

CI triggered on push of commit `e7cff81` to `main` and `deployable`.

| Branch | Workflow | Status |
|--------|----------|--------|
| `main` | [Actions](https://github.com/the-ai-guy-2k/taig_nope_portal/actions?query=branch%3Amain) | Triggered on push |
| `deployable` | [Actions](https://github.com/the-ai-guy-2k/taig_nope_portal/actions?query=branch%3Adeployable) | Triggered on push |

Gate: `npm run validate:all` (9 stages including smoke tests and operator visual verification).

## Commit IDs

| Commit | Branch | Message |
|--------|--------|---------|
| `e7cff81` | `main`, `deployable` | ACI-007: Validation + Smoke Tests and route audit hardening. |

## Governance Note

Not implemented: new features, authentication, cloud services, database, UI redesign.
