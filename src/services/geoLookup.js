'use strict';

/**
 * Visitor geolocation for the TAIG Online Music Store stats.
 *
 * On-box DB-IP Lite City database (free, no account), read with the
 * `maxmind` reader. Nothing leaves the box — there is no lookup API call.
 * lookupGeo(ip) returns { country, region, city } where country is the
 * ISO code (e.g. 'US') and region/city are English names, or null when
 * the IP is unknown (private/reserved IPs return null).
 *
 * The DB file lives in the persistent volume alongside the store DB:
 *   nebula_local/geoip/dbip-city-lite.mmdb
 * Env GEOIP_DB_PATH overrides (used by local tests). The file is NOT in
 * git (127 MB binary) — it is downloaded on the Droplet and refreshed
 * monthly. If the DB is missing or unreadable, lookups return null and
 * the store keeps working: geo is best-effort, never load-bearing. The
 * reader is loaded lazily on first lookup and cached; while the file is
 * missing it re-checks on each call, so no restart is needed after the
 * DB lands.
 */

const fs = require('fs');
const path = require('path');

const GEO_DB_PATH = process.env.GEOIP_DB_PATH
  || path.join(__dirname, '..', '..', 'nebula_local', 'geoip', 'dbip-city-lite.mmdb');

let reader = null;

function lookupGeo(ip) {
  try {
    if (!ip) return null;
    if (!reader) {
      if (!fs.existsSync(GEO_DB_PATH)) return null;
      const maxmind = require('maxmind');
      reader = new maxmind.Reader(fs.readFileSync(GEO_DB_PATH));
    }
    const r = reader.get(String(ip).trim());
    if (!r) return null;
    return {
      country: (r.country && r.country.iso_code) || '',
      region: (r.subdivisions && r.subdivisions[0] && r.subdivisions[0].names && r.subdivisions[0].names.en) || '',
      city: (r.city && r.city.names && r.city.names.en) || '',
    };
  } catch (e) {
    return null;
  }
}

module.exports = { lookupGeo, GEO_DB_PATH };
