# Docker Hub Setup

Configure these **GitHub repository secrets** before pushing to `deployable`:

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username or organization |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not account password) |

Create a token at [Docker Hub Security Settings](https://hub.docker.com/settings/security).

## Published Image

```
<DOCKERHUB_USERNAME>/taig-nope-portal
```

### Tags (deployable branch only)

| Tag | Purpose |
|-----|---------|
| `latest` | Most recent deployable publish |
| `deployable` | Stable deployment candidate |
| `<commit-sha>` | Immutable reference to exact build |

## Operator Pull and Run

```bash
docker pull <DOCKERHUB_USERNAME>/taig-nope-portal:deployable
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  <DOCKERHUB_USERNAME>/taig-nope-portal:deployable
```

- Dashboard: http://localhost:3000/dashboard
- Health: http://localhost:3000/health

## CI Publish Flow

Publish runs **only** on `push` to `deployable` after `docker-build` passes. The pipeline then pulls the published `:deployable` tag and validates health, dashboard, smoke flows, and operator visual parity.
