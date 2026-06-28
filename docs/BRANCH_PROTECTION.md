# Branch Protection Readiness

Recommended GitHub branch protection rules for `main` and `deployable`.

## Required Status Checks

Enable **Require status checks to pass before merging** with:

| Check | Job |
|-------|-----|
| Validation + Smoke Tests | `validate` |
| Docker Build | `docker-build` |
| Docker Hub Publish | `publish` (deployable only) |
| Docker Pull Validation + Smoke | `docker-pull-validation` (deployable only) |
| Pipeline Report | `pipeline-report` |

Workflow file: `.github/workflows/ci.yml` (name: **CI/CD Pipeline**).

On `main`, `publish` and `docker-pull-validation` are skipped — only require `validate`, `docker-build`, and `pipeline-report`.

On `deployable`, require all five checks (publish runs only when Docker Hub secrets are configured).

## Docker Hub Secrets

Before merging to `deployable`, configure repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

See [DOCKER_HUB.md](DOCKER_HUB.md).

## Recommended Settings

| Setting | `main` | `deployable` |
|---------|--------|--------------|
| Require pull request before merging | Yes | Yes (from `main`) |
| Require status checks | Yes | Yes |
| Require branches up to date | Yes | Yes |
| Do not allow bypassing | Yes | Yes |

## Deployable Branch Policy

`deployable` receives merges from `main` after CI passes, then publishes to Docker Hub on push. Every publish is followed by pull validation against the `:deployable` tag.

## Evidence Artifacts

| Artifact | Retention | Contents |
|----------|-----------|----------|
| `ci-reports-validate` | 14 days | `validate-all.json` |
| `ci-reports-docker-build` | 14 days | `validate-docker.json` |
| `ci-reports-publish` | 30 days | `docker-publish.json` |
| `ci-reports-docker-pull` | 30 days | `docker-artifact.json` |
| `ci-reports-pipeline` | 30 days | `pipeline-performance.json` |
