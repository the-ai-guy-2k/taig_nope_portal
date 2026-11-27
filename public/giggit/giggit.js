'use strict';
/* Giggit MVP front-end. No accounts yet — "Testing as" picks a Gigger
   from the registered list (stored in localStorage). */

let meta = null;
let gigs = [];
let giggers = [];
let whoAmI = localStorage.getItem('giggit-whoami') || '';
let currentTab = 'gigs';
let detailId = null;

/* Role views (the drawing's three lanes): Gigger (phone), Client (phone),
   Admin (desktop). Each role gets its own tabs; the role sticks in
   localStorage. */
let role = localStorage.getItem('giggit-role') || 'gigger';
const GIG = 'Gig';
const ROLE_TABS = {
  gigger: [['gigs', 'Find work'], ['wallet', 'My wallet'], ['giggers', GIG + 'gers'], ['about', 'About']],
  client: [['post', 'Post a gig'], ['mygigs', 'My gigs'], ['about', 'About']],
  admin: [['admin', 'All gigs'], ['overview', 'Overview'], ['giggers', GIG + 'gers'], ['about', 'About']],
};
const ALL_VIEWS = ['gigs', 'post', 'giggers', 'wallet', 'about', 'mygigs', 'admin', 'overview'];
let clientName = localStorage.getItem('giggit-client-name') || '';
let clientPhone = localStorage.getItem('giggit-client-phone') || '';
let adminGigs = [];

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function api(path, opts) {
  const headers = { 'Content-Type': 'application/json' };
  const adminToken = localStorage.getItem('giggit-admin-token') || '';
  if (adminToken) headers['x-giggit-admin-token'] = adminToken;
  const merged = Object.assign({}, opts || {}, { headers: Object.assign(headers, (opts && opts.headers) || {}) });
  const res = await fetch(path, merged);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

function saveAdminToken() {
  const token = ($('admin-token') || {}).value || '';
  if (token) localStorage.setItem('giggit-admin-token', token);
  else localStorage.removeItem('giggit-admin-token');
  showMsg('admin-token-msg', token ? 'Token saved on this device.' : 'Token cleared.', true);
  renderAdmin();
}

function clearAdminToken() {
  localStorage.removeItem('giggit-admin-token');
  renderAdmin();
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
  renderCurrentTab();
  if (detailId) openGig(detailId);
  if (currentTab === 'wallet') renderWallet();
}

function renderTabs() {
  $('tabs').innerHTML = ROLE_TABS[role].map(([name, label]) =>
    '<button id="tab-' + name + '" onclick="showTab(\'' + name + '\')">' + esc(label) + '</button>').join('');
}

function applyRole() {
  ['gigger', 'client', 'admin'].forEach((r) => {
    const btn = $('role-' + r);
    if (btn) btn.classList.toggle('active', r === role);
  });
  $('whoami-box').classList.toggle('hidden', role !== 'gigger');
  $('client-box').classList.toggle('hidden', role !== 'client');
}

function setRole(next) {
  role = ['gigger', 'client', 'admin'].includes(next) ? next : 'gigger';
  localStorage.setItem('giggit-role', role);
  applyRole();
  renderTabs();
  showTab(ROLE_TABS[role][0][0]);
  if (role === 'client') fillClientIdentity();
}

function renderCurrentTab() {
  if (currentTab === 'gigs') renderGigs();
  else if (currentTab === 'mygigs') renderMyGigs();
  else if (currentTab === 'admin') renderAdmin();
  else if (currentTab === 'overview') renderOverview();
  else if (currentTab === 'giggers') renderGiggers();
  else if (currentTab === 'wallet') renderWallet();
}

function showTab(tab) {
  currentTab = tab;
  detailId = null;
  ALL_VIEWS.forEach((name) => {
    const view = $('view-' + name);
    if (view) view.classList.toggle('hidden', name !== tab);
    const btn = $('tab-' + name);
    if (btn) btn.classList.toggle('active', name === tab);
  });
  $('gig-detail').innerHTML = '';
  renderCurrentTab();
}

function setWhoAmI(id) {
  whoAmI = id || '';
  if (whoAmI) localStorage.setItem('giggit-whoami', whoAmI);
  else localStorage.removeItem('giggit-whoami');
  updateWhoAmI();
  renderCurrentTab();
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
let pendingGallery = [];

function handleGalleryInput(event) {
  const files = Array.from(event.target.files || []);
  const status = $('gallery-status');
  if (!files.length) return;
  let added = 0;
  let rejected = 0;
  const readNext = (index) => {
    if (index >= files.length) {
      status.textContent = added ? added + ' photo' + (added > 1 ? 's' : '') + ' attached (up to 6).' : '';
      if (rejected) status.textContent += ' ' + rejected + ' skipped (over 2 MB or not a JPEG/PNG/WebP).';
      $('gallery-previews').innerHTML = pendingGallery.map((p) => '<img class="thumb small" src="' + esc(p.dataUrl) + '" alt="">').join('');
      event.target.value = '';
      return;
    }
    const file = files[index];
    if (pendingGallery.length >= 6 || file.size > 2 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      rejected++;
      readNext(index + 1);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingGallery.push({ name: file.name, type: file.type, dataUrl: reader.result });
      added++;
      readNext(index + 1);
    };
    reader.readAsDataURL(file);
  };
  readNext(0);
}

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
  renderTabs();
  applyRole();
  fillClientIdentity();
  showTab(ROLE_TABS[role][0][0]);
  $('gig-photo').addEventListener('change', handlePhotoInput);
  $('reg-gallery').addEventListener('change', handleGalleryInput);
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

function whenChanged() {
  const mode = (document.querySelector('input[name="when-mode"]:checked') || {}).value || 'asap';
  $('schedule-box').classList.toggle('hidden', mode !== 'later');
  $('gig-scheduled').required = mode === 'later';
}

function gigCard(g) {
  const me = giggers.find((entry) => entry.id === whoAmI);
  const canAccept = role === 'gigger' && g.status === 'open' && me && me.skills.includes(g.category) && g.pricingMode !== 'quote';
  const canReject = role === 'gigger' && g.status === 'open' && me && me.skills.includes(g.category) && g.pricingMode !== 'quote';
  const passed = me && (g.rejections || []).some((r) => r.giggerId === me.id);
  const acceptHint = role === 'gigger' && g.status === 'open' && whoAmI && !canAccept && g.pricingMode !== 'quote'
    ? '<div class="hint">You do not list ' + esc(g.category) + ' — add the skill to accept this one.</div>' : '';
  const quoteHint = role === 'gigger' && g.status === 'open' && g.pricingMode === 'quote' && me && me.skills.includes(g.category)
    ? '<div class="hint">This gig is asking for quotes — open it to send yours.</div>' : '';
  return '<div class="card">'
    + '<h3>' + esc(g.title) + ' ' + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.category) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.when ? ' • ' + esc(g.when) : '')
    + (g.scheduledAt ? ' • Scheduled ' + esc(new Date(g.scheduledAt).toLocaleString()) : '') + '</div>'
    + '<div class="price">' + esc(moneyText(g)) + ' <small>' + (g.pricingMode === 'quote' && g.priceEC == null ? 'quotes welcome' : 'per gig') + '</small></div>'
    + (g.promoCode ? '<div><span class="badge">PROMO ' + esc(g.promoCode) + ' −' + esc(moneyEC(g.discountEC)) + '</span></div>' : '')
    + (g.status === 'open' ? '<div class="ring-note">Ring ' + (g.ring != null ? g.ring : 0) + ' — ' + (g.ring === 2 ? 'every matching Gigger has the first look.' : 'the ' + (g.ring === 1 ? 'closest 6' : 'closest 3') + ' Giggers have the first look.') + '</div>' : '')
    + (g.hasPhoto ? '<img class="thumb small" src="/api/giggit/gigs/' + esc(g.id) + '/photo" alt="Photo of the problem" loading="lazy">' : '')
    + '<p>' + esc(g.description) + '</p>'
    + '<p><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span>'
    + (g.giggerName ? ' • <b>' + esc(g.giggerName) + '</b>' : '') + '</p>'
    + acceptHint + quoteHint
    + '<button class="btn small" type="button" onclick="openGig(\'' + esc(g.id) + '\')">Open</button> '
    + (canAccept ? '<button class="btn small leaf" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button>' : '')
    + (canReject && !passed ? ' <button class="btn small ghost" type="button" onclick="rejectGig(\'' + esc(g.id) + '\')">Pass on this gig</button>' : '')
    + (passed ? '<div class="hint">You passed on this gig — it stays open for other ' + GIG + 'gers.</div>' : '')
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
      + '<br><button class="btn small" type="button" onclick="openGigger(\'' + esc(g.id) + '\')">View profile</button>'
      + '</div>').join('') : '<div class="card">No Giggers yet — be the first.</div>');
}

/* ---- Provider profiles (slice 3) ---- */
async function openGigger(id) {
  let data;
  try {
    data = await api('/api/giggit/giggers/' + encodeURIComponent(id));
  } catch (err) {
    $('gigger-detail').innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
    return;
  }
  const g = data.gigger;
  const ratings = data.ratings || [];
  const isMine = g.id === whoAmI;
  let html = '<div class="card"><h3>' + esc(g.name) + ' '
    + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '')
    + ' <span class="badge tier">LEVEL ' + g.tier + '</span>' + (g.pro ? ' <span class="badge tier">PRO</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.ratingAvg != null ? ' • ★ ' + g.ratingAvg + ' (' + g.ratingCount + ' ratings)' : ' • No ratings yet')
    + ' • ' + g.gigsCompleted + ' gigs done</div>'
    + (g.bio ? '<p>' + esc(g.bio) + '</p>' : '<p class="meta">No bio yet.</p>')
    + g.skills.map((s) => '<span class="tag">' + esc(s) + '</span>').join('')
    + ((g.certifications || []).length ? '<br>' + g.certifications.map((c) => '<span class="tag cert">★ ' + esc(c.name) + (c.issuer ? ' — ' + esc(c.issuer) : '') + '</span>').join('') : '');
  if (g.galleryCount) {
    html += '<h3>Work photos (' + g.galleryCount + ')</h3><div class="gallery-grid">'
      + Array.from({ length: g.galleryCount }, (_, i) =>
        '<div class="gallery-item"><img class="thumb" src="/api/giggit/giggers/' + esc(g.id) + '/gallery/' + i + '" alt="Profile photo ' + (i + 1) + '" loading="lazy">'
        + (isMine ? '<br><button class="btn small ghost" type="button" onclick="removeGiggerPhoto(\'' + esc(g.id) + '\', ' + i + ')">Remove</button>' : '')
        + '</div>').join('') + '</div>';
  } else {
    html += '<p class="meta">No photos yet.</p>';
  }
  if (ratings.length) {
    html += '<h3>Customer ratings</h3>' + ratings.map((r) =>
      '<p>★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + ' — ' + esc(r.gigTitle) + (r.comment ? ': ' + esc(r.comment) : '') + ' <span class="meta">(' + esc(new Date(r.at).toLocaleDateString()) + ')</span></p>').join('');
  }
  if (isMine) {
    html += '<h3>Edit my profile</h3>'
      + '<label for="profile-bio">About you</label><textarea id="profile-bio" maxlength="500">' + esc(g.bio) + '</textarea>'
      + '<button class="btn small leaf" type="button" onclick="saveGiggerBio(\'' + esc(g.id) + '\')">Save bio</button> '
      + '<label for="profile-photo">Add a photo (up to 6)</label><input type="file" id="profile-photo" accept="image/*">'
      + '<div class="hint" id="profile-photo-status"></div>'
      + '<div id="profile-msg" class="msg"></div>';
  }
  html += '<p><button class="btn ghost small" type="button" onclick="closeGiggerDetail()">Back to Giggers</button></p></div>';
  $('gigger-detail').innerHTML = html;
  $('gigger-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const photoInput = $('profile-photo');
  if (photoInput) photoInput.addEventListener('change', (event) => addGiggerPhoto(id, event));
}

function closeGiggerDetail() {
  $('gigger-detail').innerHTML = '';
}

async function saveGiggerBio(id) {
  try {
    await api('/api/giggit/giggers/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ bio: $('profile-bio').value }) });
    await refreshData();
    renderGiggers();
    openGigger(id);
  } catch (err) {
    showMsg('profile-msg', err.message, false);
  }
}

async function addGiggerPhoto(id, event) {
  const file = event.target.files && event.target.files[0];
  const status = $('profile-photo-status');
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    status.textContent = 'That photo is over 2 MB — pick a smaller one.';
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/giggit/giggers/' + encodeURIComponent(id) + '/gallery', {
        method: 'POST', body: JSON.stringify({ photo: { name: file.name, type: file.type, dataUrl: reader.result } }),
      });
      await refreshData();
      renderGiggers();
      openGigger(id);
    } catch (err) {
      showMsg('profile-msg', err.message, false);
    }
  };
  reader.readAsDataURL(file);
}

async function removeGiggerPhoto(id, index) {
  if (!confirm('Remove this photo from your profile?')) return;
  try {
    await api('/api/giggit/giggers/' + encodeURIComponent(id) + '/gallery/' + index, { method: 'DELETE' });
    await refreshData();
    renderGiggers();
    openGigger(id);
  } catch (err) {
    alert(err.message);
  }
}

/* ---- Client view: my gigs (matched by the phone saved in the client box) ---- */
async function renderMyGigs() {
  const el = $('view-mygigs');
  if (!clientPhone) {
    el.innerHTML = '<div class="card"><h3>My gigs</h3><p>Save your name and phone in “You are the customer” above — your gigs are matched by phone.</p></div>';
    return;
  }
  let mine = [];
  try {
    mine = (await api('/api/giggit/gigs?customerPhone=' + encodeURIComponent(clientPhone))).gigs || [];
  } catch (err) {
    el.innerHTML = '<div class="msg err" style="display:block">Could not load your gigs — check the connection and try again.</div>';
    return;
  }
  el.innerHTML = '<h3>My gigs</h3>'
    + (mine.length ? mine.map(gigCard).join('') : '<div class="card">No gigs under this phone yet — post one and it will show here.</div>');
}

function saveClientIdentity() {
  clientName = ($('client-name') || {}).value.trim();
  clientPhone = ($('client-phone') || {}).value.trim();
  if (clientPhone.length < 7) {
    alert('Give a phone number so your gigs can be matched to you.');
    return;
  }
  localStorage.setItem('giggit-client-name', clientName);
  localStorage.setItem('giggit-client-phone', clientPhone);
  fillClientIdentity();
  renderMyGigs();
}

function fillClientIdentity() {
  if ($('client-name')) $('client-name').value = clientName;
  if ($('client-phone')) $('client-phone').value = clientPhone;
  const formName = $('gig-name');
  if (formName && clientName) formName.value = clientName;
  const formPhone = $('gig-phone');
  if (formPhone && clientPhone) formPhone.value = clientPhone;
}

/* ---- Admin view: all gigs table (desktop) + overview ---- */
let adminFilter = { status: '', category: '', q: '' };

async function renderAdmin() {
  const el = $('view-admin');
  try {
    adminGigs = (await api('/api/giggit/gigs?contacts=1')).gigs || [];
  } catch (err) {
    adminGigs = gigs;
  }
  let promos = [];
  try {
    promos = (await api('/api/giggit/promos')).promos || [];
  } catch (err) {
    promos = [];
  }
  let settings = null;
  try {
    settings = await api('/api/giggit/settings');
  } catch (err) {
    settings = null;
  }
  const cats = (meta && meta.categories) || [];
  let rows = adminGigs.slice();
  if (adminFilter.status) rows = rows.filter((g) => g.status === adminFilter.status);
  if (adminFilter.category) rows = rows.filter((g) => g.category === adminFilter.category);
  if (adminFilter.q) {
    const needle = adminFilter.q.trim().toLowerCase();
    rows = rows.filter((g) => (g.title + ' ' + g.description).toLowerCase().includes(needle));
  }
  el.innerHTML = '<div class="card"><h3>All gigs (' + rows.length + ')</h3>'
    + '<div class="row"><div><label>Status</label><select id="admin-status" onchange="adminFilterChanged()">'
    + '<option value="">All statuses</option>'
    + ['open', 'accepted', 'in_progress', 'completion_requested', 'completed', 'released', 'disputed', 'cancelled'].map((s) => '<option value="' + s + '"' + (adminFilter.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>').join('')
    + '</select></div><div><label>Category</label><select id="admin-category" onchange="adminFilterChanged()">'
    + '<option value="">All categories</option>'
    + cats.map((c) => '<option' + (adminFilter.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('')
    + '</select></div><div><label>Search</label><input type="text" id="admin-q" value="' + esc(adminFilter.q) + '" placeholder="Title or description" oninput="adminFilterChanged()"></div></div>'
    + '<p class="hint">Tap a row to open the gig — open gigs can be edited from there. The admin sees both phone numbers on every gig.</p></div>'
    + (rows.length ? '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Gig</th><th>Category</th><th>Customer</th><th>Gigger</th><th>Status</th><th>Price</th><th>Posted</th></tr></thead><tbody>'
      + rows.map((g) => '<tr onclick="openGig(\'' + esc(g.id) + '\')"><td><b>' + esc(g.title) + '</b>' + (g.sample ? ' <span class="badge sample">SAMPLE</span>' : '') + '</td><td>' + esc(g.category) + '</td><td>' + esc(g.customerName || '—') + '</td><td>' + esc(g.giggerName || '—') + '</td><td><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span></td><td>' + esc(moneyText(g)) + '</td><td>' + esc(new Date(g.createdAt).toLocaleDateString()) + '</td></tr>').join('')
      + '</tbody></table></div>' : '<div class="card">No gigs match those filters.</div>')
    + '<div class="card"><h3>Operator access</h3>'
    + '<p class="meta">Admin writes (settings, promos) and the phone-number lane need the operator token. Enter it once — it stays on this device until you clear it.</p>'
    + '<div class="row"><div><label>Operator token</label><input type="password" id="admin-token" maxlength="100" value="' + esc(localStorage.getItem('giggit-admin-token') || '') + '" placeholder="Paste the operator token"></div></div>'
    + '<p><button class="btn small leaf" type="button" onclick="saveAdminToken()">Save token</button> <button class="btn small ghost" type="button" onclick="clearAdminToken()">Clear token</button></p>'
    + '<div id="admin-token-msg" class="msg"></div></div>'
    + '<div class="card"><h3>Promo codes</h3>'
    + (promos.length ? promos.map((p) => '<p><b>' + esc(p.code) + '</b> — ' + p.percentOff + '% off • used ' + p.uses + (p.maxUses != null ? ' / ' + p.maxUses : ' (unlimited)') + (p.note ? ' • ' + esc(p.note) : '') + '</p>').join('') : '<p class="meta">No promo codes yet — create one below and hand it out.</p>')
    + '<div class="row"><div><label>Code</label><input type="text" id="promo-code" maxlength="20" placeholder="SAVE10"></div>'
    + '<div><label>Discount % (5–50)</label><input type="number" id="promo-percent" min="5" max="50" step="1" placeholder="10"></div>'
    + '<div><label>Max uses (blank = unlimited)</label><input type="number" id="promo-max" min="1" max="1000" step="1"></div></div>'
    + '<label>Note (optional)</label><input type="text" id="promo-note" maxlength="120" placeholder="e.g. Launch week">'
    + '<p><button class="btn small leaf" type="button" onclick="createPromo()">Create promo code</button></p>'
    + '<div id="promo-msg" class="msg"></div></div>'
    + '<div class="card"><h3>SOS — emergency contact</h3>'
    + '<p class="meta">The number shown on the SOS panel inside a live job. Leave blank if there is no number yet.</p>'
    + '<div class="row"><div><label>Emergency number</label><input type="tel" id="sos-phone" maxlength="40" value="' + esc(settings && settings.sosPhone ? settings.sosPhone : '') + '" placeholder="+1 758 …"></div>'
    + '<div><label>Label</label><input type="text" id="sos-label" maxlength="60" value="' + esc(settings && settings.sosLabel ? settings.sosLabel : 'Giggit emergency contact') + '"></div></div>'
    + '<p><button class="btn small leaf" type="button" onclick="saveSosSettings()">Save SOS contact</button></p>'
    + '<div id="sos-msg" class="msg"></div></div>';
}

async function saveSosSettings() {
  try {
    await api('/api/giggit/settings', {
      method: 'PUT',
      body: JSON.stringify({ sosPhone: ($('sos-phone') || {}).value || '', sosLabel: ($('sos-label') || {}).value || '' }),
    });
    meta = await api('/api/giggit/meta');
    renderAdmin();
  } catch (err) {
    showMsg('sos-msg', err.message, false);
  }
}

async function createPromo() {
  const body = {
    code: ($('promo-code') || {}).value || '',
    percentOff: Number(($('promo-percent') || {}).value || 0),
    maxUses: ($('promo-max') || {}).value || '',
    note: ($('promo-note') || {}).value || '',
  };
  try {
    await api('/api/giggit/promos', { method: 'POST', body: JSON.stringify(body) });
    renderAdmin();
  } catch (err) {
    showMsg('promo-msg', err.message, false);
  }
}

function adminFilterChanged() {
  adminFilter = {
    status: ($('admin-status') || {}).value || '',
    category: ($('admin-category') || {}).value || '',
    q: ($('admin-q') || {}).value || '',
  };
  const hadFocus = document.activeElement && document.activeElement.id === 'admin-q';
  renderAdmin();
  if (hadFocus) {
    const q = $('admin-q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

async function renderOverview() {
  const el = $('view-overview');
  el.innerHTML = '<div class="card"><p class="meta">Loading stats…</p></div>';
  try {
    const [stats, evts] = await Promise.all([
      api('/api/giggit/stats'),
      api('/api/giggit/events?limit=20'),
    ]);
    const s = stats;
    el.innerHTML = '<h3>Overview</h3><div class="stat-grid">'
      + '<div class="card stat"><div class="stat-num">' + s.demand.gigsPosted + '</div><div class="meta">Gigs posted (real)</div></div>'
      + '<div class="card stat"><div class="stat-num">' + s.supply.giggers + '</div><div class="meta">Giggers (real)</div></div>'
      + '<div class="card stat"><div class="stat-num">' + esc(moneyEC(s.money.escrowHeldEC)) + '</div><div class="meta">Escrow held</div></div>'
      + '<div class="card stat"><div class="stat-num">' + (s.matching.medianSecondsToFirstAccept != null ? s.matching.medianSecondsToFirstAccept + 's' : '—') + '</div><div class="meta">Median seconds to first accept</div></div>'
      + '<div class="card stat"><div class="stat-num">' + s.matching.zeroResponseCount + ' / ' + s.matching.gigsOldEnoughToJudge + '</div><div class="meta">Zero-response gigs</div></div>'
      + '<div class="card stat"><div class="stat-num">' + (s.trust.completionRate != null ? Math.round(s.trust.completionRate * 100) + '%' : '—') + '</div><div class="meta">Completion rate</div></div>'
      + '<div class="card stat"><div class="stat-num">' + s.trust.disputedCount + '</div><div class="meta">Disputed now</div></div>'
      + '<div class="card stat"><div class="stat-num">' + esc(moneyEC(s.money.totalCommissionEC)) + '</div><div class="meta">Commission so far</div></div>'
      + '</div><h3>Recent events</h3>'
      + ((evts.events || []).length ? '<div class="card">' + evts.events.map((e) => '<p><span class="meta">' + esc(new Date(e.at).toLocaleString()) + '</span> — <b>' + esc(e.group) + ' / ' + esc(e.type) + '</b>' + (e.gigId ? ' • ' + esc(e.gigId) : '') + '</p>').join('') + '</div>' : '<div class="card">No events yet.</div>');
  } catch (err) {
    el.innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
  }
}

async function openGig(id) {
  detailId = id;
  let g;
  try {
    const params = new URLSearchParams();
    if (role === 'admin') params.set('contacts', '1');
    if (clientPhone) params.set('customerPhone', clientPhone);
    if (whoAmI) params.set('giggerId', whoAmI);
    const qs = params.toString();
    g = (await api('/api/giggit/gigs/' + encodeURIComponent(id) + (qs ? '?' + qs : ''))).gig;
  } catch (err) {
    $('gig-detail').innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
    return;
  }
  const me = giggers.find((entry) => entry.id === whoAmI);
  const isMine = me && g.giggerId === me.id;
  let html = '<div class="card"><h3>' + esc(g.title) + ' ' + (g.sample ? '<span class="badge sample">SAMPLE</span>' : '') + '</h3>'
    + '<div class="meta">' + esc(g.category) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '')
    + (g.when ? ' • ' + esc(g.when) : '')
    + (g.scheduledAt ? ' • Scheduled ' + esc(new Date(g.scheduledAt).toLocaleString()) : '') + '</div>'
    + '<div class="price">' + esc(moneyText(g)) + '</div>'
    + (g.promoCode ? '<p class="promo-line">Promo ' + esc(g.promoCode) + ': ' + esc(moneyEC(g.priceBeforePromoEC)) + ' − ' + esc(moneyEC(g.discountEC)) + ' = ' + esc(moneyEC(g.priceEC)) + '</p>' : '')
    + '<p>' + esc(g.description) + '</p>'
    + '<p><span class="status ' + esc(g.status) + '">' + esc(statusLabel(g.status)) + '</span></p>';
  if (lastActionNote) {
    html += '<div class="hint">' + esc(lastActionNote) + '</div>';
    lastActionNote = '';
  }
  html += progressSteps(g);
  const sosLive = ['accepted', 'in_progress', 'completion_requested'].includes(g.status)
    && (role === 'admin' || (me && g.giggerId === me.id) || (clientPhone && g.customerPhone === clientPhone));
  if (sosLive) {
    const isGigger = me && g.giggerId === me.id;
    const isCustomer = clientPhone && g.customerPhone === clientPhone;
    const links = [];
    if ((isGigger || role === 'admin') && g.customerPhone) {
      links.push({ label: 'Call the customer', phone: g.customerPhone });
    }
    if ((isCustomer || role === 'admin') && g.giggerPhone) {
      links.push({ label: 'Call the Gigger', phone: g.giggerPhone });
    }
    html += '<div class="sos-panel"><h3>SOS — need help now?</h3>'
      + links.map((l) => '<p><a class="btn danger" href="tel:' + esc(l.phone.replace(/[^+0-9]/g, '')) + '">' + esc(l.label) + ' — ' + esc(l.phone) + '</a></p>').join('')
      + '<p class="meta">Job: ' + esc(g.title) + ' • ' + esc(g.parish) + (g.area ? ' — ' + esc(g.area) : '') + '</p>'
      + ((meta && meta.sosPhone) ? '<p><a class="btn danger" href="tel:' + esc(String(meta.sosPhone).replace(/[^+0-9]/g, '')) + '">Call ' + esc(meta.sosLabel || 'Giggit emergency contact') + ' — ' + esc(meta.sosPhone) + '</a></p>' : '<p class="meta">No emergency number set yet — the admin sets it in the Admin view.</p>')
      + '</div>';
  }
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
        + (role !== 'gigger' ? '<button class="btn small leaf" type="button" onclick="acceptQuote(\'' + esc(g.id) + '\', \'' + esc(q.giggerId) + '\')">Accept this quote</button>' : '') + '</div>').join('');
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
  if (role === 'gigger' && g.status === 'open' && me && me.skills.includes(g.category) && g.pricingMode !== 'quote') {
    html += '<button class="btn leaf" type="button" onclick="acceptGig(\'' + esc(g.id) + '\')">Accept this gig</button> ';
    const passedHere = (g.rejections || []).some((r) => r.giggerId === me.id);
    if (!passedHere) html += '<button class="btn ghost" type="button" onclick="rejectGig(\'' + esc(g.id) + '\')">Pass on this gig</button> ';
    else html += '<span class="hint">You passed on this gig — it stays open for other ' + GIG + 'gers.</span> ';
  }
  if (role === 'admin' && g.status === 'open') {
    html += '<button class="btn" type="button" onclick="showEditForm(\'' + esc(g.id) + '\')">Edit gig</button> ';
  }
  if (g.rejections && g.rejections.length) {
    html += '<p class="meta">Passed on this gig: ' + g.rejections.map((r) => esc(r.giggerName) + ' (' + esc(new Date(r.at).toLocaleDateString()) + ')').join(', ') + '</p>';
  }
  if (isMine && g.status === 'accepted' && !g.arrivedAt) {
    html += '<button class="btn" type="button" onclick="gigAction(\'' + esc(g.id) + '\', \'arrived\', {giggerId: whoAmI})">I’ve arrived at the job</button> ';
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
  const chatStatuses = ['accepted', 'in_progress', 'completion_requested', 'completed', 'released', 'disputed'];
  const chatParty = chatStatuses.includes(g.status)
    && (role === 'admin' || (me && g.giggerId === me.id) || (clientPhone && g.customerPhone === clientPhone));
  if (chatParty) {
    html += '<div id="chat-box"><p class="meta">Loading chat…</p></div>';
  }
  html += '<div id="matches-box"><p class="meta">Finding the closest Giggers…</p></div>';
  html += '<div id="edit-box"></div>';
  html += '<p><button class="btn ghost small" type="button" onclick="closeDetail()">Back to gigs</button></p></div>';
  $('gig-detail').innerHTML = html;
  $('gig-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderMatches(id);
  renderChat(id, g);
}

/* ---- In-app chat (slice 2) ---- */
function chatIdentity(g) {
  if (role === 'admin') return { by: 'admin', giggerId: '', customerPhone: '' };
  const me = giggers.find((entry) => entry.id === whoAmI);
  if (me && g.giggerId === me.id) return { by: 'gigger', giggerId: me.id, customerPhone: '' };
  if (clientPhone && g.customerPhone === clientPhone) return { by: 'customer', giggerId: '', customerPhone: clientPhone };
  return null;
}

async function renderChat(id, g) {
  const box = $('chat-box');
  if (!box) return;
  const who = chatIdentity(g);
  if (!who) {
    box.innerHTML = '';
    return;
  }
  let messages = [];
  try {
    const params = new URLSearchParams({ by: who.by, giggerId: who.giggerId, customerPhone: who.customerPhone });
    messages = (await api('/api/giggit/gigs/' + encodeURIComponent(id) + '/messages?' + params.toString())).messages || [];
  } catch (err) {
    box.innerHTML = '<div class="msg err" style="display:block">' + esc(err.message) + '</div>';
    return;
  }
  const canSend = who.by !== 'admin';
  box.innerHTML = '<h3>Chat — inside this job</h3>'
    + (messages.length ? messages.map((m) =>
      '<div class="chat-msg ' + (m.by === who.by ? 'mine' : 'theirs') + '"><b>' + (m.by === 'customer' ? 'Customer' : 'Gigger') + '</b> <span class="meta">' + esc(new Date(m.at).toLocaleString()) + '</span><br>' + esc(m.text) + '</div>').join('')
      : '<p class="meta">No messages yet — say hello, confirm the details.</p>')
    + (canSend
      ? '<div class="row"><input type="text" id="chat-input" maxlength="1000" placeholder="Message the ' + (who.by === 'customer' ? 'Gigger' : 'customer') + '…">'
        + '<button class="btn small leaf" type="button" onclick="sendChat(\'' + esc(id) + '\')">Send</button></div>'
      : '<p class="meta">Admin is read-only here.</p>')
    + '<div id="chat-msg" class="msg"></div>';
  const input = $('chat-input');
  if (input) input.addEventListener('keydown', (event) => { if (event.key === 'Enter') sendChat(id); });
}

async function sendChat(id) {
  const input = $('chat-input');
  const text = (input && input.value || '').trim();
  if (!text) return;
  let g;
  try {
    g = (await api('/api/giggit/gigs/' + encodeURIComponent(id))).gig;
  } catch (err) {
    showMsg('chat-msg', err.message, false);
    return;
  }
  const who = chatIdentity(g);
  if (!who || who.by === 'admin') return;
  try {
    await api('/api/giggit/gigs/' + encodeURIComponent(id) + '/messages', {
      method: 'POST', body: JSON.stringify({ by: who.by, giggerId: who.giggerId, customerPhone: who.customerPhone, text }),
    });
    renderChat(id, g);
  } catch (err) {
    showMsg('chat-msg', err.message, false);
  }
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
      '<div class="match-row' + (m.inCurrentRing === false ? ' out-of-ring' : '') + (m.rejected ? ' passed' : '') + '"><span>' + (i + 1) + '. <b>' + esc(m.gigger.name) + '</b> — ' + esc(m.gigger.skills.join(', ')) + ' <span class="ring">RING ' + m.ring + '</span>' + (m.rejected ? ' <span class="badge">PASSED</span>' : '') + '</span>'
      + '<span class="dist">' + (m.distanceKm != null ? m.distanceKm + ' km' : m.basis === 'same-area' ? 'same area' : m.basis === 'same-parish' ? 'same parish' : 'no location yet') + '</span></div>').join('');
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = '';
  }
}

function closeDetail() {
  detailId = null;
  $('gig-detail').innerHTML = '';
  renderCurrentTab();
}

/* ---- Job progress steps (slice 4): Posted → Accepted → Arrived →
   Started → Marked done → Verified → Released, like the GoferHandy
   video's customer side. Arrival is optional — a Gigger can start
   without tapping it — so it shows done only when it happened. */
function progressSteps(g) {
  const steps = [
    { label: 'Posted', at: g.createdAt, required: true },
    { label: 'Accepted — escrow held', at: g.acceptedAt, required: true },
    { label: 'Gigger arrived', at: g.arrivedAt, required: false },
    { label: 'Job started', at: g.startedAt, required: true },
    { label: 'Marked done', at: g.doneRequestedAt, required: true },
    { label: 'Verified', at: g.completedAt, required: true },
    { label: 'Released — paid', at: g.escrow && g.escrow.releasedAt, required: true },
  ];
  const live = !['cancelled', 'disputed'].includes(g.status);
  let currentFound = false;
  const rows = steps.map((step) => {
    let state = 'pending';
    if (step.at) state = 'done';
    else if (live && step.required && !currentFound) {
      state = 'current';
      currentFound = true;
    }
    const mark = state === 'done' ? '✓' : state === 'current' ? '●' : '○';
    return '<div class="step ' + state + '"><span class="step-mark">' + mark + '</span> <b>' + esc(step.label) + '</b>'
      + (step.at ? ' <span class="meta">' + esc(new Date(step.at).toLocaleString()) + '</span>' : '')
      + (state === 'current' ? ' <span class="meta">— next</span>' : '') + '</div>';
  }).join('');
  const tail = g.status === 'cancelled'
    ? '<div class="step cancelled-step"><span class="step-mark">✕</span> <b>Cancelled</b>' + (g.cancelReason ? ' — ' + esc(g.cancelReason) : '') + '</div>'
    : g.status === 'disputed'
      ? '<div class="step disputed-step"><span class="step-mark">!</span> <b>Disputed — escrow frozen</b></div>'
      : '';
  return '<div class="steps"><h3>Job progress</h3>' + rows + tail + '</div>';
}

let pickedStars = 0;
let lastActionNote = '';
function pickStars(n) {
  pickedStars = n;
  document.querySelectorAll('#rate-stars button').forEach((btn) => {
    btn.classList.toggle('lit', Number(btn.dataset.n) <= n);
  });
}

async function gigAction(id, action, body) {
  try {
    const data = await api('/api/giggit/gigs/' + encodeURIComponent(id) + '/' + action, {
      method: 'POST', body: JSON.stringify(body || {}),
    });
    if (data.escrowNotified) {
      lastActionNote = data.escrowNotified.notified
        ? 'Gigger notified — escrow is held, they can start.'
        : 'Escrow held. ' + (data.escrowNotified.reason || '');
    } else if (data.verifyNotified) {
      lastActionNote = data.verifyNotified.notified
        ? 'Customer notified — the job is marked done, they can verify.'
        : 'Marked done. ' + (data.verifyNotified.reason || '');
    } else {
      lastActionNote = '';
    }
    await refreshData();
    openGig(id);
    renderCurrentTab();
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

async function rejectGig(id) {
  if (!whoAmI) {
    alert('Pick who you are first — choose a Gigger in “Testing as” at the top.');
    return;
  }
  await gigAction(id, 'reject', { giggerId: whoAmI });
}

let editingGig = null;

async function showEditForm(id) {
  let g;
  try {
    g = (await api('/api/giggit/gigs/' + encodeURIComponent(id) + '?contacts=1')).gig;
  } catch (err) {
    alert(err.message);
    return;
  }
  editingGig = g;
  const cats = (meta && meta.categories) || [];
  $('edit-box').innerHTML = '<div class="card edit-box"><h3>Edit gig (open gigs only)</h3>'
    + '<label>Title</label><input type="text" id="edit-title" maxlength="120" value="' + esc(g.title) + '">'
    + '<label>Description</label><textarea id="edit-desc" maxlength="2000">' + esc(g.description) + '</textarea>'
    + '<label>Category</label><select id="edit-category">' + cats.map((c) => '<option' + (c === g.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>'
    + '<div class="row"><div><label>Area</label><input type="text" id="edit-area" maxlength="80" value="' + esc(g.area || '') + '"></div>'
    + '<div><label>When</label><input type="text" id="edit-when" maxlength="120" value="' + esc(g.when || '') + '"></div></div>'
    + (g.pricingMode === 'budget' ? '<label>Budget (EC$)</label><input type="number" id="edit-price" min="1" max="10000" step="0.01" value="' + Number(g.priceEC).toFixed(2) + '">' : '<p class="meta">Quote gig — the price comes from the accepted quote, so it cannot be edited here.</p>')
    + '<p><button class="btn leaf" type="button" onclick="saveEdit(\'' + esc(g.id) + '\')">Save changes</button> '
    + '<button class="btn ghost" type="button" onclick="closeEditForm()">Cancel</button></p>'
    + '<div id="edit-msg" class="msg"></div></div>';
  $('edit-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditForm() {
  editingGig = null;
  const box = $('edit-box');
  if (box) box.innerHTML = '';
}

async function saveEdit(id) {
  const body = {
    title: $('edit-title').value,
    description: $('edit-desc').value,
    category: $('edit-category').value,
    area: $('edit-area').value,
    when: $('edit-when').value,
  };
  const priceEl = $('edit-price');
  if (priceEl) body.priceEC = Number(priceEl.value);
  try {
    await api('/api/giggit/gigs/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) });
    await refreshData();
    openGig(id);
    renderCurrentTab();
  } catch (err) {
    showMsg('edit-msg', err.message, false);
  }
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
    promoCode: $('gig-promo').value,
    scheduledAt: ((document.querySelector('input[name="when-mode"]:checked') || {}).value === 'later') ? $('gig-scheduled').value : '',
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
    clientName = body.customerName;
    clientPhone = body.customerPhone;
    localStorage.setItem('giggit-client-name', clientName);
    localStorage.setItem('giggit-client-phone', clientPhone);
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
    bio: $('reg-bio').value,
    gallery: pendingGallery,
    lat: $('reg-lat').value ? Number($('reg-lat').value) : null,
    lng: $('reg-lng').value ? Number($('reg-lng').value) : null,
  };
  try {
    const data = await api('/api/giggit/giggers', { method: 'POST', body: JSON.stringify(body) });
    showMsg('reg-msg', 'Welcome in, ' + data.gigger.name + ' — you are Level 1. Pick yourself in “Testing as” to start accepting gigs.', true);
    $('reg-form').reset();
    pendingGallery = [];
    $('gallery-previews').innerHTML = '';
    $('gallery-status').textContent = '';
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
    await api('/api/giggit/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub, giggerId: whoAmI || null, customerPhone: clientPhone || null }) });
    showMsg('push-msg', 'Notifications on — Giggers get pinged about new gigs and escrow, customers get pinged when their gig is marked done. (iPhone: add Giggit to your Home Screen first.)', true);
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
