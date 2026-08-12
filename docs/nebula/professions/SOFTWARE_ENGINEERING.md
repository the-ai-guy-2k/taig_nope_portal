# Software Engineering — TAIG NOPE Portal

**ACI:** ACI-ZEP-003  
**Sources:** repository code/config; `REPO_CURRENT_TRUTH_DISCOVERY.md`; `VERIFIED_SOLUTION_INTENT.md`  
**Implementation tip:** `9048e2f`

Truth tags: **[R]** repository evidence · **[O]** Operator-verified intent · **[I]** technical interpretation · **[U]** unknown / unverified

---

## Application purpose

**[O]** Prove TAIG/Nebula governed execution as runnable software for the Operator.  
**[R]** README: “NOPE Lite proves the TAIG execution framework”; Node/Express operator portal over Job Orders and related execution objects.

---

## Technology stack

| Layer | Evidence | Tag |
|-------|----------|-----|
| Runtime | Node.js `>=20` (`package.json` engines; Docker `node:20-alpine`) | [R] |
| Framework | Express `^4.21.2` | [R] |
| Views | EJS `^3.1.10` | [R] |
| Client | Vanilla `public/css`, `public/js` | [R] |
| Persistence | JSON files under `data/` (no DB package) | [R] |
| Tooling | Node scripts in `scripts/`; no Jest/Mocha/etc. in dependencies | [R] |

---

## Application structure

```
src/server.js          # HTTP entry, graceful shutdown
src/app.js             # Express app, /health
src/routes/            # dashboard, jobOrders, placeholders
src/services/          # persistence, jobOrderService, localPreservation, helpers
src/models/            # schemas, loader, validator, writer
views/                 # EJS templates
public/                # static assets
data/                  # JSON stores
scripts/               # validation, smoke, CI helpers
```

**[I]** Classic layered server-rendered monolith: routes → services → models → files.

---

## Major components

| Component | Path | Tag |
|-----------|------|-----|
| Server / app shell | `src/server.js`, `src/app.js` | [R] |
| Dashboard workspace | `src/routes/dashboard.js`, `views/dashboard/` | [R] |
| Job Order workflows | `src/routes/jobOrders.js`, `views/job-orders/` | [R] |
| Placeholder sections | `src/routes/placeholders.js`, `views/placeholders/` | [R] |
| Schema + I/O | `src/models/*` | [R] |
| Persistence services | `src/services/*Persistence.js`, `jobOrderService.js` | [R] |
| Local preservation | `src/services/localPreservation.js` → `nebula_local/` | [R] |

---

## Routes / workflows

Documented operator surfaces **[R]**:

| URL | Role |
|-----|------|
| `/`, `/dashboard` | Execution dashboard |
| `/health` | Health JSON |
| `/job-orders` | Job Order list/create/edit |
| `/job-orders/:id/operator-actions` | Operator Actions |
| `/job-orders/:id/minority-report/edit` | Minority Report edit |

Placeholder routes expose ACI history, timeline, and completion-report sections **[R]**.

---

## Data model and JSON persistence

**[R]** Six stores via `DATA_FILES` in `src/models/schemas.js`:

| File | Root key |
|------|----------|
| `job_orders.json` | `job_orders` |
| `aci_history.json` | `aci_history` |
| `minority_reports.json` | `minority_reports` |
| `operator_actions.json` | `operator_actions` |
| `completion_reports.json` | `completion_reports` |
| `timeline.json` | `timeline` |

**[R]** Job Order is the root object: current/next/target truth, human summary, AEP, linked ACIs/actions/reports/timeline, risks, artifacts, passdown, statuses.

**[R]** Seed data includes Job Order `jo-aci-002-seed`; `aci_history.json` holds ACI-001 complete and ACI-002 in_progress only (not a full mirror of markdown ACI-001…012).

---

## Important implementation patterns

**[R]** Schema-driven validation (`schemas.js` + `validator.js`) before write.  
**[R]** Service-layer persistence for Job Orders, Operator Actions, Minority Reports.  
**[R]** Gitignored local preservation under `nebula_local/` (or `PRESERVATION_DIR` / Docker volume).  
**[R]** `/health` returns service identity and version string (`Docker Foundation (ACI-008)`).  
**[I]** File-backed store favors single-operator simplicity over concurrent multi-writer safety.

---

## Validation / testing (engineering-relevant)

**[R]** No unit-test framework dependency. Quality gates are npm scripts:

1. structure → 2. syntax → 3. data → 4. workflow → 5. operational → 6. preservation → 7. routes → 8. smoke → 9. operator visual (`npm run validate:all`)

Also: `validate:docker`, `validate:docker-pull`, `audit:routes`.

**[R]** PA materials claim local/CI validation PASS at certification; **[U]** fresh re-run on this CAE host not required for this document.

---

## Development evolution (repo-evidenced)

**[R]** ACI-sequenced delivery (001→012): foundation → data model → UI shell → Job Orders → Operator Actions/Minority Reports → preservation → validation → Docker → CI hardening → Hub publish → PA docs → PA certification. Completion reports under `docs/reports/`.

---

## Known implementation limitations

**[R]** JSON concurrency / single-operator MVP (risk register).  
**[R]** Placeholder UI for some history/report sections.  
**[R]** Seed ACI history lags documented ACI-001…012 markdown history.  
**[R]** Container `data/` writes ephemeral without volume (docs emphasize `nebula_local` volume).  
**[R]** No authentication; public image surface accepted for PA scope.

---

## Explicit non-scope

**[O]/[R]** Authentication, database, cloud sync, AWS, Terraform; multi-user concurrent editing; full execution engine beyond MVP workflows.

---

## Professional capabilities demonstrated

Based only on project evidence:

- Server-rendered Node/Express application design with clear layering  
- Schema-validated JSON domain modeling for governed execution objects  
- Operator-facing CRUD/workflow UI (EJS + static assets)  
- Scripted multi-stage validation without a separate unit-test framework  
- Incremental, ACI-governed feature delivery with completion evidence  

Does **not** evidence: large team roles, employment history, multi-tenant SaaS engineering, or database/ORM practice.

---

*Documentation only (ACI-ZEP-003). Does not modify implementation.*
