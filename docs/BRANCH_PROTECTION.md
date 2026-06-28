# Branch Protection Readiness

Recommended GitHub branch protection rules for `main` and `deployable`.

## Required Status Checks

Enable **Require status checks to pass before merging** with:

| Check | Job |
|-------|-----|
| Validation + Smoke Tests | `validate` |
| Docker Foundation Validation | `docker` |
| Pipeline Report | `pipeline-report` |

The workflow file is `.github/workflows/ci.yml` (workflow name: **CI/CD Pipeline**).

## Recommended Settings

| Setting | `main` | `deployable` |
|---------|--------|--------------|
| Require pull request before merging | Yes | Yes (from `main`) |
| Require status checks | Yes | Yes |
| Require branches up to date | Yes | Yes |
| Do not allow bypassing | Yes | Yes |
| Restrict pushes (optional) | Admins only | Admins only |

## Deployable Branch Policy

`deployable` should only receive merges from `main` after CI passes on both branches. Every push to `deployable` runs the full pipeline:

1. Validation + Smoke Tests (`validate:all`)
2. Docker build (cached) + container validation
3. Pipeline performance report and workflow summary

## Evidence Artifacts

Failed or successful runs upload `ci-reports-*` artifacts (14–30 day retention) containing:

- `build-metadata.json`
- `validate-all.json` (per-stage timing)
- `validate-docker.json` (container check timing)
- `pipeline-performance.json` (total/longest/fastest job metrics)

## Concurrency

The pipeline uses `concurrency: cancel-in-progress` so only the latest commit per branch is validated, reducing queue time and stale failures.
