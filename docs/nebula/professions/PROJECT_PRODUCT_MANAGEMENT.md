# Project / Product Management — TAIG NOPE Portal

**ACI:** ACI-ZEP-003  
**Sources:** `VERIFIED_SOLUTION_INTENT.md` (intent); repository ACIs/reports/README (delivery evidence); `REPO_CURRENT_TRUTH_DISCOVERY.md`  
**Implementation tip:** `9048e2f`

Truth tags: **[R]** repository evidence · **[O]** Operator-verified intent · **[I]** interpretation · **[U]** unknown

---

## Problem being solved

**[O]** Governed TAIG/Nebula execution methodology risked remaining only process/concept unless embodied as working software.

**[R]** Repository positions NOPE Lite as proving the TAIG execution framework via an operator portal; it does not independently narrate the problem beyond that product framing.

---

## Intended user

**[O]** Primary user: the Operator.  
**[R]** Operator runbooks, Operator Actions, and single-operator MVP language align with that audience.

---

## Verified product purpose

**[O]** Implement and operate the Nebula/TAIG governed execution framework as real software (portal), not only QEN conversations/artifacts.  
**[R]** “NOPE Lite proves the TAIG execution framework”; Job Order–centric cockpit; PA Certified Production Artifact (ACI-012).

---

## MVP objective

**[O]** Prove the core execution concept in operable software; validate via engineering process; package via Docker/CI/CD; reach Production Artifact status. Explicitly **not** the final intended evolution of NOPE.

**[R]** ACI path delivers MVP workflows + Docker Foundation + PA certification; README/risks describe MVP limits.

---

## Scope

**In scope for this version [O]/[R]:**

- Runnable operator portal for governed execution objects  
- Job Orders and related lifecycle concepts (truth states, Minority Reports, Operator Actions, ACIs, completion reports, risks, artifacts, passdowns, history)  
- Validation suite, Docker packaging, CI/CD, documented Hub publish  
- PA documentation and certification  

**Major capability increments (repo ACI progression) [R]:**

| ACI | Increment |
|-----|-----------|
| 001 | Repository foundation |
| 002 | Data model |
| 003 | MVP UI shell |
| 004 | Job Order workflow |
| 005 | Operator Actions + Minority Report |
| 006 | Local preservation |
| 007 | Validation + smoke tests |
| 008 | Docker Foundation |
| 009 | CI/CD hardening |
| 010 | Docker Hub publish |
| 011 | PA documentation package |
| 012 | PA certification |

---

## Explicit non-scope

**[O]** Intentionally excluded: authentication, database, cloud synchronization, AWS, Terraform.  
**[R]** Same list (plus multi-user concurrency and full execution engine beyond MVP) in README / risk register / PA materials.

These were **not** deferred accidental omissions for this version’s success criteria; they were unnecessary to prove the core concept **[O]**.

---

## Development progression / ACI-based evolution

**[R]** Work advanced through numbered ACIs with completion reports under `docs/reports/` and an index in `docs/aci_history/README.md`. Git history pairs feature commits with docs finalize commits. Source tip `9048e2f` (2026-06-27).

**[I]** Delivery model is governed, incremental change instruction (ACI) rather than ad-hoc feature dump.

---

## Decision / constraint evidence

| Decision | Basis | Tag |
|----------|-------|-----|
| Operator as sole primary user | Verified intent + docs | [O]/[R] |
| JSON file store, no DB | Intentional non-scope + implementation | [O]/[R] |
| No auth | Intentional non-scope + risk R-010 accepted | [O]/[R] |
| PA via Docker Hub image | ACI-010…012 + README | [R] |
| `deployable` publish gate | CI workflow | [R] |
| Not final NOPE evolution | Operator verification | [O] |

---

## Risks (product-relevant)

**[R]** From PA risk register: stale UI on port 3000, container ephemerality, single-operator JSON concurrency, local continuity loss, Hub tag movement, secrets dependency, public unauthenticated surface (by design).

---

## Success criteria

**[O]** Success = framework represented and operated as real software; validated; packaged through Docker/CI/CD; reached Production Artifact status.

**[R]** Repository documents PA certification (ACI-012, 2026-06-27) and the packaging/validation path supporting that claim.

**Terminology:** Product is a **PA** (Production Artifact). Docs may reference PE/PAPEV as **next lifecycle** using the Hub image; this management document does **not** claim completed PAPEV.

---

## Current maturity

**[O]** MVP / Production Artifact proving the core concept.  
**[R]** PA Certified; Docker Foundation; MVP workflow depth with placeholders and seed-data limits.

---

## Known gaps (intent vs implementation)

From ACI-ZEP-002 **[O]/[R]** comparison:

1. Portal seed ACI history incomplete vs markdown ACI-001…012  
2. Uneven manage/observe depth (placeholders for some history views)  
3. Final product evolution explicitly out of this version  
4. Nebula/QEN role narrative stronger in Operator intent than repo prose  
5. Certifying-commit tip currency (`a0edd22` vs `9048e2f`) — operational verification  

No material contradiction of purpose or non-scope.

---

## Relationship: intended solution ↔ delivered implementation

| Dimension | Relationship |
|-----------|--------------|
| Purpose | Aligned — software proof of governed execution |
| User | Aligned — Operator |
| Core objects | Aligned in data model; partial in some UI surfaces |
| Non-scope | Aligned — absences intentional |
| Maturity | Aligned — MVP + PA, not final evolution |
| Success | Aligned at documentation/certification level; live Hub/protection currency still **[U]/[V]** |

---

## Professional capabilities demonstrated

- Problem framing and MVP scoping with explicit non-scope  
- ACI-governed incremental delivery with completion evidence  
- Risk registration and PA certification packaging  
- Clear success definition tied to operable software + validation + deployable artifact  

Does **not** invent: market sizing, customer interviews, multi-stakeholder RACI, employment roles, or production usage metrics beyond repository/PA claims.

---

*Documentation only (ACI-ZEP-003). Does not redefine product scope or implement changes.*
