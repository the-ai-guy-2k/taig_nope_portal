# NOPE Lite — Operator Runbook

This runbook is for operators who run, verify, and use the NOPE Lite execution cockpit. No development environment is required beyond Node.js or Docker.

**Canonical published image:** `taig2k/taig_nope_portal:deployable`

## Prerequisites

- Node.js 20+ **or** Docker
- Git
- Web browser

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
| http://localhost:3000/ | Execution dashboard (default landing page) |
| http://localhost:3000/dashboard | Same dashboard |
| http://localhost:3000/health | Health JSON endpoint |

Expected health response includes `"status":"ok"` and version `Docker Foundation (ACI-008)`.

## Quick Start (Local Node.js)

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start
```

Open http://localhost:3000/dashboard

Stop any stale process on port 3000 before starting (see Troubleshooting).

## Operator Visual Verification Checklist

After startup, confirm:

1. **Landing page** — `/` shows the execution dashboard (not "MVP Foundation")
2. **Navigation** — Sidebar: Dashboard, Job Orders, Timeline, ACI History, Completion Reports, Settings
3. **Local Preservation banner** — Restoration Status, Last Preserved, Current Job Order
4. **Seed Job Order** — Open `jo-aci-002-seed` from Job Orders list
5. **Health** — `GET /health` returns HTTP 200

Automated check (server must be running on port 3000):

```bash
npm run audit:routes
```

## Job Order Workflow

1. Open **Job Orders** in the sidebar
2. Click seed Job Order `jo-aci-002-seed` or create new via **Create Job Order**
3. View mission, truth statements, risks, and timeline on the workspace
4. Edit via **Edit Job Order** form (`/job-orders/:id/edit`)

Seed Job Order ID: `jo-aci-002-seed` — title: **ACI-002 Data Model Foundation**

## Operator Actions Workflow

1. Open a Job Order workspace
2. Navigate to **Operator Actions** (`/job-orders/:id/operator-actions`)
3. Create an action with description, operator name, checklist
4. Complete or archive actions from the same page

## Minority Report Workflow

1. Open a Job Order workspace
2. Open **Minority Report** edit form (`/job-orders/:id/minority-report/edit`)
3. Fill mission-status fields and save
4. Saving rotates the current report to previous; history is preserved

## Local Preservation and Restoration

Execution continuity is stored in `nebula_local/` (local) or Docker volume `nope-nebula-local` (container).

On startup the application:

1. Detects preservation artifacts
2. Loads restoration metadata for display (does **not** overwrite repository `data/` files)
3. Shows status on the dashboard preservation banner

Manual snapshot (local Node.js only):

```bash
npm run preserve:snapshot
```

**Never commit** `nebula_local/`, `.nebula/`, `aiw_local/`, or `*.local.md`.

## Validation (Operator Smoke)

With the server stopped on port 3000 conflicts:

```bash
npm ci
npm run validate:all
```

Nine stages including smoke tests and operator visual verification.

## Troubleshooting

### Old landing page ("MVP Foundation")

A stale Node process may be on port 3000:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Linux/macOS
lsof -i :3000
kill <pid>
```

### Port conflict between Node and Docker

Only one process can bind port 3000. Stop `npm start` before `docker run`, or use a different host port:

```bash
docker run --rm -p 3001:3000 -v nope-nebula-local:/app/nebula_local taig2k/taig_nope_portal:deployable
```

Then open http://localhost:3001/dashboard

## Out of Scope

Authentication, cloud sync, database, multi-user deployment, AWS, Terraform.

## Further Reading

- [VALIDATION_GUIDE.md](VALIDATION_GUIDE.md) — full validation suite
- [DOCKER_HUB.md](DOCKER_HUB.md) — published tags and CI publish
- [PA_RISK_REGISTER.md](PA_RISK_REGISTER.md) — known risks
