'use strict';

/**
 * Backfill music-store geo counts from nginx access logs.
 *
 * ONE-OFF job — run it with the portal container STOPPED. The portal
 * holds the SQLite DB in memory (sql.js) and persists the whole file on
 * each event, so editing the file from outside while it runs would be
 * overwritten on the next event. Intended run (on the Droplet):
 *
 *   docker stop nope-portal
 *   docker run --rm -v nope-nebula-local:/app/nebula_local \
 *     -v /var/log/nginx:/logs:ro taig-nope-portal:local \
 *     node scripts/backfill-store-geo.js --logs-dir /logs
 *   docker start nope-portal
 *
 * What it does: reads nginx combined-format logs (access.log plus any
 * access.log.*.gz rotations) from --logs-dir, keeps GET requests with
 * status 200 for exactly /music-store/ and /music-store/album/ (query
 * strings stripped; the bare-path 301 redirect is skipped, so one visit
 * is not counted twice), converts each log timestamp to an
 * America/New_York day, looks the IP up in the on-box GeoIP DB, and
 * aggregates (day, country, region, city) visit counts into the
 * store_geo_backfill table. IPs are read only to look up and aggregate
 * — only counts are stored, never IPs.
 *
 * Idempotent: for each day it touches it deletes that day's backfill
 * rows and re-inserts the fresh aggregates, so re-runs give the same
 * result. Lines whose IP has no geo (private/reserved) are skipped and
 * reported, not counted as a place.
 *
 * Options (flags or env): --logs-dir (LOGS_DIR, default /logs),
 * --db (MUSIC_STORE_DB, default /app/nebula_local/music-store.sqlite).
 * The GeoIP DB path follows GEOIP_DB_PATH (see src/services/geoLookup).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const initSqlJs = require('sql.js');
const { lookupGeo } = require('../src/services/geoLookup');

const STORE_PAGES = new Set(['/music-store/', '/music-store/album/']);

/* nginx combined log:  IP - - [16/Nov/2026:03:28:16 +0000] "GET /path HTTP/1.1" 200 ... */
const LOG_LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]*) HTTP\/[\d.]+" (\d{3}) /;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

function arg(name, fallback) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[name.replace(/-/g, '_').toUpperCase()] || fallback;
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function logDay(stamp) {
  /* "16/Nov/2026:03:28:16 +0000" → Date in that offset → NY day. */
  const m = stamp.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!m) return null;
  const [, dd, mon, yyyy, hh, mm, ss, off] = m;
  const iso = `${yyyy}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${dd}T${hh}:${mm}:${ss}${off.slice(0, 3)}:${off.slice(3)}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dayFmt.format(d);
}

function readLogFile(file) {
  const buf = fs.readFileSync(file);
  const text = file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return text.split('\n');
}

async function main() {
  const logsDir = arg('logs-dir', '/logs');
  const dbPath = arg('db', '/app/nebula_local/music-store.sqlite');

  const files = fs.readdirSync(logsDir)
    .filter((f) => f === 'access.log' || (f.startsWith('access.log.') && (f.endsWith('.gz') || /^access\.log\.\d+$/.test(f))))
    .sort()
    .map((f) => path.join(logsDir, f));
  if (!files.length) {
    console.error(`No nginx access logs found in ${logsDir}`);
    process.exit(1);
  }

  const geoCache = new Map();
  const agg = new Map(); /* "day|country|region|city" → count */
  let lines = 0;
  let pageviews = 0;
  let unresolved = 0;

  for (const file of files) {
    for (const line of readLogFile(file)) {
      if (!line.trim()) continue;
      lines++;
      const m = line.match(LOG_LINE);
      if (!m) continue;
      const [, ip, stamp, method, target, status] = m;
      if (method !== 'GET' || status !== '200') continue;
      const page = target.split('?')[0];
      if (!STORE_PAGES.has(page)) continue;
      const day = logDay(stamp);
      if (!day) continue;
      pageviews++;
      let geo = geoCache.get(ip);
      if (geo === undefined) {
        geo = lookupGeo(ip);
        geoCache.set(ip, geo);
      }
      if (!geo || (!geo.country && !geo.city)) { unresolved++; continue; }
      const key = `${day}|${geo.country}|${geo.region}|${geo.city}`;
      agg.set(key, (agg.get(key) || 0) + 1);
    }
    console.log(`read ${file}`);
  }

  const SQL = await initSqlJs();
  if (!fs.existsSync(dbPath)) {
    console.error(`Store DB not found at ${dbPath}`);
    process.exit(1);
  }
  const db = new SQL.Database(fs.readFileSync(dbPath));
  db.run(`CREATE TABLE IF NOT EXISTS store_geo_backfill (
    day TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    city TEXT NOT NULL,
    visits INTEGER NOT NULL,
    PRIMARY KEY (day, country, region, city)
  )`);

  const days = [...new Set([...agg.keys()].map((k) => k.split('|')[0]))].sort();
  for (const day of days) {
    db.run(`DELETE FROM store_geo_backfill WHERE day = '${esc(day)}'`);
  }
  let rowsWritten = 0;
  for (const [key, count] of [...agg.entries()].sort()) {
    const [day, country, region, city] = key.split('|');
    db.run(`INSERT INTO store_geo_backfill (day, country, region, city, visits)
      VALUES ('${esc(day)}', '${esc(country)}', '${esc(region)}', '${esc(city)}', ${count})`);
    rowsWritten++;
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  const total = [...agg.values()].reduce((a, b) => a + b, 0);
  console.log(`backfill done: ${lines} log lines, ${pageviews} store pageviews, `
    + `${total} geo-resolved visits across ${days.length} day(s) (${days[0] || '—'} → ${days[days.length - 1] || '—'}), `
    + `${rowsWritten} aggregate rows, ${unresolved} pageview(s) skipped (no geo for IP).`);
}

main().catch((e) => { console.error('backfill failed:', e.message); process.exit(1); });
