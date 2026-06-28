# NOPE Lite — TAIG NOPE Portal

Repository foundation for the NOPE Lite Production Artifact. This project provides the development scaffold for the TAIG NOPE Portal — an Express-based web application with EJS templating, JSON storage, and Docker deployment support.

**Version:** MVP Foundation (ACI-001)

## Repository Overview

This repository establishes the complete development foundation. No business functionality is implemented in ACI-001. Job Orders, Minority Reports, Operator Actions, and the data model begin in ACI-002.

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
| Storage | JSON (placeholder in `data/`) |
| Container | Docker |
| CI/CD | GitHub Actions |

## Project Structure

```
taig_nope_portal/
├── .github/workflows/   # CI pipelines
├── data/                # JSON storage (future)
├── docs/
│   ├── aci_history/     # ACI execution history
│   └── reports/         # Completion reports
├── public/
│   ├── css/
│   └── js/
├── scripts/             # Validation utilities
├── src/
│   ├── app.js           # Express application
│   └── server.js        # Entry point
├── views/               # EJS templates
├── Dockerfile
├── package.json
└── README.md
```

Local-only preservation folders (`nebula_local/`, `.nebula/`, `aiw_local/`) exist for operator continuity and are excluded from version control.

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
4. **Application startup** — starts the server and verifies `GET /health` returns HTTP 200
5. **Docker build validation** — builds the Docker image (no container runtime test)

Docker is validated in CI only; local Docker is not required.

## Validation Scripts

```bash
npm run validate:structure   # Check required repository paths
npm run validate:syntax      # Check JavaScript syntax
```

## Next Steps

ACI-002 introduces governance structures: Job Orders, Minority Reports, Operator Actions, data model, and execution workflow.
