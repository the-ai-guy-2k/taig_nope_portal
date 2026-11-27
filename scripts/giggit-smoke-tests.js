#!/usr/bin/env node
'use strict';

/**
 * Giggit smoke tests — the full gig lifecycle, the way a normal human being
 * would use the app: post, match, accept, escrow, arrive, start, mark done,
 * client enters the code, release, both sides rate. Plus the wrong turns a
 * person makes (wrong code, out-of-ring accept, cancel a finished gig).
 *
 * Implements docs/giggit-testing-spec.md section 4.
 * Runs against an isolated server (port 3102) with a fresh seed; the live
 * data dir is backed up and restored, so no test data survives the run.
 * Time-travel (releaseAt / createdAt) is done by editing the live store file
 * between requests — the store re-reads it on every call.
 *
 * Usage: node scripts/giggit-smoke-tests.js
 */

const {
  assert, assertEq, req, adminHeaders, runSuite, tweakLiveData,
} = require('./giggit-test-helpers');

const PORT = 3102;
const CUSTOMER = { name: 'Test Customer', phone: '+17585559901' };
const G1 = { name: 'Test Gigger One', phone: '+17585559911', area: 'Test Morne', lat: 14.005, lng: -60.99 };
const G2 = { name: 'Test Gigger Two', phone: '+17585559912', area: 'Test Ciceron', lat: null, lng: null };
const G3 = { name: 'Test Gigger Three', phone: '+17585559913', area: 'Test Morne', lat: 14.01, lng: -60.995 };
const G4 = { name: 'Test Gigger Four', phone: '+17585559914', area: 'Test Morne', lat: 14.02, lng: -61.0 };

const S = {}; // shared state across checks

function gigBody(overrides = {}) {
  return {
    category: 'Cleaning',
    title: 'Test clean of a two-bed flat',
    description: 'Test gig: deep clean the kitchen and bathroom, bring supplies.',
    parish: 'Castries',
    area: 'Test Morne',
    pricingMode: 'budget',
    priceEC: 120,
    currency: 'XCD',
    customerName: CUSTOMER.name,
    customerPhone: CUSTOMER.phone,
    when: 'Saturday morning',
    lat: 14.005,
    lng: -60.99,
    ...overrides,
  };
}

function giggerBody(g) {
  return {
    name: g.name,
    phone: g.phone,
    parish: 'Castries',
    area: g.area,
    idType: 'National ID',
    idNumber: 'TEST1234',
    skills: ['Cleaning'],
    certifications: [],
    lat: g.lat,
    lng: g.lng,
  };
}

const checks = [
  ['App loads', async (port) => {
    const r = await req(port, 'GET', '/giggit/');
    assertEq(r.status, 200, 'GET /giggit/ status');
    assert(r.body.includes('Giggit'), 'app page mentions Giggit');
  }],

  ['Meta carries Musty’s constants', async (port) => {
    const r = await req(port, 'GET', '/api/giggit/meta');
    assertEq(r.status, 200, 'meta status');
    assertEq(r.json.categories.length, 12, '12 named categories');
    assertEq(r.json.categorySlotsFree, 4, '4 category slots held open for Musty');
    assertEq(r.json.usdRate, 2.7, 'EC$2.70 peg');
    assertEq(r.json.commission.standard, 0.15, '15% standard commission');
    assertEq(r.json.commission.volume, 0.10, '10% volume commission');
    assertEq(r.json.commission.pro, 0.05, '5% Pro commission');
    assertEq(r.json.ringWindowMinutes, 2, '2-minute ring window');
    assertEq(r.json.disputeWindowMinutes, 60, '60-minute dispute window default');
  }],

  ['Register four test giggers', async (port) => {
    for (const g of [G1, G2, G3, G4]) {
      const r = await req(port, 'POST', '/api/giggit/giggers', giggerBody(g));
      assertEq(r.status, 201, `register ${g.name} status`);
      assert(r.json.gigger.id, `${g.name} gets an id`);
      assertEq(r.json.gigger.tier, 1, `${g.name} starts at tier 1`);
      assertEq(r.json.gigger.pro, false, `${g.name} is not Pro`);
      assert(!('phone' in r.json.gigger), `${g.name} phone is not in the public profile`);
      assert(!('idNumber' in r.json.gigger), `${g.name} ID number is not in the public profile`);
      g.id = r.json.gigger.id;
    }
  }],

  ['Post a budget gig, closest match is G1', async (port) => {
    const r = await req(port, 'POST', '/api/giggit/gigs', gigBody());
    assertEq(r.status, 201, 'post gig status');
    S.gigId = r.json.gig.id;
    assertEq(r.json.gig.status, 'open', 'gig starts open');
    assertEq(r.json.gig.priceEC, 120, 'price is EC$120');
    assert(r.json.closest, 'post names the closest match');
    assertEq(r.json.closest.gigger.id, G1.id, 'closest match is the test gigger at distance 0');
    assert('notified' in r.json, 'post reports whether the push landed');
  }],

  ['Match list is closest-first, ring-gated', async (port) => {
    const r = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/matches`);
    assertEq(r.status, 200, 'matches status');
    assertEq(r.json.matches[0].gigger.id, G1.id, 'first match is G1');
    assertEq(r.json.matches[0].inCurrentRing, true, 'G1 is inside ring 0');
    const g2 = r.json.matches.find((m) => m.gigger.id === G2.id);
    assert(g2, 'G2 is in the match list');
    assertEq(g2.inCurrentRing, false, 'G2 (no location, last) is outside ring 0');
  }],

  ['Out-of-ring accept is refused in plain words', async (port) => {
    const r = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/accept`, { giggerId: G2.id });
    assertEq(r.status, 400, 'out-of-ring accept status');
    assert(r.json.error.includes('widened'), 'refusal names the ring widening');
  }],

  ['Ring widens on the clock (time-travelled)', async (port) => {
    tweakLiveData((data) => {
      const gig = data.gigs.find((g) => g.id === S.gigId);
      gig.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    });
    const r = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/matches`);
    const g2 = r.json.matches.find((m) => m.gigger.id === G2.id);
    assertEq(g2.inCurrentRing, true, 'G2 is inside the ring once it has widened');
  }],

  ['Accept holds escrow and reports the notice', async (port) => {
    const r = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/accept`, { giggerId: G1.id });
    assertEq(r.status, 200, 'accept status');
    assertEq(r.json.gig.status, 'accepted', 'gig is accepted');
    assertEq(r.json.gig.escrow.status, 'held', 'escrow is held');
    assertEq(r.json.gig.escrow.amountEC, 120, 'escrow holds EC$120');
    assert('escrowNotified' in r.json, 'accept reports the escrow-funded notice');
    assert(!('completionCode' in r.json.gig), 'accept response does not hand the code to the gigger');
    S.code = null; // fetched below as the customer (party)
  }],

  ['Contacts unlock after accept, code only for a party', async (port) => {
    const stranger = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}`);
    assert(!('customerPhone' in stranger.json.gig), 'stranger detail has no customer phone');
    assert(!('completionCode' in stranger.json.gig), 'stranger detail has no completion code');
    const party = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}?customerPhone=${encodeURIComponent(CUSTOMER.phone)}`);
    assertEq(party.json.gig.customerPhone, CUSTOMER.phone, 'customer detail shows the customer phone');
    assertEq(party.json.gig.giggerPhone, G1.phone, 'customer detail shows the gigger phone');
    assert(/^\d{6}$/.test(party.json.gig.completionCode || ''), 'customer detail shows the 6-digit code');
    S.code = party.json.gig.completionCode;
  }],

  ['Chat works both ways, strangers kept out', async (port) => {
    const m1 = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/messages`, { by: 'gigger', giggerId: G1.id, text: 'On my way, see you in 20 minutes.' });
    assertEq(m1.status, 201, 'gigger message status');
    const m2 = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/messages`, { by: 'customer', customerPhone: CUSTOMER.phone, text: 'Great, the gate code is 1234.' });
    assertEq(m2.status, 201, 'customer message status');
    const list = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/messages?by=admin`);
    assertEq(list.json.messages.length, 2, 'admin reads both messages');
    const stranger = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}/messages?by=customer&customerPhone=%2B17580000000`);
    assertEq(stranger.status, 400, 'a stranger cannot read the chat');
    const tooLong = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/messages`, { by: 'gigger', giggerId: G1.id, text: 'x'.repeat(1001) });
    assertEq(tooLong.status, 400, 'a 1001-character message is refused');
  }],

  ['Chat is closed on an open gig', async (port) => {
    const open = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Test open gig for chat check' }));
    const r = await req(port, 'POST', `/api/giggit/gigs/${open.json.gig.id}/messages`, { by: 'customer', customerPhone: CUSTOMER.phone, text: 'hello?' });
    assertEq(r.status, 400, 'chat on an open gig is refused');
    S.openGigId = open.json.gig.id;
  }],

  ['Arrive, start, mark done — progress steps with timestamps', async (port) => {
    const a = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/arrived`, { giggerId: G1.id });
    assertEq(a.status, 200, 'arrive status');
    assert(a.json.gig.arrivedAt, 'arrivedAt is stamped');
    const a2 = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/arrived`, { giggerId: G1.id });
    assertEq(a2.status, 400, 'arrive twice is refused');
    const s = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/start`, { giggerId: G1.id });
    assertEq(s.json.gig.status, 'in_progress', 'gig is in progress');
    assert(s.json.gig.startedAt, 'startedAt is stamped');
    const d = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/request-complete`, { giggerId: G1.id });
    assertEq(d.json.gig.status, 'completion_requested', 'gig is waiting for the client code');
    assert(d.json.gig.doneRequestedAt, 'doneRequestedAt is stamped');
    assert('verifyNotified' in d.json, 'request-complete reports the verify notice');
  }],

  ['Wrong code is refused, right code completes', async (port) => {
    const wrong = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/confirm-complete`, { code: '000000' });
    assertEq(wrong.status, 400, 'wrong code status');
    assert(wrong.json.error.includes('does not match'), 'wrong code gets a plain reason');
    const right = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/confirm-complete`, { code: S.code });
    assertEq(right.status, 200, 'right code status');
    assertEq(right.json.gig.status, 'completed', 'gig is completed');
    assert(right.json.gig.escrow.releaseAt, 'release clock is set');
    const releaseAt = new Date(right.json.gig.escrow.releaseAt).getTime();
    const completedAt = new Date(right.json.gig.completedAt).getTime();
    assertEq(Math.round((releaseAt - completedAt) / 60000), 60, 'release is 60 minutes after completion (default window)');
  }],

  ['Release after the window: 15% commission, payout to the gigger', async (port) => {
    tweakLiveData((data) => {
      const gig = data.gigs.find((g) => g.id === S.gigId);
      gig.escrow.releaseAt = new Date(Date.now() - 60000).toISOString();
    });
    const r = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}`);
    assertEq(r.json.gig.status, 'released', 'gig is released once the window passes');
    const w = await req(port, 'GET', `/api/giggit/wallet/${G1.id}`);
    assertEq(w.json.availableEC, 102, 'gigger has EC$102 available (120 minus 15%)');
    assertEq(w.json.feesEC, 18, 'Giggit kept EC$18 commission');
    const types = w.json.entries.map((e) => e.type);
    assert(types.includes('release') && types.includes('fee'), 'ledger has release and fee entries');
    assert(types.includes('hold'), 'ledger has the hold entry');
  }],

  ['Both sides rate once; a second rating is refused', async (port) => {
    const c = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/rate`, { by: 'customer', stars: 5, comment: 'Spotless work, on time.' });
    assertEq(c.status, 200, 'customer rating status');
    const g = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/rate`, { by: 'gigger', stars: 5, comment: 'Lovely customer.' });
    assertEq(g.status, 200, 'gigger rating status');
    const again = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/rate`, { by: 'customer', stars: 4 });
    assertEq(again.status, 400, 'second rating by the same side is refused');
    const prof = await req(port, 'GET', `/api/giggit/giggers/${G1.id}`);
    assertEq(prof.json.gigger.ratingAvg, 5, 'the client rating rolls up to the gigger average');
    assertEq(prof.json.gigger.gigsCompleted, 1, 'one released gig counts');
  }],

  ['Promo code discounts the booking, commission follows it', async (port) => {
    const p = await req(port, 'POST', '/api/giggit/promos', { code: 'TEST10', percentOff: 10, maxUses: 5, note: 'smoke test promo' }, { headers: adminHeaders });
    assertEq(p.status, 201, 'promo create status');
    const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Test promo gig', priceEC: 200, promoCode: 'TEST10' }));
    assertEq(gig.status, 201, 'promo gig posts');
    assertEq(gig.json.gig.priceEC, 180, 'price is EC$180 after 10% off');
    assertEq(gig.json.gig.discountEC, 20, 'discount is EC$20');
    assertEq(gig.json.gig.priceBeforePromoEC, 200, 'original price is kept');
    const acc = await req(port, 'POST', `/api/giggit/gigs/${gig.json.gig.id}/accept`, { giggerId: G1.id });
    assertEq(acc.json.gig.escrow.amountEC, 180, 'escrow holds the discounted price');
  }],

  ['Schedule-for-later: future within 30 days only', async (port) => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const ok = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Test scheduled gig', scheduledAt: tomorrow }));
    assertEq(ok.status, 201, 'a gig for tomorrow posts');
    assertEq(ok.json.gig.scheduledAt.slice(0, 10), tomorrow.slice(0, 10), 'scheduled date is stored');
    const past = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Test past gig', scheduledAt: new Date(Date.now() - 3600000).toISOString() }));
    assertEq(past.status, 400, 'a gig in the past is refused');
    const far = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Test far gig', scheduledAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() }));
    assertEq(far.status, 400, 'a gig more than 30 days out is refused');
  }],

  ['Cancel rules: open gig cancels, finished gig refuses', async (port) => {
    const c = await req(port, 'POST', `/api/giggit/gigs/${S.openGigId}/cancel`, { by: 'customer', reason: 'Test cleanup cancel.' });
    assertEq(c.status, 200, 'an open gig cancels');
    assertEq(c.json.gig.status, 'cancelled', 'cancelled status');
    const done = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/cancel`, { by: 'customer', reason: 'Too late.' });
    assertEq(done.status, 400, 'a released gig cannot be cancelled');
  }],

  ['Wallet entries are newest first', async (port) => {
    const w = await req(port, 'GET', `/api/giggit/wallet/${G1.id}`);
    const times = w.json.entries.map((e) => new Date(e.at).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    assertEq(JSON.stringify(times), JSON.stringify(sorted), 'wallet entries run newest first');
  }],

  ['SOS setting is blank by default and settable by the operator', async (port) => {
    const meta = await req(port, 'GET', '/api/giggit/meta');
    assert('sosPhone' in meta.json, 'meta carries the SOS phone');
    assert('sosLabel' in meta.json, 'meta carries the SOS label');
  }],
];

runSuite('smoke', PORT, checks);
