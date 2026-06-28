# ACI-010 Completion Report — Docker Hub Publish

**ACI:** ACI-010  
**Title:** Docker Hub Publish  
**Status:** Complete  
**Date:** 2026-06-28

## Summary

ACI-010 configured automatic Docker Hub publishing from the `deployable` branch. Published images receive `latest`, `deployable`, and commit SHA tags with OCI metadata. CI validates the push, pulls the published image, and runs container smoke and operator visual verification. No application functionality was modified.

## Work Performed

1. Restructured CI pipeline: validate → docker-build → publish → docker-pull-validation → pipeline-report
2. Added Docker Hub login and `docker/build-push-action` push with GHA cache (deployable only)
3. Created `scripts/ci-docker-publish.js` — manifest digest verification after push
4. Created `scripts/validate-docker-pull.js` — pull, artifact metrics, smoke, operator visual
5. Extracted `scripts/lib/docker-container-validation.js` for shared container tests
6. Updated workflow summaries and pipeline performance for publish/pull jobs
7. Created `docs/DOCKER_HUB.md` — secrets and operator pull/run instructions
8. Updated README, `docs/BRANCH_PROTECTION.md`, minority report

## CI/CD Pipeline (deployable)

```
validate → docker-build → publish → docker-pull-validation → pipeline-report
```

| Job | Scope |
|-----|-------|
| validate | All branches |
| docker-build | All branches |
| publish | `deployable` push only |
| docker-pull-validation | After publish |
| pipeline-report | Always |

## Files Created

| Path | Purpose |
|------|---------|
| `scripts/validate-docker-pull.js` | Pull and validate published image |
| `scripts/ci-docker-publish.js` | Verify pushed manifests and digests |
| `scripts/lib/docker-container-validation.js` | Shared container HTTP validation |
| `docs/DOCKER_HUB.md` | Secrets setup and operator instructions |

## Files Modified

| Path | Change |
|------|--------|
| `.github/workflows/ci.yml` | Publish and pull validation jobs |
| `scripts/validate-docker.js` | Use shared validation library |
| `scripts/ci-pipeline-summary.js` | Publish and artifact sections |
| `scripts/ci-pipeline-performance.js` | Pull job timing |
| `package.json`, `README.md`, `validate-structure.js` | Scripts and docs |

## Docker Artifact Verification

### CI Run [28308700309](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308700309) (deployable, `2ad53d1`)

| Field | Value |
|-------|--------|
| Image Name | `<DOCKERHUB_USERNAME>/taig-nope-portal` |
| Image Tags | `latest`, `deployable`, `2ad53d1` |
| Image Digest | Recorded in `docker-publish.json` artifact per tag |
| Compressed Image Size | Recorded in `docker-artifact.json` |
| Container Startup Time | Recorded in `docker-artifact.json` → `container_startup_ms` |
| Docker Pull Validation | **PASS** |

Download `ci-reports-docker-pull` artifact from the CI run for exact digest and size values.

### Operator pull and run

```bash
docker pull <DOCKERHUB_USERNAME>/taig-nope-portal:deployable
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  <DOCKERHUB_USERNAME>/taig-nope-portal:deployable
```

## OPERATOR VISUAL VERIFICATION

**Result:** PASS (via `validate-docker-pull` on published `:deployable` tag)

| Check | Result |
|-------|--------|
| Published image pulls successfully | PASS |
| Container starts | PASS |
| GET /health → HTTP 200 | PASS |
| Dashboard loads | PASS |
| Operator visual parity | PASS |

**Observations:** Published image serves identical UI to local build and CI-built image.

**Corrective actions:** None when secrets are configured. Configure `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` in GitHub repository secrets before `deployable` publish.

## GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub namespace |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

## Pipeline Performance

### deployable — [Run 28308700309](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308700309)

| Metric | Value |
|--------|-------|
| Total execution time | ~116s (wall clock) |
| Longest job | Docker Hub Publish (42s) |
| Fastest job | Pipeline Report (8s) |
| Failed retry count | 0 |

| Job | Duration | Result |
|-----|----------|--------|
| Validation + Smoke Tests | 15s | success |
| Docker Build | 32s | success |
| Docker Hub Publish | 42s | success |
| Docker Pull Validation + Smoke | 19s | success |
| Pipeline Report | 8s | success |

### main — [Run 28308670315](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308670315)

Publish and pull validation skipped (not deployable). validate + docker-build + pipeline-report: **success**.

## GitHub Actions Results

| Branch | Result |
|--------|--------|
| `main` | [Run 28308670315](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308670315) — **success** |
| `deployable` | [Run 28308700309](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308700309) — **success** (publish + pull validation) |

## Risks Discovered

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing Docker Hub secrets fails deployable pipeline | High | Document in DOCKER_HUB.md; verify step in publish job |
| Public image exposes application surface | Expected | PA scope; no secrets in image |
| Tag `latest` moves on each deployable push | Low | Use `:deployable` or SHA for pinned deploys |

## Recommendations for ACI-011

Per approved AEP, ACI-011 is **PA Documentation**:

1. Document published image as primary operator entry point
2. Include Docker Hub pull/run in operator onboarding
3. Cross-reference CI artifact reports for PAPEV evidence

## Commit IDs

| Commit | Branch | Message |
|--------|--------|---------|
| `2ad53d1` | `main`, `deployable` | ACI-010: Docker Hub publish from deployable with pull validation. |

## Governance Note

Not implemented: AWS deployment, Terraform, application features.
