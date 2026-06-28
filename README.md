# NOPE Lite — TAIG NOPE Portal

Repository foundation and execution data model for the NOPE Lite Production Artifact. This project provides the development scaffold for the TAIG NOPE Portal — an Express-based web application with EJS templating, JSON storage, and Docker deployment support.

**Version:** MVP Data Model (ACI-002)

## Repository Overview

ACI-001 established the repository foundation. ACI-002 adds the JSON-backed execution data model with Job Order as the root object. Execution UI and workflow logic begin in ACI-003.

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
│   ├── job_orders.json
│   ├── aci_history.json
│   ├── minority_reports.json
│   ├── operator_actions.json
│   ├── completion_reports.json
│   └── timeline.json
├── docs/
│   ├── aci_history/     # ACI execution history
│   └── reports/         # Completion reports
├── public/
│   ├── css/
│   └── js/
├── scripts/             # Validation utilities
├── src/
│   ├── app.js           # Express application
│   ├── server.js        # Entry point
│   └── models/          # Data model schemas, loader, validator
├── views/               # EJS templates
├── Dockerfile
├── package.json
└── README.md
```

Local-only preservation folders (`nebula_local/`, `.nebula/`, `aiw_local/`) exist for operator continuity and are excluded from version control.

## Data Model

The **Job Order** is the root execution object. All other objects support the Job Order lifecycle.

### Storage Files

| File | Contents |
|------|----------|
| `data/job_orders.json` | Job Orders (root objects) |
| `data/aci_history.json` | ACI records |
| `data/minority_reports.json` | Minority Reports |
| `data/operator_actions.json` | Operator Actions |
| `data/completion_reports.json` | Completion Reports |
| `data/timeline.json` | Timeline Events |

### Job Order Fields

`id`, `title`, `mission`, `status`, `current_truth`, `next_truth`, `target_truth`, `human_summary`, `minority_report_current`, `minority_report_previous`, `aep`, `acis`, `operator_actions`, `completion_reports`, `timeline`, `risks`, `artifacts`, `passdown`, `created_at`, `updated_at`

### Supporting Objects

Embedded in Job Order: Current Truth, Next Truth, Target Truth, Human Summary, Risk, Artifact Reference, Passdown.

Referenced by ID in separate collections: Minority Report, Operator Action, ACI, Completion Report, Timeline Event.

Model definitions and validation live in `src/models/`.

### Seed Data

A validation-only seed Job Order (`jo-aci-002-seed`) demonstrates mission, truth states, human summary, one operator action, one minority report, and one timeline event.

## Build Instructions

```bash
# Clone the repository
git clone https://github.com/the-ai-guy-2k/taig_nope_portal.git
cd taig_nope_portal

# Install dependencies
npm ci
```

## Run Instructions

```bash
# Start the application (default port 3000)
npm start

# Development mode with auto-reload (Node 20+)
npm run dev
```

Verify the application:

- **Home:** http://localhost:3000/
- **Health:** http://localhost:3000/health

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Primary development branch |
| `deployable` | Deployment-ready branch |

Both branches are validated by CI on every push and pull request.

## CI Overview

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes and PRs to `main` and `deployable`:

1. **Repository structure validation** — confirms required files and directories exist
2. **npm ci** — clean dependency install
3. **Syntax validation** — checks all JavaScript files under `src/` and `scripts/`
4. **Data model validation** — JSON syntax, required fields, unique IDs, cross-reference integrity
5. **Application startup** — starts the server and verifies `GET /health` returns HTTP 200
6. **Docker build validation** — builds the Docker image (no container runtime test)

Docker is validated in CI only; local Docker is not required.

## Validation Scripts

```bash
npm run validate:structure   # Check required repository paths
npm run validate:syntax      # Check JavaScript syntax
npm run validate:data        # Validate JSON data model and seed Job Order
```

## Next Steps

ACI-003 introduces execution UI: dashboard, Job Order screens, and operator workflow.
