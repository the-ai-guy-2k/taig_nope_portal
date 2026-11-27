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
- **Commit:** branch `testing/giggit-testing-audit`, merged as PR #6, merge commit `b757779` (2026-11-27 03:10:29Z).
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

### CI run — same day, PR #6 (GitHub Actions)

The local run passed T9 only because this build machine cannot reach the
npm registry — the test records that and passes. CI has registry access and
ran the audit for real. **It failed the build, exactly as designed:**

- **critical 1** — `proxy-addr` (CVSS 9.1, GHSA-jqcg-44mw-7w3h): IP
  spoofing via IPv4-mapped IPv6 trust subnet. Transitive via express.
- **high 2** — `body-parser` (DoS via trailing bytes after a compressed
  body, GHSA-27r3-jxmh-p828) and `brace-expansion` (several DoS issues).
- **moderate 1** — `qs` (DoS, fixed in 6.16.0).

Fix, done the same day on a temp clone on the Droplet (registry reachable
there — the build machine's registry is blocked):

- `npm audit fix --omit=dev` cleared the critical and both highs.
- `npm install express@^4.22.3` (one line in `package.json`, `^4.21.2` →
  `^4.22.3`) cleared the qs moderate — express 4.22.3 pins qs 6.16.2.
- Post-fix audit: **0 vulnerabilities** (critical 0, high 0, moderate 0).
- Lockfile now: express 4.22.3, qs 6.16.2, body-parser 1.20.9,
  proxy-addr 2.0.8, brace-expansion 2.1.8.
- Full `npm run validate:all` re-run locally after the bump: **13 stages,
  all green** (smoke 20/20, policy 16/16, dispute 8/8 + D7 gap, security
  11/11, existing 9 stages unchanged). The express bump is a minor version
  and the suite is the proof it broke nothing.

This is the T9 control working as written: a critical dependency
vulnerability blocked the build until it was fixed, and the fix is recorded
here with the versions.

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

## 2026-11-26 — Manual security review (Uber-level, Tee's word)

- **Runner:** builder, Giggit testing + audit build (Tee's scope update,
  Nov 26, ~22:15 ET: security in this build, Uber-level, done the manual
  way like a team of coders — policies, best practice, human review — and
  documented so the level of security is proved, not claimed).
- **Commit:** branch `security/giggit-manual-review`, merged as PR #7, merge commit `eca9a57` (2026-11-27 03:36:51Z).
- **Scope:** a human read of every Giggit route and every store function,
  looking for what the automated suites cannot see: who can do what to
  whom, and what the code trusts without checking.

### Findings (all fixed in this branch, all tested)

| Finding | What was open | Fix | Test |
|---|---|---|---|
| R1 | `by=admin` read any gig's chat, no token check | Routes pass the real admin check into the chat party check | T15 |
| R2 | Anyone could dispute any completed gig | Proof-of-party on dispute (customer phone / gigger id) | T16 |
| R3 | Anyone could cancel any open/accepted gig | Proof-of-party on cancel | T17 |
| R4 | Anyone could rate any released gig | Proof-of-party on rate | T17 |
| R5 | Anyone could pick a quote (sets price + accepts) | Quote-pick requires the posting customer's phone | T18 |
| R6 | Any caller could read any Gigger's wallet | Wallet route requires the operator token | T14 |
| R7 | Profile bio/gallery writes unauthenticated | The three profile-write routes require the operator token | T13 |

### Verified clean in the same read (no change, recorded)

Mass assignment (validators allowlist fields; extra body fields dropped);
completion code (accept-time generation, customer/admin only, never in
lists, never to the Gigger); contacts (party-only after accept, admin lane
token-gated); accept/start/arrived/request-complete (assigned-Gigger check
enforced in the store); photos (type + 2 MB + max 6, server-side);
inputs (tags/control chars stripped, money capped at EC$10,000, coords
range-checked); settings read public by design; events/stats aggregates
with no PII.

### Known limitations (no accounts yet — cannot be fixed at this stage)

- **L1 — Gigger identity is bearer:** anyone who knows a giggerId can act
  as that Gigger. Mitigations: ring + skill checks bind accepts; the
  accepted Gigger's real phone is shown to the customer, so impersonation
  surfaces on first contact. Fixed properly by accounts/login (V2).
- **L2 — Push subscriptions are caller-asserted:** anyone can subscribe a
  victim's giggerId with their own endpoint and receive that Gigger's push
  titles (titles + prices only). Fixed by accounts (V2).
- **L3 — The customer proves themselves by phone number:** anyone who
  knows a customer's phone can act as them. That is the MVP's identity
  model; fixed by accounts (V2).

### Results — full `npm run validate:all` (13 stages), local

| Suite | Result |
|-------|--------|
| smoke | 20 passed / 0 failed |
| policy | 16 passed / 0 failed |
| dispute | 8 passed / 0 failed, 1 known gap (D7) |
| security | **17 passed / 0 failed** (was 11 — T13–T18 added) |
| Existing 9 stages | all passed — no regressions |

Count note (so the 17 vs T1–T18 is not misread): the 17 security checks
are 1 setup check + 16 T-checks (T1–T9, T12–T18). T10 (VAPID key file
never committed; a missing file logged loudly on generation) is asserted
inside the T6 check — the store's warning lines include VAPID generation,
and `.gitignore` includes `nebula_local/`. T11 (the two dead ends) is not
a runnable security check by design — it is a decision (DP5, DP7),
recorded by dispute test D7.

### Pipeline bug found by this build (fixed in the same branch)

While verifying the PR #6 deploy, the live Droplet's disk was found 100%
full (58G used, 359M free; 131 dangling Docker images from months of
builds). `docker image prune -f` freed it to 35% used / 38G free — the
prune only removes untagged images no container uses; no live image was
touched.

The first auto-deploy of PR #6 then failed on the full disk, and the
watcher would not retry it on its own (it compares remote main with the
local checkout, and the failed run had already pulled). The checkout was
rewound one commit so the watcher would see new main again — and the
03:24 tick deployed b757779 cleanly (staging healthy, then live healthy).

That exposed a second, worse bug — **in the PR #6 version of
`scripts/deploy-watch.sh` itself**: the token block I added calls `log`
(lines 27–28) *before* `log()` is defined (line 32), so every watcher
tick since the merge died at line 27 with `log: command not found` and
exited 0 — silently doing nothing. The 03:12 deploy only worked because
it ran the pre-merge script; the 03:24 deploy only worked because the
rewind had restored the pre-merge script. Fixed in this branch: `log()`
moved above the token block (line 18, before its first use at line 29),
syntax-checked. Until this branch merges, the timer is a no-op — the
merge deploy is run by hand with the fixed script (same script, same
staging-first checks, recorded here), after which the timer is live
again.

Lesson recorded: the watcher needs its own smoke test — a run that proves
the script at least reaches the remote/local comparison. That check is
now part of the release checklist in the GVCA artifact.

### PR #7 — CI, staging proof, merge, deploy (2026-11-27)

- **CI on head `91f93f8`:** Validation + Smoke Tests pass, Docker Build
  pass, Pipeline Report pass.
- **Staging proof v3 (public staging URL, pr7 image, token active): 46
  passed / 0 failed.** Re-proved the PR #6 controls on the new image
  (headers, settings 401 without the token, no completion codes in lists
  / stranger detail / accept response, code to the posting customer only
  after accept, contacts=1 gated by the operator token) plus the new
  T13–T18 checks: profile bio/gallery writes 401 without the token and
  working with it, wallet 401/200, chat `by=admin` 400/200, dispute /
  cancel / rate refused without proof and with the wrong phone and
  landing with the right phone, quote-pick the same. Two probe lessons:
  the first v3 run's T18 section failed because the probe made 31 writes
  in under a minute from one address and tripped the write throttle (T7
  working as designed) — the probe now runs in three windows separated
  by 70-second sleeps; a second run tripped the same throttle at its
  first write because the previous run's writes were still inside the
  60-second window.
- **Merge:** PR #7 merged 2026-11-27 03:36:51Z → main `eca9a57`.
- **Deploy:** the fixed watcher script was run by hand once on the
  Droplet (the timer was a no-op until this deploy — see the pipeline bug
  above). `2026-11-27T03:37:55Z Deployed eca9a57 — staging OK, live OK`.
  The hand-run itself printed one `log: command not found` line — it ran
  the pre-merge script text (loaded before the pull); the token block's
  assignment still ran, the token was passed, and the deploy completed.
  The live checkout is now at `eca9a57`, so the timer's next tick runs
  the fixed script (`log()` at line 18).
- **Live verification of PR #7 (2026-11-27 ~03:38 UTC):** live container
  carries `GIGGIT_ADMIN_TOKEN` (env confirmed); no "not set" warning in
  live logs; **PUT settings without the token now returns 401 — the PR
  #6 caveat is closed**; the dispute window is unchanged at 60; headers
  all present; live gig list has no completion code. Disk 38% used / 36G
  free after the deploy.

### Live verification of PR #6 (b757779) — 2026-11-27 ~03:25 UTC

- Headers on `https://taigtsp.duckdns.org/giggit/`: nosniff, SAMEORIGIN,
  Referrer-Policy — all present.
- Live gig list carries no `completionCode`.
- Live `giggit.js` contains the admin-token header code.
- **PUT settings without the token returned 200, not 401.** Diagnosis:
  the 03:24 deploy ran the pre-merge watcher script, which has no token
  code — so the live (and staging) containers started with no
  `GIGGIT_ADMIN_TOKEN`. The code did its designed job and logged the loud
  warning (`GIGGIT_ADMIN_TOKEN is not set — admin writes ... are open`).
  The token is injected by the fixed watcher script in PR #7; until it
  merges and deploys, admin writes on live are open (pre-public app, Jan
  test phase only — no public users).
- The probe itself changed a live setting (`disputeWindowMinutes` 60 →
  120) and it was **reverted to 60 immediately** and verified back at 60.
