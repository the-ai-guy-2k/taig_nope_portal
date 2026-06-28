# Docker Hub Setup

**Canonical published image:** `taig2k/taig_nope_portal:deployable`

## GitHub Secrets (CI Publish)

Configure these **GitHub repository secrets** before pushing to `deployable`:

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | `taig2k` |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not account password) |

Create a token at [Docker Hub Security Settings](https://hub.docker.com/settings/security).

## Published Image

```
taig2k/taig_nope_portal
```

### Tags (deployable branch only)

| Tag | Purpose |
|-----|---------|
| `latest` | Most recent deployable publish |
| `deployable` | Stable deployment candidate (recommended) |
| `<commit-sha>` | Immutable reference to exact build |

## Operator Pull and Run

```bash
docker pull taig2k/taig_nope_portal:deployable
docker run --rm -p 3000:3000 \
  -v nope-nebula-local:/app/nebula_local \
  taig2k/taig_nope_portal:deployable
```

Or via npm scripts (after clone):

```bash
npm run docker:pull
npm run docker:run:published
```

- Dashboard: http://localhost:3000/dashboard
- Health: http://localhost:3000/health

## CI Publish Flow

Publish runs **only** on `push` to `deployable` after `docker-build` passes.

The pipeline pushes:

- `taig2k/taig_nope_portal:latest`
- `taig2k/taig_nope_portal:deployable`
- `taig2k/taig_nope_portal:<commit-sha>`

Then `docker-pull-validation` pulls `:deployable` and validates health, dashboard, smoke flows, and operator visual parity.

## Pin by Digest (Optional)

For mission-critical deploys:

```bash
docker pull taig2k/taig_nope_portal@sha256:<digest>
```

Digest is recorded in CI artifact `ci-reports/docker-artifact.json` after each deployable publish.
