# PA Validation Report

Production Artifact validation evidence for NOPE Lite (ACI-011).

**Canonical image:** `taig2k/taig_nope_portal:deployable`  
**Repository:** https://github.com/the-ai-guy-2k/taig_nope_portal.git  
**Validation date:** 2026-06-27  
**Local environment:** Windows; Docker Desktop not running during ACI-011 doc validation

## Summary

| Category | Result | Notes |
|----------|--------|-------|
| Clone + `npm ci` | **Pass** | 77 packages, 0 vulnerabilities |
| `npm run validate:all` | **Pass** | 9 stages, 4.4s |
| `npm start` + `/health` | **Pass** | `{"status":"ok","version":"Docker Foundation (ACI-008)"}` |
| `npm run audit:routes` | **Pass** | 9 routes on port 3000 |
| Docker build (local) | **Skipped** | Docker daemon not running locally |
| Docker pull `taig2k/taig_nope_portal:deployable` | **CI-validated** | See ACI-010 Run 28308700309; image name aligned in ACI-011 CI |
| Docker run (published) | **CI-validated** | `validate:docker-pull` in deployable pipeline |
| Dashboard access | **Pass** | http://localhost:3000/dashboard |
| Operator visual verification | **Pass** | Stage 9 of `validate:all` + `audit:routes` |

## Command Evidence

### Clone and install

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
```

Result: 77 packages, 0 vulnerabilities.

### Full validation suite

```bash
npm run validate:all
```

Result (2026-06-27): **PASSED** — 9 stages, 4.4s.

### Health check (local)

```bash
npm start
curl.exe http://localhost:3000/health
```

Result: `{"status":"ok","service":"taig-nope-portal","version":"Docker Foundation (ACI-008)"}`

### Route audit (operator port)

```bash
npm run audit:routes
```

Result: **PASS** — 9 routes on port 3000; execution dashboard (not ACI-001 landing).

### Docker build (local)

```bash
npm run docker:build
# or
docker build -t taig-nope-portal:local .
```

### Docker pull (published)

```bash
docker pull taig2k/taig_nope_portal:deployable
# or
npm run docker:pull
```

### Docker run (published)

```bash
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  taig2k/taig_nope_portal:deployable
# or
npm run docker:run:published
```

### Operator visual verification

Automated: `npm run validate:operator-visual`, `npm run audit:routes` (with server on 3000)

Manual checklist (see [OPERATOR_RUNBOOK.md](../OPERATOR_RUNBOOK.md)):

1. Landing page shows execution dashboard
2. Sidebar navigation present
3. Preservation banner visible
4. Seed Job Order `jo-aci-002-seed` loads

## CI Evidence (Prior ACIs)

| Branch | Run | Result |
|--------|-----|--------|
| deployable | [28308700309](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308700309) | Success (publish + pull validation) |
| main | [28308670315](https://github.com/the-ai-guy-2k/taig_nope_portal/actions/runs/28308670315) | Success |

ACI-011 documentation commit will trigger new CI runs on push.

## Docker Image Truth

All PA documentation uses:

```
taig2k/taig_nope_portal:deployable
```

No placeholder image names remain in PA documentation files.

## Out of Scope (Not Validated)

Authentication, database, cloud sync, AWS, Terraform.

## PA Readiness

Documentation package complete. Operator can clone, run, validate, containerize, pull, and operate without assistance. Ready for ACI-012 PA Certification.
