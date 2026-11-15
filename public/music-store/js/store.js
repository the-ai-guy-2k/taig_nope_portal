/* TAIG Online Music Store — storefront behavior (MVP demo).
   Catalog renders from /music-store/api/catalog (SQLite).
   Cart is client-side only (localStorage). No checkout, no payment:
   the checkout button shows the payment-coming-soon notice. */
(function () {
  'use strict';

  var API = '/music-store/api/catalog';
  var CART_KEY = 'taig-music-cart-v1';
  var PREVIEW_SECONDS = 30;

  var catalog = null;
  var cart = loadCart();
  var audio = new Audio();
  var playingTrackId = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function money(cents) { return '$' + (cents / 100).toFixed(2); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

  function productById(id) {
    if (!catalog) return null;
    return catalog.products.find(function (p) { return p.id === id; }) || null;
  }
  function trackById(id) {
    if (!catalog) return null;
    return catalog.tracks.find(function (t) { return t.id === id; }) || null;
  }

  function cartCount() {
    return cart.reduce(function (n, item) { return n + item.qty; }, 0);
  }
  function cartTotal() {
    return cart.reduce(function (sum, item) {
      var p = item.kind === 'track' ? trackById(item.id) : productById(item.id);
      return sum + (p ? p.price_cents * item.qty : 0);
    }, 0);
  }

  function addToCart(kind, id, qty) {
    var found = cart.find(function (item) { return item.kind === kind && item.id === id; });
    if (found) { found.qty += qty; } else { cart.push({ kind: kind, id: id, qty: qty }); }
    saveCart();
    renderCart();
  }
  function setQty(kind, id, qty) {
    cart = cart.filter(function (item) {
      if (item.kind === kind && item.id === id) {
        if (qty <= 0) return false;
        item.qty = qty;
      }
      return true;
    });
    saveCart();
    renderCart();
  }
  function removeFromCart(kind, id) { setQty(kind, id, 0); }

  function renderCart() {
    var badge = $('#cart-badge');
    var count = cartCount();
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
    var body = $('#cart-items');
    var foot = $('#cart-footer');
    if (!body) return;
    if (!cart.length) {
      body.innerHTML = '<p class="cart-empty">Your cart is empty. Add the album, a track, or a CD.</p>';
      if (foot) foot.hidden = true;
      return;
    }
    var html = '';
    cart.forEach(function (item) {
      var p = item.kind === 'track' ? trackById(item.id) : productById(item.id);
      if (!p) return;
      var name = item.kind === 'track' ? p.title : p.name;
      var sub = item.kind === 'track'
        ? 'Single track · ' + p.duration
        : (p.detail || '');
      html += '<div class="cart-item" data-kind="' + item.kind + '" data-id="' + item.id + '">'
        + '<div class="name">' + esc(name) + '<small>' + esc(sub) + '</small></div>'
        + '<div class="qty"><button data-act="dec" aria-label="Decrease quantity">−</button>'
        + '<span>' + item.qty + '</span>'
        + '<button data-act="inc" aria-label="Increase quantity">+</button></div>'
        + '<div>' + money(p.price_cents * item.qty) + '</div>'
        + '<button class="cart-remove" data-act="remove">Remove</button>'
        + '</div>';
    });
    body.innerHTML = html;
    var total = $('#cart-total-amount');
    if (total) total.textContent = money(cartTotal());
    if (foot) foot.hidden = false;
  }

  function openCart() {
    renderCart();
    $('#cart-drawer').classList.add('open');
    $('#cart-overlay').hidden = false;
  }
  function closeCart() {
    $('#cart-drawer').classList.remove('open');
    $('#cart-overlay').hidden = true;
  }

  function showCheckoutNotice() {
    var note = $('#checkout-notice');
    if (note) note.hidden = false;
  }

  /* ---- previews ---- */
  function stopPreview() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (playingTrackId !== null) {
      var row = document.querySelector('.track[data-track-id="' + playingTrackId + '"]');
      if (row) {
        row.classList.remove('is-playing');
        var btn = row.querySelector('.track-play');
        if (btn) btn.textContent = '▶';
        var read = row.querySelector('.preview-readout');
        if (read) read.hidden = true;
      }
      playingTrackId = null;
    }
  }
  function fmtTime(sec) {
    var s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function playPreview(track, btn) {
    if (playingTrackId === track.id) { stopPreview(); return; }
    stopPreview();
    var row = btn.closest('.track');
    playingTrackId = track.id;
    row.classList.add('is-playing');
    btn.textContent = '❚❚';
    var read = row.querySelector('.preview-readout');
    if (read) { read.hidden = false; read.textContent = '0:00 / 0:30 · preview'; }
    audio.src = '/music-store/audio/' + track.preview;
    audio.play().catch(function () { stopPreview(); });
  }
  audio.addEventListener('timeupdate', function () {
    if (playingTrackId === null) return;
    var row = document.querySelector('.track[data-track-id="' + playingTrackId + '"]');
    if (!row) return;
    var read = row.querySelector('.preview-readout');
    if (read) read.textContent = fmtTime(audio.currentTime) + ' / 0:30 · preview';
  });
  audio.addEventListener('ended', stopPreview);
  audio.addEventListener('pause', function () {
    if (playingTrackId !== null && !audio.seeking) stopPreview();
  });

  /* ---- rendering ---- */
  function renderLanding() {
    var album = catalog.albums[0];
    var artist = catalog.artists[0];
    var digital = productById('album-digital');
    var cd = productById('album-cd');
    var banner = $('#featured-banner');
    if (banner && album && artist) {
      banner.innerHTML =
        '<img class="cover" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
        + '<div><p class="muted small" style="margin:0 0 4px">Featured release · Out now</p>'
        + '<h2>' + esc(album.title) + '</h2>'
        + '<p class="artist">' + esc(artist.name) + '</p>'
        + '<p class="meta muted">' + album.track_count + ' songs · ' + esc(album.total_time)
        + ' · Label: ' + esc(album.label) + '</p>'
        + '<div class="btn-row">'
        + '<a class="btn" href="/music-store/album/">Shop the album</a>'
        + '<button class="btn btn-ghost" data-add="album" data-id="album-digital">Add album — '
        + money(digital.price_cents) + '</button>'
        + '</div></div>';
    }
    var cards = $('#store-cards');
    if (cards && album && digital && cd) {
      cards.innerHTML =
        '<div class="card"><img class="thumb" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
        + '<h3>Digital album</h3><p class="muted">' + esc(album.title) + ' · ' + album.track_count + ' songs</p>'
        + '<p class="price">' + money(digital.price_cents) + '</p>'
        + '<button class="btn" data-add="album" data-id="album-digital">Add album — ' + money(digital.price_cents) + '</button></div>'
        + '<div class="card"><h3>CD</h3><p class="muted">' + esc(album.title) + ' on disc.</p>'
        + '<p>' + esc(cd.detail) + '</p>'
        + '<p class="price">' + money(cd.price_cents) + '</p>'
        + '<button class="btn" data-add="cd" data-id="album-cd">Add CD — ' + money(cd.price_cents) + '</button></div>'
        + '<div class="card"><h3>More music coming soon</h3>'
        + '<p class="muted">New artists from the TAIG roster are on the way. Jay is Artist #1 — the store grows from here.</p>'
        + '<p class="price muted">—</p></div>';
    }
  }

  function renderAlbum() {
    var album = catalog.albums[0];
    var artist = catalog.artists[0];
    var digital = productById('album-digital');
    var cd = productById('album-cd');
    var hero = $('#album-hero');
    if (hero && album && artist) {
      hero.innerHTML =
        '<img class="cover" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
        + '<div><h1>' + esc(album.title) + '</h1>'
        + '<p class="artist">' + esc(artist.name) + '</p>'
        + '<p class="muted">Out now · ' + album.track_count + ' songs · ' + esc(album.total_time)
        + '<br>Label: ' + esc(album.label) + ' · Released ' + esc(album.release_date) + '</p>'
        + '<div class="formats">'
        + '<div class="format"><div class="price">' + money(digital.price_cents) + '</div>'
        + '<p>Digital album · 12 songs, MP3 download</p>'
        + '<button class="btn" data-add="album" data-id="album-digital">Add album</button></div>'
        + '<div class="format"><div class="price">' + money(cd.price_cents) + '</div>'
        + '<p>CD · ' + esc(cd.detail) + '</p>'
        + '<button class="btn" data-add="cd" data-id="album-cd">Add CD</button></div>'
        + '</div></div>';
    }
    var list = $('#tracklist');
    if (list) {
      var html = '';
      catalog.tracks.forEach(function (t) {
        if (t.demo_available) {
          html += '<li class="track" data-track-id="' + t.id + '">'
            + '<span class="track-num">' + String(t.num).padStart(2, '0') + '</span>'
            + '<button class="track-play" data-play="' + t.id + '" aria-label="Play 30-second preview of ' + esc(t.title) + '">▶</button>'
            + '<span class="track-title">' + esc(t.title)
            + (t.is_single ? '<span class="tag">Single</span>' : '') + '</span>'
            + '<span class="track-dur">' + esc(t.duration) + '</span>'
            + '<span class="preview-readout" hidden>0:00 / 0:30 · preview</span>'
            + '<button class="btn btn-small" data-add="track" data-id="' + t.id + '">+ ' + money(t.price_cents) + '</button>'
            + '</li>';
        } else {
          html += '<li class="track coming-soon">'
            + '<span class="track-num">' + String(t.num).padStart(2, '0') + '</span>'
            + '<span class="track-title">' + esc(t.title)
            + (t.is_single ? '<span class="tag">Single</span>' : '')
            + '<span class="tag soon">Coming soon</span></span>'
            + '<span class="track-dur">' + esc(t.duration) + '</span>'
            + '</li>';
        }
      });
      list.innerHTML = html;
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var addBtn = ev.target.closest('[data-add]');
      if (addBtn) {
        var kind = addBtn.getAttribute('data-add');
        var id = addBtn.getAttribute('data-id');
        addToCart(kind, kind === 'track' ? parseInt(id, 10) : id, 1);
        return;
      }
      var playBtn = ev.target.closest('[data-play]');
      if (playBtn) {
        var track = trackById(parseInt(playBtn.getAttribute('data-play'), 10));
        if (track) playPreview(track, playBtn);
        return;
      }
      var cartItem = ev.target.closest('.cart-item [data-act]');
      if (cartItem) {
        var row = cartItem.closest('.cart-item');
        var k = row.getAttribute('data-kind');
        var rid = k === 'track' ? parseInt(row.getAttribute('data-id'), 10) : row.getAttribute('data-id');
        var act = cartItem.getAttribute('data-act');
        var cur = cart.find(function (i) { return i.kind === k && i.id === rid; });
        if (!cur) return;
        if (act === 'inc') setQty(k, rid, cur.qty + 1);
        if (act === 'dec') setQty(k, rid, cur.qty - 1);
        if (act === 'remove') removeFromCart(k, rid);
        return;
      }
    });

    var cartBtn = $('#cart-open');
    if (cartBtn) cartBtn.addEventListener('click', openCart);
    var closeBtn = $('#cart-close');
    if (closeBtn) closeBtn.addEventListener('click', closeCart);
    var overlay = $('#cart-overlay');
    if (overlay) overlay.addEventListener('click', closeCart);
    var checkoutBtn = $('#checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', showCheckoutNotice);

    var signup = $('#signup-form');
    if (signup) {
      signup.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var note = $('#signup-notice');
        if (note) note.hidden = false;
        signup.reset();
      });
    }
  }

  function init() {
    bindEvents();
    renderCart();
    var page = document.body.getAttribute('data-page');
    fetch(API)
      .then(function (res) { if (!res.ok) throw new Error('catalog failed'); return res.json(); })
      .then(function (data) {
        catalog = data;
        if (page === 'landing') renderLanding();
        if (page === 'album') renderAlbum();
        var loading = $('.loading');
        if (loading) loading.hidden = true;
      })
      .catch(function () {
        var loading = $('.loading');
        if (loading) loading.textContent = 'The catalog could not be loaded. Please try again in a moment.';
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
