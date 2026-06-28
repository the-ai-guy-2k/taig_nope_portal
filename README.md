# NOPE Lite — TAIG NOPE Portal

NOPE Lite proves the TAIG execution framework. **Version:** Local Preservation (ACI-006)

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
- Update local minority reports through normal application workflow; preservation captures them automatically

## Run Instructions

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start
```

- **Dashboard:** http://localhost:3000/dashboard
- **Health:** http://localhost:3000/health

## Validation Scripts

```bash
npm run validate:preservation
npm run validate:operational
npm run validate:workflow
npm run validate:data
npm run validate:routes
```

## Approved AEP — Remaining ACIs

| ACI | Title |
|-----|-------|
| ACI-007 | Validation + Smoke Tests |
| ACI-008 | Docker Foundation |
| ACI-009 | CI/CD Hardening |
| ACI-010 | Docker Hub Publish |
| ACI-011 | PA Documentation |
| ACI-012 | PA Certification |

## Next Steps

ACI-007 — Validation + Smoke Tests.
