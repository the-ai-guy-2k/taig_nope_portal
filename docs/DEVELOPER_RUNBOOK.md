# NOPE Lite — Developer Runbook

For contributors extending or validating the NOPE Lite Production Artifact (PA).

**Repository:** https://github.com/the-ai-guy-2k/taig_nope_portal.git  
**Published image:** `taig2k/taig_nope_portal:deployable`

## Repository Layout

```
src/           Express application (app.js, server.js, routes, services, models)
views/         EJS templates (dashboard, job-orders, partials)
public/        Static assets (dashboard.css, dashboard.js)
data/          JSON execution storage (seed data, git-tracked)
scripts/       Validation and CI reporting scripts
docs/          PA documentation package
.github/       CI/CD pipeline
Dockerfile     Production container (node:20-alpine)
```

## Local Development

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start          # port 3000
# or
npm run dev        # --watch mode
```

## Validation Suite

```bash
npm run validate:all
```

Runs in order: structure, syntax, data, workflow, operational, preservation, routes, smoke, operator visual.

Individual scripts: see [VALIDATION_GUIDE.md](VALIDATION_GUIDE.md).

## Docker (Local Build)

```bash
npm run docker:build
npm run docker:run
# or
docker build -t taig-nope-portal:local .
docker run --rm -p 3000:3000 -v nope-nebula-local:/app/nebula_local taig-nope-portal:local
```

Local image tag `taig-nope-portal:local` is for development only. **Production operators use Docker Hub.**

```bash
npm run docker:pull
npm run docker:run:published
```

## Docker Hub Published Image

```bash
docker pull taig2k/taig_nope_portal:deployable
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  taig2k/taig_nope_portal:deployable
```

| Tag | Use |
|-----|-----|
| `deployable` | Stable deployment candidate (recommended) |
| `latest` | Most recent deployable publish |
| `<commit-sha>` | Immutable pin to exact build |

## CI/CD Pipeline

Workflow: `.github/workflows/ci.yml`

```
validate → docker-build → publish (deployable only) → docker-pull-validation → pipeline-report
```

- **main** — validate + docker-build + pipeline-report
- **deployable** — full pipeline including Docker Hub publish

GitHub secrets for publish: `DOCKERHUB_USERNAME` (`taig2k`), `DOCKERHUB_TOKEN`

See [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md).

## Data Model

JSON files in `data/`:

| File | Content |
|------|---------|
| `job_orders.json` | Job Orders |
| `operator_actions.json` | Operator Actions |
| `minority_reports.json` | Minority Reports |
| `aci_history.json` | ACI records |
| `completion_reports.json` | Completion summaries |
| `timeline.json` | Timeline events |

Persistence services in `src/services/` enforce schemas and read-after-write.

## Adding Validation

1. Add script under `scripts/`
2. Register in `scripts/validate-all.js` if part of the gate
3. Add path to `scripts/validate-structure.js` if required
4. Update [VALIDATION_GUIDE.md](VALIDATION_GUIDE.md)

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Integration; full validation CI |
| `deployable` | Deployment candidate; publishes to Docker Hub |

## Out of Scope

Authentication, database, cloud sync, AWS, Terraform, enterprise features.

## Future PE / PAPEV Path

1. Pull `taig2k/taig_nope_portal:deployable`
2. Run with mounted `nebula_local` volume for continuity
3. Validate `/health` and dashboard
4. Execute Job Orders per mission brief
5. ACI-012 PA Certification completes formal operator sign-off
