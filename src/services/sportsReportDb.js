'use strict';

/**
 * Tee's Sports Report — first-party stats (SQLite via sql.js, pure JS).
 *
 * Mirrors the TAIG Online Music Store stats pattern (same volume, same
 * geo, same privacy rules), as its own database so the store is untouched:
 *
 *   sports-report.sqlite lives on the persistent volume (/app/nebula_local)
 *   so it survives container rebuilds.
 *
 * Two tables, created idempotently:
 *   tsr_events   — one row per counted action (pageview, section_view).
 *     No IP, no full user-agent, no cookies: referrer is the host only,
 *     device is just mobile/desktop.
 *   tsr_visitors — one row per (day, visitor) where visitor is a one-way
 *     SHA-256 hash of IP + user-agent + day. The hash rotates daily by
 *     design, so it can count unique visitors per day but can never
 *     identify a person or join visits across days. The IP itself is
 *     never stored.
 *
 * Geo on live events: recordEvent looks up the visitor's country, region
 * and city from the same IP that feeds the visitor hash, and stores ONLY
 * those three fields (country = ISO code, e.g. 'US'). The IP itself is
 * never written to any table. Geo uses the on-box DB-IP Lite database
 * (see services/geoLookup.js) — nothing leaves the box.
 *
 * The report page is a static file served by nginx, not by this container,
 * so there is no server-side pageview middleware: the page itself sends
 * a pageview on load and a section_view on every route change, via
 * navigator.sendBeacon with a fetch fallback (see the report page).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const { lookupGeo } = require('./geoLookup');

const DB_PATH = process.env.SPORTS_REPORT_DB
  || path.join(__dirname, '..', '..', 'nebula_local', 'sports-report.sqlite');

let dbPromise = null;

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function rows(db, sql) {
  const result = db.exec(sql);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function openDb() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  if (ensureStatsTables(db)) persist(db);
  return db;
}

function ensureStatsTables(db) {
  const has = (name) => rows(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name='${name}'`)[0].n > 0;
  let changed = false;
  if (!has('tsr_events')) {
    db.run(`CREATE TABLE tsr_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,
      type TEXT NOT NULL,
      page TEXT,
      detail TEXT,
      referrer_host TEXT,
      device TEXT,
      country TEXT,
      region TEXT,
      city TEXT
    )`);
    changed = true;
  }
  if (!has('tsr_visitors')) {
    db.run(`CREATE TABLE tsr_visitors (
      day TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      PRIMARY KEY (day, visitor_hash)
    )`);
    changed = true;
  }
  if (!has('idx_tsr_events_day_type')) {
    db.run('CREATE INDEX idx_tsr_events_day_type ON tsr_events(day, type)');
    changed = true;
  }
  return changed;
}

function persist(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

const EVENT_TYPES = new Set(['pageview', 'section_view']);

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || '';
}

function deviceClass(req) {
  const ua = (req.headers && req.headers['user-agent']) || '';
  return /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop';
}

function referrerHost(req) {
  const ref = (req.headers && (req.headers.referer || req.headers.referrer)) || '';
  try { return new URL(ref).hostname; } catch (e) { return ''; }
}

/* Days run on Tee's clock (America/New_York), not UTC — "today" on the
   dashboard is his today. en-CA formats as YYYY-MM-DD. */
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
function dayString(d) { return dayFmt.format(d); }

/* Record one counted action. Synchronous insert + persist — no await sits
   between db.run and persist, so concurrent requests cannot interleave
   a half-written event. Returns false for unknown event types. */
async function recordEvent(req, type, detail, page) {
  if (!EVENT_TYPES.has(type)) return false;
  const db = await getDb();
  const now = new Date();
  const day = dayString(now);
  const ua = (req.headers && req.headers['user-agent']) || '';
  const hash = crypto.createHash('sha256')
    .update(`${clientIp(req)}|${ua}|${day}`).digest('hex');
  /* Geo: country/region/city only, from the same IP that feeds the hash.
     The IP itself is never stored. Unknown IP → blanks, event still counts. */
  const geo = lookupGeo(clientIp(req)) || { country: '', region: '', city: '' };
  db.run(`INSERT INTO tsr_events (created_at, day, type, page, detail, referrer_host, device,
      country, region, city)
    VALUES ('${now.toISOString()}', '${day}', '${esc(type)}', '${esc(page || '')}',
      '${esc(String(detail == null ? '' : detail).slice(0, 200))}',
      '${esc(referrerHost(req))}', '${esc(deviceClass(req))}',
      '${esc(geo.country)}', '${esc(geo.region)}', '${esc(geo.city)}')`);
  db.run(`INSERT OR IGNORE INTO tsr_visitors (day, visitor_hash)
    VALUES ('${day}', '${hash}')`);
  persist(db);
  return true;
}

function countByType(db, since) {
  const where = since ? `WHERE day >= '${esc(since)}'` : '';
  const out = {};
  for (const r of rows(db, `SELECT type, COUNT(*) AS n FROM tsr_events ${where} GROUP BY type`)) {
    out[r.type] = r.n;
  }
  return out;
}

function countVisitors(db, since) {
  const where = since ? `WHERE day >= '${esc(since)}'` : '';
  return rows(db, `SELECT COUNT(*) AS n FROM tsr_visitors ${where}`)[0].n;
}

function topList(db, sql, limit) {
  return rows(db, sql).slice(0, limit).map((r) => ({ label: r.label, count: r.n }));
}

/* Aggregates for the stats dashboard. rangeDays caps at 365; the daily
   series always covers exactly that many days (zero-filled). Visitor
   counts are per-day uniques added across the range — the daily hash
   rotates, so cross-day dedup is impossible by design. */
async function getStats(rangeDays) {
  const db = await getDb();
  const days = Number.isFinite(rangeDays) && rangeDays > 0 ? Math.min(Math.floor(rangeDays), 365) : 30;
  const since = dayString(new Date(Date.now() - (days - 1) * 86400000));

  const inRange = countByType(db, since);
  const allTime = countByType(db, null);
  const sum = (o, key) => o[key] || 0;
  const totals = {
    pageviews: sum(inRange, 'pageview'),
    visitors: countVisitors(db, since),
    section_views: sum(inRange, 'section_view'),
  };
  const totalsAllTime = {
    pageviews: sum(allTime, 'pageview'),
    visitors: countVisitors(db, null),
    section_views: sum(allTime, 'section_view'),
  };

  const byDay = {};
  for (let i = 0; i < days; i++) {
    const d = dayString(new Date(Date.now() - i * 86400000));
    byDay[d] = { day: d, pageviews: 0, visitors: 0, section_views: 0 };
  }
  for (const r of rows(db, `SELECT day, type, COUNT(*) AS n FROM tsr_events
      WHERE day >= '${esc(since)}' GROUP BY day, type`)) {
    if (!byDay[r.day]) continue;
    if (r.type === 'pageview') byDay[r.day].pageviews = r.n;
    if (r.type === 'section_view') byDay[r.day].section_views = r.n;
  }
  for (const r of rows(db, `SELECT day, COUNT(*) AS n FROM tsr_visitors
      WHERE day >= '${esc(since)}' GROUP BY day`)) {
    if (byDay[r.day]) byDay[r.day].visitors = r.n;
  }
  const daily = Object.keys(byDay).sort().map((d) => byDay[d]);

  return {
    generated_at: new Date().toISOString(),
    range_days: days,
    totals,
    totals_all_time: totalsAllTime,
    daily,
    top_sections: topList(db, `SELECT detail AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='section_view' AND day >= '${esc(since)}' GROUP BY detail ORDER BY n DESC`, 20),
    top_pages: topList(db, `SELECT page AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='pageview' AND day >= '${esc(since)}' GROUP BY page ORDER BY n DESC`, 10),
    top_referrers: topList(db, `SELECT referrer_host AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='pageview' AND day >= '${esc(since)}' AND referrer_host != ''
      GROUP BY referrer_host ORDER BY n DESC`, 10),
    devices: topList(db, `SELECT device AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='pageview' AND day >= '${esc(since)}' GROUP BY device ORDER BY n DESC`, 10),
    top_countries: topList(db, `SELECT country AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='pageview' AND day >= '${esc(since)}' AND country != ''
      GROUP BY country ORDER BY n DESC`, 10),
    top_cities: topList(db, `SELECT city AS label, COUNT(*) AS n FROM tsr_events
      WHERE type='pageview' AND day >= '${esc(since)}' AND city != ''
      GROUP BY city ORDER BY n DESC`, 10),
  };
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

module.exports = { getDb, recordEvent, getStats };
