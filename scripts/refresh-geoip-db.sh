#!/bin/bash
# Refresh the TAIG Online Music Store's on-box GeoIP database (DB-IP Lite).
#
# Runs on the Droplet HOST (not in a container) from the portal checkout:
#   /root/taig_nope_portal/scripts/refresh-geoip-db.sh
# Monthly via the Droplet root crontab (see GVCA for the entry).
#
# What it does:
#   1. Downloads the fresh DB-IP Lite City file for the current month
#      from the official free source (falls back to the previous month
#      if this month's file is not published yet).
#   2. Validates it (gzip integrity + uncompressed size) BEFORE touching
#      the live file, so a bad download can never break geo lookups.
#   3. Backs up the current file, then atomically replaces it.
#   4. Restarts the portal container. A restart IS required: the app
#      loads the GeoIP DB into memory once (src/services/geoLookup.js
#      caches the reader for the process lifetime) and never re-reads
#      the file, so a replaced file alone changes nothing until restart.
#   5. Verifies the portal is healthy and geo still resolves (test
#      pageview with a known US IP, then the stats API). On any failure
#      it restores the backup file, restarts again, and exits non-zero.
#
# Logs to /var/log/geoip-refresh.log. Exit 0 = fresh DB live and geo
# verified. The DB stays out of git (127 MB binary in the persistent
# volume); only this script is versioned.
set -u
exec >> /var/log/geoip-refresh.log 2>&1

GEO_DIR="/var/lib/docker/volumes/nope-nebula-local/_data/geoip"
GEO_FILE="$GEO_DIR/dbip-city-lite.mmdb"
GEO_BACKUP="$GEO_DIR/dbip-city-lite.mmdb.prev"
CONTAINER="nope-portal"
TMPDIR="/tmp/geoip-refresh"
BASE_URL="https://download.db-ip.com/free"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

restore_and_fail() {
  log "ERROR: $1 — restoring previous DB and restarting."
  if [ -f "$GEO_BACKUP" ]; then
    mv -f "$GEO_BACKUP" "$GEO_FILE"
  fi
  docker restart "$CONTAINER" >/dev/null 2>&1 || true
  log "refresh FAILED: $1"
  exit 1
}

mkdir -p "$TMPDIR" "$GEO_DIR"
log "--- geoip refresh starting ---"

# Candidate months: this month first, then last month (db-ip publishes
# the new file around the 1st; early in the month it may not exist yet).
CUR_MM="$(date -u +%Y-%m)"
PREV_MM="$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m)"
USED_MM=""
for MM in "$CUR_MM" "$PREV_MM"; do
  GZ="$TMPDIR/dbip-city-lite-$MM.mmdb.gz"
  log "trying $MM: $BASE_URL/dbip-city-lite-$MM.mmdb.gz"
  if curl --fail -sSL --max-time 300 -o "$GZ" "$BASE_URL/dbip-city-lite-$MM.mmdb.gz"; then
    USED_MM="$MM"
    break
  fi
  log "download failed for $MM"
done
[ -n "$USED_MM" ] || { log "ERROR: could not download any month's file"; exit 1; }

GZ="$TMPDIR/dbip-city-lite-$USED_MM.mmdb.gz"
NEW="$TMPDIR/dbip-city-lite.mmdb.new"
gzip -t "$GZ" || { log "ERROR: downloaded gzip failed integrity check"; exit 1; }
gunzip -f -c "$GZ" > "$NEW" || { log "ERROR: gunzip failed"; exit 1; }
SIZE="$(stat -c %s "$NEW")"
[ "$SIZE" -gt 50000000 ] || { log "ERROR: uncompressed DB only $SIZE bytes, refusing to install"; exit 1; }
log "downloaded + validated $USED_MM file ($SIZE bytes uncompressed)"

[ -f "$GEO_FILE" ] && cp -f "$GEO_FILE" "$GEO_BACKUP"
mv -f "$NEW" "$GEO_FILE"
rm -f "$GZ"
log "installed $USED_MM DB at $GEO_FILE (previous kept at $GEO_BACKUP)"

docker restart "$CONTAINER" >/dev/null \
  || restore_and_fail "docker restart failed"

# Wait for the portal to come back healthy.
HEALTHY=0
for _ in $(seq 1 18); do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health 2>/dev/null | grep -q 200; then
    HEALTHY=1
    break
  fi
  sleep 5
done
[ "$HEALTHY" = 1 ] || restore_and_fail "portal did not come back healthy after restart"

# Geo verification: a pageview from a known US IP must return 200, and the
# stats API must still report geo (top_countries non-empty).
CODE="$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 8.8.8.8" \
  -H "User-Agent: GeoRefreshCheck/1.0" https://taigtsp.duckdns.org/music-store/)"
[ "$CODE" = "200" ] || restore_and_fail "store page returned $CODE after restart"
STATS="$(curl -s "https://taigtsp.duckdns.org/music-store/api/stats?days=1")"
echo "$STATS" | grep -q '"top_countries":\[' \
  || restore_and_fail "stats API did not return geo data after restart"
echo "$STATS" | grep -q '"label":"US"' \
  || restore_and_fail "stats API shows no US geo after restart (test IP did not resolve)"

rm -rf "$TMPDIR"
log "refresh DONE: $USED_MM DB live, portal healthy, geo verified (US test IP resolved)."
exit 0
