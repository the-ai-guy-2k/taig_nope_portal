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

/* ---- Currency display (EC$ default, US$ toggle) ---- */
let displayCurrency = localStorage.getItem('giggit-currency') || 'XCD';

function usdRate() {
  return (meta && Number(meta.usdRate)) || 2.70;
}

function moneyText(g) {
  if (g.pricingMode === 'quote' && g.priceEC == null) return 'Asking for quotes';
  if (displayCurrency === 'USD') {
    const usd = g.priceUSD != null ? g.priceUSD : (Number(g.priceEC) / usdRate());
    return 'US$' + Number(usd).toFixed(2);
  }
  return 'EC$' + Number(g.priceEC).toFixed(2);
}

function moneyEC(ec) {
  if (displayCurrency === 'USD') return 'US$' + (Number(ec) / usdRate()).toFixed(2);
  return 'EC$' + Number(ec).toFixed(2);
}

function windowText() {
  const mins = (meta && meta.disputeWindowMinutes) || 60;
  if (mins === 60) return '1-hour dispute window';
  if (mins === 1440) return '24-hour dispute window';
  if (mins < 60) return mins + '-minute dispute window';
  return (mins / 60) + '-hour dispute window';
}

function setCurrency(cur) {
  displayCurrency = cur === 'USD' ? 'USD' : 'XCD';
  localStorage.setItem('giggit-currency', displayCurrency);
  $('curr-xcd').classList.toggle('active', displayCurrency === 'XCD');
  $('curr-usd').classList.toggle('active', displayCurrency === 'USD');
  renderGigs();
  if (detailId) openGig(detailId);
  if (currentTab === 'wallet') renderWallet();
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

let pendingPhoto = null;

function captureLocation(prefix) {
  const status = $(prefix + '-loc-status');
  if (!navigator.geolocation) {
    status.textContent = 'Location is not available in this browser — matching falls back to area.';
    return;
  }
  status.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $(prefix + '-lat').value = pos.coords.latitude;
      $(prefix + '-lng').value = pos.coords.longitude;
      status.textContent = 'Location saved (' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4) + ').';
    },
    () => { status.textContent = 'Could not get your location — matching falls back to area.'; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
}

function handlePhotoInput(event) {
  const file = event.target.files && event.target.files[0];
  const status = $('photo-status');
  pendingPhoto = null;
  $('photo-preview').classList.add('hidden');
  if (!file) {
    status.textContent = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    status.textContent = 'That photo is over 2 MB — pick a smaller one.';
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhoto = { name: file.name, type: file.type, dataUrl: reader.result };
    $('photo-preview').src = reader.result;
    $('photo-preview').classList.remove('hidden');
    status.textContent = 'Photo attached (' + Math.round(file.size / 1024) + ' KB).';
  };
  reader.readAsDataURL(file);
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
  $('gig-photo').addEventListener('change', handlePhotoInput);
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
  $('usd-rate-note').textContent = 'Converted at EC$' + usdRate().toFixed(2) + ' per US$1 (the EC$ peg).';
  $('curr-rate').textContent = 'EC$' + usdRate().toFixed(2) + ' = US$1';
  $('curr-xcd').classList.toggle('active', displayCurrency === 'XCD');
  $('curr-usd').classList.toggle('active', displayCurrency === 'USD');
  pricingChanged();
}

function pricingChanged() {
  const mode = (document.querySelector('input[name="pricing"]:checked') || {}).value || 'budget';
  $('budget-box').classList.toggle('hidden', mode !== 'budget');
  $('quote-hint').classList.toggle('hidden', mode !== 'quote');
  $('gig-price').required = mode === 'budget';
}

function gigCard(g) {
  const me = giggers.find((entry) => entry.id === whoAmI);
  const canAccept = g.status === 'open' && me && me.skills.includes(g.category) && g.pricingMode !== 'quote';
  const acceptHint = g.status === 'open' && whoAmI && !canAccept && g.pricingMode !== 'quote'
    ? '<div class="hint">You do not list ' + esc(g.category) + ' — add the skill to accept this one.</div>' : '';
  const quoteHint = g.status === 'open' && g.pricingMode === 'quote' && me && me.skills.includes(g.category)
    ? '<div class="hint">This gig is asking for quotes — open it to send yours.</div>' : '';
  return '<div class="card">'
    + '<h3>' + esc(g.title) + ' ' + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.category) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.when ? ' • ' + esc(g.when) : '') + '</div>'
    + '<div class="price">' + esc(moneyText(g)) + ' <small>' + (g.pricingMode === 'quote' && g.priceEC == null ? 'quotes welcome' : 'per gig') + '</small></div>'
    + (g.status === 'open' ? '<div class="ring-note">Ring ' + (g.ring != null ? g.ring : 0) + ' — ' + (g.ring === 2 ? 'every matching Gigger has the first look.' : 'the ' + (g.ring === 1 ? 'closest 6' : 'closest 3') + ' Giggers have the first look.') + '</div>' : '')
    + (g.hasPhoto ? '<img class="thumb small" src="/api/giggit/gigs/' + esc(g.id) + '/photo" alt="Photo of the problem" loading="lazy">' : '')
    + '<p>' + esc(g.description) + '</p>'
    + '<p><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span>'
    + (g.giggerName ? ' • <b>' + esc(g.giggerName) + '</b>' : '') + '</p>'
    + acceptHint + quoteHint
    + '<button class="btn small" type="button" onclick="openGig(\'' + esc(g.id) + '\')">Open</button> '
    + (canAccept ? '<button class="btn small leaf" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button>' : '')
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
      + ((g.certifications || []).length ? '<br>' + g.certifications.map((c) => '<span class="tag cert">★ ' + esc(c.name) + (c.issuer ? ' — ' + esc(c.issuer) : '') + '</span>').join('') : '')
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
    + '<div class="price">' + esc(moneyText(g)) + '</div>'
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
    html += '<div class="escrow"><b>Escrow: ' + esc(moneyEC(g.escrow.amountEC)) + ' — ' + esc(g.escrow.status) + '</b>'
      + (g.escrow.status === 'held' && g.escrow.releaseAt ? '<br>' + esc(timeLeft(g.escrow.releaseAt)) + ' (' + esc(windowText()) + ' after completion).' : '')
      + (g.escrow.status === 'released'
        ? '<br>Paid out ' + esc(moneyEC(g.escrow.payoutEC)) + ' to the Gigger, commission ' + esc(moneyEC(g.escrow.commissionEC)) + ' (' + Math.round((g.escrow.commissionRate || 0) * 100) + '%).'
        : '')
      + '</div>';
  }
  if (g.pricingMode === 'quote' && g.status === 'open') {
    html += '<h3>Quotes</h3>';
    if (g.quotes && g.quotes.length) {
      html += g.quotes.map((q) =>
        '<div class="quote-row"><span><b>' + esc(q.giggerName) + '</b> — ' + esc(moneyEC(q.amountEC))
        + (q.postedIn === 'USD' ? ' <span class="meta">(posted US$' + Number(q.postedAmount).toFixed(2) + ')</span>' : '') + '</span>'
        + '<button class="btn small leaf" type="button" onclick="acceptQuote(\'' + esc(g.id) + '\', \'' + esc(q.giggerId) + '\')">Accept this quote</button></div>').join('');
    } else {
      html += '<p class="meta">No quotes yet — matching Giggers will send theirs here.</p>';
    }
  }
  if (g.pricingMode === 'quote' && g.status === 'open' && me && me.skills.includes(g.category)) {
    html += '<label for="quote-amount">Your quote</label>'
      + '<input type="number" id="quote-amount" min="1" max="10000" step="0.01" placeholder="150"> '
      + '<label><input type="checkbox" id="quote-usd"> In US$</label> '
      + '<button class="btn leaf" type="button" onclick="submitQuote(\'' + esc(g.id) + '\')">Send quote</button>';
  }
  if (g.completionCode && (g.status === 'accepted' || g.status === 'in_progress' || g.status === 'completion_requested')) {
    html += '<p>Completion code (customer gives this to the Gigger when the work is done):<br><span class="code">' + esc(g.completionCode) + '</span></p>';
  }
  if (g.hasPhoto) {
    html += '<img class="thumb" src="/api/giggit/gigs/' + esc(g.id) + '/photo" alt="Photo of the problem">';
  }
  if (g.status === 'open' && me && me.skills.includes(g.category) && g.pricingMode !== 'quote') {
    html += '<button class="btn leaf" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button> ';
  }
  if (isMine && g.status === 'accepted') {
    html += '<button class="btn" type="button" onclick="gigAction(\'' + esc(g.id) + '\', \'start\', {giggerId: whoAmI})">Start the job</button> ';
  }
  if (isMine && (g.status === 'accepted' || g.status === 'in_progress')) {
    html += '<button class="btn leaf" type="button" onclick="gigAction(\'' + esc(g.id) + '\', \'request-complete\', {giggerId: whoAmI})">Job done — ask customer to confirm</button> ';
  }
  if (g.status === 'completion_requested') {
    html += '<label for="confirm-code">Customer: enter the completion code</label>'
      + '<input type="text" id="confirm-code" maxlength="6" inputmode="numeric" placeholder="6 digits"> '
      + '<button class="btn leaf" type="button" onclick="confirmComplete(\'' + esc(g.id) + '\')">Confirm — release to escrow window</button>';
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
  html += '<div id="matches-box"><p class="meta">Finding the closest Giggers…</p></div>';
  html += '<p><button class="btn ghost small" type="button" onclick="closeDetail()">Back to gigs</button></p></div>';
  $('gig-detail').innerHTML = html;
  $('gig-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderMatches(id);
}

async function renderMatches(id) {
  const box = $('matches-box');
  if (!box) return;
  try {
    const data = await api('/api/giggit/gigs/' + encodeURIComponent(id) + '/matches');
    if (!data.matches.length) {
      box.innerHTML = '<p class="meta">No matching Gigger in the pool yet for this one.</p>';
      return;
    }
    const me = giggers.find((entry) => entry.id === whoAmI);
    let html = '';
    const ringNames = ['closest 3', 'closest 6', 'every matching Gigger'];
    if (data.gig.status === 'open' && data.currentRing != null) {
      html += '<div class="ring-note"><b>Ring ' + data.currentRing + ' of 2</b> — the ' + ringNames[data.currentRing] + ' get this gig first. The ring widens every ' + data.ringWindowMinutes + ' minutes with no accept.</div>';
    }
    if (me && data.matches[0].gigger.id === me.id && data.gig.status === 'open') {
      html += '<div class="closest-banner"><b>You are the closest Gigger for this job.</b> It came to you first — accept it above.</div>';
    }
    html += '<h3>Closest first</h3>' + data.matches.map((m, i) =>
      '<div class="match-row' + (m.inCurrentRing === false ? ' out-of-ring' : '') + '"><span>' + (i + 1) + '. <b>' + esc(m.gigger.name) + '</b> — ' + esc(m.gigger.skills.join(', ')) + ' <span class="ring">RING ' + m.ring + '</span></span>'
      + '<span class="dist">' + (m.distanceKm != null ? m.distanceKm + ' km' : m.basis === 'same-area' ? 'same area' : m.basis === 'same-parish' ? 'same parish' : 'no location yet') + '</span></div>').join('');
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = '';
  }
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

async function submitQuote(id) {
  if (!whoAmI) {
    alert('Pick who you are first — choose a Gigger in “Testing as” at the top.');
    return;
  }
  const amount = Number(($('quote-amount') || {}).value || 0);
  const currency = ($('quote-usd') || {}).checked ? 'USD' : 'XCD';
  await gigAction(id, 'quotes', { giggerId: whoAmI, amount, currency });
}

async function acceptQuote(id, giggerId) {
  await gigAction(id, 'accept-quote', { giggerId });
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
    pricingMode: (document.querySelector('input[name="pricing"]:checked') || {}).value || 'budget',
    priceEC: Number($('gig-price').value),
    currency: $('gig-usd').checked ? 'USD' : 'XCD',
    when: $('gig-when').value,
    customerName: $('gig-name').value,
    customerPhone: $('gig-phone').value,
    photo: pendingPhoto,
    lat: $('gig-lat').value ? Number($('gig-lat').value) : null,
    lng: $('gig-lng').value ? Number($('gig-lng').value) : null,
  };
  try {
    const data = await api('/api/giggit/gigs', { method: 'POST', body: JSON.stringify(body) });
    let note = data.gig.pricingMode === 'quote'
      ? 'Gig posted — Giggers will send quotes, you pick one on the gig page.'
      : 'Gig posted — Giggers in Castries can see it now.';
    if (data.closest) {
      note += ' Closest: ' + data.closest.gigger.name
        + (data.closest.distanceKm != null ? ' (' + data.closest.distanceKm + ' km away)' : '')
        + (data.notified && data.notified.notified ? ' — they were notified.' : ' — they have no push on yet, so it is listed for them.');
    }
    showMsg('post-msg', note, true);
    pendingPhoto = null;
    $('photo-preview').classList.add('hidden');
    $('gig-photo').value = '';
    $('gig-lat').value = '';
    $('gig-lng').value = '';
    $('gig-loc-status').textContent = 'No location yet — matching falls back to area.';
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
    certifications: $('reg-certs').value.split(',').map((s) => s.trim()).filter(Boolean),
    lat: $('reg-lat').value ? Number($('reg-lat').value) : null,
    lng: $('reg-lng').value ? Number($('reg-lng').value) : null,
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
      + '<div class="price">' + esc(moneyEC(w.availableEC)) + ' <small>available</small></div>'
      + '<p>Held in escrow: <b>' + esc(moneyEC(w.heldEC)) + '</b> • Commission paid so far: ' + esc(moneyEC(w.feesEC)) + '</p>'
      + (w.entries.length ? '<h3>Ledger</h3>' + w.entries.map((e) =>
        '<p>' + esc(new Date(e.at).toLocaleString()) + ' — ' + esc(e.type) + ' ' + esc(moneyEC(e.amountEC)) + ' <span class="meta">' + esc(e.note || '') + '</span></p>').join('')
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
    await api('/api/giggit/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub, giggerId: whoAmI || null }) });
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
