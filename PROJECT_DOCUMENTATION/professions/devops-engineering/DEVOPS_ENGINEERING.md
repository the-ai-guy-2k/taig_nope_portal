# DevOps Engineering — TAIG NOPE Portal

**ACI:** ACI-ZEP-003  
**Sources:** `.github/workflows/ci.yml`, Dockerfile, scripts, PA docs; `REPO_CURRENT_TRUTH_DISCOVERY.md`; `VERIFIED_SOLUTION_INTENT.md`  
**Implementation tip:** `9048e2f`

Truth tags: **[R]** repository evidence · **[O]** Operator-verified intent · **[I]** technical interpretation · **[U]** / **[V]** operator verification still required

---

## Repository workflow

**[R]** Remote: `https://github.com/the-ai-guy-2k/taig_nope_portal.git`  
**[R]** Primary branches observed: `main`, `deployable` (same tip `9048e2f` at discovery).  
**[R]** Documentation work for Nebula discovery/intent/professions lives on local branch `docs/repo-current-truth` (not merged by these ACIs).  
**[R]** `docs/BRANCH_PROTECTION.md` documents **recommended** protections—not proof they are enabled remotely.

---

## Git evidence

**[R]** ~27 commits on source history through `9048e2f`; ACI-sequenced feature + completion-report commits.  
**[R]** Sole author in shortlog: `the-ai-guy-2k`.  
**[R]** PA certification materials cite certifying commit `a0edd22`; tip later advanced to `9048e2f` (ACI-012 commit-id correction).

---

## CI/CD and GitHub Actions

**[R]** Workflow `CI/CD Pipeline` (`.github/workflows/ci.yml`) on push/PR to `main` and `deployable`:

| Job | Role |
|-----|------|
| `validate` | `npm run validate:all` (+ metadata/artifacts) |
| `docker-build` | buildx + GHA cache + `validate:docker` |
| `publish` | **only** on push to `deployable`; Hub tags `latest`, `deployable`, `<sha>` |
| `docker-pull-validation` | pull published image + smoke/visual |
| `pipeline-report` | performance summary; fail if required jobs failed |

**[R]** Node 20; secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` required for publish.

---

## Validation automation

**[R]** Nine-stage `validate:all` (structure, syntax, data, workflow, operational, preservation, routes, smoke, operator visual).  
**[R]** Docker validators: `validate:docker`, `validate:docker-pull`; route audit; CI metadata/summary/performance scripts.  
**[I]** Validation suite substitutes for a conventional unit-test framework in this repo.

---

## Docker / containerization

**[R]** `Dockerfile`: `node:20-alpine`, `npm ci --omit=dev`, copies `src`/`views`/`public`/`data`, non-root `node` user, HEALTHCHECK on `/health`, port 3000.  
**[R]** Local tags via npm: `taig-nope-portal:local`; published image documented as `taig2k/taig_nope_portal:deployable`.  
**[R]** Volume pattern: `nope-nebula-local:/app/nebula_local`.

---

## Build / package / release flow

```
push/PR (main|deployable)
  → validate
  → docker-build (+ container validation)
  → [deployable push only] publish to Docker Hub
  → docker-pull-validation
  → pipeline-report
```

**[R]** Canonical deploy artifact (docs): `taig2k/taig_nope_portal:deployable`.  
**[R]** PA certification report records digest and Actions run ids at certification time (see `docs/reports/PA_CERTIFICATION_REPORT.md`).

---

## Production Artifact path (PA — not PAPEV claim)

**[R]** ACI-012 certifies NOPE Lite as **Production Artifact (PA)** (2026-06-27).  
**[R]** Docs approve beginning **PE / PAPEV lifecycle** using the Hub image as the deploy artifact.  

**Accurate terminology for this documentation set:**

- **Proven in-repo:** PA certification documentation and packaging path.  
- **Not claimed as completed by this DevOps doc:** full PAPEV execution/proof. Repository points forward to PE/PAPEV use; it does not evidence completed PAPEV here.

**[O]** Success for this version includes validation + Docker/CI/CD packaging + Production Artifact status.

---

## Operational / runbook evidence

**[R]** `docs/OPERATOR_RUNBOOK.md`, `docs/DEVELOPER_RUNBOOK.md`, `docs/VALIDATION_GUIDE.md`, `docs/DOCKER_HUB.md`, README quick starts.  
**[R]** Troubleshooting for stale port-3000 processes; guidance to stop Node vs Docker conflicts; Windows file-lock note during validation.

---

## Risks and limitations (DevOps-relevant)

From `docs/PA_RISK_REGISTER.md` and discovery **[R]**:

- Stale process / port conflicts  
- Ephemeral `data/` in containers without volume  
- JSON single-operator concurrency  
- `nebula_local/` loss is operator responsibility  
- Hub `latest` moves; prefer `:deployable` or SHA  
- Missing Hub secrets fail deployable publish  
- Public image / no auth by design  

**Cloud boundary:** Docker Hub is used as an image registry. There is **no** AWS/Terraform/cloud sync implementation. Do not overstate cloud engineering.

**Security boundary:** Non-root user, secret-based Hub login, gitignore for local/env artifacts are evidenced. Authentication/authorization are intentionally absent.

---

## Unresolved operational verification items

Preserved from ACI-ZEP-001 / intent gaps **[V]**:

1. Live Docker Hub image/tags/digest still valid vs certification report  
2. GitHub branch protection actually enabled  
3. Docker Hub / CI secrets still configured  
4. Optional fresh `validate:all` / pull validation on CAE host  
5. PA certifying-commit tip currency (`a0edd22` vs `9048e2f`)  
6. Push of documentation branch requires Operator GitHub authorization  

These are **unverified operational currency** items—not failures of the PA documentation narrative in-repo.

---

## Professional capabilities demonstrated

- GitHub Actions multi-job pipeline with caching and artifact reporting  
- Container build, healthcheck, non-root runtime, and pull validation  
- Branch-gated publish to Docker Hub  
- Automated structural/workflow/smoke validation integrated into CI  
- Operator/developer runbooks and risk register for day-2 operation  

Does **not** evidence: Kubernetes/cloud IaC platforms, enterprise secrets management programs, or completed PAPEV missions.

---

*Documentation only (ACI-ZEP-003). Does not change CI/CD or infrastructure.*
