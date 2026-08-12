# REPO CURRENT TRUTH DISCOVERY

**ACI:** ACI-ZEP-001  
**Project:** TAIG NOPE Portal (NOPE Lite)  
**QEN:** Zepline · **AIW:** CAE  
**Discovery date:** 2026-08-11  
**Source of truth:** GitHub remote `the-ai-guy-2k/taig_nope_portal`  
**Local path:** `C:\Users\tim\Documents\business_related\The_AI_Guy\nebula\2 - TAIG2K_SOFTWARE\1 - repo_docu\nova`

Truth control legend used below:

- **[T]** Repository-evidenced truth
- **[I]** Reasonable technical interpretation
- **[V]** Operator verification required

---

## 1. Repository Identification

| Field | Value | Class |
|-------|--------|-------|
| Remote URL | `https://github.com/the-ai-guy-2k/taig_nope_portal.git` | [T] |
| Local clone path | Authorized `nova` folder (above) | [T] |
| `package.json` name | `taig-nope-portal` `0.1.0` (private, UNLICENSED) | [T] |
| Product label in docs | **NOPE Lite — TAIG NOPE Portal** | [T] |
| Stated purpose | Prove the TAIG execution framework; operator portal for Job Orders, ACI history, Minority Reports, Operator Actions, local preservation | [T] |
| Stated maturity | Docker Foundation (ACI-008); **PA Certified** (ACI-012, 2026-06-27) | [T] |
| Canonical deploy artifact (docs) | Docker Hub `taig2k/taig_nope_portal:deployable` | [T] |

---

## 2. Remote / Local Repository State

| Check | Result | Class |
|-------|--------|-------|
| Origin fetch/push | `https://github.com/the-ai-guy-2k/taig_nope_portal.git` | [T] |
| Fetch | Succeeded; no new objects at discovery time | [T] |
| Starting branch | `main` @ `9048e2f` (tracking `origin/main`, 0 ahead / 0 behind) | [T] |
| Working tree | Clean before documentation work | [T] |
| Remote branches | `origin/main`, `origin/deployable` (`origin/HEAD` → `main`) | [T] |
| `main` vs `deployable` | Same commit `9048e2f` | [T] |
| Documentation branch | `docs/repo-current-truth` (created from `main`; not merged) | [T] |
| Commit count | 27 commits on current history | [T] |
| Sole author in `git shortlog` | `the-ai-guy-2k` | [T] |
| Latest source commit | `9048e2f` — `docs: correct ACI-012 commit id in completion report.` (2026-06-27) | [T] |
| Local GitHub CLI auth | `gh auth status` → not logged in | [T] |
| Push posture for this mission | Local commit only; push not attempted | [T] |

---

## 3. Current Solution Summary

**[T]** NOPE Lite is a Node.js/Express web application that presents an execution cockpit for TAIG-style governed work: Job Orders as the root object, with linked ACIs, operator actions, minority reports, completion reports, timeline events, and risks, persisted as JSON under `data/`.

**[T]** Operators can create/edit Job Orders, manage Operator Actions, edit Minority Reports, view dashboard/placeholder sections (ACI history, timeline, completion reports), and use a local preservation layer under `nebula_local/` (gitignored).

**[T]** Repository documentation asserts PA certification and approval to begin PE / PAPEV lifecycle; Docker Hub image is documented as the canonical PE/PAPEV deployment artifact.

**[I]** The product is intentionally an MVP / foundation portal (not a full execution engine), demonstrated by seed Job Order `jo-aci-002-seed` and explicit out-of-scope lists.

---

## 4. Architecture Observed

```
Browser (EJS + public CSS/JS)
        │
        ▼
Express app (src/app.js) ── routes: dashboard, job-orders, placeholders, /health
        │
        ├── services (persistence, jobOrderService, localPreservation, operationalHelpers)
        ├── models (schemas, loader, validator, writer)
        └── JSON files in data/  (+ optional nebula_local/ preservation)
```

**[T]** Entry: `src/server.js` → `src/app.js`; view engine EJS; static assets from `public/`.

**[T]** Layering is clear: routes → services → models → `data/*.json`.

**[T]** Container: single-process Node 20 Alpine image; healthcheck hits `/health`; non-root `node` user; volume intended for `/app/nebula_local`.

**[I]** Architecture is a classic server-rendered monolith with file-backed storage—suitable for single-operator local/Docker use.

---

## 5. Technology Stack

| Layer | Evidence | Class |
|-------|----------|-------|
| Runtime | Node.js `>=20` (`package.json` engines; Docker `node:20-alpine`) | [T] |
| Framework | Express `^4.21.2` | [T] |
| Views | EJS `^3.1.10` | [T] |
| Storage | JSON files in `data/`; no DB dependency | [T] |
| Client assets | Vanilla `public/css`, `public/js` | [T] |
| Validation/tooling | Node scripts under `scripts/` (no Jest/Mocha/etc. in dependencies) | [T] |
| CI | GitHub Actions `.github/workflows/ci.yml` | [T] |
| Containers | `Dockerfile`, `.dockerignore`, npm docker scripts | [T] |
| Registry | Docker Hub publish from `deployable` via secrets | [T] |

---

## 6. Repository Structure

```
nova/
├── .github/workflows/ci.yml
├── data/                 # JSON execution store
├── docs/                 # PA package, ACI reports, risks, runbooks
├── public/               # CSS/JS
├── scripts/              # validation, smoke, CI helpers
├── src/                  # app, routes, models, services
├── views/                # EJS templates
├── Dockerfile
├── package.json / package-lock.json
└── README.md
```

**[T]** No `tests/` directory; validation lives in `scripts/`.  
**[T]** No Terraform/AWS/cloud IaC in tree.  
**[T]** `docs/nebula/reports/` introduced by this discovery mission for Nebula reporting artifacts.

---

## 7. Application Components

| Component | Path / surface | Class |
|-----------|----------------|-------|
| HTTP server / graceful shutdown | `src/server.js` | [T] |
| Express app + `/health` | `src/app.js` | [T] |
| Dashboard / workspace UI | `src/routes/dashboard.js`, `views/dashboard/` | [T] |
| Job Orders CRUD/workflows | `src/routes/jobOrders.js`, `views/job-orders/` | [T] |
| Placeholder sections | `src/routes/placeholders.js`, `views/placeholders/` | [T] |
| Schema + load/validate/write | `src/models/*` | [T] |
| Persistence services | `src/services/*Persistence.js`, `jobOrderService.js` | [T] |
| Local preservation | `src/services/localPreservation.js` | [T] |
| Seed / runtime data | `data/*.json` | [T] |

Documented operator URLs **[T]**: `/`, `/dashboard`, `/health`, `/job-orders`, `/job-orders/:id/operator-actions`, `/job-orders/:id/minority-report/edit`.

---

## 8. Data / Storage

**[T]** Six tracked JSON stores (`DATA_FILES` in `schemas.js`):

| File | Root key | Role |
|------|----------|------|
| `job_orders.json` | `job_orders` | Root execution object |
| `aci_history.json` | `aci_history` | ACI records |
| `minority_reports.json` | `minority_reports` | Minority reports |
| `operator_actions.json` | `operator_actions` | Operator actions |
| `completion_reports.json` | `completion_reports` | Completion reports |
| `timeline.json` | `timeline` | Timeline events |

**[T]** Job Order carries current/next/target truth, human summary, AEP id, linked ACI/action/report/timeline ids, risks, artifacts, passdown.

**[T]** Runtime seed shows Job Order `jo-aci-002-seed` (status `active`) and `aci_history.json` with ACI-001 `complete` and ACI-002 `in_progress`—**seed/demo data**, not a full mirror of markdown ACI-001…012 completion history.

**[T]** Operator continuity: `nebula_local/` (or `PRESERVATION_DIR` / Docker volume `nope-nebula-local`); gitignored along with `.nebula/`, `aiw_local/`, `*.local.md`, `ci-reports/`.

**[I]** Writes to `data/` inside a container without a volume for that path would be ephemeral; docs emphasize volume for preservation, not necessarily for `data/`.

---

## 9. Development & ACI History

**[T]** Git history is ACI-sequenced (001→012) with completion-report finalize commits; 27 commits ending at `9048e2f`.

| ACI | Title (from `docs/aci_history/README.md`) | Status (docs) |
|-----|-------------------------------------------|---------------|
| 001 | Repository Foundation | Complete |
| 002 | Data Model Foundation | Complete |
| 003 | MVP UI Shell | Complete |
| 004 | Job Order Execution Workflow | Complete |
| 005 | Operator Actions + Minority Report | Complete |
| 006 | Local Preservation | Complete |
| 007 | Validation + Smoke Tests | Complete |
| 008 | Docker Foundation | Complete |
| 009 | CI/CD Hardening | Complete |
| 010 | Docker Hub Publish | Complete |
| 011 | PA Documentation | Complete |
| 012 | PA Certification | Complete |

**[T]** Completion reports: `docs/reports/ACI-001` … `ACI-012-completion-report.md`, plus `PA_CERTIFICATION_REPORT.md`, `PA_validation_report.md`.

**[T]** PA certification report cites certifying commit `a0edd22`; HEAD later advanced to `9048e2f` (ACI-012 commit-id correction). `docs/aci_history/README.md` still lists certifying commit as `a0edd22`.

**[V]** Confirm whether Operator intends seed `data/aci_history.json` to remain intentionally stale relative to markdown ACI history, or should be synchronized for portal display accuracy.

---

## 10. Testing / Validation

**[T]** No unit-test framework dependency. Validation is first-class via npm scripts:

1. structure → 2. syntax → 3. data → 4. workflow → 5. operational → 6. preservation → 7. routes → 8. smoke → 9. operator visual (`scripts/validate-all.js`)

**[T]** Additional: `validate:docker`, `validate:docker-pull`, `audit:routes`.

**[T]** PA docs claim local `validate:all` PASS and CI success on certification date (runs linked in PA certification report).

**[V]** Re-run `npm run validate:all` / Docker pull validation on this CAE host if Operator requires fresh local evidence beyond repository claims.

---

## 11. CI/CD & Containerization

**[T]** Workflow `CI/CD Pipeline` on push/PR to `main` and `deployable`:

1. `validate` — `npm run validate:all`  
2. `docker-build` — buildx + GHA cache + `validate:docker`  
3. `publish` — **only** `push` to `deployable`; tags `latest`, `deployable`, `<sha>`  
4. `docker-pull-validation` — pull published image + smoke/visual  
5. `pipeline-report` — performance + fail-if-required-jobs-failed  

**[T]** Dockerfile: `npm ci --omit=dev`, copies `src`, `views`, `public`, `data`; `USER node`; HEALTHCHECK on `/health`.

**[T]** `docs/BRANCH_PROTECTION.md` documents **recommended** GitHub protection rules (not proof they are enabled on the remote).

**[V]** Confirm whether branch protection and Docker Hub secrets remain configured on GitHub as documented.

---

## 12. Deployment / Release Evidence

**[T]** Docs assert publish path and image `taig2k/taig_nope_portal:deployable`; PA report records digest `sha256:627d0f4498fed599b28f18b2d850fb47f3efbb239337b15a7b2d4db5fff244f5` and Actions runs `28308972338` (`main`), `28308975083` (`deployable`).

**[T]** Repository contains publish/validation scripts and CI wiring; this discovery mission did **not** pull Docker Hub or query live Actions.

**[V]** Operator should confirm image still exists/pulls and whether digest at Hub still matches certification report.

---

## 13. Existing Documentation

| Document | Role | Class |
|----------|------|-------|
| `README.md` | Product overview, quick start, CI diagram, out of scope | [T] |
| `docs/OPERATOR_RUNBOOK.md` | Operator workflows | [T] |
| `docs/DEVELOPER_RUNBOOK.md` | Dev / CI / data model | [T] |
| `docs/VALIDATION_GUIDE.md` | Validation suite | [T] |
| `docs/DOCKER_HUB.md` | Image/tags/secrets | [T] |
| `docs/PA_RISK_REGISTER.md` | Known risks | [T] |
| `docs/BRANCH_PROTECTION.md` | Recommended protections | [T] |
| `docs/aci_history/README.md` | ACI index | [T] |
| `docs/reports/*` | ACI + PA certification/validation | [T] |

**[T]** No prior `docs/nebula/reports/REPO_CURRENT_TRUTH_DISCOVERY.md` before this ACI.

---

## 14. Risks / Limitations

From `docs/PA_RISK_REGISTER.md` and code/docs alignment **[T]**:

- Stale process on port 3000 can serve old UI  
- JSON concurrency / single-operator MVP  
- Container ephemerality without volumes  
- Public image surface with no auth (by design)  
- `nebula_local/` loss is operator responsibility  
- Windows file-lock interactions during validation  

**[I]** Seed JSON lagging markdown ACI history may confuse operators viewing portal ACI history vs documentation.

---

## 15. Explicit Out-of-Scope Items

**[T]** Stated in README / risk register / PA materials:

- Authentication / authorization  
- Database storage  
- Cloud sync / remote backup  
- AWS / Terraform deployment  
- Multi-user concurrent editing  
- Full execution engine beyond MVP workflows  

---

## 16. Professional Disciplines Evidenced

| Discipline | Repository evidence | Why relevant | Confidence |
|------------|---------------------|--------------|------------|
| **Software Engineering** | Express/EJS app, models/services/routes, npm scripts, lockfile | Core product implementation | **HIGH** |
| **Solution / Systems Architecture** | Layered structure, Job Order root model, ACI-sequenced AEP, PA package | System shape and governed evolution | **HIGH** |
| **DevOps Engineering** | GitHub Actions pipeline, Docker build/publish/pull validation, CI metadata/summary scripts | Build, verify, publish loop | **HIGH** |
| **QA / Testing** | Nine-stage validate-all, smoke, route audit, operator visual, Docker validators | Continuous quality gates without classic unit-test framework | **HIGH** |
| **Operations** | Operator runbook, preservation subsystem, health endpoint, troubleshooting for port conflicts | Day-2 run/operate focus | **HIGH** |
| **Project / Product Management** | ACI completion reports, PA certification, truth-state fields on Job Orders, risk register | Governed delivery and certification narrative | **HIGH** |
| **Cloud Engineering** | Docker Hub as deployment registry; docs mention PE/PAPEV image use | Container distribution only—no cloud IaC | **MEDIUM** |
| **Security** | Non-root container user, secret-based Hub login, `.gitignore` for env/local; explicit no-auth PA scope | Hardening present but auth/authz out of scope | **MEDIUM** |

No final profession-specific documentation produced in this ACI.

---

## 17. Operator Verification Required

1. **Intended product purpose for Nebula/Zepline** — Confirm “prove TAIG execution framework / PA for PE·PAPEV” remains the Operator-intended mission statement.  
2. **Seed data vs ACI docs** — `data/aci_history.json` (and related seed objects) vs complete ACI-001…012 markdown history.  
3. **PA certification currency** — Certifying commit documented as `a0edd22` while HEAD is `9048e2f`; confirm certification still applies to current tip.  
4. **Live Docker Hub artifact** — Image/tags/digest still valid for operators.  
5. **GitHub branch protection** — Whether recommended rules in `BRANCH_PROTECTION.md` are actually enabled.  
6. **Docker Hub / CI secrets** — Still present for `deployable` publishes.  
7. **Fresh local validation** — Optional re-run of `validate:all` / container pull on CAE host.  
8. **Push of `docs/repo-current-truth`** — Requires Operator GitHub authorization (`gh` not logged in at discovery time).

---

## 18. Repository Current Truth Summary

**[T]** The authorized `nova` folder holds a clean, synchronized clone of `the-ai-guy-2k/taig_nope_portal`. `main` and `deployable` both point at `9048e2f`. The product is a Node 20 Express + EJS “NOPE Lite” portal with JSON-backed Job Order workflows, local preservation, a substantial scripted validation suite, Docker packaging, and a deployable-branch Docker Hub publish pipeline. Documentation asserts PA certification (ACI-012) and lists authentication, databases, cloud sync, AWS/Terraform, and multi-user concurrency as out of scope.

**[I]** Repository evidence supports treating NOPE Lite as a certified MVP execution cockpit and framework demonstrator, not as a cloud-native multi-tenant platform.

**[V]** Operator confirmation is still required before treating seed JSON, live Hub digests, remote branch protection, and certification tip-commit alignment as operationally current for Zepline profession-specific documentation.

---

*End of ACI-ZEP-001 discovery artifact. Documentation only; no application implementation changes.*
