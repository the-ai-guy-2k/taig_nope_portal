# NOPE Lite — TAIG NOPE Portal

NOPE Lite proves the TAIG execution framework. **Version:** Docker Foundation (ACI-008)

The **Docker image** is the canonical deployment artifact for CI/CD, future Docker Hub publication, and PAPEV deployment.

## Docker

### Container architecture

```
┌─────────────────────────────────────────────┐
│  node:20-alpine                             │
│  WORKDIR /app                               │
│  USER node                                  │
│  ┌─────────────────────────────────────┐   │
│  │  node src/server.js  (PORT 3000)    │   │
│  │  Express + EJS dashboard            │   │
│  │  data/          (baked in image)      │   │
│  │  nebula_local/  (writable volume)   │   │
│  └─────────────────────────────────────┘   │
│  HEALTHCHECK → GET /health                  │
└─────────────────────────────────────────────┘
```

| Layer | Contents |
|-------|----------|
| Base | `node:20-alpine` |
| Dependencies | `npm ci --omit=dev` (production only) |
| Application | `src/`, `views/`, `public/`, `data/` |
| Runtime | `NODE_ENV=production`, port `3000` |
| Preservation | `/app/nebula_local` (mount a volume for continuity) |

### Build

```bash
docker build -t taig-nope-portal:local .
# or
npm run docker:build
```

### Run

```bash
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  taig-nope-portal:local

# or
npm run docker:run
```

- **Dashboard:** http://localhost:3000/dashboard
- **Health:** http://localhost:3000/health

No additional configuration is required. The container starts the same execution cockpit as `npm start`.

### Validate Docker locally

```bash
npm run validate:docker
```

Builds the image, starts a container, validates health, dashboard, preservation, smoke HTTP flows, and operator visual parity.

## Validation + Smoke Tests

```bash
npm ci
npm run validate:all
```

Nine stages: structure, syntax, data, workflow, operational, preservation, routes, smoke tests, operator visual verification.

| Script | Purpose |
|--------|---------|
| `npm run validate:all` | Complete validation suite (CI gate) |
| `npm run validate:docker` | Docker build + container validation (CI gate) |
| `npm run validate:structure` | Required repository paths |
| `npm run validate:syntax` | JavaScript syntax check |
| `npm run validate:data` | JSON integrity and schema validation |
| `npm run validate:workflow` | Job Order CRUD, read-after-write, error handling |
| `npm run validate:operational` | Operator Actions and Minority Report rotation |
| `npm run validate:preservation` | Local preservation save/load/restore |
| `npm run validate:routes` | HTTP route availability (port 3099) |
| `npm run smoke` | End-to-end HTTP smoke tests (port 3100) |
| `npm run validate:operator-visual` | Operator HTML verification (port 3099) |
| `npm run audit:routes` | Operator port audit (port 3000, requires running server) |

### Operator visual verification

Compare local and container UIs:

1. `npm start` → http://localhost:3000/
2. `npm run docker:run` → http://localhost:3000/ (stop local server first if port conflicts)
3. Confirm identical dashboard shell, navigation, preservation banner, and seed Job Order data
4. `npm run audit:routes` (local) or `npm run validate:docker` (container)

## Local Preservation

Execution continuity is preserved in `nebula_local/`. In Docker, mount a named volume at `/app/nebula_local`.

### Ignored Folders (never commit)

- `nebula_local/`
- `.nebula/`
- `aiw_local/`
- `*.local.md`

Manual snapshot (local): `npm run preserve:snapshot`

## Run Instructions (Node.js)

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
npm run validate:all
npm start
```

### Troubleshooting: Old landing page on port 3000

If you see **"Version: MVP Foundation"**, a stale process may be bound to port 3000.

```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

## Approved AEP — Remaining ACIs

| ACI | Title |
|-----|-------|
| ACI-009 | CI/CD Hardening |
| ACI-010 | Docker Hub Publish |
| ACI-011 | PA Documentation |
| ACI-012 | PA Certification |

## Next Steps

ACI-009 — CI/CD Hardening.
