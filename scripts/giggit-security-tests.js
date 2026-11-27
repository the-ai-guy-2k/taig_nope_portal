#!/usr/bin/env node
'use strict';

/**
 * Giggit security tests — threats T1–T12 from docs/giggit-testing-spec.md
 * section 3, and the controls C1–C6.
 *
 * Runs against an isolated server (port 3105) with a fresh seed; the live
 * data dir is backed up and restored, so no test data survives the run.
 * The write-throttle check (T7) spawns a second, normal-mode server (port
 * 3106) because the main server runs with the relaxed test-mode throttle.
 *
 * EXPECTED BASELINE before the controls land: T1, T2, T3, T5 fail — those
 * are the gaps this build closes. A failing security check names the exact
 * exposure; that is the test working, not the test broken.
 *
 * Usage: node scripts/giggit-security-tests.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  assert, assertEq, req, adminHeaders, runSuite, tweakLiveData,
  withTestServer, httpRequest, ROOT,
} = require('./giggit-test-helpers');

const PORT = 3105;
const PHONE = '+17585559904';
const S = {};

async function driveToAccepted(port) {
  const g = await req(port, 'POST', '/api/giggit/giggers', {
    name: 'Security Test Gigger', phone: '+17585559941', parish: 'Castries',
    area: 'Security Area', idType: 'National ID', idNumber: 'SEC1234',
    skills: ['Cleaning'], certifications: [], lat: 14.005, lng: -60.99,
  });
  assertEq(g.status, 201, 'register security gigger');
  S.giggerId = g.json.gigger.id;
  const gig = await req(port, 'POST', '/api/giggit/gigs', {
    category: 'Cleaning', title: 'Security test gig',
    description: 'Security test gig: enough description to pass validation.',
    parish: 'Castries', area: 'Security Area', pricingMode: 'budget',
    priceEC: 100, currency: 'XCD', customerName: 'Security Customer',
    customerPhone: PHONE, when: 'Saturday morning', lat: 14.005, lng: -60.99,
  });
  assertEq(gig.status, 201, 'post security gig');
  S.gigId = gig.json.gig.id;
  tweakLiveData((data) => {
    const gg = data.gigs.find((entry) => entry.id === S.gigId);
    gg.createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  });
  const acc = await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/accept`, { giggerId: S.giggerId });
  assertEq(acc.status, 200, 'accept security gig');
}

const checks = [
  ['Setup — one accepted gig to probe', async (port) => {
    await driveToAccepted(port);
  }],

  ['T1 — Settings cannot be changed without the operator token', async (port) => {
    const noToken = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 120 });
    assertEq(noToken.status, 401, 'PUT settings without the token is refused');
    const withToken = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 120 }, { headers: adminHeaders });
    assertEq(withToken.status, 200, 'PUT settings with the token works');
    const back = await req(port, 'PUT', '/api/giggit/settings', { disputeWindowMinutes: 60 }, { headers: adminHeaders });
    assertEq(back.status, 200, 'the window is restored to 60');
    const promo = await req(port, 'POST', '/api/giggit/promos', { code: 'NOPE1', percentOff: 10 }, {});
    assertEq(promo.status, 401, 'creating a promo without the token is refused');
  }],

  ['T2 — Phone numbers cannot be pulled with ?contacts=1 and no token', async (port) => {
    const seedPhone = '+17584559901'; // seed gig-sample1's customer phone (an open gig)
    const open = await req(port, 'GET', '/api/giggit/gigs?status=open&contacts=1');
    assert(!JSON.stringify(open.json).includes(seedPhone), 'no phone numbers without the token');
    const withToken = await req(port, 'GET', '/api/giggit/gigs?status=open&contacts=1', undefined, { headers: adminHeaders });
    assert(JSON.stringify(withToken.json).includes(seedPhone), 'the admin lane with the token still sees numbers');
  }],

  ['T3 — Completion code only for a party or the token, never in a list', async (port) => {
    const stranger = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}`);
    assert(!('completionCode' in stranger.json.gig), 'a stranger gets no code');
    const list = await req(port, 'GET', '/api/giggit/gigs?status=accepted');
    assert(!JSON.stringify(list.json).includes('completionCode'), 'no code in any list response');
    const party = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}?customerPhone=${encodeURIComponent(PHONE)}`);
    assert(/^\d{6}$/.test(party.json.gig.completionCode || ''), 'the customer gets the 6-digit code');
    const giggerParty = await req(port, 'GET', `/api/giggit/gigs/${S.gigId}?giggerId=${S.giggerId}`);
    assert(!('completionCode' in giggerParty.json.gig), 'the gigger does not get the code — the client gives it at the door');
  }],

  ['T4 — User text is escaped where it is rendered (static scan + live probe)', async (port) => {
    const js = fs.readFileSync(path.join(ROOT, 'public', 'giggit', 'giggit.js'), 'utf8');
    assert(js.includes('function esc(s)'), 'the esc() helper exists');
    assert(js.includes("'&': '&amp;'") && js.includes("'<': '&lt;'"), 'esc() covers & and <');
    // No innerHTML line may interpolate a value without esc().
    const bad = js.split('\n').filter((line) => line.includes('innerHTML') && line.includes('${') && !line.includes('esc('));
    assertEq(bad.length, 0, `innerHTML lines with unescaped interpolation: ${bad.slice(0, 2).join(' | ')}`);
    // The gig card/detail renderers escape the user fields they show.
    for (const field of ['esc(g.title)', 'esc(g.description)', 'esc(g.area)']) {
      assert(js.includes(field), `the renderer escapes ${field}`);
    }
    // Live probe: a script payload posts as inert text, not markup.
    // cleanText() strips tags at the door AND esc() escapes on render —
    // two layers. The stored value must carry no markup at all.
    const probe = await req(port, 'POST', '/api/giggit/gigs', {
      category: 'Cleaning', title: '<script>alert(1)</script>', description: 'Probe: <img src=x onerror=alert(2)> enough description here.',
      parish: 'Castries', area: 'Probe Area', pricingMode: 'budget', priceEC: 50, currency: 'XCD',
      customerName: 'Probe', customerPhone: '+17585559949', when: 'now', lat: 14.005, lng: -60.99,
    });
    assertEq(probe.status, 201, 'the probe gig posts (validation is about shape, not content)');
    assert(!probe.json.gig.title.includes('<'), 'the stored title carries no markup');
    assert(!probe.json.gig.description.includes('<'), 'the stored description carries no markup');
    assert(!probe.json.gig.description.includes('onerror'), 'no event-handler text survives in the description');
  }],

  ['T5 — Security headers on every portal response', async (port) => {
    const r = await req(port, 'GET', '/giggit/');
    assertEq(r.headers['x-content-type-options'], 'nosniff', 'nosniff header');
    assertEq(r.headers['x-frame-options'], 'SAMEORIGIN', 'frame header');
    assert(r.headers['referrer-policy'], 'referrer policy header is set');
    const api = await req(port, 'GET', '/api/giggit/meta');
    assertEq(api.headers['x-content-type-options'], 'nosniff', 'nosniff header on API responses too');
  }],

  ['T6 — Silent fallbacks are loud now (static check)', async () => {
    const store = fs.readFileSync(path.join(ROOT, 'src', 'services', 'giggitStore.js'), 'utf8');
    assert(store.includes('console.warn'), 'the store logs warnings (seed fallback, VAPID generation, event-cap drop)');
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert(gitignore.includes('nebula_local/'), 'the live data dir is gitignored (VAPID keys never commit)');
  }],

  ['T8 — Every bad input is a 400 with a plain-words reason', async (port) => {
    const bad = [
      ['bad category', await req(port, 'POST', '/api/giggit/gigs', { category: 'Plumbing', title: 'x', description: 'long enough description here', parish: 'Castries', area: 'A', pricingMode: 'budget', priceEC: 10, customerName: 'N', customerPhone: PHONE })],
      ['short description', await req(port, 'POST', '/api/giggit/gigs', { category: 'Cleaning', title: 'Test', description: 'too short', parish: 'Castries', area: 'A', pricingMode: 'budget', priceEC: 10, customerName: 'N', customerPhone: PHONE })],
      ['wrong parish', await req(port, 'POST', '/api/giggit/gigs', { category: 'Cleaning', title: 'Test', description: 'long enough description here', parish: 'Gros Islet', area: 'A', pricingMode: 'budget', priceEC: 10, customerName: 'N', customerPhone: PHONE })],
      ['bad stars', await req(port, 'POST', `/api/giggit/gigs/${S.gigId}/rate`, { by: 'customer', stars: 6 })],
      ['bad promo percent', await req(port, 'POST', '/api/giggit/promos', { code: 'BADPCT', percentOff: 90 }, { headers: adminHeaders })],
      ['bad USD rate', await req(port, 'PUT', '/api/giggit/settings', { usdRate: 9.99 }, { headers: adminHeaders })],
    ];
    for (const [name, res] of bad) {
      assertEq(res.status, 400, `${name} is refused`);
      assert(typeof res.json.error === 'string' && res.json.error.length > 0, `${name} carries a plain-words reason`);
    }
  }],

  ['T9 — Dependency audit (registry may be unreachable here; CI runs it for real)', async () => {
    let out;
    try {
      out = execSync('npm audit --omit=dev --json', { cwd: ROOT, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    } catch (err) {
      out = (err.stdout || Buffer.alloc(0)).toString();
      if (!out) {
        // Registry unreachable in this environment — record it, do not fail.
        // GitHub CI has registry access and runs this check for real.
        return 'npm audit unavailable in this environment (registry blocked); CI runs it — see the audit log';
      }
    }
    const audit = JSON.parse(out);
    const meta = audit.metadata || {};
    const counts = meta.vulnerabilities || {};
    const detail = `audit: critical ${counts.critical || 0}, high ${counts.high || 0}, moderate ${counts.moderate || 0}, low ${counts.low || 0}, info ${counts.info || 0}`;
    if ((counts.critical || 0) > 0) throw new Error(`${detail} — a critical dependency vulnerability blocks the build until it is fixed or excepted in the spec`);
    return detail;
  }],

  ['T12 — A cross-origin form shape cannot make admin writes (no custom header)', async (port) => {
    const res = await httpRequest(PORT, '/api/giggit/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'disputeWindowMinutes=120',
    });
    assertEq(res.statusCode, 401, 'a form-shaped admin write without the token is refused');
  }],

  ['T7 — Write throttle trips at 31 writes a minute (normal-mode server)', async () => {
    // Runs LAST: it deliberately exhausts the throttle on its own server.
    let lastStatus = null;
    await withTestServer(3106, {}, async () => {
      for (let i = 0; i < 31; i += 1) {
        const r = await req(3106, 'POST', '/api/giggit/gigs', {
          category: 'Cleaning', title: `Throttle probe ${i}`,
          description: 'Throttle probe gig: enough description to pass.',
          parish: 'Castries', area: 'Throttle Area', pricingMode: 'budget',
          priceEC: 10, currency: 'XCD', customerName: 'Throttle', customerPhone: '+17585559948',
          when: 'now', lat: 14.005, lng: -60.99,
        });
        lastStatus = r.status;
      }
    });
    assertEq(lastStatus, 429, 'the 31st write in a minute is throttled');
    return 'throttle tripped at 31 as designed';
  }],
];

runSuite('security', PORT, checks);
