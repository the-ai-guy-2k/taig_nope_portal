/* TAIG Online Music Store — storefront behavior.
   iTunes-style browse: featured album hero, featured tracks, artist
   catalog, artist pages, album page. Catalog renders from
   /music-store/api/catalog (SQLite). Cart is client-side only
   (localStorage). No checkout, no payment: the checkout button shows
   the payment-coming-soon notice. */
(function () {
  'use strict';

  var API = '/music-store/api/catalog';
  var EVENT_URL = '/music-store/api/event';
  var CART_KEY = 'taig-music-cart-v1';
  var PREVIEW_SECONDS = 30;

  var catalog = null;
  var cart = loadCart();
  var audio = new Audio();
  var playingTrackId = null;
  var activeGenre = 'All';

  /* First-party stats: one counted action per call, no personal data.
     sendBeacon survives page navigation (artist clicks). Stats must
     never break the store, so every failure is swallowed. */
  function sendStat(type, detail) {
    try {
      var payload = JSON.stringify({
        type: type,
        detail: detail || '',
        page: document.body.getAttribute('data-page') || '',
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(EVENT_URL, new Blob([payload], { type: 'application/json' }));
      } else if (window.fetch) {
        fetch(EVENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload, keepalive: true,
        }).catch(function () {});
      }
    } catch (e) { /* stats must never break the store */ }
  }

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
  function albumForArtist(artistId) {
    if (!catalog) return null;
    return catalog.albums.find(function (a) { return a.artist_id === artistId; }) || null;
  }

  /* ---- genre browse/filter ---- */
  function genres() {
    var seen = [];
    catalog.artists.forEach(function (a) {
      if (a.genre && seen.indexOf(a.genre) === -1) seen.push(a.genre);
    });
    return seen;
  }
  function renderGenreFilter() {
    var bar = $('#genre-filter');
    if (!bar) return;
    var html = '<button class="genre-chip' + (activeGenre === 'All' ? ' active' : '')
      + '" data-filter-genre="All" type="button">All genres</button>';
    genres().forEach(function (g) {
      html += '<button class="genre-chip' + (activeGenre === g ? ' active' : '')
        + '" data-filter-genre="' + esc(g) + '" type="button">' + esc(g) + '</button>';
    });
    bar.innerHTML = html;
  }
  function applyGenreFilter() {
    document.querySelectorAll('[data-genre]').forEach(function (el) {
      el.hidden = activeGenre !== 'All' && el.getAttribute('data-genre') !== activeGenre;
    });
    document.querySelectorAll('.genre-chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-filter-genre') === activeGenre);
    });
  }
  function setGenre(g) {
    activeGenre = g;
    applyGenreFilter();
  }

  function renderRoster() {
    var box = $('#roster');
    if (!box) return;
    var html = '';
    catalog.artists.forEach(function (a) { html += artistSlotHTML(a); });
    box.innerHTML = html;
  }

  /* One artist card, used by the landing roster, the album-page
     recommendations, and the artist-page "more artists". Every card
     links to the artist's own page; the album link (when the artist
     has one) still goes to the album page. */
  function artistPageURL(a) {
    return '/music-store/artist/?slug=' + encodeURIComponent(a.slug || a.id);
  }
  function artistSlotHTML(a) {
    var album = albumForArtist(a.id);
    var cover = a.cover || (album && album.cover);
    var num = String(a.roster_position || a.id).padStart(2, '0');
    var page = artistPageURL(a);
    return '<div class="roster-slot" data-genre="' + esc(a.genre || '') + '" data-artist="' + esc(a.slug) + '">'
      + (cover
        ? '<a href="' + esc(page) + '"><img class="cover" src="' + esc(cover) + '" alt="Cover art — ' + esc(a.name) + '"></a>'
        : '')
      + '<div class="num">' + num + '</div>'
      + '<h3><a href="' + esc(page) + '">' + esc(a.name) + '</a></h3>'
      + '<p><span class="tag">' + esc(a.genre || '') + '</span></p>'
      + '<p class="muted">' + esc(a.blurb || '') + '</p>'
      + (album
        ? '<p><a href="' + esc(album.page || '/music-store/') + '">' + esc(album.title) + ' — out now</a></p>'
        : '<p class="muted">Debut release coming soon</p>')
      + '</div>';
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
    var item = kind === 'track' ? trackById(id) : productById(id);
    sendStat('cart_add', item ? (item.title || item.name) : String(id));
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
    sendStat('checkout_notice', 'shown');
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
    sendStat('preview_play', track.title);
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
  /* Featured album hero (landing): the store's one album is the
     featured album. Same cover/meta/actions as the album page hero,
     plus a link to the full tracklist. */
  function renderHero() {
    var box = $('#featured-hero');
    if (!box) return;
    var album = catalog.albums[0];
    if (!album) { box.innerHTML = '<p class="muted">No album featured yet.</p>'; return; }
    var artist = catalog.artists.find(function (a) { return a.id === album.artist_id; });
    var digital = catalog.products.find(function (p) { return p.album_id === album.id && p.kind === 'album'; });
    var cd = catalog.products.find(function (p) { return p.album_id === album.id && p.kind === 'cd'; });
    if (!artist || !digital || !cd) return;
    box.innerHTML =
      '<img class="cover" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
      + '<div><h2>' + esc(album.title) + '</h2>'
      + '<p class="artist"><a href="' + esc(artistPageURL(artist)) + '">' + esc(artist.name) + '</a></p>'
      + '<p class="meta muted">Out now · ' + album.track_count + ' songs · ' + esc(album.total_time)
      + '<br>Label: ' + esc(album.label) + ' · Released ' + esc(album.release_date) + '</p>'
      + '<div class="formats">'
      + '<div class="format"><div class="price">' + money(digital.price_cents) + '</div>'
      + '<p>Digital album · ' + esc(digital.detail) + '</p>'
      + '<button class="btn" data-add="album" data-id="' + digital.id + '">Add album</button></div>'
      + '<div class="format"><div class="price">' + money(cd.price_cents) + '</div>'
      + '<p>CD · ' + esc(cd.detail) + '</p>'
      + '<button class="btn" data-add="cd" data-id="' + cd.id + '">Add CD</button></div>'
      + '</div>'
      + '<a class="hero-link" href="' + esc(album.page || '/music-store/') + '">See all ' + album.track_count + ' tracks →</a>'
      + '</div>';
  }

  /* Featured tracks (landing): the album's previewable tracks as
     iTunes-style rows. Same row markup as the album page, so the
     shared preview player and cart buttons work unchanged. */
  function renderFeaturedTracks() {
    var list = $('#featured-tracks');
    if (!list) return;
    var album = catalog.albums[0];
    if (!album) { list.innerHTML = ''; return; }
    var artist = catalog.artists.find(function (a) { return a.id === album.artist_id; });
    var html = '';
    catalog.tracks.filter(function (t) { return t.album_id === album.id && t.demo_available; }).forEach(function (t) {
      html += '<li class="track" data-track-id="' + t.id + '">'
        + '<span class="track-num">' + String(t.num).padStart(2, '0') + '</span>'
        + '<button class="track-play" data-play="' + t.id + '" aria-label="Play 30-second preview of ' + esc(t.title) + '">▶</button>'
        + '<span class="track-title">' + esc(t.title)
        + (t.is_single ? '<span class="tag">Single</span>' : '') + '</span>'
        + (artist ? '<span class="track-artist">' + esc(artist.name) + '</span>' : '')
        + '<span class="track-dur">' + esc(t.duration) + '</span>'
        + '<span class="preview-readout" hidden>0:00 / 0:30 · preview</span>'
        + '<button class="btn btn-small" data-add="track" data-id="' + t.id + '">+ ' + money(t.price_cents) + '</button>'
        + '</li>';
    });
    list.innerHTML = html;
  }

  function renderLanding() {
    /* Landing = featured album hero + featured tracks + the artist
       catalog. The genre filter lives on the artist grid only. */
    renderHero();
    renderFeaturedTracks();
    renderGenreFilter();
    renderRoster();
    applyGenreFilter();
  }

  /* Recommendations (album page + artist page): the label's other
     artists, as roster cards linking to their artist pages. */
  function renderRecommendations(box, excludeArtistId) {
    if (!box) return;
    var html = '';
    catalog.artists.forEach(function (a) {
      if (a.id === excludeArtistId) return;
      html += artistSlotHTML(a);
    });
    box.innerHTML = html;
  }

  function renderAlbum() {
    /* The album page is the album whose page URL matches this page's
       path. Jay's page is /music-store/album/. Artist pages are a
       separate page type (data-page="artist", ?slug=) with no album
       fallback — see renderArtist. */
    var path = window.location.pathname.replace(/\/$/, '');
    var album = catalog.albums.find(function (a) { return (a.page || '').replace(/\/$/, '') === path; })
      || catalog.albums[0];
    var artist = catalog.artists.find(function (a) { return a.id === album.artist_id; })
      || catalog.artists[0];
    var digital = catalog.products.find(function (p) { return p.album_id === album.id && p.kind === 'album'; });
    var cd = catalog.products.find(function (p) { return p.album_id === album.id && p.kind === 'cd'; });
    var hero = $('#album-hero');
    if (hero && album && artist && digital && cd) {
      hero.innerHTML =
        '<img class="cover" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
        + '<div><h1>' + esc(album.title) + '</h1>'
        + '<p class="artist"><a href="' + esc(artistPageURL(artist)) + '">' + esc(artist.name) + '</a></p>'
        + '<p class="muted">Out now · ' + album.track_count + ' songs · ' + esc(album.total_time)
        + '<br>Label: ' + esc(album.label) + ' · Released ' + esc(album.release_date) + '</p>'
        + '<div class="formats">'
        + '<div class="format"><div class="price">' + money(digital.price_cents) + '</div>'
        + '<p>Digital album · ' + esc(digital.detail) + '</p>'
        + '<button class="btn" data-add="album" data-id="' + digital.id + '">Add album</button></div>'
        + '<div class="format"><div class="price">' + money(cd.price_cents) + '</div>'
        + '<p>CD · ' + esc(cd.detail) + '</p>'
        + '<button class="btn" data-add="cd" data-id="' + cd.id + '">Add CD</button></div>'
        + '</div></div>';
    }
    var sub = $('#tracks-sub');
    if (sub) {
      var albumTracks = catalog.tracks.filter(function (t) { return t.album_id === album.id; });
      var playable = albumTracks.filter(function (t) { return t.demo_available; }).length;
      sub.textContent = playable === albumTracks.length
        ? 'Tap play for a 30-second preview of any track.'
        : playable + ' songs are live — tap play for a 30-second preview. The rest of the album is coming soon.';
    }
    var list = $('#tracklist');
    if (list) {
      var html = '';
      catalog.tracks.filter(function (t) { return t.album_id === album.id; }).forEach(function (t) {
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
    renderRecommendations($('#recommendations'), album ? album.artist_id : null);
  }

  function renderArtist() {
    /* Artist page: ?slug= picks the artist. No fallback to another
       artist — an unknown slug is a not-found message, never Jay's
       album. (The old static artist pages fell back to albums[0];
       that bug is why they were deleted.) */
    var params = new URLSearchParams(window.location.search);
    var slug = params.get('slug') || '';
    var artist = catalog.artists.find(function (a) { return a.slug === slug; });
    var hero = $('#artist-hero');
    if (!hero) return;
    if (!artist) {
      hero.innerHTML = '<div style="margin-top:28px"><h1>Artist not found</h1>'
        + '<p class="muted">We couldn\'t find that artist on the store.</p>'
        + '<p style="margin-top:16px"><a href="/music-store/">← Back to the store</a></p></div>';
      document.title = 'Artist not found — TAIG Online Music Store';
      var sec = $('#artist-albums-section');
      if (sec) sec.hidden = true;
      renderRecommendations($('#artist-more'), null);
      return;
    }
    document.title = artist.name + ' — TAIG Online Music Store';
    var album = albumForArtist(artist.id);
    var cover = artist.cover || (album && album.cover);
    hero.innerHTML = '<div class="artist-hero">'
      + (cover ? '<img class="cover" src="' + esc(cover) + '" alt="Cover art — ' + esc(artist.name) + '">' : '')
      + '<div><h1>' + esc(artist.name) + '</h1>'
      + '<p><span class="tag">' + esc(artist.genre || '') + '</span></p>'
      + '<p class="blurb">' + esc(artist.blurb || '') + '</p>'
      + (album ? '' : '<p class="coming">Debut release coming soon.</p>')
      + '</div></div>';
    var albumsSec = $('#artist-albums-section');
    var albumsBox = $('#artist-albums');
    if (album && albumsSec && albumsBox) {
      var digital = catalog.products.find(function (p) { return p.album_id === album.id && p.kind === 'album'; });
      albumsSec.hidden = false;
      albumsBox.innerHTML = '<div class="card">'
        + '<img class="thumb" src="' + esc(album.cover) + '" alt="Album cover — ' + esc(album.title) + '">'
        + '<h3><a href="' + esc(album.page || '/music-store/') + '">' + esc(album.title) + '</a></h3>'
        + '<p class="muted">' + album.track_count + ' songs · ' + esc(album.total_time) + '</p>'
        + (digital ? '<p class="price">' + money(digital.price_cents) + ' digital</p>' : '')
        + '<div class="btn-row"><a class="btn" href="' + esc(album.page || '/music-store/') + '">View album</a>'
        + (digital ? '<button class="btn" data-add="album" data-id="' + digital.id + '">Add album</button>' : '')
        + '</div></div>';
    } else if (albumsSec) {
      albumsSec.hidden = true;
    }
    renderRecommendations($('#artist-more'), artist.id);
  }

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var artistLink = ev.target.closest('.roster-slot a');
      if (artistLink) {
        var slot = artistLink.closest('.roster-slot');
        if (slot) sendStat('artist_click', slot.getAttribute('data-artist') || '');
        return;
      }
      var chip = ev.target.closest('[data-filter-genre]');
      if (chip) {
        setGenre(chip.getAttribute('data-filter-genre'));
        sendStat('genre_filter', chip.getAttribute('data-filter-genre'));
        return;
      }
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
        if (page === 'artist') renderArtist();
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
