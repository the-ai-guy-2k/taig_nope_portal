'use strict';

/* Giggit — Caribbean gig-work platform, MVP (Castries pilot).
   Musty's ops plan (Giggit_Operation.docx, 10 sections) is the source of
   truth; this build is the MVP slice only: Castries, L1 verification,
   request → accept → complete with escrow, one payment channel (Giggit
   Wallet, SIMULATED ledger — no real money moves in the MVP).
   Live data lives in the mounted volume (nebula_local) so it survives
   container rebuilds and never dirties the git working tree.
   First run seeds from the committed data/giggit.json.
   VAPID keys for web push live in nebula_local/giggit-vapid.json and are
   generated on first use — they are never committed. */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const LIVE_PATH = path.join(__dirname, '..', '..', 'nebula_local', 'giggit.json');
const SEED_PATH = path.join(__dirname, '..', '..', 'data', 'giggit.json');
const VAPID_PATH = path.join(__dirname, '..', '..', 'nebula_local', 'giggit-vapid.json');

/* Escrow dispute window after completion, per the ops plan — default 1
   hour, configurable 1 hour to 1 day (Musty/Tee set it). Stored in
   state.settings.disputeWindowMinutes; disputeWindowMs(state) reads it. */
const DEFAULT_DISPUTE_WINDOW_MINUTES = 60;
const MIN_DISPUTE_WINDOW_MINUTES = 60;
const MAX_DISPUTE_WINDOW_MINUTES = 1440;

/* EC$ is pegged to the US dollar at EC$2.70 = US$1 (Eastern Caribbean
   Central Bank peg, fixed since 1976). That peg IS the market rate for
   XCD/USD — it does not float, so no live feed is needed; the rate is a
   setting (state.settings.usdRate) and changes only if the peg moves. */
const DEFAULT_USD_RATE = 2.70;

/* Matching rings (Musty, Nov 24): the closest giggers get the first
   ~2-minute window, then the ring widens — ring 0 is the closest 3,
   ring 1 the closest 6, ring 2 everybody matching in the parish. */
const RING_WINDOW_MINUTES = 2;
const RING_SIZES = [3, 6, Infinity];

/* Job categories — Musty's deck, Nov 24 (12 named). Four more slots are
   kept open (MAX_CATEGORIES 16); the extra names come from Musty, never
   invented here. */
const MAX_CATEGORIES = 16;

/* St. Lucia parishes (quarters). MVP pilot is Castries only. */
const PARISHES = [
  'Castries',
  'Gros Islet',
  'Babonneau',
  'Dennery',
  'Micoud',
  'Vieux Fort',
  'Laborie',
  'Choiseul',
  'Soufrière',
  'Canaries',
  'Anse la Raye',
];
const PILOT_PARISHES = ['Castries'];

const CATEGORIES = [
  'Courier',
  'Roadside Assistance',
  'Mounting',
  'Moving',
  'Cleaning',
  'Outdoor Help',
  'Home Repairs',
  'Painting',
  'Home Help',
  'Tech Install',
  'Beautification',
  'Gardening',
];

/* Suggested EC$ price ranges (Castries, per gig) for the five categories
   carried over from the MVP guide — NOT market-verified rates. The other
   seven categories show no guide until Musty sets ranges for them. */
const PRICE_GUIDE = {
  'Cleaning': [80, 150],
  'Gardening': [75, 150],
  'Painting': [150, 400],
  'Moving': [150, 400],
  'Courier': [25, 80],
};

/* Commission per the ops plan: 15% standard, 10% at 20+ gigs in the
   calendar month, 5% Giggit Pro. (The plan's "Micro-gig fee: Flat EC$50"
   line is ambiguous — open question for Musty, NOT encoded here.) */
const COMMISSION_STANDARD = 0.15;
const COMMISSION_VOLUME = 0.10;
const COMMISSION_PRO = 0.05;
const VOLUME_THRESHOLD = 20;

/* Gig lifecycle: open → accepted → in_progress → completion_requested →
   completed → released (auto after the 1h dispute window).
   disputed freezes escrow; cancelled ends the gig with escrow returned. */
const GIG_STATUSES = [
  'open',
  'accepted',
  'in_progress',
  'completion_requested',
  'completed',
  'released',
  'disputed',
  'cancelled',
];

class ValidationError extends Error {}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLen) {
  let text = String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  text = text.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLen) text = text.slice(0, maxLen).trim();
  return text;
}

function cleanMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > 10000) return null;
  return Math.round(num * 100) / 100;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function cleanCoord(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Math.round(num * 100000) / 100000;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

function validatePhoto(photo) {
  if (!photo) return null;
  const dataUrl = String(photo.dataUrl || '');
  const name = cleanText(photo.name, 120);
  const type = String(photo.type || '');
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || !PHOTO_TYPES.has(match[1]) || !PHOTO_TYPES.has(type)) {
    throw new ValidationError('Photo must be a JPEG, PNG or WebP image.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_PHOTO_BYTES || bytes.length === 0) {
    throw new ValidationError('Photo must be under 2 MB.');
  }
  return { name: name || 'photo', type: match[1], dataUrl };
}

function cleanLatLng(body) {
  const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== '';
  const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== '';
  if (!hasLat && !hasLng) return { lat: null, lng: null };
  const lat = hasLat ? cleanCoord(body.lat, -90, 90) : null;
  const lng = hasLng ? cleanCoord(body.lng, -180, 180) : null;
  if (lat === null || lng === null) {
    throw new ValidationError('That location does not look right — use the “Use my location” button.');
  }
  return { lat, lng };
}

function loadSeed() {
  try {
    return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  } catch (err) {
    return { giggers: [], gigs: [], ratings: [], ledger: [], pushSubscriptions: [] };
  }
}

function emptyState() {
  return {
    giggers: [], gigs: [], ratings: [], ledger: [], pushSubscriptions: [],
    events: [],
    messages: [],
    promos: [],
    settings: {
      usdRate: DEFAULT_USD_RATE,
      disputeWindowMinutes: DEFAULT_DISPUTE_WINDOW_MINUTES,
      sosPhone: '',
      sosLabel: 'Giggit emergency contact',
    },
  };
}

function load() {
  let state;
  try {
    const parsed = JSON.parse(fs.readFileSync(LIVE_PATH, 'utf8'));
    if (parsed && Array.isArray(parsed.giggers) && Array.isArray(parsed.gigs)) {
      state = parsed;
    }
  } catch (err) {
    /* No live file yet (or corrupt) — fall through to seed. */
  }
  if (!state) {
    state = loadSeed();
  }
  for (const key of ['giggers', 'gigs', 'ratings', 'ledger', 'pushSubscriptions', 'messages', 'promos']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  if (!Array.isArray(state.events)) state.events = [];
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.settings.usdRate = Number.isFinite(Number(state.settings.usdRate))
    ? Number(state.settings.usdRate) : DEFAULT_USD_RATE;
  state.settings.disputeWindowMinutes = Number.isInteger(state.settings.disputeWindowMinutes)
    ? Math.min(MAX_DISPUTE_WINDOW_MINUTES, Math.max(MIN_DISPUTE_WINDOW_MINUTES, state.settings.disputeWindowMinutes))
    : DEFAULT_DISPUTE_WINDOW_MINUTES;
  if (typeof state.settings.sosPhone !== 'string') state.settings.sosPhone = '';
  if (typeof state.settings.sosLabel !== 'string' || !state.settings.sosLabel.trim()) {
    state.settings.sosLabel = 'Giggit emergency contact';
  }
  /* Lazy escrow sweep: release anything whose dispute window closed. */
  if (sweepReleases(state)) save(state);
  /* Lazy ring widening: advance any open gig past its window. */
  if (sweepRings(state)) save(state);
  return state;
}

function save(state) {
  const dir = path.dirname(LIVE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${LIVE_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, LIVE_PATH);
}

/* ---- Settings, currency, events, rings ---- */

function settingsOf(state) {
  return {
    usdRate: Number.isFinite(Number(state.settings && state.settings.usdRate))
      ? Number(state.settings.usdRate) : DEFAULT_USD_RATE,
    disputeWindowMinutes: Number.isInteger(state.settings && state.settings.disputeWindowMinutes)
      ? state.settings.disputeWindowMinutes : DEFAULT_DISPUTE_WINDOW_MINUTES,
  };
}

function disputeWindowMs(state) {
  return settingsOf(state).disputeWindowMinutes * 60 * 1000;
}

function xcdToUsd(rate, ec) {
  if (ec == null) return null;
  return Math.round((Number(ec) / rate) * 100) / 100;
}

function usdToXcd(rate, usd) {
  return Math.round(Number(usd) * rate * 100) / 100;
}

/* Tracking events for the six groups (matching, supply, demand, money,
   trust, growth). The events feed is what the later dashboard reads;
   the store keeps the last 500. */
function logEvent(state, group, type, gigId, data) {
  if (!Array.isArray(state.events)) state.events = [];
  state.events.unshift({
    id: `evt-${randomUUID().slice(0, 8)}`,
    group, type,
    gigId: gigId || null,
    giggerId: (data && data.giggerId) || null,
    at: nowIso(),
    data: data || {},
  });
  if (state.events.length > 500) state.events.length = 500;
}

/* Which ring an open gig is in right now: 0 for the first ~2 minutes,
   1 for the next 2, 2 after that. Pure — computed from createdAt. */
function currentRing(gig, now) {
  const elapsedMin = (now - Date.parse(gig.createdAt)) / 60000;
  if (elapsedMin < RING_WINDOW_MINUTES) return 0;
  if (elapsedMin < RING_WINDOW_MINUTES * 2) return 1;
  return 2;
}

function ringForRank(index) {
  if (index < RING_SIZES[0]) return 0;
  if (index < RING_SIZES[1]) return 1;
  return 2;
}

/* Shared ranking used by matches + ring enforcement: skill + parish,
   closest first (GPS km → same area → same parish → no location). */
function rankMatches(state, gig) {
  return state.giggers
    .filter((gigger) => gigger.skills.includes(gig.category) && gigger.parish === gig.parish)
    .map((gigger) => {
      let distanceKm = null;
      let basis = 'no-location';
      let rank = 3000;
      if (gig.lat != null && gig.lng != null && gigger.lat != null && gigger.lng != null) {
        distanceKm = haversineKm(gig.lat, gig.lng, gigger.lat, gigger.lng);
        basis = 'gps';
        rank = distanceKm;
      } else if (gig.area && gigger.area && gig.area.trim().toLowerCase() === gigger.area.trim().toLowerCase()) {
        basis = 'same-area';
        rank = 1000;
      } else {
        basis = 'same-parish';
        rank = 2000;
      }
      return { gigger, distanceKm, basis, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.gigger.name.localeCompare(b.gigger.name));
}

/* Widen queue: when a ring advances, the giggers newly inside it get a
   push. load() advances the ring + logs the event; routes drain the
   queue and send the pushes (best-effort, never blocks the read). */
let widenQueue = [];

function drainWidenQueue() {
  const queued = widenQueue;
  widenQueue = [];
  return queued;
}

/* Advance any open gig whose ring moved. Returns true when anything
   changed (so load() can persist it). */
function sweepRings(state) {
  const now = Date.now();
  let changed = false;
  for (const gig of state.gigs) {
    if (gig.status !== 'open') continue;
    const ring = currentRing(gig, now);
    const stored = Number.isInteger(gig.ring) ? gig.ring : 0;
    if (ring <= stored) continue;
    gig.ring = ring;
    const ranked = rankMatches(state, gig);
    const newGiggers = ranked
      .map((entry, index) => ({ entry, index }))
      .filter(({ index }) => ringForRank(index) === ring)
      .map(({ entry }) => entry.gigger.id);
    logEvent(state, 'matching', 'ring_widened', gig.id, { ring, newGiggerCount: newGiggers.length });
    if (newGiggers.length) {
      widenQueue.push({ gigId: gig.id, category: gig.category, title: gig.title, ring, giggerIds: newGiggers });
    }
    changed = true;
  }
  return changed;
}

async function sendPushToGigger(state, giggerId, title, body) {
  const sub = state.pushSubscriptions.find((entry) => entry.giggerId === giggerId);
  if (!sub) return false;
  try {
    const webPush = require('web-push');
    const keys = getVapidKeys();
    webPush.setVapidDetails('mailto:taig2k@outlook.com', keys.publicKey, keys.privateKey);
    await webPush.sendNotification(sub, JSON.stringify({ title, body, url: '/giggit/' }));
    return true;
  } catch (err) {
    return false;
  }
}

async function notifyRinged(job) {
  const state = load();
  for (const giggerId of job.giggerIds) {
    await sendPushToGigger(state, giggerId,
      'Giggit: a ' + job.category + ' gig near you opened up',
      job.title + ' — it just widened to your ring. Open Giggit to accept.');
  }
}

/* Client pushes (gap-close, Nov 26): a subscription can link to a
   customer phone instead of a Gigger id, so the client side of a gig
   can be reached too. */
async function sendPushToCustomer(state, customerPhone, title, body) {
  const phone = String(customerPhone || '').trim();
  if (!phone) return false;
  const sub = state.pushSubscriptions.find((entry) => entry.customerPhone === phone);
  if (!sub) return false;
  try {
    const webPush = require('web-push');
    const keys = getVapidKeys();
    webPush.setVapidDetails('mailto:taig2k@outlook.com', keys.publicKey, keys.privateKey);
    await webPush.sendNotification(sub, JSON.stringify({ title, body, url: '/giggit/' }));
    return true;
  } catch (err) {
    return false;
  }
}

/* Step 10 — escrow-funded notice: the accepted Gigger gets a push the
   moment escrow holds. Best-effort; returns whether it landed. */
async function notifyEscrowHeld(gig) {
  if (!gig || !gig.giggerId) return { notified: null, reason: 'No Gigger on this gig yet.' };
  const state = load();
  const hasSub = state.pushSubscriptions.some((entry) => entry.giggerId === gig.giggerId);
  if (!hasSub) return { notified: null, reason: 'Gigger has no push subscription yet — the gig shows it in the app.' };
  const sent = await sendPushToGigger(state, gig.giggerId,
    'Giggit: escrow held — EC$' + Number(gig.priceEC).toFixed(2) + ' for ' + gig.title,
    'The money is held for "' + gig.title + '". Go do the job.');
  if (!sent) return { notified: null, reason: 'Push failed to send — the gig shows it in the app.' };
  return { notified: gig.giggerId };
}

/* Step 14 — verify notice: the customer gets a push the moment the
   Gigger marks the job done, so they can verify with the code. */
async function notifyVerifyNeeded(gig) {
  if (!gig || !gig.customerPhone) return { notified: null, reason: 'No customer phone on this gig.' };
  const state = load();
  const hasSub = state.pushSubscriptions.some((entry) => entry.customerPhone === gig.customerPhone);
  if (!hasSub) return { notified: null, reason: 'Customer has no push subscription yet — the gig shows it in the app.' };
  const sent = await sendPushToCustomer(state, gig.customerPhone,
    'Giggit: your ' + gig.category + ' gig is marked done',
    '"' + gig.title + '" is done — open Giggit to verify with your completion code.');
  if (!sent) return { notified: null, reason: 'Push failed to send — the gig shows it in the app.' };
  return { notified: gig.customerPhone };
}

/* Release escrow for completed gigs past the dispute window. Returns
   true when anything changed (so load() can persist it). */
function sweepReleases(state) {
  const now = Date.now();
  let changed = false;
  for (const gig of state.gigs) {
    if (gig.status !== 'completed' || !gig.escrow || gig.escrow.status !== 'held') continue;
    if (!gig.escrow.releaseAt || Date.parse(gig.escrow.releaseAt) > now) continue;
    const rate = commissionRateFor(state, gig.giggerId, gig.completedAt);
    const fee = Math.round(gig.priceEC * rate * 100) / 100;
    const payout = Math.round((gig.priceEC - fee) * 100) / 100;
    gig.status = 'released';
    gig.escrow.status = 'released';
    gig.escrow.releasedAt = nowIso();
    gig.escrow.commissionRate = rate;
    gig.escrow.commissionEC = fee;
    gig.escrow.payoutEC = payout;
    state.ledger.push(
      { id: `led-${randomUUID().slice(0, 8)}`, gigId: gig.id, giggerId: gig.giggerId, type: 'release', amountEC: payout, at: nowIso(), note: 'Escrow released after dispute window' },
      { id: `led-${randomUUID().slice(0, 8)}`, gigId: gig.id, giggerId: gig.giggerId, type: 'fee', amountEC: fee, at: nowIso(), note: `Giggit commission ${Math.round(rate * 100)}%` },
    );
    logEvent(state, 'money', 'escrow_released', gig.id, { giggerId: gig.giggerId, amountEC: gig.priceEC, payoutEC: payout, commissionEC: fee });
    if (!state.gigs.some((other) => other !== gig && other.giggerId === gig.giggerId && other.status === 'released')) {
      logEvent(state, 'growth', 'gigger_first_release', gig.id, { giggerId: gig.giggerId });
    }
    changed = true;
  }
  return changed;
}

function commissionRateFor(state, giggerId, atIso) {
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (gigger && gigger.pro === true) return COMMISSION_PRO;
  const at = atIso ? new Date(atIso) : new Date();
  const monthKey = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  const releasedThisMonth = state.gigs.filter(
    (gig) => gig.giggerId === giggerId
      && gig.status === 'released'
      && gig.escrow && gig.escrow.releasedAt
      && gig.escrow.releasedAt.slice(0, 7) === monthKey,
  ).length;
  if (releasedThisMonth >= VOLUME_THRESHOLD) return COMMISSION_VOLUME;
  return COMMISSION_STANDARD;
}

function publicGigger(gigger) {
  return {
    id: gigger.id,
    name: gigger.name,
    parish: gigger.parish,
    area: gigger.area,
    skills: gigger.skills,
    certifications: gigger.certifications || [],
    tier: gigger.tier,
    pro: !!gigger.pro,
    ratingAvg: gigger.ratingAvg || null,
    ratingCount: gigger.ratingCount || 0,
    gigsCompleted: gigger.gigsCompleted || 0,
    bio: gigger.bio || '',
    galleryCount: Array.isArray(gigger.gallery) ? gigger.gallery.length : 0,
    hasGallery: Array.isArray(gigger.gallery) && gigger.gallery.length > 0,
    sample: !!gigger.sample,
    createdAt: gigger.createdAt,
  };
}

function publicGig(gig, opts) {
  const showContacts = opts && opts.showContacts;
  const includePhoto = opts && opts.includePhoto;
  const rate = (opts && opts.rate) || DEFAULT_USD_RATE;
  const out = {
    id: gig.id,
    category: gig.category,
    title: gig.title,
    description: gig.description,
    parish: gig.parish,
    area: gig.area,
    pricingMode: gig.pricingMode || 'budget',
    priceEC: gig.priceEC,
    priceUSD: xcdToUsd(rate, gig.priceEC),
    postedIn: gig.postedIn || 'XCD',
    postedAmount: gig.postedAmount != null ? gig.postedAmount : null,
    promoCode: gig.promoCode || null,
    priceBeforePromoEC: gig.priceBeforePromoEC != null ? gig.priceBeforePromoEC : null,
    discountEC: gig.discountEC != null ? gig.discountEC : null,
    priceGuide: PRICE_GUIDE[gig.category] || null,
    quotes: (gig.quotes || []).map((quote) => ({
      giggerId: quote.giggerId,
      giggerName: quote.giggerName,
      amountEC: quote.amountEC,
      amountUSD: xcdToUsd(rate, quote.amountEC),
      postedIn: quote.postedIn || 'XCD',
      postedAmount: quote.postedAmount != null ? quote.postedAmount : null,
      createdAt: quote.createdAt,
    })),
    ring: gig.status === 'open' ? currentRing(gig, Date.now()) : (Number.isInteger(gig.ring) ? gig.ring : null),
    hasPhoto: !!gig.photo,
    lat: gig.lat != null ? gig.lat : null,
    lng: gig.lng != null ? gig.lng : null,
    status: gig.status,
    giggerId: gig.giggerId || null,
    giggerName: gig.giggerName || null,
    completionCode: gig.status === 'accepted' || gig.status === 'in_progress' || gig.status === 'completion_requested'
      ? gig.completionCode : undefined,
    escrow: gig.escrow ? {
      amountEC: gig.escrow.amountEC,
      status: gig.escrow.status,
      releaseAt: gig.escrow.releaseAt || null,
      releasedAt: gig.escrow.releasedAt || null,
      commissionRate: gig.escrow.commissionRate ?? null,
      commissionEC: gig.escrow.commissionEC ?? null,
      payoutEC: gig.escrow.payoutEC ?? null,
    } : null,
    ratings: gig.ratings || [],
    sample: !!gig.sample,
    createdAt: gig.createdAt,
    acceptedAt: gig.acceptedAt || null,
    arrivedAt: gig.arrivedAt || null,
    startedAt: gig.startedAt || null,
    doneRequestedAt: gig.doneRequestedAt || null,
    completedAt: gig.completedAt || null,
    cancelledBy: gig.cancelledBy || null,
    cancelReason: gig.cancelReason || null,
    dispute: gig.dispute || null,
    when: gig.when || null,
    rejections: (gig.rejections || []).map((entry) => ({ giggerId: entry.giggerId, giggerName: entry.giggerName, at: entry.at })),
  };
  if (showContacts) {
    out.customerName = gig.customerName;
    out.customerPhone = gig.customerPhone;
    out.giggerPhone = gig.giggerPhone || null;
  }
  if (includePhoto && gig.photo) out.photo = gig.photo;
  return out;
}

function gigPhoto(id) {
  const state = load();
  const gig = state.gigs.find((entry) => entry.id === id);
  return gig && gig.photo ? gig.photo : null;
}

function validateGigger(body) {
  const name = cleanText(body.name, 100);
  if (name.length < 2) throw new ValidationError('Name needs at least 2 characters.');
  const phone = cleanText(body.phone, 40);
  if (phone.length < 7) throw new ValidationError('Give a phone number so customers can reach you.');
  const parish = cleanText(body.parish, 40);
  if (!PILOT_PARISHES.includes(parish)) {
    throw new ValidationError('The pilot is Castries only for now — pick Castries as your parish.');
  }
  const area = cleanText(body.area, 80);
  const idType = cleanText(body.idType, 40);
  if (!['National ID', 'Driver’s Licence', 'Passport'].includes(idType)) {
    throw new ValidationError('Pick an ID type: National ID, Driver’s Licence or Passport.');
  }
  const idNumber = cleanText(body.idNumber, 40);
  if (idNumber.length < 4) throw new ValidationError('Give your ID number for Level 1 verification.');
  const skills = Array.isArray(body.skills)
    ? [...new Set(body.skills.map((s) => cleanText(s, 40)).filter((s) => CATEGORIES.includes(s)))].slice(0, 8)
    : [];
  if (!skills.length) throw new ValidationError('Pick at least one skill.');
  /* Certifications are OPTIONAL and self-declared — the ID card above is
     what verifies a Gigger (Level 1). Certs show on the profile as-is. */
  const certifications = Array.isArray(body.certifications)
    ? [...new Map(body.certifications.map((entry) => {
        const cert = typeof entry === 'string'
          ? { name: cleanText(entry, 80), issuer: '' }
          : { name: cleanText(entry && entry.name, 80), issuer: cleanText(entry && entry.issuer, 80) };
        return [cert.name.toLowerCase(), cert];
      })).values()].filter((cert) => cert.name.length >= 2).slice(0, 6)
    : [];
  /* Profile (gap-close slice 3): a short bio and up to 6 gallery photos.
     Photos follow the same rule as gig photos — JPEG/PNG/WebP, under
     2 MB each. One bad photo fails the registration with a plain error. */
  const bio = cleanText(body.bio, 500);
  const gallery = Array.isArray(body.gallery)
    ? body.gallery.slice(0, 6).map((entry) => validatePhoto(entry)).filter(Boolean)
    : [];
  const { lat, lng } = cleanLatLng(body);
  return { name, phone, parish, area, idType, idNumber, skills, certifications, bio, gallery, lat, lng };
}

function validateGig(body, usdRate) {
  const category = cleanText(body.category, 40);
  if (!CATEGORIES.includes(category)) throw new ValidationError('Pick a service category from the list.');
  const title = cleanText(body.title, 120);
  if (title.length < 3) throw new ValidationError('Title needs at least 3 characters.');
  const description = cleanText(body.description, 2000);
  if (description.length < 20) throw new ValidationError('Description needs at least 20 characters.');
  const parish = cleanText(body.parish, 40);
  if (!PILOT_PARISHES.includes(parish)) {
    throw new ValidationError('The pilot is Castries only for now — pick Castries as the parish.');
  }
  const area = cleanText(body.area, 80);
  /* Pricing (Musty, Nov 24): the customer either sets a budget OR asks
     for an actual quote — both options. A budget is stored in EC$
     (canonical); if the customer ticked USD, convert at today's rate. */
  const pricingMode = String(body.pricingMode || 'budget') === 'quote' ? 'quote' : 'budget';
  const postedIn = String(body.currency || 'XCD').toUpperCase() === 'USD' ? 'USD' : 'XCD';
  const postedAmount = cleanMoney(body.priceEC);
  let priceEC = null;
  if (pricingMode === 'budget') {
    if (postedAmount === null) throw new ValidationError('Give a budget in EC$ (more than 0) — or ask Giggers to quote instead.');
    priceEC = postedIn === 'USD' ? usdToXcd(usdRate, postedAmount) : postedAmount;
  }
  const customerName = cleanText(body.customerName, 100);
  if (customerName.length < 2) throw new ValidationError('Your name needs at least 2 characters.');
  const customerPhone = cleanText(body.customerPhone, 40);
  if (customerPhone.length < 7) throw new ValidationError('Give a phone number so the Gigger can reach you.');
  const when = cleanText(body.when, 120);
  const photo = validatePhoto(body.photo || null);
  const { lat, lng } = cleanLatLng(body);
  return { category, title, description, parish, area, pricingMode, priceEC, postedIn, postedAmount: pricingMode === 'budget' ? postedAmount : null, customerName, customerPhone, when, photo, lat, lng };
}

function createGigger(body) {
  const fields = validateGigger(body);
  const state = load();
  const gigger = {
    id: `ggr-${randomUUID().slice(0, 8)}`,
    ...fields,
    tier: 1,
    pro: false,
    ratingAvg: null,
    ratingCount: 0,
    gigsCompleted: 0,
    createdAt: nowIso(),
  };
  state.giggers.unshift(gigger);
  logEvent(state, 'supply', 'gigger_registered', null, { giggerId: gigger.id, parish: gigger.parish, skills: gigger.skills, certifications: gigger.certifications.length });
  save(state);
  return publicGigger(gigger);
}

function listGiggers() {
  return load().giggers.map(publicGigger);
}

/* ---- Provider profiles (gap-close slice 3) ---- */
/* A profile is the Gigger's public face: bio, gallery photos, and the
   customer ratings their released gigs earned. Photos are stored like
   gig photos (data URL in state, raw bytes via the gallery endpoint)
   and never leak the phone or ID number. */

function giggerProfile(id) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === id);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  return { gigger: publicGigger(gigger), ratings: giggerRatings(id) };
}

function giggerRatings(giggerId) {
  const state = load();
  return state.ratings
    .filter((entry) => entry.by === 'customer')
    .map((entry) => {
      const gig = state.gigs.find((item) => item.id === entry.gigId);
      return gig && gig.giggerId === giggerId
        ? { gigId: gig.id, gigTitle: gig.title, category: gig.category, stars: entry.stars, comment: entry.comment, at: entry.at }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function giggerPhoto(id, index) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === id);
  if (!gigger || !Array.isArray(gigger.gallery)) return null;
  const i = Number(index);
  return gigger.gallery[i] || null;
}

function updateGigger(id, body) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === id);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  if (body.bio !== undefined) gigger.bio = cleanText(body.bio, 500);
  save(state);
  return publicGigger(gigger);
}

function addGiggerPhoto(id, photo) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === id);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  if (!Array.isArray(gigger.gallery)) gigger.gallery = [];
  if (gigger.gallery.length >= 6) throw new ValidationError('A profile holds up to 6 photos — remove one first.');
  const clean = validatePhoto(photo);
  if (!clean) throw new ValidationError('Photo must be a JPEG, PNG or WebP image.');
  gigger.gallery.push(clean);
  save(state);
  return publicGigger(gigger);
}

function removeGiggerPhoto(id, index) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === id);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  const i = Number(index);
  if (!Array.isArray(gigger.gallery) || !Number.isInteger(i) || i < 0 || i >= gigger.gallery.length) {
    throw new ValidationError('That photo was not found.');
  }
  gigger.gallery.splice(i, 1);
  save(state);
  return publicGigger(gigger);
}

function createGig(body) {
  const state = load();
  const fields = validateGig(body, settingsOf(state).usdRate);
  /* Promo (slice 5): a code at booking discounts a set-budget gig.
     Quote gigs have no price yet, so they refuse the code plainly. */
  let promo = null;
  if (body.promoCode !== undefined && body.promoCode !== null && String(body.promoCode).trim() !== '') {
    if (fields.pricingMode === 'quote') {
      throw new ValidationError('Promo codes apply to set-budget gigs — this one asks for quotes.');
    }
    promo = findUsablePromo(state, body.promoCode);
  }
  const gig = {
    id: `gig-${randomUUID().slice(0, 8)}`,
    ...fields,
    status: 'open',
    giggerId: null,
    giggerName: null,
    giggerPhone: null,
    completionCode: null,
    escrow: null,
    ratings: [],
    quotes: [],
    rejections: [],
    ring: 0,
    promoCode: null,
    priceBeforePromoEC: null,
    discountEC: null,
    createdAt: nowIso(),
  };
  if (promo) {
    gig.promoCode = promo.code;
    gig.priceBeforePromoEC = fields.priceEC;
    gig.discountEC = Math.round(fields.priceEC * promo.percentOff) / 100;
    gig.priceEC = Math.round((fields.priceEC - gig.discountEC) * 100) / 100;
    promo.uses += 1;
  }
  state.gigs.unshift(gig);
  logEvent(state, 'demand', 'gig_posted', gig.id, { category: gig.category, parish: gig.parish, pricingMode: gig.pricingMode, priceEC: gig.priceEC, postedIn: gig.postedIn });
  if (!state.gigs.some((other) => other !== gig && other.customerPhone === gig.customerPhone)) {
    logEvent(state, 'growth', 'customer_first_gig', gig.id, { customerPhone: gig.customerPhone });
  }
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate });
}

function listGigs(filter) {
  const state = load();
  let gigs = state.gigs;
  if (filter && filter.status) gigs = gigs.filter((gig) => gig.status === filter.status);
  if (filter && filter.parish) gigs = gigs.filter((gig) => gig.parish === filter.parish);
  if (filter && filter.category) gigs = gigs.filter((gig) => gig.category === filter.category);
  if (filter && filter.customerPhone) gigs = gigs.filter((gig) => gig.customerPhone === filter.customerPhone);
  if (filter && filter.q) {
    const needle = String(filter.q).trim().toLowerCase();
    if (needle) gigs = gigs.filter((gig) => (gig.title + ' ' + gig.description).toLowerCase().includes(needle));
  }
  /* Contacts stay hidden until accept — except for the admin lane, which
     passes includeContacts and sees both numbers on every gig. */
  return gigs.map((gig) => publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: !!(filter && filter.includeContacts) }));
}

function getGig(id, includeContacts) {
  const state = load();
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) return null;
  /* Contacts are visible once a Gigger has accepted — both sides need
     each other to coordinate. Before that, numbers stay hidden — except
     for the admin lane (includeContacts), which sees them on every gig. */
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: includeContacts || gig.status !== 'open', includePhoto: true });
}

/* Closest-first matching (Musty's notebook flow): rank the pool by skill
   + parish, closest first. GPS distance when both sides shared a
   location; same area next; same parish after that; no location last.
   distanceKm is a real number only when both sides have GPS — otherwise
   null, and the basis says why. Each match also carries its ring: ring 0
   is the closest 3 (first ~2 minutes), ring 1 the closest 6, ring 2
   everybody matching. inCurrentRing says whether that Gigger can accept
   right now. */
function matchesForGig(id) {
  const state = load();
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) return null;
  const ring = gig.status === 'open' ? currentRing(gig, Date.now()) : null;
  const ranked = rankMatches(state, gig);
  return {
    gig: publicGig(gig, { rate: settingsOf(state).usdRate }),
    currentRing: ring,
    ringWindowMinutes: RING_WINDOW_MINUTES,
    ringSizes: RING_SIZES.map((size) => (Number.isFinite(size) ? size : null)),
    matches: ranked.map((entry, index) => ({
      gigger: publicGigger(entry.gigger),
      distanceKm: entry.distanceKm,
      basis: entry.basis,
      ring: ringForRank(index),
      inCurrentRing: ring === null ? false : index < RING_SIZES[ring],
      rejected: (gig.rejections || []).some((r) => r.giggerId === entry.gigger.id),
    })),
  };
}

async function notifyClosest(gig) {
  const ranked = matchesForGig(gig.id);
  if (!ranked || !ranked.matches.length) {
    return { notified: null, reason: 'No matching gigger in the pool yet.' };
  }
  const closest = ranked.matches[0];
  const priceText = gig.pricingMode === 'quote'
    ? 'asking for quotes'
    : 'EC$' + Number(gig.priceEC).toFixed(2);
  const sent = await sendPushToGigger(load(), closest.gigger.id,
    'Giggit: new ' + gig.category + ' gig near you',
    gig.title + ' — ' + priceText + ', ' + (gig.area || gig.parish) + '. Open Giggit to accept.');
  if (!sent) {
    return { notified: null, reason: 'Closest gigger has no push subscription yet — the gig is listed for them.' };
  }
  return { notified: closest.gigger.id, giggerName: closest.gigger.name, distanceKm: closest.distanceKm, basis: closest.basis };
}

function findGigOrThrow(state, id) {
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) throw new ValidationError('That gig was not found.');
  return gig;
}

/* Shared accept path: mark the gig accepted, set the completion code,
   hold the escrow. Used by direct accept (budget gigs) and quote accept. */
function holdEscrow(state, gig, gigger) {
  gig.status = 'accepted';
  gig.giggerId = gigger.id;
  gig.giggerName = gigger.name;
  gig.giggerPhone = gigger.phone;
  gig.acceptedAt = nowIso();
  gig.completionCode = String(Math.floor(100000 + Math.random() * 900000));
  gig.escrow = {
    amountEC: gig.priceEC,
    status: 'held',
    releaseAt: null,
    releasedAt: null,
    commissionRate: null,
    commissionEC: null,
    payoutEC: null,
  };
  state.ledger.push({
    id: `led-${randomUUID().slice(0, 8)}`, gigId: gig.id, giggerId: gigger.id,
    type: 'hold', amountEC: gig.priceEC, at: nowIso(), note: 'Escrow held on accept',
  });
  logEvent(state, 'money', 'escrow_held', gig.id, { giggerId: gigger.id, amountEC: gig.priceEC });
}

function logAcceptEvents(state, gig, giggerId, ring) {
  const secondsToAccept = Math.round((Date.now() - Date.parse(gig.createdAt)) / 1000);
  if (!state.events.some((entry) => entry.type === 'first_accept' && entry.gigId === gig.id)) {
    logEvent(state, 'matching', 'first_accept', gig.id, { giggerId, secondsSincePost: secondsToAccept });
  }
  logEvent(state, 'matching', 'accept', gig.id, { giggerId, ring });
}

function acceptGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('That gig is no longer open.');
  if (gig.pricingMode === 'quote') {
    throw new ValidationError('This gig is asking for quotes — send a quote first, the customer picks one.');
  }
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found — register first.');
  if (!gigger.skills.includes(gig.category)) {
    throw new ValidationError('That Gigger does not list this service — pick a matching skill first.');
  }
  if ((gig.rejections || []).some((entry) => entry.giggerId === gigger.id)) {
    throw new ValidationError('You already passed on this gig.');
  }
  /* Ring rule: only the current ring can accept. The closest 3 get the
     first ~2 minutes; after that the ring widens. */
  const ring = currentRing(gig, Date.now());
  const ranked = rankMatches(state, gig);
  const position = ranked.findIndex((entry) => entry.gigger.id === gigger.id);
  if (position === -1 || position >= RING_SIZES[ring]) {
    throw new ValidationError('This gig has not widened to you yet — the closest Giggers get the first ' + RING_WINDOW_MINUTES + ' minutes.');
  }
  holdEscrow(state, gig, gigger);
  logAcceptEvents(state, gig, gigger.id, ring);
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

/* Quote flow (Musty, Nov 24): on a quote-mode gig, matching Giggers send
   a quote; the customer picks one, which sets the price and accepts. */
function submitQuote(id, giggerId, amount, currency) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('That gig is no longer open.');
  if (gig.pricingMode !== 'quote') throw new ValidationError('This gig has a set budget — no quotes needed.');
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found — register first.');
  if (!gigger.skills.includes(gig.category)) {
    throw new ValidationError('That Gigger does not list this service — pick a matching skill first.');
  }
  if ((gig.rejections || []).some((entry) => entry.giggerId === gigger.id)) {
    throw new ValidationError('You already passed on this gig.');
  }
  const raw = cleanMoney(amount);
  if (raw === null) throw new ValidationError('Give a quote amount (more than 0).');
  const rate = settingsOf(state).usdRate;
  const postedIn = String(currency || 'XCD').toUpperCase() === 'USD' ? 'USD' : 'XCD';
  const amountEC = postedIn === 'USD' ? usdToXcd(rate, raw) : raw;
  if (!Array.isArray(gig.quotes)) gig.quotes = [];
  const quote = {
    giggerId: gigger.id, giggerName: gigger.name, amountEC, postedIn, postedAmount: raw, createdAt: nowIso(),
  };
  const existing = gig.quotes.find((entry) => entry.giggerId === gigger.id);
  if (existing) Object.assign(existing, quote);
  else gig.quotes.push(quote);
  logEvent(state, 'matching', 'quote_received', gig.id, { giggerId: gigger.id, amountEC });
  save(state);
  return publicGig(gig, { rate, showContacts: false });
}

function acceptQuote(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('That gig is no longer open.');
  if (gig.pricingMode !== 'quote') throw new ValidationError('This gig has a set budget — accept it directly.');
  const quote = (gig.quotes || []).find((entry) => entry.giggerId === giggerId);
  if (!quote) throw new ValidationError('That Gigger has not quoted on this gig yet.');
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  gig.priceEC = quote.amountEC;
  gig.postedIn = quote.postedIn;
  gig.postedAmount = quote.postedAmount;
  holdEscrow(state, gig, gigger);
  logEvent(state, 'money', 'quote_accepted', gig.id, { giggerId: gigger.id, amountEC: quote.amountEC });
  logAcceptEvents(state, gig, gigger.id, currentRing(gig, Date.now()));
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

/* Reject (new, Nov 24 — the drawing's "View / accept / Reject gigs"):
   a Gigger passes on an open gig. The gig stays open for everybody
   else — a reject is a pass, not a claim — so rings do NOT gate it
   (like quotes, only accepts are ring-gated). A Gigger who passed
   cannot later accept or quote on the same gig. Logged as a matching
   event so the pass shows in the tracking feed. */
function rejectGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('That gig is no longer open.');
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found — register first.');
  if (!gigger.skills.includes(gig.category)) {
    throw new ValidationError('That Gigger does not list this service — pick a matching skill first.');
  }
  if (!Array.isArray(gig.rejections)) gig.rejections = [];
  if (gig.rejections.some((entry) => entry.giggerId === gigger.id)) {
    throw new ValidationError('You already passed on this gig.');
  }
  gig.rejections.push({ giggerId: gigger.id, giggerName: gigger.name, at: nowIso() });
  logEvent(state, 'matching', 'gig_rejected', gig.id, { giggerId: gigger.id, ring: currentRing(gig, Date.now()) });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: false });
}

/* Admin edit (new, Nov 24 — the drawing's "edit gig?"): an open gig can
   be corrected before anyone accepts — title, description, category,
   area, when, and (budget gigs only) the budget in EC$. Once accepted
   the deal is set and the gig cannot be edited. Logged as a matching
   event so edits leave a trail. */
function updateGig(id, body) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('Only an open gig can be edited — this one is already ' + gig.status + '.');
  const changed = [];
  if (body.title !== undefined) {
    const title = cleanText(body.title, 120);
    if (title.length < 3) throw new ValidationError('Title needs at least 3 characters.');
    if (title !== gig.title) { gig.title = title; changed.push('title'); }
  }
  if (body.description !== undefined) {
    const description = cleanText(body.description, 2000);
    if (description.length < 20) throw new ValidationError('Description needs at least 20 characters.');
    if (description !== gig.description) { gig.description = description; changed.push('description'); }
  }
  if (body.category !== undefined) {
    const category = cleanText(body.category, 40);
    if (!CATEGORIES.includes(category)) throw new ValidationError('Pick a service category from the list.');
    if (category !== gig.category) { gig.category = category; changed.push('category'); }
  }
  if (body.area !== undefined) {
    const area = cleanText(body.area, 80);
    if (area !== gig.area) { gig.area = area; changed.push('area'); }
  }
  if (body.when !== undefined) {
    const when = cleanText(body.when, 120);
    if (when !== gig.when) { gig.when = when; changed.push('when'); }
  }
  if (body.priceEC !== undefined && body.priceEC !== null && body.priceEC !== '') {
    if (gig.pricingMode === 'quote') {
      throw new ValidationError('A quote gig has no set budget — its price comes from the accepted quote.');
    }
    const priceEC = cleanMoney(body.priceEC);
    if (priceEC === null) throw new ValidationError('Give a budget in EC$ (more than 0).');
    if (priceEC !== gig.priceEC) {
      gig.priceEC = priceEC;
      gig.postedIn = 'XCD';
      gig.postedAmount = priceEC;
      changed.push('priceEC');
    }
  }
  if (!changed.length) throw new ValidationError('Nothing changed — edit at least one field.');
  logEvent(state, 'matching', 'gig_edited', gig.id, { fields: changed });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: false });
}

function arriveGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'accepted') throw new ValidationError('Only an accepted gig can be marked arrived — this one is ' + gig.status + '.');
  if (gig.giggerId !== giggerId) throw new ValidationError('Only the accepted Gigger can mark arrival on this gig.');
  if (gig.arrivedAt) throw new ValidationError('Arrival is already marked on this gig.');
  gig.arrivedAt = nowIso();
  logEvent(state, 'matching', 'job_arrived', gig.id, { giggerId });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function startGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'accepted') throw new ValidationError('Only an accepted gig can start.');
  if (gig.giggerId !== giggerId) throw new ValidationError('Only the accepted Gigger can start this gig.');
  gig.status = 'in_progress';
  gig.startedAt = nowIso();
  logEvent(state, 'matching', 'job_started', gig.id, { giggerId });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function requestComplete(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'in_progress' && gig.status !== 'accepted') {
    throw new ValidationError('Only a gig in progress can be marked done.');
  }
  if (gig.giggerId !== giggerId) throw new ValidationError('Only the accepted Gigger can mark this gig done.');
  gig.status = 'completion_requested';
  gig.doneRequestedAt = nowIso();
  logEvent(state, 'matching', 'job_done_requested', gig.id, { giggerId });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function confirmComplete(id, code) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'completion_requested') {
    throw new ValidationError('The Gigger has to mark the job done first.');
  }
  if (String(code || '').trim() !== String(gig.completionCode)) {
    throw new ValidationError('That completion code does not match.');
  }
  gig.status = 'completed';
  gig.completedAt = nowIso();
  gig.escrow.releaseAt = new Date(Date.now() + disputeWindowMs(state)).toISOString();
  logEvent(state, 'matching', 'job_confirmed', gig.id, { giggerId: gig.giggerId });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function disputeGig(id, by, reason) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'completed') {
    throw new ValidationError('Only a completed gig inside its dispute window can be disputed.');
  }
  if (gig.escrow && gig.escrow.releaseAt && Date.parse(gig.escrow.releaseAt) <= Date.now()) {
    throw new ValidationError('The dispute window has closed — escrow already released.');
  }
  const who = cleanText(by, 20);
  if (who !== 'customer' && who !== 'gigger') throw new ValidationError('Say whether you are the customer or the Gigger.');
  gig.status = 'disputed';
  gig.dispute = { by: who, reason: cleanText(reason, 500), at: nowIso() };
  if (gig.escrow) gig.escrow.status = 'frozen';
  logEvent(state, 'trust', 'dispute_opened', gig.id, { by: who, reason: gig.dispute.reason });
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function cancelGig(id, by, reason) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status === 'released' || gig.status === 'cancelled' || gig.status === 'completed') {
    throw new ValidationError('That gig can no longer be cancelled.');
  }
  const who = cleanText(by, 20);
  if (who !== 'customer' && who !== 'gigger') throw new ValidationError('Say whether you are the customer or the Gigger.');
  gig.status = 'cancelled';
  gig.cancelledBy = who;
  gig.cancelReason = cleanText(reason, 500);
  if (gig.escrow) gig.escrow.status = 'returned';
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function rateGig(id, by, stars, comment) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'released') throw new ValidationError('You can rate once the gig is released.');
  const who = cleanText(by, 20);
  if (who !== 'customer' && who !== 'gigger') throw new ValidationError('Say whether you are the customer or the Gigger.');
  const n = Number(stars);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new ValidationError('Stars must be 1 to 5.');
  const text = cleanText(comment, 500);
  if (n < 3 && text.length < 3) throw new ValidationError('Ratings below 3 stars need a comment — say what went wrong.');
  if (gig.ratings.some((entry) => entry.by === who)) {
    throw new ValidationError('You already rated this gig.');
  }
  const rating = { by: who, stars: n, comment: text, at: nowIso() };
  gig.ratings.push(rating);
  state.ratings.push({ id: `rat-${randomUUID().slice(0, 8)}`, gigId: gig.id, ...rating });
  logEvent(state, 'trust', 'rating_submitted', gig.id, { by: who, stars: n });
  if (who === 'customer') {
    const gigger = state.giggers.find((entry) => entry.id === gig.giggerId);
    if (gigger) {
      const all = state.ratings.filter((entry) => {
        const g = state.gigs.find((item) => item.id === entry.gigId);
        return g && g.giggerId === gigger.id && entry.by === 'customer';
      });
      gigger.ratingCount = all.length;
      gigger.ratingAvg = Math.round((all.reduce((sum, entry) => sum + entry.stars, 0) / all.length) * 10) / 10;
      gigger.gigsCompleted = state.gigs.filter((g) => g.giggerId === gigger.id && g.status === 'released').length;
    }
  }
  save(state);
  return publicGig(gig, { rate: settingsOf(state).usdRate, showContacts: true });
}

function walletFor(giggerId) {
  const state = load();
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found.');
  const entries = state.ledger.filter((entry) => entry.giggerId === giggerId);
  const held = state.gigs
    .filter((gig) => gig.giggerId === giggerId && gig.escrow && gig.escrow.status === 'held')
    .reduce((sum, gig) => sum + gig.escrow.amountEC, 0);
  const available = entries
    .filter((entry) => entry.type === 'release')
    .reduce((sum, entry) => sum + entry.amountEC, 0);
  const fees = entries
    .filter((entry) => entry.type === 'fee')
    .reduce((sum, entry) => sum + entry.amountEC, 0);
  return {
    gigger: publicGigger(gigger),
    heldEC: Math.round(held * 100) / 100,
    availableEC: Math.round(available * 100) / 100,
    feesEC: Math.round(fees * 100) / 100,
    entries: entries.slice(0, 50),
  };
}

/* ---- In-app chat (gap-close slice 2, Nov 26) ---- */
/* Chat opens at accept — the same moment contacts unlock — and stays
   open through release. Messages are plain text, 1–1000 chars. A gig
   keeps its last 200 messages; the store keeps the last 5000 overall.
   Identity follows the MVP's own rule: the Gigger by id, the customer
   by phone. Admin can read (the admin lane already sees both numbers)
   but never sends. */

const CHAT_STATUSES = ['accepted', 'in_progress', 'completion_requested', 'completed', 'released', 'disputed'];

function checkChatParty(gig, by, giggerId, customerPhone) {
  const who = cleanText(by, 20);
  if (who !== 'customer' && who !== 'gigger' && who !== 'admin') {
    throw new ValidationError('Say whether you are the customer, the Gigger, or the admin.');
  }
  if (!CHAT_STATUSES.includes(gig.status)) {
    throw new ValidationError('Chat opens once a Gigger accepts this gig.');
  }
  if (who === 'gigger' && gig.giggerId !== cleanText(giggerId || '', 40)) {
    throw new ValidationError('Only the accepted Gigger can chat on this gig.');
  }
  if (who === 'customer' && gig.customerPhone !== cleanText(customerPhone || '', 40)) {
    throw new ValidationError('Only the customer who posted this gig can chat on it.');
  }
  return who;
}

function sendMessage(gigId, body) {
  const state = load();
  const gig = findGigOrThrow(state, gigId);
  const who = checkChatParty(gig, body.by, body.giggerId, body.customerPhone);
  if (who === 'admin') throw new ValidationError('Only the customer or the Gigger can send messages here.');
  const text = cleanText(body.text, 1000);
  if (text.length < 1) throw new ValidationError('Write a message first.');
  const message = {
    id: `msg-${randomUUID().slice(0, 8)}`,
    gigId: gig.id,
    by: who,
    text,
    at: nowIso(),
  };
  state.messages.push(message);
  const gigMessages = state.messages.filter((entry) => entry.gigId === gig.id);
  if (gigMessages.length > 200) {
    const drop = new Set(gigMessages.slice(0, gigMessages.length - 200).map((entry) => entry.id));
    state.messages = state.messages.filter((entry) => !drop.has(entry.id));
  }
  if (state.messages.length > 5000) state.messages = state.messages.slice(-5000);
  save(state);
  return message;
}

function listMessages(gigId, query) {
  const state = load();
  const gig = findGigOrThrow(state, gigId);
  checkChatParty(gig, query.by, query.giggerId, query.customerPhone);
  return state.messages.filter((entry) => entry.gigId === gig.id);
}

/* ---- Promo codes (gap-close slice 5, Nov 26) ---- */
/* A promo is a percent-off code, created in the admin lane and handed
   out by Tee/Musty. It applies at booking on set-budget gigs only —
   a quote gig has no price yet, so there is nothing to discount.
   The discount comes off the posted budget; escrow holds the reduced
   price, and commission is computed on it. */

function publicPromo(promo) {
  return {
    code: promo.code,
    percentOff: promo.percentOff,
    maxUses: promo.maxUses,
    uses: promo.uses,
    active: promo.active,
    note: promo.note || '',
    createdAt: promo.createdAt,
  };
}

function createPromo(body) {
  const code = cleanText(body.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) throw new ValidationError('Promo code needs at least 3 letters or numbers.');
  const percentOff = Number(body.percentOff);
  if (!Number.isInteger(percentOff) || percentOff < 5 || percentOff > 50) {
    throw new ValidationError('Promo discount must be 5% to 50%.');
  }
  const maxUses = body.maxUses === undefined || body.maxUses === null || body.maxUses === ''
    ? null
    : Number(body.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) {
    throw new ValidationError('Max uses must be 1 to 1000, or blank for unlimited.');
  }
  const state = load();
  if (state.promos.some((entry) => entry.code === code)) {
    throw new ValidationError('That promo code already exists.');
  }
  const promo = {
    code,
    percentOff,
    maxUses,
    uses: 0,
    active: true,
    note: cleanText(body.note, 120),
    createdAt: nowIso(),
  };
  state.promos.unshift(promo);
  save(state);
  return publicPromo(promo);
}

function listPromos() {
  return load().promos.map(publicPromo);
}

function findUsablePromo(state, code) {
  const clean = cleanText(code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const promo = state.promos.find((entry) => entry.code === clean);
  if (!promo) throw new ValidationError('That promo code does not exist.');
  if (!promo.active) throw new ValidationError('That promo code is no longer active.');
  if (promo.maxUses !== null && promo.uses >= promo.maxUses) {
    throw new ValidationError('That promo code has been used up.');
  }
  return promo;
}

/* ---- Settings, events, stats (tracking) ---- */

function getSettings() {
  const settings = settingsOf(load());
  return {
    usdRate: settings.usdRate,
    rateSource: 'EC$ peg — EC$2.70 per US$1 (fixed peg, configurable if the peg ever moves)',
    disputeWindowMinutes: settings.disputeWindowMinutes,
    disputeWindowRange: [MIN_DISPUTE_WINDOW_MINUTES, MAX_DISPUTE_WINDOW_MINUTES],
  };
}

function updateSettings(body) {
  const state = load();
  if (body.usdRate !== undefined && body.usdRate !== null && body.usdRate !== '') {
    const rate = Number(body.usdRate);
    if (!Number.isFinite(rate) || rate < 2.0 || rate > 3.5) {
      throw new ValidationError('The USD rate must be between 2.00 and 3.50.');
    }
    state.settings.usdRate = Math.round(rate * 100) / 100;
  }
  if (body.disputeWindowMinutes !== undefined && body.disputeWindowMinutes !== null && body.disputeWindowMinutes !== '') {
    const mins = Number(body.disputeWindowMinutes);
    if (!Number.isInteger(mins) || mins < MIN_DISPUTE_WINDOW_MINUTES || mins > MAX_DISPUTE_WINDOW_MINUTES) {
      throw new ValidationError('The dispute window must be between 60 minutes (1 hour) and 1440 minutes (1 day).');
    }
    state.settings.disputeWindowMinutes = mins;
  }
  save(state);
  return getSettings();
}

function listEvents(filter) {
  const state = load();
  let events = state.events;
  if (filter && filter.group) events = events.filter((entry) => entry.group === filter.group);
  if (filter && filter.type) events = events.filter((entry) => entry.type === filter.type);
  if (filter && filter.gigId) events = events.filter((entry) => entry.gigId === filter.gigId);
  const limit = Math.min(200, Math.max(1, Number((filter && filter.limit) || 50) || 50));
  return events.slice(0, limit);
}

/* Tracking aggregates for the six groups. Samples are EXCLUDED — the
   numbers must measure real use. Targets are Musty's ops-plan targets. */
function getStats() {
  const state = load();
  const gigs = state.gigs.filter((gig) => !gig.sample);
  const giggers = state.giggers.filter((gigger) => !gigger.sample);
  const firstAccepts = state.events
    .filter((entry) => entry.type === 'first_accept' && Number.isFinite(entry.data && entry.data.secondsSincePost))
    .map((entry) => entry.data.secondsSincePost)
    .sort((a, b) => a - b);
  const medianSeconds = firstAccepts.length ? firstAccepts[Math.floor(firstAccepts.length / 2)] : null;
  const oldEnough = gigs.filter((gig) => Date.now() - Date.parse(gig.createdAt) > 30 * 60 * 1000);
  const zeroResponse = oldEnough.filter((gig) => !state.events.some(
    (entry) => entry.gigId === gig.id && (entry.type === 'accept' || entry.type === 'quote_received'),
  ));
  const released = gigs.filter((gig) => gig.status === 'released');
  const done = gigs.filter((gig) => gig.status === 'completed' || gig.status === 'released');
  const disputed = gigs.filter((gig) => gig.status === 'disputed').length;
  const escrowHeld = gigs
    .filter((gig) => gig.escrow && gig.escrow.status === 'held')
    .reduce((sum, gig) => sum + gig.escrow.amountEC, 0);
  const commission = state.ledger
    .filter((entry) => entry.type === 'fee')
    .reduce((sum, entry) => sum + entry.amountEC, 0);
  const byCategory = {};
  for (const gig of gigs) byCategory[gig.category] = (byCategory[gig.category] || 0) + 1;
  return {
    generatedAt: nowIso(),
    samplesExcluded: { gigs: state.gigs.length - gigs.length, giggers: state.giggers.length - giggers.length },
    matching: {
      medianSecondsToFirstAccept: medianSeconds,
      zeroResponseRate: oldEnough.length ? Math.round((zeroResponse.length / oldEnough.length) * 1000) / 1000 : null,
      zeroResponseCount: zeroResponse.length,
      gigsOldEnoughToJudge: oldEnough.length,
      widenedCount: state.events.filter((entry) => entry.type === 'ring_widened').length,
      note: 'Zero-response = gigs older than 30 minutes with no accept and no quotes.',
    },
    supply: {
      giggers: giggers.length,
      withCertifications: giggers.filter((gigger) => (gigger.certifications || []).length > 0).length,
    },
    demand: {
      gigsPosted: gigs.length,
      byCategory,
      budgetVsQuote: {
        budget: gigs.filter((gig) => gig.pricingMode !== 'quote').length,
        quote: gigs.filter((gig) => gig.pricingMode === 'quote').length,
      },
    },
    money: {
      escrowHeldEC: Math.round(escrowHeld * 100) / 100,
      totalCommissionEC: Math.round(commission * 100) / 100,
      avgGigValueEC: gigs.length
        ? Math.round((gigs.reduce((sum, gig) => sum + (gig.priceEC || 0), 0) / gigs.length) * 100) / 100
        : null,
    },
    trust: {
      completionRate: gigs.length ? Math.round((done.length / gigs.length) * 1000) / 1000 : null,
      releasedCount: released.length,
      disputedCount: disputed,
    },
    growth: {
      customersFirstGig: state.events.filter((entry) => entry.type === 'customer_first_gig').length,
      giggersFirstRelease: state.events.filter((entry) => entry.type === 'gigger_first_release').length,
    },
    targets: {
      acceptanceWithin30Min: '>85%',
      completion: '>95%',
      onboardingHours: '<48',
      disputeHours: '<24',
      paymentDays: '<2',
    },
  };
}

/* ---- Web push (VAPID) ---- */

function getVapidKeys() {
  try {
    const parsed = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
    if (parsed && parsed.publicKey && parsed.privateKey) return parsed;
  } catch (err) {
    /* Missing — generate below. */
  }
  const webPush = require('web-push');
  const keys = webPush.generateVAPIDKeys();
  const dir = path.dirname(VAPID_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2), 'utf8');
  return keys;
}

function savePushSubscription(subscription, giggerId, customerPhone) {
  const endpoint = String((subscription && subscription.endpoint) || '');
  const keys = (subscription && subscription.keys) || {};
  if (!endpoint.startsWith('https://') || !keys.p256dh || !keys.auth) {
    throw new ValidationError('That push subscription does not look right.');
  }
  const gid = cleanText(giggerId || '', 40);
  const phone = cleanText(customerPhone || '', 40);
  const state = load();
  const linkedId = gid && state.giggers.some((entry) => entry.id === gid) ? gid : null;
  state.pushSubscriptions = state.pushSubscriptions.filter((entry) => entry.endpoint !== endpoint);
  state.pushSubscriptions.unshift({ endpoint, keys, giggerId: linkedId, customerPhone: phone || null, createdAt: nowIso() });
  save(state);
  return { saved: true, count: state.pushSubscriptions.length };
}

function listPushSubscriptions() {
  return load().pushSubscriptions;
}

module.exports = {
  PARISHES,
  PILOT_PARISHES,
  CATEGORIES,
  MAX_CATEGORIES,
  PRICE_GUIDE,
  COMMISSION_STANDARD,
  COMMISSION_VOLUME,
  COMMISSION_PRO,
  DEFAULT_USD_RATE,
  DEFAULT_DISPUTE_WINDOW_MINUTES,
  RING_WINDOW_MINUTES,
  RING_SIZES,
  ValidationError,
  getVapidKeys,
  createGigger,
  listGiggers,
  giggerProfile,
  giggerRatings,
  giggerPhoto,
  updateGigger,
  addGiggerPhoto,
  removeGiggerPhoto,
  createGig,
  listGigs,
  getGig,
  gigPhoto,
  matchesForGig,
  notifyClosest,
  notifyRinged,
  notifyEscrowHeld,
  notifyVerifyNeeded,
  drainWidenQueue,
  acceptGig,
  rejectGig,
  updateGig,
  submitQuote,
  acceptQuote,
  arriveGig,
  startGig,
  requestComplete,
  confirmComplete,
  disputeGig,
  cancelGig,
  rateGig,
  sendMessage,
  listMessages,
  createPromo,
  listPromos,
  walletFor,
  getSettings,
  updateSettings,
  listEvents,
  getStats,
  savePushSubscription,
  listPushSubscriptions,
};
