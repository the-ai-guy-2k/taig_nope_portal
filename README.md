# NOPE Lite — TAIG NOPE Portal

NOPE Lite proves the TAIG execution framework. **Version:** Validation + Smoke Tests (ACI-007)

## Validation + Smoke Tests

The PA includes a repeatable validation suite that proves data integrity, workflows, routes, operational behavior, local preservation, and operator-visible UI rendering.

### Run the complete suite

```bash
npm ci
npm run validate:all
```

This runs nine stages in order: structure, syntax, data, workflow, operational, preservation, routes, smoke tests, and operator visual verification.

### Individual scripts

| Script | Purpose |
|--------|---------|
| `npm run validate:all` | Complete validation suite (CI gate) |
| `npm run validate:structure` | Required repository paths |
| `npm run validate:syntax` | JavaScript syntax check |
| `npm run validate:data` | JSON integrity and schema validation |
| `npm run validate:workflow` | Job Order CRUD, read-after-write, error handling |
| `npm run validate:operational` | Operator Actions and Minority Report rotation |
| `npm run validate:preservation` | Local preservation save/load/restore |
| `npm run validate:routes` | HTTP route availability (port 3099) |
| `npm run smoke` | End-to-end HTTP smoke tests (port 3100) |
| `npm run validate:operator-visual` | Operator HTML verification (port 3099) |
| `npm run audit:routes` | Operator port audit (port 3000, requires running server) |

### Operator visual verification

After `npm start`, verify the application as an operator would:

1. Open http://localhost:3000/ — execution dashboard (not the ACI-001 foundation page)
2. Confirm sidebar navigation (Dashboard, Job Orders, Timeline, etc.)
3. Confirm Local Preservation banner with Restoration Status
4. Open seed Job Order `jo-aci-002-seed` and confirm execution data
5. Run `npm run audit:routes` to detect stale servers on port 3000

CI runs `validate:operator-visual` against a fresh server instance to avoid stale-process false positives.

## Local Preservation

Execution continuity is preserved outside Git in `nebula_local/`. The Local Preservation service (`src/services/localPreservation.js`) automatically snapshots execution context on application startup.

### Preserved Artifacts

| File | Contents |
|------|----------|
| `current_job_order.json` | Active Job Order snapshot |
| `minority_report_current.md` | Current Minority Report |
| `minority_report_previous.md` | Previous Minority Report |
| `current_aci.json` | Current ACI summary |
| `completion_summary.json` | Latest completion report summary |
| `restore_status.json` | Preservation and restoration metadata |

### Ignored Folders (never commit)

- `nebula_local/`
- `.nebula/`
- `aiw_local/`
- `*.local.md`

### Restoration

On startup the application:

1. Detects local preservation artifacts
2. Loads restoration metadata (does **not** overwrite repository `data/` files)
3. Displays Last Preserved, Current Job Order, Current ACI, and Restoration Status on the dashboard

Manual snapshot: `npm run preserve:snapshot`

### Operator Responsibilities

- Do not commit `nebula_local/` or other ignored preservation paths
- After cloning, run `npm start` to initialize or restore local context
- Use the dashboard preservation banner to confirm execution continuity
- Run `npm run validate:all` before release or handoff

## Run Instructions

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm run validate:all
npm start
```

- **Dashboard:** http://localhost:3000/dashboard
- **Health:** http://localhost:3000/health

### Troubleshooting: Old landing page on port 3000

If you see **"Version: MVP Foundation"** or **"Repository foundation established"**, a **stale server process** is still bound to port 3000. CI validates on ports 3099/3100 and can pass while port 3000 serves outdated code.

```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
npm start
npm run audit:routes
```

## Approved AEP — Remaining ACIs

| ACI | Title |
|-----|-------|
| ACI-008 | Docker Foundation |
| ACI-009 | CI/CD Hardening |
| ACI-010 | Docker Hub Publish |
| ACI-011 | PA Documentation |
| ACI-012 | PA Certification |

## Next Steps

ACI-008 — Docker Foundation.
