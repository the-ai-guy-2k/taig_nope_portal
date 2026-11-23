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

/* 1-hour dispute window after completion, per the ops plan. Escrow
   releases automatically when the window closes with no dispute. */
const DISPUTE_WINDOW_MS = 60 * 60 * 1000;

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
  'Cleaning',
  'Gardening & Yard Work',
  'Painting',
  'Plumbing',
  'Electrical',
  'Carpentry',
  'Housekeeping',
  'Cooking & Catering',
  'Delivery & Errands',
  'Caregiving',
  'Childcare',
  'Moving & Hauling',
  'Laundry & Ironing',
  'Farming & Fishing Help',
  'Tour Guide',
  'Event Help',
  'Other',
];

/* Suggested EC$ price ranges (Castries, per gig). These are MVP guide
   numbers for the pilot — NOT market-verified rates. The ops plan's smart
   pricing (parish averages, complexity, travel) is a later phase. */
const PRICE_GUIDE = {
  'Cleaning': [80, 150],
  'Gardening & Yard Work': [75, 150],
  'Painting': [150, 400],
  'Plumbing': [100, 300],
  'Electrical': [120, 350],
  'Carpentry': [150, 400],
  'Housekeeping': [80, 150],
  'Cooking & Catering': [100, 250],
  'Delivery & Errands': [25, 80],
  'Caregiving': [100, 200],
  'Childcare': [80, 160],
  'Moving & Hauling': [150, 400],
  'Laundry & Ironing': [40, 100],
  'Farming & Fishing Help': [60, 120],
  'Tour Guide': [150, 300],
  'Event Help': [80, 180],
  'Other': [50, 200],
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
  return { giggers: [], gigs: [], ratings: [], ledger: [], pushSubscriptions: [] };
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
  for (const key of ['giggers', 'gigs', 'ratings', 'ledger', 'pushSubscriptions']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  /* Lazy escrow sweep: release anything whose dispute window closed. */
  if (sweepReleases(state)) save(state);
  return state;
}

function save(state) {
  const dir = path.dirname(LIVE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${LIVE_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, LIVE_PATH);
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
    tier: gigger.tier,
    pro: !!gigger.pro,
    ratingAvg: gigger.ratingAvg || null,
    ratingCount: gigger.ratingCount || 0,
    gigsCompleted: gigger.gigsCompleted || 0,
    sample: !!gigger.sample,
    createdAt: gigger.createdAt,
  };
}

function publicGig(gig, opts) {
  const showContacts = opts && opts.showContacts;
  const includePhoto = opts && opts.includePhoto;
  const out = {
    id: gig.id,
    category: gig.category,
    title: gig.title,
    description: gig.description,
    parish: gig.parish,
    area: gig.area,
    priceEC: gig.priceEC,
    priceGuide: PRICE_GUIDE[gig.category] || null,
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
    completedAt: gig.completedAt || null,
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
  const { lat, lng } = cleanLatLng(body);
  return { name, phone, parish, area, idType, idNumber, skills, lat, lng };
}

function validateGig(body) {
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
  const priceEC = cleanMoney(body.priceEC);
  if (priceEC === null) throw new ValidationError('Give a price in EC$ (more than 0).');
  const customerName = cleanText(body.customerName, 100);
  if (customerName.length < 2) throw new ValidationError('Your name needs at least 2 characters.');
  const customerPhone = cleanText(body.customerPhone, 40);
  if (customerPhone.length < 7) throw new ValidationError('Give a phone number so the Gigger can reach you.');
  const when = cleanText(body.when, 120);
  const photo = validatePhoto(body.photo || null);
  const { lat, lng } = cleanLatLng(body);
  return { category, title, description, parish, area, priceEC, customerName, customerPhone, when, photo, lat, lng };
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
  save(state);
  return publicGigger(gigger);
}

function listGiggers() {
  return load().giggers.map(publicGigger);
}

function createGig(body) {
  const fields = validateGig(body);
  const state = load();
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
    createdAt: nowIso(),
  };
  state.gigs.unshift(gig);
  save(state);
  return publicGig(gig);
}

function listGigs(filter) {
  const state = load();
  let gigs = state.gigs;
  if (filter && filter.status) gigs = gigs.filter((gig) => gig.status === filter.status);
  if (filter && filter.parish) gigs = gigs.filter((gig) => gig.parish === filter.parish);
  if (filter && filter.category) gigs = gigs.filter((gig) => gig.category === filter.category);
  return gigs.map((gig) => publicGig(gig));
}

function getGig(id) {
  const state = load();
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) return null;
  /* Contacts are visible once a Gigger has accepted — both sides need
     each other to coordinate. Before that, numbers stay hidden. */
  return publicGig(gig, { showContacts: gig.status !== 'open', includePhoto: true });
}

/* Closest-first matching (Musty's notebook flow): rank the pool by skill
   + parish, closest first. GPS distance when both sides shared a
   location; same area next; same parish after that; no location last.
   distanceKm is a real number only when both sides have GPS — otherwise
   null, and the basis says why. */
function matchesForGig(id) {
  const state = load();
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) return null;
  const ranked = state.giggers
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
      return { gigger: publicGigger(gigger), distanceKm, basis, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.gigger.name.localeCompare(b.gigger.name));
  return {
    gig: publicGig(gig),
    matches: ranked.map((entry) => ({ gigger: entry.gigger, distanceKm: entry.distanceKm, basis: entry.basis })),
  };
}

async function notifyClosest(gig) {
  const ranked = matchesForGig(gig.id);
  if (!ranked || !ranked.matches.length) {
    return { notified: null, reason: 'No matching gigger in the pool yet.' };
  }
  const closest = ranked.matches[0];
  const state = load();
  const sub = state.pushSubscriptions.find((entry) => entry.giggerId === closest.gigger.id);
  if (!sub) {
    return { notified: null, reason: 'Closest gigger has no push subscription yet — the gig is listed for them.' };
  }
  try {
    const webPush = require('web-push');
    const keys = getVapidKeys();
    webPush.setVapidDetails('mailto:taig2k@outlook.com', keys.publicKey, keys.privateKey);
    await webPush.sendNotification(sub, JSON.stringify({
      title: 'Giggit: new ' + gig.category + ' gig near you',
      body: gig.title + ' — EC$' + Number(gig.priceEC).toFixed(2) + ', ' + (gig.area || gig.parish) + '. Open Giggit to accept.',
      url: '/giggit/',
    }));
    return { notified: closest.gigger.id, giggerName: closest.gigger.name, distanceKm: closest.distanceKm, basis: closest.basis };
  } catch (err) {
    return { notified: null, reason: 'Push to the closest gigger failed — the gig is listed for them.' };
  }
}

function findGigOrThrow(state, id) {
  const gig = state.gigs.find((entry) => entry.id === id);
  if (!gig) throw new ValidationError('That gig was not found.');
  return gig;
}

function acceptGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'open') throw new ValidationError('That gig is no longer open.');
  const gigger = state.giggers.find((entry) => entry.id === giggerId);
  if (!gigger) throw new ValidationError('That Gigger was not found — register first.');
  if (!gigger.skills.includes(gig.category)) {
    throw new ValidationError('That Gigger does not list this service — pick a matching skill first.');
  }
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
  save(state);
  return publicGig(gig, { showContacts: true });
}

function startGig(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'accepted') throw new ValidationError('Only an accepted gig can start.');
  if (gig.giggerId !== giggerId) throw new ValidationError('Only the accepted Gigger can start this gig.');
  gig.status = 'in_progress';
  save(state);
  return publicGig(gig, { showContacts: true });
}

function requestComplete(id, giggerId) {
  const state = load();
  const gig = findGigOrThrow(state, id);
  if (gig.status !== 'in_progress' && gig.status !== 'accepted') {
    throw new ValidationError('Only a gig in progress can be marked done.');
  }
  if (gig.giggerId !== giggerId) throw new ValidationError('Only the accepted Gigger can mark this gig done.');
  gig.status = 'completion_requested';
  save(state);
  return publicGig(gig, { showContacts: true });
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
  gig.escrow.releaseAt = new Date(Date.now() + DISPUTE_WINDOW_MS).toISOString();
  save(state);
  return publicGig(gig, { showContacts: true });
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
  save(state);
  return publicGig(gig, { showContacts: true });
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
  return publicGig(gig, { showContacts: true });
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
  return publicGig(gig, { showContacts: true });
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

function savePushSubscription(subscription, giggerId) {
  const endpoint = String((subscription && subscription.endpoint) || '');
  const keys = (subscription && subscription.keys) || {};
  if (!endpoint.startsWith('https://') || !keys.p256dh || !keys.auth) {
    throw new ValidationError('That push subscription does not look right.');
  }
  const gid = cleanText(giggerId || '', 40);
  const state = load();
  const linkedId = gid && state.giggers.some((entry) => entry.id === gid) ? gid : null;
  state.pushSubscriptions = state.pushSubscriptions.filter((entry) => entry.endpoint !== endpoint);
  state.pushSubscriptions.unshift({ endpoint, keys, giggerId: linkedId, createdAt: nowIso() });
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
  PRICE_GUIDE,
  COMMISSION_STANDARD,
  COMMISSION_VOLUME,
  COMMISSION_PRO,
  DISPUTE_WINDOW_MS,
  ValidationError,
  getVapidKeys,
  createGigger,
  listGiggers,
  createGig,
  listGigs,
  getGig,
  gigPhoto,
  matchesForGig,
  notifyClosest,
  acceptGig,
  startGig,
  requestComplete,
  confirmComplete,
  disputeGig,
  cancelGig,
  rateGig,
  walletFor,
  savePushSubscription,
  listPushSubscriptions,
};
