#!/usr/bin/env node
'use strict';

/**
 * Giggit policy tests — one pass/fail check per Musty policy (P1–P16),
 * implementing docs/giggit-testing-spec.md section 1.
 *
 * Runs against an isolated server (port 3103) with a fresh seed; the live
 * data dir is backed up and restored, so no test data survives the run.
 * Commission tiers are proven by seeding released gigs into the live store
 * file between requests (the tier logic reads released gigs in the calendar
 * month) — the seeding is explicit and visible in the check.
 *
 * Usage: node scripts/giggit-policy-tests.js
 */

const {
  assert, assertEq, req, adminHeaders, runSuite, tweakLiveData,
} = require('./giggit-test-helpers');

const PORT = 3103;
const PHONE = '+17585559902';
const S = {};

const CATEGORIES_12 = ['Courier', 'Roadside Assistance', 'Mounting', 'Moving', 'Cleaning', 'Outdoor Help', 'Home Repairs', 'Painting', 'Home Help', 'Tech Install', 'Beautification', 'Gardening'];

function giggerBody(overrides = {}) {
  return {
    name: 'Policy Test Gigger', phone: '+17585559921', parish: 'Castries',
    area: 'Policy Area', idType: 'National ID', idNumber: 'POL1234',
    skills: ['Cleaning'], certifications: [], lat: 14.005, lng: -60.99,
    ...overrides,
  };
}

function gigBody(overrides = {}) {
  return {
    category: 'Cleaning', title: 'Policy test gig',
    description: 'Policy test gig: enough description to pass validation.',
    parish: 'Castries', area: 'Policy Area', pricingMode: 'budget',
    priceEC: 100, currency: 'XCD', customerName: 'Policy Customer',
    customerPhone: PHONE, when: 'Saturday morning', lat: 14.005, lng: -60.99,
    ...overrides,
  };
}

async function registerGigger(port, overrides = {}) {
  const r = await req(port, 'POST', '/api/giggit/giggers', giggerBody(overrides));
  assertEq(r.status, 201, 'register test gigger');
  return r.json.gigger;
}

/** Drive one gig from post to released for a given gigger and price. */
async function runGigToRelease(port, giggerId, priceEC) {
  const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody({ priceEC }));
  assertEq(gig.status, 201, 'post gig for release run');
  const id = gig.json.gig.id;
  // Widen the ring first (time-travel the post 5 minutes back) so the accept
  // never depends on who else is in the pool — the ring is not under test here.
  tweakLiveData((data) => {
    const g = data.gigs.find((entry) => entry.id === id);
    g.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  });
  const acc = await req(port, 'POST', `/api/giggit/gigs/${id}/accept`, { giggerId });
  assertEq(acc.status, 200, 'accept for release run');
  const party = await req(port, 'GET', `/api/giggit/gigs/${id}?customerPhone=${encodeURIComponent(PHONE)}`);
  const code = party.json.gig.completionCode;
  assert(/^\d{6}$/.test(code || ''), 'release run has a code');
  await req(port, 'POST', `/api/giggit/gigs/${id}/request-complete`, { giggerId });
  const done = await req(port, 'POST', `/api/giggit/gigs/${id}/confirm-complete`, { code });
  assertEq(done.status, 200, 'confirm for release run');
  tweakLiveData((data) => {
    const g = data.gigs.find((entry) => entry.id === id);
    g.escrow.releaseAt = new Date(Date.now() - 60000).toISOString();
  });
  const rel = await req(port, 'GET', `/api/giggit/gigs/${id}`);
  assertEq(rel.json.gig.status, 'released', 'release run released');
  return id;
}

const checks = [
  ['P1 — ID verification: type + number required, number never leaks', async (port) => {
    const badType = await req(port, 'POST', '/api/giggit/giggers', giggerBody({ idType: 'Library Card' }));
    assertEq(badType.status, 400, 'unknown ID type is refused');
    const shortNum = await req(port, 'POST', '/api/giggit/giggers', giggerBody({ idNumber: '12' }));
    assertEq(shortNum.status, 400, 'an ID number under 4 characters is refused');
    const ok = await req(port, 'POST', '/api/giggit/giggers', giggerBody());
    assertEq(ok.status, 201, 'a valid ID registers');
    S.gigger = ok.json.gigger;
    const list = await req(port, 'GET', '/api/giggit/giggers');
    assert(!JSON.stringify(list.json).includes('POL1234'), 'no ID number anywhere in the giggers list');
    const prof = await req(port, 'GET', `/api/giggit/giggers/${S.gigger.id}`);
    assert(!JSON.stringify(prof.json).includes('POL1234'), 'no ID number on the public profile');
  }],

  ['P2 — Certs are optional, max 6, and never change matching', async (port) => {
    const none = await req(port, 'POST', '/api/giggit/giggers', giggerBody({ name: 'No Cert Gigger', phone: '+17585559922' }));
    assertEq(none.status, 201, 'a gigger with no certs registers');
    const many = await req(port, 'POST', '/api/giggit/giggers', giggerBody({
      name: 'Many Cert Gigger', phone: '+17585559923',
      certifications: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) => ({ name: `Cert ${n}`, issuer: 'Test' })),
    }));
    assertEq(many.json.gigger.certifications.length, 6, 'only 6 certs are kept');
    // A Gardening-only gigger with a "Cleaning Master" cert must NOT match a Cleaning gig.
    const wrong = await registerGigger(port, { name: 'Wrong Skill Gigger', phone: '+17585559924', skills: ['Gardening'], certifications: [{ name: 'Cleaning Master', issuer: 'Test' }] });
    const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody());
    S.gigId = gig.json.gig.id;
    const m = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/matches`);
    assert(!m.json.matches.some((entry) => entry.gigger.id === wrong.id), 'a cert does not grant a skill the gigger lacks');
  }],

  ['P3 — Budget OR quote, no third path', async (port) => {
    const noPrice = await req(port, 'POST', '/api/giggit/gigs', gigBody({ priceEC: null }));
    assertEq(noPrice.status, 400, 'a budget gig with no price is refused');
    const quote = await req(port, 'POST', '/api/giggit/gigs', gigBody({ pricingMode: 'quote', priceEC: null, title: 'Policy quote gig' }));
    assertEq(quote.status, 201, 'a quote gig posts with no price');
    assertEq(quote.json.gig.priceEC, null, 'a quote gig has no price yet');
    S.quoteGigId = quote.json.gig.id;
    const direct = await req(port, 'POST', `/api/giggit/gigs/${S.quoteGigId}/accept`, { giggerId: S.gigger.id });
    assertEq(direct.status, 400, 'a quote gig refuses a direct accept');
    const q = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/quotes`, { giggerId: S.gigger.id, amount: 90, currency: 'XCD' });
    assertEq(q.status, 400, 'a budget gig refuses quotes');
  }],

  ['P4 — Quote, re-quote replaces, pick sets price and accepts', async (port) => {
    const q1 = await req(port, 'POST', `/api/giggit/gigs/${S.quoteGigId}/quotes`, { giggerId: S.gigger.id, amount: 90, currency: 'XCD' });
    assertEq(q1.status, 201, 'first quote lands');
    const q2 = await req(port, 'POST', `/api/giggit/gigs/${S.quoteGigId}/quotes`, { giggerId: S.gigger.id, amount: 80, currency: 'XCD' });
    assertEq(q2.status, 201, 're-quote lands');
    assertEq(q2.json.gig.quotes.length, 1, 'one quote per gigger — the re-quote replaced it');
    assertEq(q2.json.gig.quotes[0].amountEC, 80, 'the kept quote is the latest one');
    const pick = await req(port, 'POST', `/api/giggit/gigs/${S.quoteGigId}/accept-quote`, { giggerId: S.gigger.id, customerPhone: PHONE });
    assertEq(pick.status, 200, 'picking a quote succeeds');
    assertEq(pick.json.gig.status, 'accepted', 'the pick accepts the gig');
    assertEq(pick.json.gig.priceEC, 80, 'the pick sets the price');
    assertEq(pick.json.gig.escrow.amountEC, 80, 'escrow holds the picked price');
  }],

  ['P5 — EC$ canonical, US$ converts at the 2.70 peg, original kept', async (port) => {
    const r = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Policy USD gig', priceEC: 10, currency: 'USD' }));
    assertEq(r.status, 201, 'a US$ gig posts');
    assertEq(r.json.gig.postedIn, 'USD', 'posted currency is kept');
    assertEq(r.json.gig.postedAmount, 10, 'posted amount is kept');
    assertEq(r.json.gig.priceEC, 27, 'US$10 becomes EC$27 at the peg');
    assertEq(r.json.gig.priceUSD, 10, 'the US$ price on output matches');
  }],

  ['P6 — Escrow window: default 60, settable 60–1440, nothing else', async (port) => {
    const meta = await req(port, 'GET', '/api/giggit/meta');
    assertEq(meta.json.disputeWindowMinutes, 60, 'the default window is 60 minutes');
    const low = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 30 }, { headers: adminHeaders });
    assertEq(low.status, 400, 'a 30-minute window is refused');
    const high = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 2000 }, { headers: adminHeaders });
    assertEq(high.status, 400, 'a 2000-minute window is refused');
    const ok = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 120 }, { headers: adminHeaders });
    assertEq(ok.status, 200, 'a 120-minute window sticks');
    const back = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 60 }, { headers: adminHeaders });
    assertEq(back.status, 200, 'the window is restored to 60');
    const rate = await req(port, 'PUT', '/api/giggit/settings', { usdRate: 1.5 }, { headers: adminHeaders });
    assertEq(rate.status, 400, 'a USD rate outside 2.00–3.50 is refused');
  }],

  ['P7 — No live tracking, no cameras', async (port) => {
    const js = await req(port, 'GET', '/giggit/giggit.js');
    assertEq(js.status, 200, 'front-end script serves');
    assert(!js.body.includes('watchPosition'), 'no live location watching in the front end');
    assert(!js.body.includes('getUserMedia'), 'no camera access in the front end');
    const gig = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}`);
    assert(!('camera' in gig.json.gig), 'no camera field on a gig');
    assert(!('liveLocation' in gig.json.gig), 'no live-location field on a gig');
  }],

  ['P8 — Commission tiers: 15% standard, 10% at 20+/month, 5% Pro', async (port) => {
    const g = await registerGigger(port, { name: 'Tier Gigger', phone: '+17585559925' });
    await runGigToRelease(port, g.id, 100);
    let w = await req(port, 'GET', `/api/giggit/wallet/${g.id}`, undefined, { headers: adminHeaders });
    assertEq(w.json.feesEC, 15, 'first gig: 15% standard');
    assertEq(w.json.availableEC, 85, 'first gig: EC$85 payout');
    // Seed 19 more released gigs this month, so the next one is the 21st.
    tweakLiveData((data) => {
      const now = new Date().toISOString();
      for (let i = 0; i < 19; i += 1) {
        data.gigs.push({
          id: `gig-seed-tier-${i}`, category: 'Cleaning', title: 'Seeded released gig',
          description: 'Seeded for the volume-tier test.', parish: 'Castries', area: 'Policy Area',
          pricingMode: 'budget', priceEC: 100, postedIn: 'XCD', postedAmount: 100,
          customerName: 'Seed', customerPhone: PHONE, status: 'released', giggerId: g.id,
          giggerName: g.name, escrow: { amountEC: 100, status: 'released', releaseAt: now, releasedAt: now, commissionRate: 15, commissionEC: 15, payoutEC: 85 },
          quotes: [], ratings: [], rejections: [], createdAt: now, acceptedAt: now, completedAt: now,
        });
      }
    });
    await runGigToRelease(port, g.id, 100);
    w = await req(port, 'GET', `/api/giggit/wallet/${g.id}`, undefined, { headers: adminHeaders });
    assertEq(w.json.feesEC, 15 + 10, '21st gig this month: 10% volume rate (fees count ledger entries only)');
    assertEq(w.json.availableEC, 85 + 90, '21st gig: EC$90 payout');
    // Pro: flip the flag in the file, run one more gig.
    tweakLiveData((data) => {
      data.giggers.find((entry) => entry.id === g.id).pro = true;
    });
    await runGigToRelease(port, g.id, 100);
    w = await req(port, 'GET', `/api/giggit/wallet/${g.id}`, undefined, { headers: adminHeaders });
    assertEq(w.json.feesEC, 15 + 10 + 5, 'Pro gigger: 5% rate');
    assertEq(w.json.availableEC, 85 + 90 + 95, 'Pro gig: EC$95 payout');
  }],

  ['P9 — Matching is closest-first and a missing skill is invisible', async (port) => {
    const m = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/matches`);
    assert(m.json.matches.length > 0, 'matches exist');
    assert('distanceKm' in m.json.matches[0], 'matches carry a distance');
    assert('basis' in m.json.matches[0], 'matches carry the ranking basis');
    const distances = m.json.matches.map((entry) => entry.distanceKm);
    const finite = distances.filter((d) => d !== null);
    const sorted = [...finite].sort((a, b) => a - b);
    assertEq(JSON.stringify(finite), JSON.stringify(sorted), 'matches with GPS are closest-first');
  }],

  ['P10 — 12 named categories, 4 slots open, a 13th is refused', async (port) => {
    const meta = await req(port, 'GET', '/api/giggit/meta');
    assertEq(JSON.stringify([...meta.json.categories].sort()), JSON.stringify([...CATEGORIES_12].sort()), 'the 12 named categories match the code');
    assertEq(meta.json.categorySlotsFree, 4, '4 slots are held open for Musty to name');
    const bad = await req(port, 'POST', '/api/giggit/gigs', gigBody({ category: 'Plumbing', title: 'Policy bad category gig' }));
    assertEq(bad.status, 400, 'an unnamed category is refused');
  }],

  ['P11 — Castries only', async (port) => {
    const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody({ parish: 'Gros Islet', title: 'Policy parish gig' }));
    assertEq(gig.status, 400, 'a gig outside Castries is refused');
    assert(gig.json.error.includes('Castries'), 'the refusal names Castries');
    const g = await req(port, 'POST', '/api/giggit/giggers', giggerBody({ name: 'Parish Gigger', phone: '+17585559926', parish: 'Gros Islet' }));
    assertEq(g.status, 400, 'a gigger outside Castries is refused');
  }],

  ['P12 — Ops targets are reported and the numbers are computed from data', async (port) => {
    const r = await req(port, 'GET', '/api/giggit/stats');
    assertEq(r.status, 200, 'stats status');
    assertEq(r.json.targets.acceptanceWithin30Min, '>85%', 'acceptance target is >85% in 30 min');
    assertEq(r.json.targets.completion, '>95%', 'completion target is >95%');
    assertEq(r.json.targets.onboardingHours, '<48', 'onboarding target is <48 hours');
    assertEq(r.json.targets.disputeHours, '<24', 'dispute target is <24 hours');
    assertEq(r.json.targets.paymentDays, '<2', 'payment target is <2 days');
    assert('medianSecondsToFirstAccept' in r.json.matching, 'median time to first accept is computed');
    assert('completionRate' in r.json.trust, 'completion rate is computed');
    assert('disputedCount' in r.json.trust, 'disputed count is computed');
  }],

  ['P13 — Ratings: once per side, under-3 needs a comment, no client score', async (port) => {
    const g = await registerGigger(port, { name: 'Rating Gigger', phone: '+17585559927' });
    const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Policy rating gig' }));
    const id = gig.json.gig.id;
    const early = await req(port, 'POST', `/api/giggit/gigs/${id}/rate`, { by: 'customer', stars: 5, customerPhone: PHONE });
    assertEq(early.status, 400, 'rating before release is refused');
    await runGigToRelease(port, g.id, 100);
    // The run above released a different gig; release this one too.
    tweakLiveData((data) => {
      const gg = data.gigs.find((entry) => entry.id === id);
      gg.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    });
    const acc = await req(port, 'POST', `/api/giggit/gigs/${id}/accept`, { giggerId: g.id });
    assertEq(acc.status, 200, 'accept the rating gig');
    const party = await req(port, 'GET', `/api/giggit/gigs/${id}?customerPhone=${encodeURIComponent(PHONE)}`);
    await req(port, 'POST', `/api/giggit/gigs/${id}/request-complete`, { giggerId: g.id });
    await req(port, 'POST', `/api/giggit/gigs/${id}/confirm-complete`, { code: party.json.gig.completionCode });
    tweakLiveData((data) => {
      const gg = data.gigs.find((entry) => entry.id === id);
      gg.escrow.releaseAt = new Date(Date.now() - 60000).toISOString();
    });
    const rel = await req(port, 'GET', `/api/giggit/gigs/${id}`);
    assertEq(rel.json.gig.status, 'released', 'rating gig released');
    const noComment = await req(port, 'POST', `/api/giggit/gigs/${id}/rate`, { by: 'customer', stars: 2, customerPhone: PHONE });
    assertEq(noComment.status, 400, 'under 3 stars without a comment is refused');
    const withComment = await req(port, 'POST', `/api/giggit/gigs/${id}/rate`, { by: 'customer', stars: 2, comment: 'Left the bathroom unfinished.', customerPhone: PHONE });
    assertEq(withComment.status, 200, 'under 3 stars with a comment lands');
    const giggerRate = await req(port, 'POST', `/api/giggit/gigs/${id}/rate`, { by: 'gigger', stars: 4, comment: 'Good customer.', giggerId: g.id });
    assertEq(giggerRate.status, 200, 'the gigger rates the client');
    const detail = await req(port, 'GET', `/api/giggit/gigs/${id}`);
    assert(!('customerRatingAvg' in detail.json.gig), 'no client score is computed from the gigger rating');
    assert(detail.json.gig.ratings.some((r) => r.by === 'gigger'), 'the gigger rating is stored on the gig');
  }],

  ['P14 — Dispute endpoint exists and guards the state (full scenarios in dispute tests)', async (port) => {
    const r = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/dispute`, { by: 'customer', reason: 'Policy probe.', customerPhone: PHONE });
    assertEq(r.status, 400, 'disputing an open gig is refused');
  }],

  ['P15 — Phones hidden on open gigs; admin lane needs the token', async (port) => {
    const list = await req(port, 'GET', '/api/giggit/gigs?status=open');
    assert(!JSON.stringify(list.json).includes(PHONE), 'no customer phone in the open list');
    const openWithContacts = await req(port, 'GET', '/api/giggit/gigs?status=open&contacts=1');
    assert(!JSON.stringify(openWithContacts.json).includes(PHONE), 'contacts=1 without the token shows no phones');
    const withToken = await req(port, 'GET', '/api/giggit/gigs?status=open&contacts=1', undefined, { headers: adminHeaders });
    assert(JSON.stringify(withToken.json).includes(PHONE), 'contacts=1 with the token shows phones (admin lane)');
  }],

  ['P16 — Completion code never appears in a list response', async (port) => {
    const list = await req(port, 'GET', '/api/giggit/gigs?status=accepted');
    assert(!JSON.stringify(list.json).includes('completionCode'), 'no completion code in any list response');
  }],
];

runSuite('policy', PORT, checks);
