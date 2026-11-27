#!/usr/bin/env node
'use strict';

/**
 * Giggit dispute tests — scenarios D1–D8 from docs/giggit-testing-spec.md
 * section 2.
 *
 * Dispute-open is built; dispute-resolve is NOT built (Decision Point 7 —
 * who resolves, and what outcomes exist, is still Tee + Musty's decision).
 * D7 records that as a known gap — it is never faked as a pass.
 *
 * Runs against an isolated server (port 3104) with a fresh seed; the live
 * data dir is backed up and restored, so no test data survives the run.
 *
 * Usage: node scripts/giggit-dispute-tests.js
 */

const {
  assert, assertEq, req, adminHeaders, runSuite, tweakLiveData, knownGap,
} = require('./giggit-test-helpers');

const PORT = 3104;
const PHONE = '+17585559903';
const S = {};

function gigBody(overrides = {}) {
  return {
    category: 'Cleaning', title: 'Dispute test gig',
    description: 'Dispute test gig: enough description to pass validation.',
    parish: 'Castries', area: 'Dispute Area', pricingMode: 'budget',
    priceEC: 100, currency: 'XCD', customerName: 'Dispute Customer',
    customerPhone: PHONE, when: 'Saturday morning', lat: 14.005, lng: -60.99,
    ...overrides,
  };
}

async function registerGigger(port) {
  const r = await req(port, 'POST', '/api/giggit/giggers', {
    name: 'Dispute Test Gigger', phone: '+17585559931', parish: 'Castries',
    area: 'Dispute Area', idType: 'National ID', idNumber: 'DSP1234',
    skills: ['Cleaning'], certifications: [], lat: 14.005, lng: -60.99,
  });
  assertEq(r.status, 201, 'register dispute gigger');
  return r.json.gigger;
}

/** Drive one gig to `completed` and return its id + code. */
async function driveToCompleted(port, giggerId, overrides = {}) {
  const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody(overrides));
  assertEq(gig.status, 201, 'post gig for dispute run');
  const id = gig.json.gig.id;
  tweakLiveData((data) => {
    const g = data.gigs.find((entry) => entry.id === id);
    g.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  });
  const acc = await req(port, 'POST', `/api/giggit/gigs/${id}/accept`, { giggerId });
  assertEq(acc.status, 200, 'accept for dispute run');
  const party = await req(port, 'GET', `/api/giggit/gigs/${id}?customerPhone=${encodeURIComponent(PHONE)}`);
  await req(port, 'POST', `/api/giggit/gigs/${id}/request-complete`, { giggerId });
  const done = await req(port, 'POST', `/api/giggit/gigs/${id}/confirm-complete`, { code: party.json.gig.completionCode });
  assertEq(done.status, 200, 'confirm for dispute run');
  return id;
}

async function releaseGig(port, id) {
  tweakLiveData((data) => {
    const g = data.gigs.find((entry) => entry.id === id);
    g.escrow.releaseAt = new Date(Date.now() - 60000).toISOString();
  });
  const r = await req(port, 'GET', `/api/giggit/gigs/${id}`);
  return r.json.gig;
}

const checks = [
  ['Setup — one gigger for all dispute runs', async (port) => {
    S.gigger = await registerGigger(port);
  }],

  ['D1 — Customer disputes inside the window: frozen, never releases', async (port) => {
    const id = await driveToCompleted(port, S.gigger.id, { title: 'Dispute D1 gig' });
    const d = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'The bathroom was left unfinished.', customerPhone: PHONE });
    assertEq(d.status, 200, 'dispute lands');
    assertEq(d.json.gig.status, 'disputed', 'gig is disputed');
    assertEq(d.json.gig.escrow.status, 'frozen', 'escrow is frozen');
    assertEq(d.json.gig.dispute.by, 'customer', 'dispute records who raised it');
    S.d1 = id;
    // Even after the window passes, a disputed gig never releases.
    const after = await releaseGig(port, id);
    assertEq(after.status, 'disputed', 'disputed gig stays disputed after the window');
    assertEq(after.escrow.status, 'frozen', 'escrow stays frozen');
    const w = await req(port, 'GET', `/api/giggit/wallet/${S.gigger.id}`, undefined, { headers: adminHeaders });
    assert(!w.json.entries.some((e) => e.gigId === id && e.type === 'release'), 'no release entry for the disputed gig');
    const events = await req(port, 'GET', `/api/giggit/events?gigId=${id}&type=dispute_opened`);
    assertEq(events.json.events.length, 1, 'a dispute_opened event is logged');
  }],

  ['D2 — Gigger disputes inside the window: same freeze', async (port) => {
    const id = await driveToCompleted(port, S.gigger.id, { title: 'Dispute D2 gig' });
    const d = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'gigger', reason: 'Customer refused to let me in.', giggerId: S.gigger.id });
    assertEq(d.status, 200, 'gigger dispute lands');
    assertEq(d.json.gig.status, 'disputed', 'gig is disputed');
    assertEq(d.json.gig.dispute.by, 'gigger', 'dispute records the gigger');
  }],

  ['D3 — Dispute after the window is refused', async (port) => {
    const id = await driveToCompleted(port, S.gigger.id, { title: 'Dispute D3 gig' });
    const released = await releaseGig(port, id);
    assertEq(released.status, 'released', 'gig released before the dispute attempt');
    const d = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'Too late to complain.', customerPhone: PHONE });
    assertEq(d.status, 400, 'disputing a released gig is refused');
  }],

  ['D4 — Dispute before completion is refused in every state', async (port) => {
    const gig = await req(port, 'POST', '/api/giggit/gigs', gigBody({ title: 'Dispute D4 gig' }));
    const id = gig.json.gig.id;
    const open = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'Too early.', customerPhone: PHONE });
    assertEq(open.status, 400, 'disputing an open gig is refused');
    tweakLiveData((data) => {
      const g = data.gigs.find((entry) => entry.id === id);
      g.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    });
    await req(port, 'POST', `/api/giggit/gigs/${id}/accept`, { giggerId: S.gigger.id });
    const accepted = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'Too early.', customerPhone: PHONE });
    assertEq(accepted.status, 400, 'disputing an accepted gig is refused');
    await req(port, 'POST', `/api/giggit/gigs/${id}/start`, { giggerId: S.gigger.id });
    const inProgress = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'Too early.', customerPhone: PHONE });
    assertEq(inProgress.status, 400, 'disputing an in-progress gig is refused');
    await req(port, 'POST', `/api/giggit/gigs/${id}/request-complete`, { giggerId: S.gigger.id });
    const requested = await req(port, 'POST', `/api/giggit/gigs/${id}/dispute`, { by: 'customer', reason: 'Too early.', customerPhone: PHONE });
    assertEq(requested.status, 400, 'disputing a completion-requested gig is refused');
  }],

  ['D5 — A gig can be disputed only once', async (port) => {
    const second = await req(port, 'POST', `/api/giggit/gigs/${S.d1}/dispute`, { by: 'gigger', reason: 'Second dispute.', giggerId: S.gigger.id });
    assertEq(second.status, 400, 'a second dispute on the same gig is refused');
  }],

  ['D6 — A disputed gig’s money never moves', async (port) => {
    const w = await req(port, 'GET', `/api/giggit/wallet/${S.gigger.id}`, undefined, { headers: adminHeaders });
    const forD1 = w.json.entries.filter((e) => e.gigId === S.d1);
    assertEq(forD1.filter((e) => e.type === 'release').length, 0, 'no release entry for the disputed gig');
    assertEq(forD1.filter((e) => e.type === 'fee').length, 0, 'no fee entry for the disputed gig');
    assertEq(forD1.filter((e) => e.type === 'hold').length, 1, 'the hold entry is still there');
  }],

  ['D7 — Resolve a disputed gig (known gap: no resolve path exists)', async (port) => {
    const r = await req(port, 'POST', `/api/giggit/gigs/${S.d1}/resolve`, { by: 'admin', outcome: 'release' }, { headers: adminHeaders });
    if (r.status === 200) {
      throw new Error('a resolve endpoint exists but the spec says it does not — the spec is wrong, surface this');
    }
    assertEq(r.status, 404, 'no resolve endpoint exists');
    throw knownGap('No resolve function, endpoint, or screen exists (Decision Point 7). A disputed gig is moved only by a deliberate, recorded operator edit of the data file, with Tee’s word.');
  }],

  ['D8 — The window itself: 60 and 1440 set releaseAt, anything else refused', async (port) => {
    const set60 = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 60 }, { headers: adminHeaders });
    assertEq(set60.status, 200, 'window 60 sticks');
    const id60 = await driveToCompleted(port, S.gigger.id, { title: 'Dispute D8-60 gig' });
    const g60 = await req(port, 'GET', `/api/giggit/gigs/${id60}`);
    assertEq(Math.round((new Date(g60.json.gig.escrow.releaseAt) - new Date(g60.json.gig.completedAt)) / 60000), 60, 'release is 60 minutes after completion');
    const set1440 = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 1440 }, { headers: adminHeaders });
    assertEq(set1440.status, 200, 'window 1440 sticks');
    const id1440 = await driveToCompleted(port, S.gigger.id, { title: 'Dispute D8-1440 gig' });
    const g1440 = await req(port, 'GET', `/api/giggit/gigs/${id1440}`);
    assertEq(Math.round((new Date(g1440.json.gig.escrow.releaseAt) - new Date(g1440.json.gig.completedAt)) / 60000), 1440, 'release is 1440 minutes after completion');
    const bad = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 30 }, { headers: adminHeaders });
    assertEq(bad.status, 400, 'a 30-minute window is refused');
    const back = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 60 }, { headers: adminHeaders });
    assertEq(back.status, 200, 'the window is restored to 60');
  }],
];

runSuite('dispute', PORT, checks);
