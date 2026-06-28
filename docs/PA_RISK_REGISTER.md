# NOPE Lite — PA Risk Register

Known risks for the NOPE Lite Production Artifact. Review before PA certification (ACI-012).

| ID | Risk | Severity | Mitigation | Status |
|----|------|----------|------------|--------|
| R-001 | Stale Node process on port 3000 serves old ACI-001 UI | Medium | `npm run audit:routes`; README troubleshooting; `EADDRINUSE` handler | Mitigated |
| R-002 | CI ports (3099/3100) differ from operator port (3000) | Low | Document in VALIDATION_GUIDE; use `audit:routes` for operator checks | Accepted |
| R-003 | `data/` writes in container ephemeral without volume | Medium | Document volume mount `nope-nebula-local:/app/nebula_local` | Mitigated |
| R-004 | Port 3000 conflict between Node and Docker | Low | Operator runbook: stop one before starting the other | Accepted |
| R-005 | Windows file lock during `validate:all` with `npm start` running | Low | Stop server before validation on Windows | Accepted |
| R-006 | JSON file concurrency (single-operator MVP) | Medium | Document single-operator scope; local preservation | Accepted |
| R-007 | `nebula_local/` loss deletes local continuity | Medium | Operator responsibility; git-tracked `data/` unchanged | Accepted |
| R-008 | Docker Hub `latest` tag moves on each deployable push | Low | Pin `:deployable` or commit SHA tag | Mitigated |
| R-009 | Missing Docker Hub secrets fails deployable CI | High | DOCKER_HUB.md; secrets configured (`taig2k`) | Mitigated |
| R-011 | Hub image name migration `taig-nope-portal` → `taig_nope_portal` | Medium | CI `DOCKER_HUB_IMAGE_NAME` updated; republish on deployable push | Open |

## Out of Scope (Not Risks — By Design)

- Authentication and authorization
- Cloud sync and remote backup
- Database storage
- Multi-user concurrent editing
- AWS / Terraform deployment
- Full execution engine beyond MVP workflows

## Future PE / PAPEV Considerations

- Pin image by digest for mission-critical deploys: `taig2k/taig_nope_portal@sha256:...`
- Mount persistent volume for `nebula_local` across container restarts
- Run `npm run validate:all` after clone before mission execution
