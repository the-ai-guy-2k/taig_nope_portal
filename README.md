# NOPE Lite — TAIG NOPE Portal

NOPE Lite proves the TAIG execution framework. **Version:** Docker Foundation (ACI-008) · **Status:** **PA Certified** (ACI-012)

The **Docker Hub image** `taig2k/taig_nope_portal:deployable` is the canonical deployment artifact for PE and PAPEV missions.

## Documentation (PA Package)

| Document | Audience |
|----------|----------|
| [docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md) | Clone, run, operate workflows |
| [docs/DEVELOPER_RUNBOOK.md](docs/DEVELOPER_RUNBOOK.md) | Development, CI/CD, data model |
| [docs/VALIDATION_GUIDE.md](docs/VALIDATION_GUIDE.md) | Full validation suite |
| [docs/DOCKER_HUB.md](docs/DOCKER_HUB.md) | Published image and tags |
| [docs/PA_RISK_REGISTER.md](docs/PA_RISK_REGISTER.md) | Known risks |
| [docs/reports/PA_validation_report.md](docs/reports/PA_validation_report.md) | PA validation evidence |
| [docs/reports/PA_CERTIFICATION_REPORT.md](docs/reports/PA_CERTIFICATION_REPORT.md) | Formal PA certification |

## Quick Start (Docker Hub — Recommended)

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
docker pull taig2k/taig_nope_portal:deployable
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  taig2k/taig_nope_portal:deployable
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000/ | Execution dashboard |
| http://localhost:3000/dashboard | Same dashboard |
| http://localhost:3000/health | Health JSON |

Or use npm helpers after clone:

```bash
npm run docker:pull
npm run docker:run:published
```

## Quick Start (Node.js)

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start
```

Open http://localhost:3000/dashboard

## Validation

```bash
npm ci
npm run validate:all
```

Nine stages including smoke tests and operator visual verification. See [docs/VALIDATION_GUIDE.md](docs/VALIDATION_GUIDE.md).

## Operator Workflows

| Workflow | Path |
|----------|------|
| Job Orders | `/job-orders` — seed: `jo-aci-002-seed` |
| Operator Actions | `/job-orders/:id/operator-actions` |
| Minority Report | `/job-orders/:id/minority-report/edit` |
| Local Preservation | `nebula_local/` or Docker volume `nope-nebula-local` |

Full procedures: [docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md)

## Docker (Local Build)

```bash
npm run docker:build
npm run docker:run
```

Local tag `taig-nope-portal:local` is for development. Production operators use `taig2k/taig_nope_portal:deployable`.

```bash
npm run validate:docker
```

## CI/CD Architecture

```
push / pull_request (main, deployable)
        │
        ▼
┌───────────────────────────┐
│  validate                 │  npm run validate:all
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│  docker-build             │  buildx + GHA cache + validate:docker
└─────────────┬─────────────┘
              ▼ (deployable push only)
┌───────────────────────────┐
│  publish                  │  taig2k/taig_nope_portal: latest, deployable, SHA
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│  docker-pull-validation   │  pull + smoke + operator visual
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│  pipeline-report          │  performance + workflow summary
└───────────────────────────┘
```

| Feature | Implementation |
|---------|----------------|
| Published image | `taig2k/taig_nope_portal:deployable` |
| Publish scope | `deployable` branch pushes only |
| Docker Hub secrets | `DOCKERHUB_USERNAME` (`taig2k`), `DOCKERHUB_TOKEN` |
| Published tags | `latest`, `deployable`, `<commit-sha>` |

## Local Preservation

Execution continuity is stored in `nebula_local/` (local) or volume `nope-nebula-local` (Docker). **Never commit** `nebula_local/`, `.nebula/`, `aiw_local/`, or `*.local.md`.

Manual snapshot: `npm run preserve:snapshot`

## Troubleshooting

If you see **"Version: MVP Foundation"**, a stale process is on port 3000:

```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

## Out of Scope

Authentication, database, cloud sync, AWS, Terraform.

## PA Certification

**Certified:** 2026-06-27 (ACI-012) — approved for PE and PAPEV lifecycle.  
**Report:** [docs/reports/PA_CERTIFICATION_REPORT.md](docs/reports/PA_CERTIFICATION_REPORT.md)
