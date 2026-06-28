# NOPE Lite — TAIG NOPE Portal

Repository foundation, execution data model, and read-only UI shell for the NOPE Lite Production Artifact.

**Version:** MVP UI Shell (ACI-003)

## Repository Overview

ACI-001 established the repository foundation. ACI-002 added the JSON-backed data model. ACI-003 introduces the read-only execution cockpit UI. Write operations and workflow execution begin in ACI-004+.

- **Repository:** https://github.com/the-ai-guy-2k/taig_nope_portal.git
- **Branches:** `main`, `deployable`

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | JavaScript |
| Runtime | Node.js 20+ |
| Framework | Express |
| Templating | EJS |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Storage | JSON files in `data/` |
| Container | Docker |
| CI/CD | GitHub Actions |

## Project Structure

```
taig_nope_portal/
├── .github/workflows/   # CI pipelines
├── data/                # JSON execution storage
├── docs/
│   ├── aci_history/
│   └── reports/
├── public/
│   ├── css/dashboard.css
│   └── js/dashboard.js
├── scripts/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── models/          # Data model schemas, loader, validator
│   ├── routes/          # Express route modules
│   └── services/        # View-model builders
├── views/               # EJS templates (dashboard, partials)
├── Dockerfile
├── package.json
└── README.md
```

## Execution Cockpit (UI)

The MVP UI shell provides a responsive read-only dashboard:

- **Header** — portal identity and read-only mode indicator
- **Left navigation** — Dashboard, Job Orders, Timeline, ACI History, Completion Reports, Settings
- **Main workspace** — Job Order title, mission, status, truth states, human summary
- **Right panel** — minority report, operator actions, timeline, risks
- **Footer** — cockpit metadata

All displayed data is loaded via `src/models/loader.js` and `src/services/jobOrderService.js`. No execution data is hardcoded in templates.

### Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Execution dashboard (primary Job Order) |
| `GET /dashboard` | Execution dashboard |
| `GET /job-orders` | Job Order list |
| `GET /job-orders/:id` | Job Order detail workspace |
| `GET /timeline` | Timeline events (read-only) |
| `GET /aci-history` | ACI records (read-only) |
| `GET /completion-reports` | Completion reports (read-only) |
| `GET /settings` | Settings placeholder |
| `GET /health` | Health check JSON |

## Data Model

The **Job Order** is the root execution object. See `src/models/` and `data/` for schemas and storage files. Seed Job Order: `jo-aci-002-seed`.

## Build Instructions

```bash
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal
npm ci
```

## Run Instructions

```bash
npm start
# Development mode with auto-reload (Node 20+)
npm run dev
```

Open the execution cockpit:

- **Dashboard:** http://localhost:3000/ or http://localhost:3000/dashboard
- **Seed Job Order:** http://localhost:3000/job-orders/jo-aci-002-seed
- **Health:** http://localhost:3000/health

## CI Overview

GitHub Actions validates structure, syntax, data model, routes (HTTP 200 + content), health endpoint, and Docker build.

## Validation Scripts

```bash
npm run validate:structure
npm run validate:syntax
npm run validate:data
npm run validate:routes
```

## Next Steps

ACI-004 introduces write operations, editing, and operator workflow capabilities.
