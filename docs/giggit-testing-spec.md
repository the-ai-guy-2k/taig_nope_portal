# Giggit — Testing & Audit Spec

Source of truth for what "tested" means on Giggit. Written Nov 26, 2026, in the
testing + audit build (Tee's direction: build and test like a normal human
being would, using human logic; test every code; once a module tests good, add
the appropriate level of security; keep a security chart against known threats
and test against it; if it breaks, it breaks as an oopsie — small and fixable.
This WILL be audited, so evidence is kept.)

The test scripts in `scripts/giggit-*.js` implement this spec. The spec is the
authority; if a script and this spec disagree, the spec wins and the script
gets fixed.

## 0. Baseline — what testing existed before this build (verified Nov 26, 2026)

- CI (`.github/workflows/ci.yml`): structure + `validate:all` + Docker build +
  container runtime + Docker Hub publish (deployable only) + pull validation.
  Reports kept as artifacts 14/30 days — too short for audit.
- `validate-all.js` runs 9 stages. **All 9 test the NOPE portal's Job Order /
  operator system. None touches a Giggit endpoint.** `smoke-tests.js` and
  `validate-operational.js` are Job Order / operator-action tests.
- `audit-routes.js` exists but is NOT in the `validate-all` suite.
- Gap-close build (Nov 26/27, GVCA v8): slice-by-slice local tests + 15/16 live
  checks, then test data cleaned out. One-off verification — no repeatable
  script was left behind.
- Jan test plan: manual phone testing by Tee + Musty, 4 phases, pretend money.
  Phase 1 (Musty on the app) due Dec 4, 2026. Human testing, not automated.
- No policy test criteria existed. No dispute tests existed. No security
  tests existed. No audit trail existed.

## 1. Policy test criteria — every Musty policy, pass / fail

Each policy is a rule Musty set. A policy with no passing test is unfinished.

| ID | Policy (Musty's rule) | Where it lives | PASS when | FAIL when |
|----|------------------------|----------------|-----------|-----------|
| P1 | ID verification Level 1: ID type + number recorded at registration, not checked against any registry | `validateGigger` / `createGigger` | Registration requires one of National ID / Driver's Licence / Passport + a number of 4+ chars; the number is stored but never appears in any public API output | Any other ID type is accepted; a short/missing number is accepted; the ID number leaks in `GET /giggers`, `GET /giggers/:id`, or a gig response |
| P2 | Certifications optional, self-declared, max 6, shown as typed; they do NOT verify a Gigger | `validateGigger` | A Gigger with no certs registers fine; certs show on the profile exactly as typed; certs never change matching or accept | A cert is required; more than 6 are kept; a cert changes who can accept a gig |
| P3 | Pricing is budget OR quote — two paths, no third | `validateGig` / `createGig` | A budget gig needs a price over 0; a quote gig has no price until a quote is accepted; a quote gig refuses direct accept; a budget gig refuses quotes | Either path accepts the other's action; a third pricing mode is accepted |
| P4 | Bidding: Giggers quote, client picks, the pick sets the price and accepts in one move | `submitQuote` / `acceptQuote` | A quote is recorded per Gigger (re-quote replaces); the client's pick sets priceEC and accepts; escrow holds at the picked price | A Gigger can quote twice and keep both; a pick does not set the price; a pick does not accept |
| P5 | Currency: EC$ is canonical; US$ converts at the EC$2.70 peg; both the original currency and amount are kept | `validateGig` / `xcdToUsd` | A US$ post stores postedIn USD + postedAmount + the EC$ conversion at 2.70; priceUSD on output matches the peg | The conversion uses any other rate; the original amount is lost; EC$ and US$ disagree on the same gig |
| P6 | Escrow hold window: default 60 minutes, settable 60–1440 (1 hour–1 day), one global setting | `updateSettings` / `confirmComplete` | Default is 60; a PUT inside 60–1440 sticks; a PUT outside is refused with a plain error; releaseAt = completedAt + window | The default is not 60; an out-of-range window sticks; releaseAt ignores the window |
| P7 | GPS / ID / cameras are policy-gated: location is a one-time fix only, no live tracking, no cameras | `captureLocation` / store | Posting/registration take at most one GPS fix; no `watchPosition`, no live location update, no arrival-by-GPS, no camera field exists in the gig or Gigger | Any live-location or camera path exists in code or API |
| P8 | Commission tiers: 15% standard, 10% at 20+ released gigs in the calendar month, 5% Giggit Pro | `commissionRateFor` / `sweepReleases` | A first gig releases at 15%; the 21st released gig in a month releases at 10%; a Pro Gigger releases at 5%; payout = price − fee, rounded to the cent; two ledger entries (release + fee) | Any tier computes wrong; the fee is charged on the pre-discount price; the split is missing an entry |
| P9 | Matching: closest first (real GPS distance, then same area, then same parish, then no location); ring-gated 3, then 6, then all; rings widen every 2 minutes | `rankMatches` / `currentRing` / `acceptGig` | The match list is ordered closest-first by the stated order; a Gigger outside the current ring is refused with the plain ring message; the ring widens on the 2-minute clock | The order is wrong; an out-of-ring Gigger can accept; the ring never widens |
| P10 | Categories: 12 named, 4 slots held open — names owed by Musty | `CATEGORIES` | The meta lists exactly the 12 named categories; a gig in any of the 12 posts; a gig in any other category is refused | A 13th category posts; the list and the code disagree |
| P11 | Pilot parish: Castries only | `validateGig` / `validateGigger` | A Castries gig and a Castries Gigger register; any other parish is refused with the plain Castries message | Another parish posts or registers |
| P12 | Ops targets (Musty's bar, carried in `getStats`): accept within 30 min over 85%, completion over 95%, onboarding under 48 hours, disputes under 24 hours, payment under 2 days | `getStats` | The stats endpoint reports the targets and computes the underlying numbers from real data (median seconds to first accept, completion rate, disputed count) | The targets are missing from the response; a computed number is wrong against the data it claims to summarise |
| P13 | Ratings: 1–5 stars, once per side, under 3 stars needs a comment; a client's rating rolls up to the Gigger's average; a Gigger's rating of a client is recorded but rolls up to nothing | `rateGig` | Both sides can rate a released gig once each; a second rating is refused; under-3 without a comment is refused; a client rating moves ratingAvg/ratingCount/gigsCompleted; a Gigger rating is stored on the gig and in the ratings collection | A second rating lands; a rating lands before release; a Gigger rating creates a client score |
| P14 | Dispute: either side may dispute a completed gig inside its window; escrow freezes; no resolve path exists yet (Decision Point 7) | `disputeGig` | See Section 2 — dispute scenarios are tested separately | — |
| P15 | Contacts hidden until accept; the admin lane sees them with `?contacts=1` | `publicGig` / `getGig` / `listGigs` | An open gig shows no phone numbers to anyone; after accept both sides see each other; `?contacts=1` is admin-token gated (see Section 3, C1) | Any phone number appears on an open gig; `?contacts=1` works without the admin token once C1 is live |
| P16 | Completion code: 6 digits, made at accept, client enters it to confirm | `holdEscrow` / `confirmComplete` / `publicGig` | The code is 6 digits; a wrong code is refused; the right code completes the gig and starts the release clock; the code appears only to a party or the admin token (see Section 3, C2) | A wrong code completes a gig; the code appears in a list response or to a stranger |

## 2. Dispute scenarios

Dispute-open is built. Dispute-resolve is NOT built (Decision Point 7 — who
resolves, and what outcomes exist, is still Tee + Musty's decision). The tests
prove the open/freeze behaviour and record the missing resolve as a known gap —
they never fake a resolve.

| ID | Scenario | Expected result |
|----|----------|-----------------|
| D1 | Dispute a completed gig inside the window (customer) | Status `disputed`; escrow status `frozen`; the release sweep does not release it after the window passes; a `dispute_opened` event is logged |
| D2 | Dispute a completed gig inside the window (Gigger) | Same as D1, `by` = gigger |
| D3 | Dispute after the window has passed (releaseAt gone by) | Refused with a plain error; gig is `released`, not disputed |
| D4 | Dispute a gig that is not completed (open / accepted / in_progress / completion_requested) | Refused with a plain error in every state |
| D5 | Dispute the same gig twice | Second dispute refused with a plain error |
| D6 | A disputed gig's money | No release ledger entry and no fee entry appear for it, ever, until a resolve path exists; the held amount stays held |
| D7 | Resolve a disputed gig | **NOT BUILT — expected gap.** No resolve function, endpoint, or screen exists. The test records this as a known gap, not a pass and not a failure. Moving a disputed gig today is a deliberate, recorded operator edit of the data file, only with Tee's word. |
| D8 | The window itself | Set the window to 60, confirm releaseAt = completedAt + 60 min; set it to 1440, confirm +1440 min; set it to 30 or 2000, confirm refusal |

## 3. Security chart — known threats, controls, tests

"Appropriate level" for this stage: pretend money, two known testers, no
public launch. The controls below are what a careful team of coders would do
at this stage — policies, best practice, human review — with documentation
proving each control is in place. Full accounts/login is the public-launch
step, not this build.

| ID | Known threat | Exposure today (verified) | Control in THIS build | Test |
|----|--------------|---------------------------|------------------------|------|
| T1 | Anyone on the internet can change Giggit settings (USD rate, dispute window, SOS number) — `PUT /api/giggit/settings` has no auth | Verified: open, validated ranges only | C1 — operator token. `GIGGIT_ADMIN_TOKEN` env; when set, admin writes require header `x-giggit-admin-token`. When unset, endpoints stay open for local dev AND the server logs a loud startup warning | Security test: PUT settings without the token → 401 when the token is set; with the token → 200. Live/staging audit checks the token is active |
| T2 | Anyone can read phone numbers off open gigs with `?contacts=1` | Verified: `listGigs` / `getGig` honour `?contacts=1` with no auth | C1 — same operator token gates `?contacts=1` | Security test: open-gig list/detail with `?contacts=1` and no token → no phone numbers; with the token → numbers present |
| T3 | Anyone can read a gig's completion code and confirm a job they never saw | Verified: `publicGig` includes `completionCode` for any caller while the gig is accepted / in_progress / completion_requested | C2 — the code leaves list responses entirely; the detail endpoint includes it only for a party (matching customer phone or the accepted Gigger's id) or the admin token | Security test: stranger detail fetch → no code; party detail fetch → code present; wrong code → refused |
| T4 | Cross-site script injection through user text (gig titles, descriptions, bios, chat) rendered in the app | Front end has `esc()` and a scan finds no unescaped `${}` in `innerHTML` templates — but that was a hand check, not a test. Verified in this build: `cleanText()` also strips HTML tags at the door, so stored text carries no markup at all | C3 — the escaping rule becomes a test, not a habit: the security script statically scans `giggit.js` for every `innerHTML` assignment and fails if any interpolated value is not passed through `esc()`; plus a live probe post with a script payload and confirms no markup survives in storage | Security test: static scan passes; live probe gig stores the payload as plain text |
| T5 | Missing security headers on the portal (clickjacking, MIME sniffing) | Verified: `app.js` sets no security headers | C4 — `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` on every portal response | Security test: `GET /giggit/` returns all three headers |
| T6 | Silent data loss: the store falls back to seed data if the live file cannot be read, with no error anywhere | Verified in the engine doc (Nov 24) | C5 — loud logging: the fallback logs a warning line with the reason; the events-cap drop (500) is counted and logged; the wallet returns the LAST 50 entries, newest first, instead of the first 50 oldest-first | Security/policy test: fallback path logs; wallet order is newest-first |
| T7 | Flood the API with writes (spam gigs, spam chat, spam ratings) | Partly covered: 30 POST/PUT per minute per IP → 429 (`throttleWrites`) | Keep the throttle; test it: 31 rapid writes from one client → the 31st is 429 with the plain message | Security test: throttle trips at 31 |
| T8 | Bad input crashes or corrupts the store (huge text, bad types, bad photo) | Validated per field (title ≤120, description 20–2000, bio ≤500, chat 1–1000, photo ≤2 MB JPEG/PNG/WebP, promo 5–50%) | Keep the validators; negative-test every guard in the policy + security scripts | Policy/security tests: every bad input is a 400 with a plain-words message |
| T9 | Vulnerable dependencies | Deps: ejs, express 4.21.2, maxmind, sql.js, web-push | C6 — `npm audit` (production) runs in this build; the result is recorded here; anything critical that is a one-line bump gets fixed, anything else gets recorded with a reason | Security test: audit report recorded in the audit log |
| T10 | Push subscriptions orphaned if the VAPID key file is deleted | Verified in the engine doc: fresh keys are generated silently and every old subscription stops working | Document + test: the key file is never committed (gitignored), and a missing key file is logged loudly on generation instead of silently | Security test: VAPID path is gitignored; generation logs |
| T11 | Disputed / never-verified gigs stuck forever (the two dead ends) | Verified: no resolve path; no timeout on `completion_requested` | No code change in this build — this is a decision (DP5, DP7), not a bug to patch quietly. Recorded in Section 2 (D7) and in the audit log | Dispute test D7 records the gap |
| T12 | Cross-site request forgery on state-changing writes | No auth today, so no session to hijack; after C1, admin writes need a custom header, which a cross-origin form cannot set without a preflight the server does not grant | C1's header token is the control for admin writes. Non-admin writes (post, accept, rate) stay open by design at this stage — pretend money, known testers — and are recorded here as an accepted risk until accounts exist | Security test: admin write with no token → 401; admin write from a cross-origin form shape (no custom header) → 401 |

Deferred with a reason (not in this build): full accounts/login and per-user
permissions (public-launch step); real-money rails (blocked — no processor);
SMS notifications (blocked — no gateway); live GPS tracking (blocked — policy
+ consent); dispute resolve (DP7 — needs Tee + Musty's decision); a strict
Content-Security-Policy (needs an inline-script audit across the whole portal,
not just Giggit — V2); the community fund (step 15, not built, optional).

## 4. Human-logic testing — how the scripts test

The scripts test the way a normal human being would use the app, not just the
way a machine would:

- **The full loop, as a person:** post a gig → find the closest Gigger → accept
  → escrow held → arrive → start → mark done → client enters the code →
  release after the window → both sides rate. Every step is checked the way a
  person would check it: the screen state, the numbers, and the other side's
  view — not just a 200.
- **The wrong turns a person makes:** wrong code, accept out of ring, quote a
  budget gig, accept a quote gig directly, rate twice, rate before release,
  dispute too late, post with a 3-character description, register outside
  Castries. Every one must fail with a plain-words reason, never a crash.
- **The oopsie bar:** if the code breaks, it breaks as an oopsie — a small,
  fixable mistake. A test failure names the exact step, the exact input, and
  the exact expected-vs-actual, so the fix is obvious. No mystery breakage.

## 5. Audit trail

Every verified test run is recorded in `docs/reports/giggit-test-audit-log.md`:
date, who ran it, commit, scope, each script's result, and any known gaps
(D7 and the deferred list). CI artifacts are 14/30-day only; the committed
log and the GVCA artifact are the durable audit record. A run that is not in
the log did not happen.
