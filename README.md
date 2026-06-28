# NOPE Lite — TAIG NOPE Portal

Repository foundation, execution data model, and Job Order workflow for the NOPE Lite Production Artifact.

**Version:** Job Order Workflow (ACI-004)

## Repository Overview

ACI-001–003 established foundation, data model, and read-only UI. ACI-004 adds Job Order create, edit, and save with JSON-backed persistence and validation.

- **Repository:** https://github.com/the-ai-guy-2k/taig_nope_portal.git
- **Branches:** `main`, `deployable`

## Job Order Workflow

Operators can create, edit, and save Job Orders through HTML forms. All writes pass through `src/services/jobOrderPersistence.js` and `src/models/writer.js` with full schema validation before persistence.

### Editable Fields

Mission, status, current/next/target truth, human summary, risks, and passdown.

### Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/job-orders/new` | GET | Create form |
| `/job-orders` | POST | Create Job Order |
| `/job-orders/:id/edit` | GET | Edit form |
| `/job-orders/:id` | POST | Update Job Order |
| `/job-orders/:id` | GET | View Job Order (read-only workspace) |

Read routes (`/`, `/dashboard`, `/job-orders`, placeholders) continue to function.

## Run Instructions

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm start
```

- **Dashboard:** http://localhost:3000/dashboard
- **Create Job Order:** http://localhost:3000/job-orders/new
- **Seed Job Order:** http://localhost:3000/job-orders/jo-aci-002-seed

## Validation Scripts

```bash
npm run validate:structure
npm run validate:syntax
npm run validate:data
npm run validate:workflow   # Create, update, read-after-write, failure tests
npm run validate:routes
```

## CI Overview

GitHub Actions runs all validation scripts including workflow persistence tests and route checks.

## Next Steps

ACI-005 may introduce operator action editing, minority report editing, and authentication.
