'use strict';
/* Giggit MVP front-end. No accounts yet — "Testing as" picks a Gigger
   from the registered list (stored in localStorage). */

let meta = null;
let gigs = [];
let giggers = [];
let whoAmI = localStorage.getItem('giggit-whoami') || '';
let currentTab = 'gigs';
let detailId = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function api(path, opts) {
  const res = await fetch(path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
  }, opts || {}));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

function showMsg(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
  el.style.display = 'block';
}

function statusLabel(status) {
  return {
    open: 'Open',
    accepted: 'Accepted — escrow held',
    in_progress: 'In progress',
    completion_requested: 'Done — waiting for customer code',
    completed: 'Completed — in dispute window',
    released: 'Released — paid',
    disputed: 'Disputed — escrow frozen',
    cancelled: 'Cancelled',
  }[status] || status;
}

function timeLeft(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'releasing now…';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return 'releases in ~' + mins + ' min';
  return 'releases in ~' + Math.round(mins / 60) + ' h';
}

function showTab(tab) {
  currentTab = tab;
  detailId = null;
  ['gigs', 'post', 'giggers', 'wallet', 'about'].forEach((name) => {
    $('view-' + name).classList.toggle('hidden', name !== tab);
    $('tab-' + name).classList.toggle('active', name === tab);
  });
  $('gig-detail').innerHTML = '';
  if (tab === 'gigs') renderGigs();
  if (tab === 'giggers') renderGiggers();
  if (tab === 'wallet') renderWallet();
}

function setWhoAmI(id) {
  whoAmI = id || '';
  if (whoAmI) localStorage.setItem('giggit-whoami', whoAmI);
  else localStorage.removeItem('giggit-whoami');
  updateWhoAmI();
  renderGigs();
  if (detailId) openGig(detailId);
}

function updateWhoAmI() {
  const sel = $('whoami');
  sel.innerHTML = '<option value="">— Pick who you are (MVP test, no accounts yet) —</option>'
    + giggers.map((g) => '<option value="' + esc(g.id) + '"' + (g.id === whoAmI ? ' selected' : '') + '>'
      + esc(g.name) + ' — ' + esc(g.skills.join(', ')) + '</option>').join('');
  const me = giggers.find((g) => g.id === whoAmI);
  $('whoami-label').textContent = me ? (me.name + ' (Level ' + me.tier + ', ' + esc(me.parish) + ')') : 'nobody yet';
}

async function loadAll() {
  try {
    meta = await api('/api/giggit/meta');
  } catch (err) {
    meta = null;
  }
  await refreshData();
  buildForms();
  updateWhoAmI();
  renderGigs();
}

async function refreshData() {
  try {
    const [gigRes, ggrRes] = await Promise.all([
      api('/api/giggit/gigs'),
      api('/api/giggit/giggers'),
    ]);
    gigs = gigRes.gigs || [];
    giggers = ggrRes.giggers || [];
  } catch (err) {
    const cached = localStorage.getItem('giggit-gigs-cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        gigs = parsed.gigs || [];
        giggers = parsed.giggers || [];
      } catch (e) { /* ignore */ }
    }
  }
  localStorage.setItem('giggit-gigs-cache', JSON.stringify({ gigs, giggers }));
}

function buildForms() {
  if (!meta) return;
  $('gig-category').innerHTML = meta.categories.map((c) => '<option>' + esc(c) + '</option>').join('');
  $('reg-skills').innerHTML = meta.categories.map((c) =>
    '<label><input type="checkbox" name="skill" value="' + esc(c) + '"> ' + esc(c) + '</label>').join('');
  const updateHint = () => {
    const cat = $('gig-category').value;
    const range = meta.priceGuide[cat];
    $('price-hint').textContent = range
      ? 'Suggested for ' + cat + ' in Castries: EC$' + range[0] + ' – EC$' + range[1] + ' (guide only).'
      : '';
  };
  $('gig-category').addEventListener('change', updateHint);
  updateHint();
}

function gigCard(g) {
  const me = giggers.find((entry) => entry.id === whoAmI);
  const canAccept = g.status === 'open' && me && me.skills.includes(g.category);
  const acceptHint = g.status === 'open' && whoAmI && !canAccept
    ? '<div class="hint">You do not list ' + esc(g.category) + ' — add the skill to accept this one.</div>' : '';
  return '<div class="card">'
    + '<h3>' + esc(g.title) + ' ' + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.category) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.when ? ' • ' + esc(g.when) : '') + '</div>'
    + '<div class="price">EC$' + Number(g.priceEC).toFixed(2) + ' <small>per gig</small></div>'
    + '<p>' + esc(g.description) + '</p>'
    + '<p><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span>'
    + (g.giggerName ? ' • <b>' + esc(g.giggerName) + '</b>' : '') + '</p>'
    + acceptHint
    + '<button class="btn small" type="button" onclick="openGig(\'' + esc(g.id) + '\')">Open</button> '
    + (canAccept ? '<button class="btn small sun" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button>' : '')
    + '</div>';
}

function renderGigs() {
  const el = $('view-gigs');
  const open = gigs.filter((g) => g.status === 'open');
  const mine = whoAmI ? gigs.filter((g) => g.giggerId === whoAmI && g.status !== 'open' && g.status !== 'cancelled') : [];
  const done = gigs.filter((g) => ['released', 'completed', 'disputed'].includes(g.status));
  let html = '';
  if (mine.length) {
    html += '<h3>My gigs</h3>' + mine.map(gigCard).join('');
  }
  html += '<h3>Open gigs in Castries</h3>';
  html += open.length ? open.map(gigCard).join('') : '<div class="card">No open gigs right now. Post one, or check back soon.</div>';
  if (done.length) {
    html += '<h3>Finished &amp; in escrow</h3>' + done.map(gigCard).join('');
  }
  el.innerHTML = html;
}

function renderGiggers() {
  $('gigger-list').innerHTML = '<h3>Registered Giggers</h3>'
    + (giggers.length ? giggers.map((g) =>
      '<div class="card"><h3>' + esc(g.name) + ' '
      + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '')
      + ' <span class="badge tier">LEVEL ' + g.tier + '</span></h3>'
      + '<div class="meta">' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
      + (g.ratingAvg != null ? ' • ★ ' + g.ratingAvg + ' (' + g.ratingCount + ')' : '')
      + ' • ' + g.gigsCompleted + ' gigs done</div>'
      + g.skills.map((s) => '<span class="tag">' + esc(s) + '</span>').join('')
      + '</div>').join('') : '<div class="card">No Giggers yet — be the first.</div>');
}

async function openGig(id) {
  detailId = id;
  let g;
  try {
    g = (await api('/api/giggit/gigs/' + encodeURIComponent(id))).gig;
  } catch (err) {
    $('gig-detail').innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
    return;
  }
  const me = giggers.find((entry) => entry.id === whoAmI);
  const isMine = me && g.giggerId === me.id;
  let html = '<div class="card"><h3>' + esc(g.title) + ' ' + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.category) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.when ? ' • ' + esc(g.when) : '') + '</div>'
    + '<div class="price">EC$' + Number(g.priceEC).toFixed(2) + '</div>'
    + '<p>' + esc(g.description) + '</p>'
    + '<p><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span></p>'
    + '<div class="timeline">Posted ' + esc(new Date(g.createdAt).toLocaleString())
    + (g.acceptedAt ? '<br>Accepted ' + esc(new Date(g.acceptedAt).toLocaleString()) + (g.giggerName ? ' by <b>' + esc(g.giggerName) + '</b>' : '') : '')
    + (g.completedAt ? '<br>Completed ' + esc(new Date(g.completedAt).toLocaleString()) : '')
    + '</div>';
  if (g.customerName) {
    html += '<p><b>Customer:</b> ' + esc(g.customerName)
      + (g.customerPhone ? ' • ' + esc(g.customerPhone) : '') + '</p>';
  }
  if (g.giggerName) {
    html += '<p><b>Gigger:</b> ' + esc(g.giggerName)
      + (g.giggerPhone ? ' • ' + esc(g.giggerPhone) : '') + '</p>';
  }
  if (g.escrow) {
    html += '<div class="escrow"><b>Escrow: EC$' + Number(g.escrow.amountEC).toFixed(2) + ' — ' + esc(g.escrow.status) + '</b>'
      + (g.escrow.status === 'held' && g.escrow.releaseAt ? '<br>' + esc(timeLeft(g.escrow.releaseAt)) + ' (1-hour dispute window after completion).' : '')
      + (g.escrow.status === 'released'
        ? '<br>Paid out EC$' + Number(g.escrow.payoutEC).toFixed(2) + ' to the Gigger, commission EC$' + Number(g.escrow.commissionEC).toFixed(2) + ' (' + Math.round((g.escrow.commissionRate || 0) * 100) + '%).'
        : '')
      + '</div>';
  }
  if (g.completionCode && (g.status === 'accepted' || g.status === 'in_progress' || g.status === 'completion_requested')) {
    html += '<p>Completion code (customer gives this to the Gigger when the work is done):<br><span class="code">' + esc(g.completionCode) + '</span></p>';
  }
  if (g.status === 'open' && me && me.skills.includes(g.category)) {
    html += '<button class="btn sun" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button> ';
  }
  if (isMine && g.status === 'accepted') {
    html += '<button class="btn" type="button" onclick="gigAction(\'' + esc(g.id) + '\', \'start\', {giggerId: whoAmI})">Start the job</button> ';
  }
  if (isMine && (g.status === 'accepted' || g.status === 'in_progress')) {
    html += '<button class="btn sun" type="button" onclick="gigAction(\'' + esc(g.id) + '\', \'request-complete\', {giggerId: whoAmI})">Job done — ask customer to confirm</button> ';
  }
  if (g.status === 'completion_requested') {
    html += '<label for="confirm-code">Customer: enter the completion code</label>'
      + '<input type="text" id="confirm-code" maxlength="6" inputmode="numeric" placeholder="6 digits"> '
      + '<button class="btn sun" type="button" onclick="confirmComplete(\'' + esc(g.id) + '\')">Confirm — release to escrow window</button>';
  }
  if (g.status === 'completed') {
    html += '<p>' + esc(timeLeft(g.escrow && g.escrow.releaseAt)) + '</p>'
      + '<button class="btn danger" type="button" onclick="disputeGig(\'' + esc(g.id) + '\')">Dispute this gig</button> ';
  }
  if (['open', 'accepted', 'in_progress', 'completion_requested'].includes(g.status)) {
    html += '<button class="btn ghost" type="button" onclick="cancelGig(\'' + esc(g.id) + '\')">Cancel gig</button>';
  }
  if (g.status === 'released') {
    html += '<div id="rate-box"><p><b>Rate this gig</b> (both sides, 1–5 stars; under 3 stars needs a comment):</p>'
      + '<div class="stars" id="rate-stars">'
      + [1, 2, 3, 4, 5].map((n) => '<button type="button" onclick="pickStars(' + n + ')" data-n="' + n + '">★</button>').join('')
      + '</div>'
      + '<input type="text" id="rate-comment" maxlength="500" placeholder="What went well — or what did not"> '
      + '<button class="btn small" type="button" onclick="rateGig(\'' + esc(g.id) + '\')">Send rating</button></div>';
  }
  if (g.ratings && g.ratings.length) {
    html += '<h3>Ratings</h3>' + g.ratings.map((r) =>
      '<p>★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + ' — ' + esc(r.by) + (r.comment ? ': ' + esc(r.comment) : '') + '</p>').join('');
  }
  html += '<p><button class="btn ghost small" type="button" onclick="closeDetail()">Back to gigs</button></p></div>';
  $('gig-detail').innerHTML = html;
  $('gig-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDetail() {
  detailId = null;
  $('gig-detail').innerHTML = '';
  renderGigs();
}

let pickedStars = 0;
function pickStars(n) {
  pickedStars = n;
  document.querySelectorAll('#rate-stars button').forEach((btn) => {
    btn.classList.toggle('lit', Number(btn.dataset.n) <= n);
  });
}

async function gigAction(id, action, body) {
  try {
    await api('/api/giggit/gigs/' + encodeURIComponent(id) + '/' + action, {
      method: 'POST', body: JSON.stringify(body || {}),
    });
    await refreshData();
    openGig(id);
    renderGigs();
  } catch (err) {
    showMsg('post-msg', err.message, false);
    alert(err.message);
  }
}

async function acceptGig(id) {
  if (!whoAmI) {
    alert('Pick who you are first — choose a Gigger in “Testing as” at the top.');
    return;
  }
  await gigAction(id, 'accept', { giggerId: whoAmI });
}

async function confirmComplete(id) {
  const code = ($('confirm-code') || {}).value || '';
  await gigAction(id, 'confirm-complete', { code });
}

async function disputeGig(id) {
  const reason = prompt('What went wrong? (short, plain words)');
  if (reason === null) return;
  const by = whoAmI ? 'gigger' : 'customer';
  await gigAction(id, 'dispute', { by, reason });
}

async function cancelGig(id) {
  if (!confirm('Cancel this gig? Escrow held on it goes back.')) return;
  const by = whoAmI ? 'gigger' : 'customer';
  await gigAction(id, 'cancel', { by, reason: 'Cancelled in the app' });
}

async function rateGig(id) {
  if (!pickedStars) {
    alert('Pick 1 to 5 stars first.');
    return;
  }
  const by = whoAmI ? 'gigger' : 'customer';
  const comment = ($('rate-comment') || {}).value || '';
  await gigAction(id, 'rate', { by, stars: pickedStars, comment });
  pickedStars = 0;
}

async function postGig(event) {
  event.preventDefault();
  const body = {
    category: $('gig-category').value,
    title: $('gig-title').value,
    description: $('gig-desc').value,
    parish: 'Castries',
    area: $('gig-area').value,
    priceEC: Number($('gig-price').value),
    when: $('gig-when').value,
    customerName: $('gig-name').value,
    customerPhone: $('gig-phone').value,
  };
  try {
    const data = await api('/api/giggit/gigs', { method: 'POST', body: JSON.stringify(body) });
    showMsg('post-msg', 'Gig posted — Giggers in Castries can see it now.', true);
    $('post-form').reset();
    await refreshData();
    detailId = data.gig.id;
    showTab('gigs');
    openGig(data.gig.id);
  } catch (err) {
    showMsg('post-msg', err.message, false);
  }
}

async function registerGigger(event) {
  event.preventDefault();
  const skills = Array.from(document.querySelectorAll('#reg-skills input:checked')).map((el) => el.value);
  const body = {
    name: $('reg-name').value,
    phone: $('reg-phone').value,
    parish: 'Castries',
    area: $('reg-area').value,
    idType: $('reg-idtype').value,
    idNumber: $('reg-idnum').value,
    skills,
  };
  try {
    const data = await api('/api/giggit/giggers', { method: 'POST', body: JSON.stringify(body) });
    showMsg('reg-msg', 'Welcome in, ' + data.gigger.name + ' — you are Level 1. Pick yourself in “Testing as” to start accepting gigs.', true);
    $('reg-form').reset();
    await refreshData();
    updateWhoAmI();
    renderGiggers();
  } catch (err) {
    showMsg('reg-msg', err.message, false);
  }
}

async function renderWallet() {
  const el = $('view-wallet');
  if (!whoAmI) {
    el.innerHTML = '<div class="card"><h3>My wallet</h3><p>Pick who you are in “Testing as” at the top to see your Giggit Wallet.</p></div>';
    return;
  }
  try {
    const w = await api('/api/giggit/wallet/' + encodeURIComponent(whoAmI));
    el.innerHTML = '<div class="card"><h3>' + esc(w.gigger.name) + ' — Giggit Wallet</h3>'
      + '<div class="meta">Simulated ledger — no real money moves in this test build.</div>'
      + '<div class="price">EC$' + Number(w.availableEC).toFixed(2) + ' <small>available</small></div>'
      + '<p>Held in escrow: <b>EC$' + Number(w.heldEC).toFixed(2) + '</b> • Commission paid so far: EC$' + Number(w.feesEC).toFixed(2) + '</p>'
      + (w.entries.length ? '<h3>Ledger</h3>' + w.entries.map((e) =>
        '<p>' + esc(new Date(e.at).toLocaleString()) + ' — ' + esc(e.type) + ' EC$' + Number(e.amountEC).toFixed(2) + ' <span class="meta">' + esc(e.note || '') + '</span></p>').join('')
        : '<p>No wallet activity yet.</p>')
      + '</div>';
  } catch (err) {
    el.innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
  }
}

/* ---- Service worker: update fix + offline ---- */

let swRegistration = null;
let waitingSW = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
      swRegistration = reg;
      /* Check for updates on load and every 30 minutes — this is the
         fix for the "app never updates" lag: the new worker is found
         fast, and the banner below lets the user apply it now. */
      reg.update();
      setInterval(() => reg.update(), 30 * 60 * 1000);
      if (reg.waiting) {
        waitingSW = reg.waiting;
        $('update-banner').classList.add('show');
      }
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            waitingSW = next;
            $('update-banner').classList.add('show');
          }
        });
      });
    }).catch(() => { /* PWA offline/update features unavailable — app still works online. */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
  $('update-btn').addEventListener('click', () => {
    if (waitingSW) waitingSW.postMessage({ type: 'SKIP_WAITING' });
  });
}

window.addEventListener('online', () => $('offline-banner').classList.remove('show'));
window.addEventListener('offline', () => $('offline-banner').classList.add('show'));
if (!navigator.onLine) $('offline-banner').classList.add('show');

/* ---- Web push ---- */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push is not supported in this browser.');
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications were not allowed — turn them on in the browser settings and try again.');
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api('/api/giggit/push/vapid-public-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api('/api/giggit/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
    showMsg('push-msg', 'Notifications on — new gigs will reach you here. (iPhone: add Giggit to your Home Screen first.)', true);
  } catch (err) {
    showMsg('push-msg', err.message, false);
  }
}

async function testPush() {
  try {
    await api('/api/giggit/push/test', { method: 'POST', body: JSON.stringify({}) });
    showMsg('push-msg', 'Test notification sent — it should arrive in a few seconds.', true);
  } catch (err) {
    showMsg('push-msg', err.message, false);
  }
}

document.addEventListener('DOMContentLoaded', loadAll);
