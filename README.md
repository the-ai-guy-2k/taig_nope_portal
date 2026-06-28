# NOPE Lite — TAIG NOPE Portal

Repository foundation, execution data model, Job Order workflow, and operational awareness layer for NOPE Lite.

**Version:** Operational Awareness (ACI-005)

## Operational Workflow

ACI-005 adds editable **Operator Actions** and **Minority Reports** with automatic current/previous rotation.

### Operator Actions

| Route | Method | Purpose |
|-------|--------|---------|
| `/job-orders/:id/operator-actions` | GET | List and create actions |
| `/job-orders/:id/operator-actions` | POST | Create action |
| `/job-orders/:id/operator-actions/:actionId` | POST | Update, complete, or archive |

Statuses: `open`, `completed`, `archived`. Includes owner, checklist, created/completed dates.

### Minority Reports

| Route | Method | Purpose |
|-------|--------|---------|
| `/job-orders/:id/minority-report/edit` | GET | New report form |
| `/job-orders/:id/minority-report` | POST | Save with rotation |

Saving a new report moves the current report to **Previous**, marks it superseded, and preserves history in `data/minority_reports.json`.

### Dashboard Panels

The execution cockpit right panel displays:

- Current and Previous Minority Reports (mission, phase, truth states, risk, next action, target)
- Open Operator Actions Required (status, owner, checklist, dates)
- Timeline and Risks

## Run Instructions

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start
```

- **Dashboard:** http://localhost:3000/dashboard
- **Operator Actions:** http://localhost:3000/job-orders/jo-aci-002-seed/operator-actions
- **Minority Report:** http://localhost:3000/job-orders/jo-aci-002-seed/minority-report/edit

## Validation Scripts

```bash
npm run validate:structure
npm run validate:syntax
npm run validate:data
npm run validate:workflow
npm run validate:operational
npm run validate:routes
```

## Next Steps

ACI-006 may introduce authentication, notifications, or execution engine capabilities.
