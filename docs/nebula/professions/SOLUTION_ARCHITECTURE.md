# Solution / Systems Architecture — TAIG NOPE Portal

**ACI:** ACI-ZEP-003  
**Sources:** repository structure/code; `REPO_CURRENT_TRUTH_DISCOVERY.md`; `VERIFIED_SOLUTION_INTENT.md`  
**Implementation tip:** `9048e2f`

Truth tags: **[R]** repository evidence · **[O]** Operator-verified intent · **[I]** technical interpretation · **[U]** unknown

---

## Solution purpose

**[O]** Software proof of the Nebula/TAIG governed execution methodology as an operational portal for the Operator.  
**[R]** NOPE Lite portal representing Job Order–centric execution objects in a runnable web application; PA Certified (ACI-012) as a Production Artifact for this MVP scope.

---

## System context

```
Operator (browser)
       │
       ▼
NOPE Lite (Node/Express + EJS)  ── JSON files (data/)
       │
       ├── optional local continuity (nebula_local/)
       └── packaged as Docker image (documented Hub: taig2k/taig_nope_portal:deployable)
```

**[R]** Single process; no external database, auth provider, or cloud control plane in tree.  
**[O]** Role: move governed execution out of QEN-only process/artifacts into operable software.

---

## Major components

| Component | Responsibility | Tag |
|-----------|----------------|-----|
| Presentation | EJS views + `public/` assets | [R] |
| HTTP/application | Express routes + `/health` | [R] |
| Domain services | Job Order / action / minority-report persistence; preservation | [R] |
| Model layer | Schemas, load, validate, write | [R] |
| Execution store | `data/*.json` | [R] |
| Continuity store | `nebula_local/` (gitignored) | [R] |
| Packaging | Dockerfile; CI publish path | [R] |

---

## Component relationships

**[R]** Browser → Express routes → services → models → JSON files.  
**[R]** Job Order is the architectural root; other entities link by id.  
**[R]** Placeholder-module routes provide additional observation surfaces (ACI history, timeline, completion reports as read-only lists; `/settings` stub) with lighter depth than Job Order / Operator Action / Minority Report edit paths.

---

## Execution / data flow

1. Operator opens dashboard or Job Order workflows.  
2. Requests hit route handlers; services read/validate/write JSON via models.  
3. Truth fields (current / next / target), actions, minority reports, and related objects update on Job Order–scoped workflows.  
4. Optional preservation snapshots go to `nebula_local/`.  
5. Health consumers hit `/health` for liveness.

**[I]** Synchronous request/response; no message bus or async worker architecture evidenced.

---

## Persistence approach

**[R]** File-backed JSON under `data/` with schema validation.  
**[R]** Local preservation directory for operator continuity (not a remote sync system).  
**[R]** Docker volume documented for `/app/nebula_local`.  

**[I]** Suitable for single-operator MVP proof; not designed as durable multi-writer enterprise storage.

---

## Application boundaries

**In boundary [R]:** Operator UI, Job Order lifecycle objects, scripted validation, container packaging, documented Hub image for PA use.

**Out of boundary [O]/[R]:** Authentication/authorization, database, cloud synchronization, AWS, Terraform, multi-user concurrent editing, full execution engine beyond MVP.

**Cloud / Security note:** No cloud IaC or auth subsystem is implemented. Absence is intentional non-scope, not an undocumented omission. Do not treat Docker Hub distribution as cloud platform engineering.

---

## Architectural decisions evidenced

| Decision | Evidence | Tag |
|----------|----------|-----|
| Server-rendered monolith | Express + EJS structure | [R] |
| Job Order as root aggregate | `schemas.js` Job Order requirements | [R] |
| JSON over database | `data/` + no DB dependency | [R]/[O] non-scope |
| Scripted validation over unit-test framework | `scripts/validate-*.js` | [R] |
| `main` + `deployable` publish gate | CI publishes only from `deployable` push | [R] |
| Non-root container user + HEALTHCHECK | Dockerfile | [R] |

---

## Intentional constraints

**[R]/[O]** Single-operator MVP; no auth; no DB; no AWS/Terraform; no cloud sync.  
**[R]** Public image surface accepted in PA risk register (R-010).  
**[O]** This version is MVP / Production Artifact proving the core concept—not the final intended evolution of NOPE.

---

## Current architecture limitations

**[R]** History/report observation views are read-only; settings stub; edit depth concentrated on Job Orders / actions / minority reports.  
**[R]** Seed portal ACI history incomplete vs markdown ACI docs.  
**[R]** Ephemeral container filesystem for `data/` without additional volume.  
**[R]** JSON concurrency limits.  
**[U]** Live Hub digest / branch-protection currency (operational verification; see DevOps doc).

---

## MVP / PA architecture versus possible future evolution

**[R]** Current: PA Certified MVP portal + Docker Foundation packaging. Repository documents approval to begin PE / PAPEV **lifecycle** using the Hub image as deploy artifact—this documents a **path**, not completed PAPEV proof in-repo.

**Future / not implemented (do not design here):**

- Authentication / authorization  
- Database-backed persistence  
- Cloud sync / remote backup  
- AWS / Terraform deployment architecture  
- Multi-user concurrency model  
- Final NOPE product evolution beyond this MVP  

---

## Operational evidence (architecture-relevant)

**[R]** Operator and developer runbooks; `/health`; preservation volume guidance; risk register for port conflicts, ephemerality, and single-operator scope.

---

## Professional capabilities demonstrated

- Job Order as root aggregate in a small server-rendered monolith  
- Explicit system boundaries and intentional non-scope  
- Persistence and packaging choices matched to MVP proof goals  
- Separation of runtime app, validation tooling, and container artifact  

Does **not** evidence: enterprise multi-service architecture, cloud reference architectures, or security architecture programs.

---

*Documentation only (ACI-ZEP-003). Does not design future architecture.*
