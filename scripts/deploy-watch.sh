#!/bin/bash
# TAIG deploy watcher — polls GitHub main, deploys staging first, then live.
# Run by a systemd timer every 2 minutes. Pull-only: the Droplet never
# pushes anything; GitHub is the source of truth (Tee's Nov 3 rules).
# Staging proves the exact image before live gets it. If staging fails,
# live is never touched. If live fails after deploy, it rolls back.
set -u

REPO_DIR=/root/taig_nope_portal
LOG=/var/log/taig-deploy.log
LOCK=/var/lock/taig-deploy.lock
IMAGE_LOCAL=taig-nope-portal:local
IMAGE_STAGING=taig-nope-portal:staging
IMAGE_PREVIOUS=taig-nope-portal:previous
LIVE_PORT=3000
STAGING_PORT=3005

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" | tee -a "$LOG"; }

# One run at a time; a second tick exits quietly.
exec 9>"$LOCK"
if ! flock -n 9; then exit 0; fi

cd "$REPO_DIR" || { log "ERROR: cannot cd to $REPO_DIR"; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  log "ERROR: live checkout is on branch '$BRANCH', expected main — refusing to deploy"
  exit 1
fi

# Refuse to deploy over local edits; the box never edits code.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "ERROR: live checkout has local modifications — refusing to deploy"
  exit 1
fi

REMOTE_SHA=$(git ls-remote origin main | awk '{print $1}')
LOCAL_SHA=$(git rev-parse HEAD)
if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
  exit 0  # Nothing new. Stay quiet.
fi

log "New main: ${LOCAL_SHA:0:7} -> ${REMOTE_SHA:0:7} — starting deploy"

if ! git pull --ff-only origin main >>"$LOG" 2>&1; then
  log "ERROR: git pull failed — live untouched"
  exit 1
fi

# Keep the running image so a bad deploy can roll back.
docker tag "$IMAGE_LOCAL" "$IMAGE_PREVIOUS" 2>/dev/null || true

if ! docker build -t "$IMAGE_LOCAL" . >>"$LOG" 2>&1; then
  log "ERROR: docker build failed — live untouched"
  exit 1
fi
docker tag "$IMAGE_LOCAL" "$IMAGE_STAGING"

# --- Staging first: same image, own port, own data volume. ---
docker rm -f nope-portal-staging 2>/dev/null || true
if ! docker run -d --name nope-portal-staging --restart unless-stopped \
    -p "127.0.0.1:${STAGING_PORT}:3000" \
    -v nope-nebula-staging:/app/nebula_local \
    "$IMAGE_STAGING" >>"$LOG" 2>&1; then
  log "ERROR: staging container failed to start — live untouched"
  exit 1
fi

wait_healthy() {
  local port="$1" tries=0
  while [ "$tries" -lt 12 ]; do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1 \
       && curl -fsS "http://127.0.0.1:${port}/giggit/" >/dev/null 2>&1; then
      return 0
    fi
    tries=$((tries + 1)); sleep 5
  done
  return 1
}

if ! wait_healthy "$STAGING_PORT"; then
  log "ERROR: staging unhealthy after deploy of ${REMOTE_SHA:0:7} — live untouched, staging left up for inspection"
  exit 1
fi
log "Staging healthy on ${REMOTE_SHA:0:7} — promoting to live"

# --- Live: exact DEPLOY.md steps. ---
docker rm -f nope-portal 2>/dev/null || true
if ! docker run -d --name nope-portal --restart unless-stopped \
    -p 3000:3000 \
    -v nope-nebula-local:/app/nebula_local \
    "$IMAGE_LOCAL" >>"$LOG" 2>&1; then
  log "ERROR: live container failed to start — rolling back"
  docker rm -f nope-portal 2>/dev/null || true
  docker run -d --name nope-portal --restart unless-stopped \
    -p 3000:3000 -v nope-nebula-local:/app/nebula_local \
    "$IMAGE_PREVIOUS" >>"$LOG" 2>&1 || true
  exit 1
fi

if ! wait_healthy "$LIVE_PORT"; then
  log "ERROR: live unhealthy after deploy of ${REMOTE_SHA:0:7} — rolling back to previous image"
  docker rm -f nope-portal 2>/dev/null || true
  docker run -d --name nope-portal --restart unless-stopped \
    -p 3000:3000 -v nope-nebula-local:/app/nebula_local \
    "$IMAGE_PREVIOUS" >>"$LOG" 2>&1 || true
  if wait_healthy "$LIVE_PORT"; then log "Rollback healthy"; else log "ERROR: rollback also unhealthy — needs a human"; fi
  exit 1
fi

log "Deployed ${REMOTE_SHA:0:7} — staging OK, live OK"
