# Giggit — Testing + Audit

**What this is:** the record of how Giggit is tested, what is tested, and the
proof that it was tested. Every Musty policy carries pass/fail test criteria.
Every dispute has a test scenario. Every known threat has a test. Evidence is
kept in the audit log so an auditor can verify every policy was tested, and
when.

**Companion documents:**
- `docs/giggit-testing-spec.md` — the authority: policy criteria P1–P16,
  dispute scenarios D1–D8, security chart T1–T12, audit format.
- `docs/reports/giggit-test-audit-log.md` — the audit trail. A run not in
  the log did not happen.
- `docs/VALIDATION_GUIDE.md` — how to run the suite.

---

## For the manager (Tee)

**The one-line version:** Giggit is tested the way a normal person would use
it — post a gig, get matched, accept, escrow, arrive, do the work, get paid —
plus the wrong turns (wrong code, no-show, dispute, bad input). If something
breaks, it breaks small and fixable, and the test suite catches it before it
reaches the live app.

**What the tests cover, in plain words:**

| Area | What it proves |
|---|---|
| The full job | A gig can go from post to paid, every step, in the right order. A step taken out of order is refused. |
| Every Musty policy | Each policy (ID checks, certs, budget or quote, bidding, EC$ money, escrow window, commission, closest-first matching, categories, Castries only, ratings, contacts, completion code) has one written pass/fail test. A policy with no test is unfinished. |
| Disputes | Work not done, no-show, damage, payment disagreement, and the other dispute paths are tested end to end. **One honest gap: there is no way to resolve a dispute yet (Decision Point 7).** A disputed gig is moved only by a deliberate, recorded operator edit, with Tee's word. Nothing is faked. |
| Security | The app is checked against a chart of known threats — strangers seeing phones, the completion code leaking, fake admin writes, bad input, dependency holes. See "For the owner" below. |

**How testing runs:** every code change goes branch → pull request → CI
runs the whole suite (13 stages) → staging proof → merge → auto-deploy.
Nothing goes straight to the live app. CI also runs a dependency audit that
blocks the build on any critical vulnerability — it caught one on the first
run of this build (a critical IP-spoofing hole in a dependency) and the fix
is recorded in the audit log.

**The oopsie bar:** code works; if it breaks, it breaks because of a small
mistake we can fix — not a mystery. The test suite exists so breakage is
caught early, in CI, before a gigger or a client ever sees it.

---

## For the owner (Musty — backend from the intake level)

You run the app from the Admin view. Here is what the tests mean for your
day-to-day, and what the security layer changes for you.

**Your admin controls, tested:**

- **Settings** (escrow window, commission, categories, SOS number) — saving
  them now needs the operator token. The first time you save a setting on a
  device, paste the token into the "Operator access" card in the Admin view.
  It stays on that device until you clear it. Without the token, the save is
  refused (401). Nobody else can change your settings from a browser.
- **Promos and SOS** — same token rule.
- **Contacts** — customer phones stay hidden until a gig is accepted, and
  then only to the two people on the job (or to you, as admin). A stranger
  asking for a gig's details sees no phone numbers. This is tested (P15).
- **Completion code** — the customer gets the code when they post the gig.
  They give it to the Gigger at the door; the Gigger enters it to mark the
  job done. The code is never shown to the Gigger through the app, and never
  in a list. Tested (P16).
- **Escrow** — simulated for now (pretend money in the January test phase).
  Real money rails are a separate decision, not part of this build.
- **Disputes** — a client or a Gigger can open a dispute; the gig freezes
  (no release, no completion while disputed). Resolving a dispute is not
  built yet — that is Decision Point 7, and it needs your decision with Tee
  on who resolves and what the outcomes are.

**The security chart (threat → protection → test):**

| Threat | Protection | Test |
|---|---|---|
| Stranger changes settings/promos | Operator token on admin writes | T1 |
| Stranger sees customer phones | Contacts only to the two parties or admin | T2, P15 |
| Gigger (or anyone) learns the completion code | Code only to the posting customer or admin, never in lists | T3, P16 |
| Fake form input / scripts in gig text | Input is cleaned on save; output is escaped on render | T4 |
| Browser tricks (clickjacking, MIME sniffing) | Security headers on every response | T5 |
| Silent failures (bad data file, missing keys) | Loud warnings in the server log | T6 |
| A flood of writes | 30 writes a minute per address, then 429 | T7 |
| A flood of reads | Read endpoints are public by design; no throttle (monitored) | T8 |
| A hole in a dependency | `npm audit` in CI blocks the build on any critical | T9 |
| Forged admin request from another site | Same-origin form shape; admin writes need the token | T10 |
| Data file corruption | Corrupt file falls back to seed with a loud warning | T11 |
| Fake admin write via form data | Admin writes need the token, any content type | T12 |

**Deferred, with the reason (not built in this build):** full accounts and
login (public-launch step); real-money rails (no processor); SMS
notifications (no gateway); live GPS tracking (policy + consent); a strict
Content-Security-Policy (needs a whole-portal inline-script audit — V2);
the community fund (step 15, not built, optional).

**What you need from Tee:** the operator token is on the server
(`/etc/taig/giggit-admin-token`). Tee holds it. Ask him for it when you
first save a setting, and keep it like a password — do not share it in a
chat.

---

## For the gigger

**What the tests prove about your experience:**

- You see gigs closest to you first, and only gigs in Castries.
- When you accept a gig, you get the customer's phone number — not before.
- You can only accept a gig that is open and in your ring; a gig that is
  already taken, or one you are too far from, is refused with a plain
  message.
- You tap "arrived", then "started", then "mark done". Each step only works
  after the one before it.
- When you mark a job done, the customer enters their completion code. That
  code is theirs — you do not see it in the app. If the code is wrong, the
  job is not marked done.
- Your pay: the escrow is released to you when the job is completed. The
  commission is 15% normally, 10% once you have done 20 gigs in a month,
  5% if you are Pro. The test suite checks the maths.
- If something goes wrong — the client is not there, the work cannot be
  done, the client disagrees about payment — you can open a dispute, and
  the gig freezes until it is sorted. (How a dispute gets resolved is still
  being decided — that is the one open gap.)
- Your rating: the client rates you once, after the job. A rating under 3
  needs a comment, so a bad score always comes with a reason.

---

## For the client

**What the tests prove about your experience:**

- You post a gig with a budget or a quote, in EC$ (US$ is shown at the
  EC$2.70 peg). You pick a Gigger from the bids, or take a fixed price.
- Your phone number is hidden until you accept a Gigger — and then only
  that Gigger sees it.
- You get a completion code when you post. Keep it: you give it to the
  Gigger at the door, and they enter it to mark the job done. Nobody else
  can see the code.
- The money sits in escrow until the job is done. (Pretend money in the
  January test phase; real money is a later decision.)
- If the work is not done, the Gigger does not show, or something is
  damaged, you can open a dispute and the payment freezes. (How a dispute
  gets resolved is still being decided — that is the one open gap.)
- You rate the Gigger once, after the job. A rating under 3 needs a
  comment, so a low score always comes with a reason.

---

## For the engineer (redo-docs)

**Run it:** `npm run validate:all` (13 stages). Giggit suites:
`npm run giggit:smoke` (port 3102), `npm run giggit:policy` (3103),
`npm run giggit:dispute` (3104), `npm run giggit:security` (3105).
Each suite spawns an isolated server via `scripts/lib/test-server.js`,
backs up and restores `nebula_local/`, and writes a per-check JSON report to
`ci-reports/giggit-<suite>.json`.

**Test mode:** `GIGGIT_TEST_MODE=1` (set only by the test helpers, for the
server they spawn) raises the write throttle to 1000/min. Production stays
at 30/min. Never set it in production.

**Operator token:** `GIGGIT_ADMIN_TOKEN` env. When set, `requireAdmin`
gates PUT settings, POST promos, PUT gig (admin edit), POST push/test, and
the `?contacts=1` lane. When unset, open as before plus a loud startup
warning. `deploy-watch.sh` reads it from `/etc/taig/giggit-admin-token`
(env override `GIGGIT_ADMIN_TOKEN_FILE`) and passes `-e
GIGGIT_ADMIN_TOKEN=…` to staging, live, and both rollback runs. The token
value is never logged.

**Completion code:** `publicGig` includes the code only with
`opts.showCode`. Lists never carry it. `getGig(id, opts)` returns contacts
only to a party (matching `?customerPhone=` or `?giggerId=`) after accept,
or to the admin lane; the code only to the posting customer or admin —
never the Gigger.

**Headers:** `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy:
strict-origin-when-cross-origin`, set in `src/app.js` before
`express.static`.

**Audit:** `docs/reports/giggit-test-audit-log.md` is the durable record.
CI artifacts expire in 14/30 days; the log does not. Record every verified
run there: date, who, commit, scope, per-suite results, known gaps.

**Known gaps (do not paper over):** D7 dispute resolve (DP7) — no resolve
path; T9 runs for real only in CI (registry blocked on the build machine);
the two dead ends still stand (a gig whose client never enters the code
waits at `completion_requested` forever; a disputed gig stays disputed
forever — both are decisions, not bugs to patch quietly).

**Dependency fix (Nov 26):** CI's first run of T9 caught critical 1 /
high 2 / moderate 1 (proxy-addr 9.1, body-parser, brace-expansion, qs).
Fixed by `npm audit fix` + express `^4.21.2` → `^4.22.3` (pins qs
6.16.2). Post-fix audit: 0 vulnerabilities. Full suite re-run green.
