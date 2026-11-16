'use strict';

/**
 * TAIG Online Music Store — catalog database (SQLite via sql.js, pure JS).
 *
 * The database file lives on the persistent volume (/app/nebula_local) so it
 * survives container rebuilds. On first start it is created and seeded from
 * data/music-store-catalog.json. Tables follow the design doc pack
 * (taig-online-music-design-doc-pack): artists, albums, tracks, products,
 * orders, order_items, download_tokens. Orders / tokens stay empty in the
 * MVP — there is no payment yet, so nothing can be ordered or delivered.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.MUSIC_STORE_DB
  || path.join(__dirname, '..', '..', 'nebula_local', 'music-store.sqlite');
const SEED_PATH = path.join(__dirname, '..', '..', 'data', 'music-store-catalog.json');

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
    if (migrate(db)) persist(db);
  } else {
    db = new SQL.Database();
    seed(db);
    persist(db);
  }
  if (ensureStatsTables(db)) persist(db);
  return db;
}

/**
 * Migrate an existing database forward. The MVP shipped the artists table
 * without a genre column and with Jay as the only artist; this adds the
 * column, backfills Jay's genre, and adds any roster artists present in the
 * seed file but missing from the DB. Idempotent — a no-op once applied.
 */
function migrate(db) {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  let changed = false;
  const cols = rows(db, 'PRAGMA table_info(artists)').map((c) => c.name);
  if (!cols.includes('genre')) {
    db.run('ALTER TABLE artists ADD COLUMN genre TEXT');
    changed = true;
  }
  const jay = rows(db, "SELECT genre FROM artists WHERE slug='jay-garrett-band'")[0];
  if (jay && (jay.genre === null || jay.genre === '')) {
    db.run("UPDATE artists SET genre='Country' WHERE slug='jay-garrett-band'");
    changed = true;
  }
  /* Artists: cover column FIRST (the upsert below inserts into it), then upsert. */
  const artistCols = rows(db, 'PRAGMA table_info(artists)').map((c) => c.name);
  if (!artistCols.includes('cover')) { db.run('ALTER TABLE artists ADD COLUMN cover TEXT'); changed = true; }
  const before = rows(db, 'SELECT COUNT(*) AS n FROM artists')[0].n;
  for (const a of seed.artists) {
    db.run(`INSERT OR IGNORE INTO artists (id, name, slug, roster_position, blurb, genre, cover)
      VALUES (${a.id}, '${esc(a.name)}', '${esc(a.slug)}', ${a.roster_position},
        '${esc(a.blurb)}', '${esc(a.genre || '')}', '${esc(a.cover || '')}')`);
  }
  const after = rows(db, 'SELECT COUNT(*) AS n FROM artists')[0].n;
  if (after > before) changed = true;

  /* Artists: backfill cover from the seed (roster-card art for artists with no album). */
  for (const a of seed.artists) {
    if (!a.cover) continue;
    const cur = rows(db, `SELECT cover FROM artists WHERE id=${a.id}`)[0];
    if (cur && (cur.cover === null || cur.cover === '')) {
      db.run(`UPDATE artists SET cover='${esc(a.cover)}' WHERE id=${a.id}`);
      changed = true;
    }
  }

  /* Roster-only cleanup (Tee, Nov 15): the fictional artists have no albums, tracks
     or products — remove any rows an earlier build left behind. Idempotent. */
  const ficAlbums = rows(db, 'SELECT COUNT(*) AS n FROM albums WHERE id IN (2,3,4)')[0].n;
  const ficTracks = rows(db, 'SELECT COUNT(*) AS n FROM tracks WHERE album_id IN (2,3,4)')[0].n;
  const ficProducts = rows(db, "SELECT COUNT(*) AS n FROM products WHERE id IN ('kairo-vale-digital','kairo-vale-cd','marlowe-grey-digital','marlowe-grey-cd','static-bloom-digital','static-bloom-cd')")[0].n;
  if (ficAlbums + ficTracks + ficProducts > 0) {
    db.run("DELETE FROM products WHERE id IN ('kairo-vale-digital','kairo-vale-cd','marlowe-grey-digital','marlowe-grey-cd','static-bloom-digital','static-bloom-cd')");
    db.run('DELETE FROM tracks WHERE album_id IN (2,3,4)');
    db.run('DELETE FROM albums WHERE id IN (2,3,4)');
    changed = true;
  }

  /* Albums: genre + page columns, backfill Jay's album, upsert seed albums. */
  const albumCols = rows(db, 'PRAGMA table_info(albums)').map((c) => c.name);
  if (!albumCols.includes('genre')) { db.run('ALTER TABLE albums ADD COLUMN genre TEXT'); changed = true; }
  if (!albumCols.includes('page')) { db.run('ALTER TABLE albums ADD COLUMN page TEXT'); changed = true; }
  const jayAlbum = rows(db, "SELECT genre, page FROM albums WHERE slug='still-chasing-the-sunset'")[0];
  if (jayAlbum && (jayAlbum.genre === null || jayAlbum.genre === '')) {
    db.run("UPDATE albums SET genre='Country' WHERE slug='still-chasing-the-sunset'");
    changed = true;
  }
  if (jayAlbum && (jayAlbum.page === null || jayAlbum.page === '')) {
    db.run("UPDATE albums SET page='/music-store/album/' WHERE slug='still-chasing-the-sunset'");
    changed = true;
  }
  const albBefore = rows(db, 'SELECT COUNT(*) AS n FROM albums')[0].n;
  for (const al of seed.albums) {
    db.run(`INSERT OR IGNORE INTO albums (id, artist_id, title, slug, release_date, label,
        cover, price_cents, cd_price_cents, status, total_time, track_count, genre, page)
      VALUES (${al.id}, ${al.artist_id}, '${esc(al.title)}', '${esc(al.slug)}',
        '${esc(al.release_date)}', '${esc(al.label)}', '${esc(al.cover)}',
        ${al.price_cents}, ${al.cd_price_cents}, '${esc(al.status)}',
        '${esc(al.total_time)}', ${al.track_count}, '${esc(al.genre || '')}', '${esc(al.page || '')}')`);
  }
  if (rows(db, 'SELECT COUNT(*) AS n FROM albums')[0].n > albBefore) changed = true;

  /* Tracks: genre column, backfill from the album, upsert seed tracks. */
  const trackCols = rows(db, 'PRAGMA table_info(tracks)').map((c) => c.name);
  if (!trackCols.includes('genre')) { db.run('ALTER TABLE tracks ADD COLUMN genre TEXT'); changed = true; }
  db.run(`UPDATE tracks SET genre = (SELECT genre FROM albums WHERE albums.id = tracks.album_id)
    WHERE genre IS NULL OR genre = ''`);
  const trkBefore = rows(db, 'SELECT COUNT(*) AS n FROM tracks')[0].n;
  for (const t of seed.tracks) {
    db.run(`INSERT OR IGNORE INTO tracks (id, album_id, num, title, duration, duration_seconds,
        preview, demo_available, is_single, price_cents, genre)
      VALUES (${t.id}, ${t.album_id}, ${t.num}, '${esc(t.title)}', '${esc(t.duration)}',
        ${t.duration_seconds}, ${t.preview ? `'${esc(t.preview)}'` : 'NULL'},
        ${t.demo_available ? 1 : 0}, ${t.is_single ? 1 : 0}, ${t.price_cents}, '${esc(t.genre || '')}')`);
  }
  if (rows(db, 'SELECT COUNT(*) AS n FROM tracks')[0].n > trkBefore) changed = true;

  /* Products: upsert seed products. */
  const prodBefore = rows(db, 'SELECT COUNT(*) AS n FROM products')[0].n;
  for (const p of seed.products) {
    db.run(`INSERT OR IGNORE INTO products (id, album_id, kind, name, detail, price_cents)
      VALUES ('${esc(p.id)}', ${p.album_id}, '${esc(p.kind)}', '${esc(p.name)}',
        '${esc(p.detail)}', ${p.price_cents})`);
  }
  if (rows(db, 'SELECT COUNT(*) AS n FROM products')[0].n > prodBefore) changed = true;

  return changed;
}

function seed(db) {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

  db.run(`CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    roster_position INTEGER,
    blurb TEXT,
    genre TEXT,
    cover TEXT
  )`);
  db.run(`CREATE TABLE albums (
    id INTEGER PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    release_date TEXT,
    label TEXT,
    cover TEXT,
    price_cents INTEGER NOT NULL,
    cd_price_cents INTEGER NOT NULL,
    status TEXT,
    total_time TEXT,
    track_count INTEGER,
    genre TEXT,
    page TEXT
  )`);
  db.run(`CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    album_id INTEGER NOT NULL REFERENCES albums(id),
    num INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration TEXT,
    duration_seconds INTEGER,
    preview TEXT,
    demo_available INTEGER NOT NULL DEFAULT 0,
    is_single INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL,
    genre TEXT
  )`);
  db.run(`CREATE TABLE products (
    id TEXT PRIMARY KEY,
    album_id INTEGER REFERENCES albums(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    detail TEXT,
    price_cents INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    status TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE download_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    downloads_used INTEGER NOT NULL DEFAULT 0,
    downloads_max INTEGER NOT NULL DEFAULT 3
  )`);

  for (const a of seed.artists) {
    db.run(`INSERT INTO artists (id, name, slug, roster_position, blurb, genre, cover)
      VALUES (${a.id}, '${esc(a.name)}', '${esc(a.slug)}', ${a.roster_position},
        '${esc(a.blurb)}', '${esc(a.genre || '')}', '${esc(a.cover || '')}')`);
  }
  for (const al of seed.albums) {
    db.run(`INSERT INTO albums (id, artist_id, title, slug, release_date, label, cover,
        price_cents, cd_price_cents, status, total_time, track_count, genre, page)
      VALUES (${al.id}, ${al.artist_id}, '${esc(al.title)}', '${esc(al.slug)}',
        '${esc(al.release_date)}', '${esc(al.label)}', '${esc(al.cover)}',
        ${al.price_cents}, ${al.cd_price_cents}, '${esc(al.status)}',
        '${esc(al.total_time)}', ${al.track_count}, '${esc(al.genre || '')}', '${esc(al.page || '')}')`);
  }
  for (const t of seed.tracks) {
    db.run(`INSERT INTO tracks (id, album_id, num, title, duration, duration_seconds,
        preview, demo_available, is_single, price_cents, genre)
      VALUES (${t.id}, ${t.album_id}, ${t.num}, '${esc(t.title)}', '${esc(t.duration)}',
        ${t.duration_seconds}, ${t.preview ? `'${esc(t.preview)}'` : 'NULL'},
        ${t.demo_available ? 1 : 0}, ${t.is_single ? 1 : 0}, ${t.price_cents}, '${esc(t.genre || '')}')`);
  }
  for (const p of seed.products) {
    db.run(`INSERT INTO products (id, album_id, kind, name, detail, price_cents)
      VALUES ('${esc(p.id)}', ${p.album_id}, '${esc(p.kind)}', '${esc(p.name)}',
        '${esc(p.detail)}', ${p.price_cents})`);
  }
}

function persist(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

/* ---- Store stats (first-party, aggregate only) -------------------------
 * Two tables, created idempotently for fresh and existing databases:
 *   store_events   — one row per counted action (pageview, preview_play,
 *     cart_add, checkout_notice, genre_filter, artist_click). No IP, no
 *     full user-agent, no cookies: referrer is the host only, device is
 *     just mobile/desktop.
 *   store_visitors — one row per (day, visitor) where visitor is a
 *     one-way SHA-256 hash of IP + user-agent + day. The hash rotates
 *     daily by design, so it can count unique visitors per day but can
 *     never identify a person or join visits across days. The IP itself
 *     is never stored.
 * ---------------------------------------------------------------------- */

const EVENT_TYPES = new Set([
  'pageview', 'preview_play', 'cart_add', 'checkout_notice',
  'genre_filter', 'artist_click',
]);

function ensureStatsTables(db) {
  const has = (name) => rows(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name='${name}'`)[0].n > 0;
  let changed = false;
  if (!has('store_events')) {
    db.run(`CREATE TABLE store_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,
      type TEXT NOT NULL,
      page TEXT,
      detail TEXT,
      referrer_host TEXT,
      device TEXT
    )`);
    changed = true;
  }
  if (!has('store_visitors')) {
    db.run(`CREATE TABLE store_visitors (
      day TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      PRIMARY KEY (day, visitor_hash)
    )`);
    changed = true;
  }
  if (!has('idx_store_events_day_type')) {
    db.run('CREATE INDEX idx_store_events_day_type ON store_events(day, type)');
    changed = true;
  }
  return changed;
}

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
  db.run(`INSERT INTO store_events (created_at, day, type, page, detail, referrer_host, device)
    VALUES ('${now.toISOString()}', '${day}', '${esc(type)}', '${esc(page || '')}',
      '${esc(String(detail == null ? '' : detail).slice(0, 200))}',
      '${esc(referrerHost(req))}', '${esc(deviceClass(req))}')`);
  db.run(`INSERT OR IGNORE INTO store_visitors (day, visitor_hash)
    VALUES ('${day}', '${hash}')`);
  persist(db);
  return true;
}

function countByType(db, since) {
  const where = since ? `WHERE day >= '${esc(since)}'` : '';
  const out = {};
  for (const r of rows(db, `SELECT type, COUNT(*) AS n FROM store_events ${where} GROUP BY type`)) {
    out[r.type] = r.n;
  }
  return out;
}

function countVisitors(db, since) {
  const where = since ? `WHERE day >= '${esc(since)}'` : '';
  return rows(db, `SELECT COUNT(*) AS n FROM store_visitors ${where}`)[0].n;
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
    preview_plays: sum(inRange, 'preview_play'),
    cart_adds: sum(inRange, 'cart_add'),
    checkout_notices: sum(inRange, 'checkout_notice'),
    genre_filters: sum(inRange, 'genre_filter'),
    artist_clicks: sum(inRange, 'artist_click'),
  };
  const totalsAllTime = {
    pageviews: sum(allTime, 'pageview'),
    visitors: countVisitors(db, null),
    preview_plays: sum(allTime, 'preview_play'),
    cart_adds: sum(allTime, 'cart_add'),
    checkout_notices: sum(allTime, 'checkout_notice'),
    genre_filters: sum(allTime, 'genre_filter'),
    artist_clicks: sum(allTime, 'artist_click'),
  };

  const byDay = {};
  for (let i = 0; i < days; i++) {
    const d = dayString(new Date(Date.now() - i * 86400000));
    byDay[d] = { day: d, pageviews: 0, visitors: 0, preview_plays: 0, cart_adds: 0 };
  }
  for (const r of rows(db, `SELECT day, type, COUNT(*) AS n FROM store_events
      WHERE day >= '${esc(since)}' GROUP BY day, type`)) {
    if (!byDay[r.day]) continue;
    if (r.type === 'pageview') byDay[r.day].pageviews = r.n;
    if (r.type === 'preview_play') byDay[r.day].preview_plays = r.n;
    if (r.type === 'cart_add') byDay[r.day].cart_adds = r.n;
  }
  for (const r of rows(db, `SELECT day, COUNT(*) AS n FROM store_visitors
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
    top_tracks: topList(db, `SELECT detail AS label, COUNT(*) AS n FROM store_events
      WHERE type='preview_play' AND day >= '${esc(since)}' GROUP BY detail ORDER BY n DESC`, 10),
    top_pages: topList(db, `SELECT page AS label, COUNT(*) AS n FROM store_events
      WHERE type='pageview' AND day >= '${esc(since)}' GROUP BY page ORDER BY n DESC`, 10),
    top_referrers: topList(db, `SELECT referrer_host AS label, COUNT(*) AS n FROM store_events
      WHERE type='pageview' AND day >= '${esc(since)}' AND referrer_host != ''
      GROUP BY referrer_host ORDER BY n DESC`, 10),
    devices: topList(db, `SELECT device AS label, COUNT(*) AS n FROM store_events
      WHERE type='pageview' AND day >= '${esc(since)}' GROUP BY device ORDER BY n DESC`, 10),
    top_genres: topList(db, `SELECT detail AS label, COUNT(*) AS n FROM store_events
      WHERE type='genre_filter' AND day >= '${esc(since)}' GROUP BY detail ORDER BY n DESC`, 10),
    top_artists: topList(db, `SELECT detail AS label, COUNT(*) AS n FROM store_events
      WHERE type='artist_click' AND day >= '${esc(since)}' GROUP BY detail ORDER BY n DESC`, 10),
  };
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

async function getCatalog() {
  const db = await getDb();
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const artists = rows(db, 'SELECT * FROM artists ORDER BY roster_position');
  const albums = rows(db, 'SELECT * FROM albums ORDER BY id');
  const tracks = rows(db, 'SELECT * FROM tracks ORDER BY album_id, num');
  const products = rows(db, 'SELECT * FROM products ORDER BY id');
  for (const t of tracks) {
    t.demo_available = t.demo_available === 1;
    t.is_single = t.is_single === 1;
  }
  return { store: seed.store, artists, albums, tracks, products };
}

module.exports = { getCatalog, getDb, recordEvent, getStats };
