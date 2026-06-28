# ACI-006 Completion Report — Local Preservation

**ACI:** ACI-006  
**Title:** Local Preservation  
**Status:** Complete  
**Date:** 2026-06-28

## Summary

ACI-006 implemented the Local Preservation subsystem. An automated service snapshots execution context to `nebula_local/` on startup, supports validation and restoration for display, and remains fully excluded from source control.

## Work Performed

1. Created `src/services/localPreservation.js` with save, load, validate, and restore APIs
2. Automated preservation on application startup in `src/server.js`
3. Added dashboard preservation banner with restoration metadata
4. Created `scripts/validate-preservation.js` for artifact and gitignore validation
5. Extended CI with preservation validation step
6. Updated README with operator responsibilities and ignored folders

## Files Created

| Path | Purpose |
|------|---------|
| `src/services/localPreservation.js` | Local Preservation service |
| `views/partials/preservation-banner.ejs` | Dashboard restoration display |
| `scripts/validate-preservation.js` | Preservation CI validation |

## Preservation Workflow

1. Application starts → `initializeOnStartup()`
2. If artifacts exist → `restoreSnapshot()` loads metadata (repository `data/` unchanged)
3. `savePreservationSnapshot()` writes current execution context to `nebula_local/`
4. Dashboard displays Last Preserved, Job Order, ACI, and Restoration Status

## Restoration Workflow

1. Operator clones repository and runs `npm start`
2. Service detects `nebula_local/` artifacts (or creates initial snapshot)
3. Restoration metadata displayed on dashboard
4. Operator navigates to preserved Job Order link to continue execution

## Validation Evidence

### Local

```
npm run validate:preservation — passed
  - Gitignore exclusions validated
  - Save/load/validate/restore passed
  - Missing snapshot graceful handling passed
  - Invalid JSON graceful handling passed
  - Repository remains clean
```

## GitHub Actions Results

_Will be updated after push._

## Risks Discovered

| Risk | Severity | Mitigation |
|------|----------|------------|
| Local artifacts lost if `nebula_local/` deleted | Medium | Document operator responsibility; clone + run recreates from repo |
| Preservation dir not portable across machines | Expected | By design — local continuity only |
| Startup save refreshes from repo, not chat history | Expected | PA scope is execution framework proof |

## Recommendations for ACI-007

Per approved AEP, ACI-007 is **Validation + Smoke Tests**:

1. Expand end-to-end smoke test coverage across all routes and workflows
2. Add startup smoke test verifying preservation banner and health endpoint together
3. Document smoke test execution for operators and AIWs
4. Integrate smoke tests into CI as the primary release gate before Docker work in ACI-008

## Commit IDs

_Will be updated after push._

## Governance Note

Not implemented: cloud sync, git sync, remote backups, multi-user restoration, database storage.
