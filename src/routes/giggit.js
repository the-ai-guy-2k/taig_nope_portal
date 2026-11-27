'use strict';

/* Giggit — Caribbean gig-work platform, MVP API (Castries pilot).
   Escrow is a SIMULATED Giggit Wallet ledger in the MVP — no real money
   moves. Real payment channels (Mona, WiPay, banks, cash QR, tourist
   USD) are a later phase. */

const express = require('express');
const store = require('../services/giggitStore');

const router = express.Router();

/* Light per-IP throttle on writes: 30 POSTs a minute per IP.
   Test mode (GIGGIT_TEST_MODE=1, set only by the Giggit test scripts for
   the server they spawn) relaxes the limit so a suite can run its writes
   without tripping its own throttle. Never set in production. */
const writeHits = new Map();
function throttleWrites(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const limit = process.env.GIGGIT_TEST_MODE === '1' ? 1000 : 30;
  const hits = (writeHits.get(key) || []).filter((time) => now - time < 60000);
  hits.push(now);
  writeHits.set(key, hits);
  if (hits.length > limit) {
    return res.status(429).json({ error: 'Too many requests — slow down a minute.' });
  }
  return next();
}

function badRequest(res, err) {
  if (err instanceof store.ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Something went wrong saving that.' });
}

/* Operator token (security, Nov 26): the shared secret Tee/Musty hold.
   When GIGGIT_ADMIN_TOKEN is set, admin writes and the ?contacts=1 lane
   need header x-giggit-admin-token. When it is NOT set (local dev only),
   those endpoints stay open as today — and the server says so loudly at
   startup so nobody mistakes open for secured. */
const ADMIN_TOKEN = process.env.GIGGIT_ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) {
  console.warn('[giggit] GIGGIT_ADMIN_TOKEN is not set — admin writes and ?contacts=1 are open. Set it on staging and live.');
}
function isAdminRequest(req) {
  return ADMIN_TOKEN !== '' && req.headers['x-giggit-admin-token'] === ADMIN_TOKEN;
}
function adminLaneOpen(req) {
  return ADMIN_TOKEN === '' || isAdminRequest(req);
}
function requireAdmin(req, res, next) {
  if (ADMIN_TOKEN === '') return next(); // no token configured: open (local dev only)
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: 'Operator access only — that needs the admin token.' });
}

/* Widen pushes: when a ring advances, the newly-included giggers get a
   push. load() queues those jobs; this drains them after gig reads, and
   a 60-second timer drains them even when nobody is reading. */
function drainWidenPushes() {
  for (const job of store.drainWidenQueue()) {
    store.notifyRinged(job).catch(() => {});
  }
}

const widenTimer = setInterval(drainWidenPushes, 60000);
widenTimer.unref();

router.get('/api/giggit/meta', (req, res) => {
  const settings = store.getSettings();
  res.json({
    parishes: store.PARISHES,
    pilotParishes: store.PILOT_PARISHES,
    categories: store.CATEGORIES,
    maxCategories: store.MAX_CATEGORIES,
    categorySlotsFree: store.MAX_CATEGORIES - store.CATEGORIES.length,
    priceGuide: store.PRICE_GUIDE,
    pricingModes: ['budget', 'quote'],
    usdRate: settings.usdRate,
    rateSource: settings.rateSource,
    commission: {
      standard: store.COMMISSION_STANDARD,
      volume: store.COMMISSION_VOLUME,
      pro: store.COMMISSION_PRO,
      note: '15% standard, 10% at 20+ gigs a month, 5% Giggit Pro.',
    },
    disputeWindowMinutes: settings.disputeWindowMinutes,
    disputeWindowRange: settings.disputeWindowRange,
    sosPhone: settings.sosPhone,
    sosLabel: settings.sosLabel,
    ringWindowMinutes: store.RING_WINDOW_MINUTES,
    ringSizes: store.RING_SIZES.map((size) => (Number.isFinite(size) ? size : null)),
    trackingGroups: ['matching', 'supply', 'demand', 'money', 'trust', 'growth'],
    mvpNote: 'Castries pilot. Budget or quote pricing, EC$ default with US$ at the EC$2.70 peg, closest-first rings (2-minute window), event tracking for the six groups. Giggit Wallet is a simulated ledger in the MVP — no real money moves.',
  });
});

router.get('/api/giggit/settings', (req, res) => {
  res.json(store.getSettings());
});

router.put('/api/giggit/settings', throttleWrites, requireAdmin, (req, res) => {
  try {
    res.json(store.updateSettings(req.body || {}));
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/giggit/events', (req, res) => {
  const { group, type, gigId, limit } = req.query;
  res.json({ events: store.listEvents({ group, type, gigId, limit }) });
});

router.get('/api/giggit/stats', (req, res) => {
  res.json(store.getStats());
});

router.get('/api/giggit/giggers', (req, res) => {
  res.json({ giggers: store.listGiggers() });
});

router.post('/api/giggit/giggers', throttleWrites, (req, res) => {
  try {
    res.status(201).json({ gigger: store.createGigger(req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

/* ---- Provider profiles (slice 3): public profile, gallery, ratings. */
router.get('/api/giggit/giggers/:id', (req, res) => {
  try {
    res.json(store.giggerProfile(req.params.id));
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/giggit/giggers/:id/gallery/:index', (req, res) => {
  const photo = store.giggerPhoto(req.params.id, req.params.index);
  if (!photo) return res.status(404).end();
  const base64 = String(photo.dataUrl.split(',')[1] || '');
  const buf = Buffer.from(base64, 'base64');
  res.type(photo.type).send(buf);
});

router.put('/api/giggit/giggers/:id', throttleWrites, (req, res) => {
  try {
    res.json({ gigger: store.updateGigger(req.params.id, req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/giggers/:id/gallery', throttleWrites, (req, res) => {
  try {
    res.status(201).json({ gigger: store.addGiggerPhoto(req.params.id, (req.body || {}).photo || null) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.delete('/api/giggit/giggers/:id/gallery/:index', throttleWrites, (req, res) => {
  try {
    res.json({ gigger: store.removeGiggerPhoto(req.params.id, req.params.index) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/giggit/gigs', (req, res) => {
  const { status, parish, category, customerPhone, q } = req.query;
  res.json({ gigs: store.listGigs({ status, parish, category, customerPhone, q, includeContacts: req.query.contacts === '1' && adminLaneOpen(req) }) });
  drainWidenPushes();
});

router.post('/api/giggit/gigs', throttleWrites, async (req, res) => {
  let gig;
  try {
    gig = store.createGig(req.body || {});
  } catch (err) {
    return badRequest(res, err);
  }
  /* Closest-first (Musty's flow): rank the pool and ping the closest
     gigger. The push attempt never blocks the post for long — 5s max. */
  const ranked = store.matchesForGig(gig.id);
  const closest = ranked && ranked.matches[0] ? ranked.matches[0] : null;
  let notified = { notified: null, reason: 'No matching gigger in the pool yet.' };
  try {
    notified = await Promise.race([
      store.notifyClosest(gig),
      new Promise((resolve) => setTimeout(
        () => resolve({ notified: null, reason: 'Push timed out — the gig is listed for them.' }), 5000)),
    ]);
  } catch (err) {
    notified = { notified: null, reason: 'Push failed — the gig is listed for them.' };
  }
  return res.status(201).json({ gig, closest, notified });
});

router.get('/api/giggit/gigs/:id/matches', (req, res) => {
  const ranked = store.matchesForGig(req.params.id);
  if (!ranked) return res.status(404).json({ error: 'Gig not found.' });
  drainWidenPushes();
  return res.json(ranked);
});

/* Raw photo bytes, so <img src="…/photo"> works without bloating the
   gig list JSON with base64. */
router.get('/api/giggit/gigs/:id/photo', (req, res) => {
  const photo = store.gigPhoto(req.params.id);
  if (!photo) return res.status(404).end();
  const base64 = String(photo.dataUrl.split(',')[1] || '');
  const buf = Buffer.from(base64, 'base64');
  res.type(photo.type).send(buf);
});

router.get('/api/giggit/gigs/:id', (req, res) => {
  const gig = store.getGig(req.params.id, {
    includeContacts: req.query.contacts === '1' && adminLaneOpen(req),
    customerPhone: String(req.query.customerPhone || ''),
    giggerId: String(req.query.giggerId || ''),
    isAdmin: isAdminRequest(req),
  });
  if (!gig) return res.status(404).json({ error: 'Gig not found.' });
  drainWidenPushes();
  return res.json({ gig });
});

router.post('/api/giggit/gigs/:id/quotes', throttleWrites, (req, res) => {
  try {
    const body = req.body || {};
    res.status(201).json({ gig: store.submitQuote(req.params.id, String(body.giggerId || ''), body.amount, body.currency) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/accept-quote', throttleWrites, async (req, res) => {
  let gig;
  try {
    gig = store.acceptQuote(req.params.id, String((req.body || {}).giggerId || ''));
  } catch (err) {
    return badRequest(res, err);
  }
  /* Step 10 — escrow-funded notice to the accepted Gigger. Best-effort,
     never blocks the accept for long — 5s max, same as the post-gig push. */
  let escrowNotified = { notified: null, reason: 'Notice skipped.' };
  try {
    escrowNotified = await Promise.race([
      store.notifyEscrowHeld(gig),
      new Promise((resolve) => setTimeout(
        () => resolve({ notified: null, reason: 'Push timed out — the gig shows it in the app.' }), 5000)),
    ]);
  } catch (err) {
    escrowNotified = { notified: null, reason: 'Push failed — the gig shows it in the app.' };
  }
  return res.json({ gig, escrowNotified });
});

router.post('/api/giggit/gigs/:id/accept', throttleWrites, async (req, res) => {
  let gig;
  try {
    gig = store.acceptGig(req.params.id, String((req.body || {}).giggerId || ''));
  } catch (err) {
    return badRequest(res, err);
  }
  /* Step 10 — escrow-funded notice to the accepted Gigger. Best-effort,
     never blocks the accept for long — 5s max, same as the post-gig push. */
  let escrowNotified = { notified: null, reason: 'Notice skipped.' };
  try {
    escrowNotified = await Promise.race([
      store.notifyEscrowHeld(gig),
      new Promise((resolve) => setTimeout(
        () => resolve({ notified: null, reason: 'Push timed out — the gig shows it in the app.' }), 5000)),
    ]);
  } catch (err) {
    escrowNotified = { notified: null, reason: 'Push failed — the gig shows it in the app.' };
  }
  return res.json({ gig, escrowNotified });
});

/* Reject: a Gigger passes on an open gig. The gig stays open for
   everybody else. */
router.post('/api/giggit/gigs/:id/reject', throttleWrites, (req, res) => {
  try {
    res.json({ gig: store.rejectGig(req.params.id, String((req.body || {}).giggerId || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

/* Admin edit: correct an open gig before anyone accepts. */
router.put('/api/giggit/gigs/:id', throttleWrites, requireAdmin, (req, res) => {
  try {
    res.json({ gig: store.updateGig(req.params.id, req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/start', throttleWrites, (req, res) => {
  try {
    res.json({ gig: store.startGig(req.params.id, String((req.body || {}).giggerId || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

/* Slice 4 — arrival check-in: the Gigger taps "I've arrived" between
   accept and start. It is a marker on the progress steps, not a new
   status, and it needs no GPS — arrival is the Gigger saying so. */
router.post('/api/giggit/gigs/:id/arrived', throttleWrites, (req, res) => {
  try {
    res.json({ gig: store.arriveGig(req.params.id, String((req.body || {}).giggerId || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/request-complete', throttleWrites, async (req, res) => {
  let gig;
  try {
    gig = store.requestComplete(req.params.id, String((req.body || {}).giggerId || ''));
  } catch (err) {
    return badRequest(res, err);
  }
  /* Step 14 — verify notice to the customer. Best-effort, 5s max. */
  let verifyNotified = { notified: null, reason: 'Notice skipped.' };
  try {
    verifyNotified = await Promise.race([
      store.notifyVerifyNeeded(gig),
      new Promise((resolve) => setTimeout(
        () => resolve({ notified: null, reason: 'Push timed out — the gig shows it in the app.' }), 5000)),
    ]);
  } catch (err) {
    verifyNotified = { notified: null, reason: 'Push failed — the gig shows it in the app.' };
  }
  return res.json({ gig, verifyNotified });
});

router.post('/api/giggit/gigs/:id/confirm-complete', throttleWrites, (req, res) => {
  try {
    res.json({ gig: store.confirmComplete(req.params.id, String((req.body || {}).code || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/dispute', throttleWrites, (req, res) => {
  try {
    const body = req.body || {};
    res.json({ gig: store.disputeGig(req.params.id, String(body.by || ''), String(body.reason || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/cancel', throttleWrites, (req, res) => {
  try {
    const body = req.body || {};
    res.json({ gig: store.cancelGig(req.params.id, String(body.by || ''), String(body.reason || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/rate', throttleWrites, (req, res) => {
  try {
    const body = req.body || {};
    res.json({ gig: store.rateGig(req.params.id, String(body.by || ''), body.stars, String(body.comment || '')) });
  } catch (err) {
    badRequest(res, err);
  }
});

/* ---- In-app chat (slice 2): messages live inside the job, both sides. */
router.get('/api/giggit/gigs/:id/messages', (req, res) => {
  try {
    res.json({ messages: store.listMessages(req.params.id, {
      by: String(req.query.by || ''),
      giggerId: String(req.query.giggerId || ''),
      customerPhone: String(req.query.customerPhone || ''),
    }) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.post('/api/giggit/gigs/:id/messages', throttleWrites, (req, res) => {
  try {
    res.status(201).json({ message: store.sendMessage(req.params.id, req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

router.get('/api/giggit/wallet/:giggerId', (req, res) => {
  try {
    res.json(store.walletFor(req.params.giggerId));
  } catch (err) {
    badRequest(res, err);
  }
});

/* ---- Promo codes (slice 5): create in the admin lane, use at booking. */
router.get('/api/giggit/promos', (req, res) => {
  res.json({ promos: store.listPromos() });
});

router.post('/api/giggit/promos', throttleWrites, requireAdmin, (req, res) => {
  try {
    res.status(201).json({ promo: store.createPromo(req.body || {}) });
  } catch (err) {
    badRequest(res, err);
  }
});

/* ---- Web push ---- */

router.get('/api/giggit/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: store.getVapidKeys().publicKey });
});

router.post('/api/giggit/push/subscribe', throttleWrites, (req, res) => {
  try {
    const body = req.body || {};
    res.json(store.savePushSubscription(body.subscription || body, String(body.giggerId || ''), String(body.customerPhone || '')));
  } catch (err) {
    badRequest(res, err);
  }
});

/* MVP test endpoint: sends a test notification to the most recent
   subscription (or one named by endpoint). Rate-limited like other
   writes; this is a pilot testing aid, not a broadcast tool. */
router.post('/api/giggit/push/test', throttleWrites, requireAdmin, async (req, res) => {
  try {
    const webPush = require('web-push');
    const keys = store.getVapidKeys();
    webPush.setVapidDetails('mailto:taig2k@outlook.com', keys.publicKey, keys.privateKey);
    const subs = store.listPushSubscriptions();
    const wanted = String((req.body || {}).endpoint || '');
    const sub = (wanted && subs.find((entry) => entry.endpoint === wanted)) || subs[0];
    if (!sub) return res.status(404).json({ error: 'No push subscription saved yet — enable notifications in the app first.' });
    await webPush.sendNotification(sub, JSON.stringify({
      title: 'Giggit test',
      body: 'Notifications are working — new gigs will reach you here.',
      url: '/giggit/',
    }));
    return res.json({ sent: true });
  } catch (err) {
    if (err && err.statusCode === 410) {
      return res.status(410).json({ error: 'That subscription expired — enable notifications again in the app.' });
    }
    return res.status(500).json({ error: 'Push failed — the device may be offline or the subscription stale.' });
  }
});

module.exports = router;
