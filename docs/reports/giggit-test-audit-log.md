# Giggit — Test Audit Log

The durable audit record. Every verified test run is entered here: date, who
ran it, commit, scope, each script's result, and any known gaps. CI artifacts
are 14/30-day only; this log and the GVCA artifacts are the record an auditor
reads. A run that is not in this log did not happen.

Source of truth for what is tested: `docs/giggit-testing-spec.md`.
Scripts: `scripts/giggit-smoke-tests.js`, `scripts/giggit-policy-tests.js`,
`scripts/giggit-dispute-tests.js`, `scripts/giggit-security-tests.js`.

## 2026-11-26 — Testing + audit build (local run, pre-merge)

- **Runner:** builder, Giggit testing + audit build (Tee's word, Nov 26, 21:38 ET).
- **Commit:** branch `testing/giggit-testing-audit` (merge commit to be filled in on merge).
- **Scope:** first Giggit test suites + stage-appropriate security controls
  (operator token, completion-code party rule, security headers, loud
  fallback logging, wallet newest-first, chat over-long refusal).

### Baseline — before the controls (same day, same scripts)

| Suite | Result | What failed (the gaps this build closes) |
|-------|--------|------------------------------------------|
| smoke | 8 passed / 12 failed | Accept response handed the completion code to the gigger; stranger detail showed customer phones; 1001-char chat was silently truncated; wrong-code/right-code/release/rate/cancel checks cascaded off the code leak; wallet entries oldest-first |
| policy | 14 passed / 2 failed | P15 (`?contacts=1` without a token showed phones), P16 (completion code in list responses) |
| dispute | 8 passed / 0 failed, 1 known gap | D7 — no resolve path (Decision Point 7), recorded as a known gap |
| security | 4 passed / 7 failed | T1 (settings open), T2 (`?contacts=1` open), T3 (code to strangers), T4 (probe title stored raw — later found `cleanText` strips tags; test corrected to assert no markup survives), T5 (no security headers), T6 (silent fallbacks), T12 (form-shaped admin write open) |

### After the controls — full `npm run validate:all` (13 stages), local

| Suite | Result |
|-------|--------|
| smoke | 20 passed / 0 failed |
| policy | 16 passed / 0 failed |
| dispute | 8 passed / 0 failed, 1 known gap (D7) |
| security | 11 passed / 0 failed |
| Existing 9 stages (structure, syntax, data, workflow, operational, preservation, routes, smoke, operator-visual) | all passed — no regressions |

### Known gaps and deferred items (still open after this build)

- **D7 — Dispute resolve (Decision Point 7).** No resolve function, endpoint,
  or screen exists. A disputed gig is moved only by a deliberate, recorded
  operator edit of the data file, with Tee's word. Needs Tee + Musty's
  decision on who resolves and what outcomes exist.
- **T9 — Dependency audit.** `npm audit` is blocked in this build
  environment (registry returns 403 policy_denied). The security script
  records that and passes; GitHub CI has registry access and runs the audit
  for real, failing the build on any critical vulnerability.
- **Deferred with a reason (not this build):** full accounts/login and
  per-user permissions (public-launch step); real-money rails (blocked — no
  processor); SMS notifications (blocked — no gateway); live GPS tracking
  (blocked — policy + consent); a strict Content-Security-Policy (needs a
  whole-portal inline-script audit — V2); the community fund (step 15, not
  built, optional).
- **The two dead ends still stand:** a gig whose client never enters the
  completion code waits at `completion_requested` forever (DP5); a disputed
  gig stays disputed forever (DP7). Both are decisions, not bugs to patch
  quietly.
- **Operator token:** `GIGGIT_ADMIN_TOKEN` lives in `/etc/taig/giggit-admin-token`
  on the Droplet (one line, never in the repo). Staging and live share it at
  this stage. The token value is never printed in logs, docs, or chat. Tee /
  Musty type it once into the Admin view's Operator access card; it stays on
  that device until cleared.
