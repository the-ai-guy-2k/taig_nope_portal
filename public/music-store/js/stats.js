/* TAIG Online Music Store — stats dashboard.
   Fetches aggregate stats from /music-store/api/stats and renders them.
   No libraries, no tracking — this page only reads the store's own numbers. */
(function () {
  'use strict';

  var API = '/music-store/api/stats';
  var rangeDays = 30;

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderCards(data) {
    var t = data.totals;
    var at = data.totals_all_time;
    $('#stat-cards').innerHTML =
      '<div class="stat-card"><div class="num">' + t.pageviews + '</div><div class="lbl">Visits</div><div class="sub">page views</div></div>'
      + '<div class="stat-card"><div class="num">' + t.visitors + '</div><div class="lbl">Unique visitors</div><div class="sub">per day, added up</div></div>'
      + '<div class="stat-card"><div class="num">' + t.preview_plays + '</div><div class="lbl">Preview plays</div><div class="sub">30-second previews</div></div>'
      + '<div class="stat-card"><div class="num">' + t.cart_adds + '</div><div class="lbl">Cart adds</div><div class="sub">tracks, albums, CDs</div></div>';
    $('#all-time').textContent = 'All time: ' + at.pageviews + ' visits · ' + at.visitors
      + ' visitor-days · ' + at.preview_plays + ' preview plays · ' + at.cart_adds + ' cart adds.';
  }

  function renderChart(data) {
    var chart = $('#chart');
    var daily = data.daily || [];
    var max = 0;
    daily.forEach(function (d) {
      if (d.pageviews > max) max = d.pageviews;
      if (d.preview_plays > max) max = d.preview_plays;
    });
    if (!daily.length || max === 0) {
      chart.innerHTML = '<p class="loading">No visits in this range yet.</p>';
      return;
    }
    var html = '';
    daily.forEach(function (d) {
      var vH = Math.max(2, Math.round((d.pageviews / max) * 100));
      var pH = Math.max(0, Math.round((d.preview_plays / max) * 100));
      html += '<div class="bar" style="height:' + vH + '%" title="' + d.day + ' — ' + d.pageviews
        + ' visits, ' + d.visitors + ' visitors, ' + d.preview_plays + ' plays"></div>';
      html += '<div class="bar plays" style="height:' + (pH || 2) + '%" title="' + d.day + ' — '
        + d.preview_plays + ' preview plays"></div>';
    });
    chart.innerHTML = html;
  }

  function renderList(title, items, emptyText) {
    var body = items && items.length
      ? '<ol>' + items.map(function (it) {
        return '<li><span>' + esc(it.label || '(none)') + '</span><span class="count">' + it.count + '</span></li>';
      }).join('') + '</ol>'
      : '<p class="empty">' + esc(emptyText) + '</p>';
    return '<div class="top-list"><h3>' + esc(title) + '</h3>' + body + '</div>';
  }

  function renderTop(data) {
    $('#top-grid').innerHTML =
      renderList('Top previewed tracks', data.top_tracks, 'No previews played in this range yet.')
      + renderList('Top pages', data.top_pages, 'No page views in this range yet.')
      + renderList('Top referrers', data.top_referrers, 'No referrers recorded — visitors came direct or the referrer was blank.')
      + renderList('Devices', data.devices, 'No device data yet.')
      + renderList('Top genres browsed', data.top_genres, 'Nobody used the genre filter in this range yet.')
      + renderList('Top artist clicks', data.top_artists, 'No artist clicks in this range yet.');
  }

  function renderAlso(data) {
    var t = data.totals;
    $('#also').textContent = 'Checkout notices shown: ' + t.checkout_notices
      + ' · Genre filter uses: ' + t.genre_filters
      + ' · Artist card clicks: ' + t.artist_clicks + '.';
  }

  function load() {
    fetch(API + '?days=' + rangeDays)
      .then(function (res) { if (!res.ok) throw new Error('stats failed'); return res.json(); })
      .then(function (data) {
        var when = data.generated_at ? new Date(data.generated_at) : new Date();
        $('#generated').textContent = 'Updated ' + when.toLocaleString() + ' · last ' + data.range_days + ' days';
        renderCards(data);
        renderChart(data);
        renderTop(data);
        renderAlso(data);
      })
      .catch(function () {
        $('#generated').textContent = 'Stats could not be loaded. Please try again in a moment.';
        $('#chart').innerHTML = '<p class="loading">Stats could not be loaded.</p>';
      });
  }

  document.querySelectorAll('[data-range]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-range]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      rangeDays = parseInt(btn.getAttribute('data-range'), 10) || 30;
      load();
    });
  });

  document.addEventListener('DOMContentLoaded', load);
})();
