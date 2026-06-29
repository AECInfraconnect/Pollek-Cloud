# Pollek Cloud

Pollek Cloud is the commercial central control plane for Pollek Local Enforcement Kit and Local Control Plane deployments.

This first local build provides a real local test URL and cloud-protocol endpoints that a Local Control Plane can probe as if it were talking to a hosted Pollek Cloud endpoint.

## Local Test URL

```powershell
npm run dev
```

Open:

- Web console: `http://127.0.0.1:8790`
- Cloud contract discovery: `http://127.0.0.1:8790/.well-known/pollek-contract`
- API health: `http://127.0.0.1:8790/health`

Default ports can be changed with:

```powershell
$env:POLLEK_CLOUD_DEV_HOST="127.0.0.1"
$env:POLLEK_CLOUD_DEV_PORT="8790"
npm run dev
```

## Local Control Plane Protocol Test

Pollek Cloud does not build the Local Control Plane during normal Cloud UI testing. Start an already-built Local Control Plane separately, with auth disabled for local protocol testing, and point it at this Cloud URL:

```powershell
$env:DEK_LCP_AUTH_DISABLE="1"
$env:DEK_CLOUD_URL="http://127.0.0.1:8790"
$env:DEK_CLOUD_API_KEY="local-dev-cloud-key"
& "C:\Users\DELL\Documents\Codex\2026-06-26\chat-github-aecinfraconnect-antig-pollen-dek\repo\target\debug\local-control-plane.exe"
```

Then test from this repo:

```powershell
npm run test:lcp
```

If the LCP is still compiling, the Cloud console remains usable at `http://127.0.0.1:8790`. The inventory view will show the local LCP as `unknown` until the LCP is listening on `http://127.0.0.1:43891` and the `Run` probe succeeds.

The test probes:

- `GET /.well-known/pollek-contract` on Local Control Plane.
- `POST /v1/tenants/local/pdp/cloud` to configure the cloud endpoint.
- `POST /v1/tenants/local/pdp/cloud/probe` so Local Control Plane fetches this Cloud contract over the same cloud discovery path used by Enterprise Cloud mode.
- `GET /v1/tenants/local/devices/local/capability-snapshot-v2`.
- `POST /v1/telemetry/batches` against Pollek Cloud.

## Current Scope

This repository is intentionally starting with a dependency-light local foundation so it can run immediately. The SRS-driven monorepo boundaries remain:

- `apps/api` for the control-plane API and protocol test server.
- `apps/web` for the enterprise console UX.
- `packages/contracts` for Contract Hub artifacts.
- `docs` for architecture, SRS, UX, and runbooks.

The next implementation phase should add TypeSpec/OpenAPI generation, Drizzle schema generation, durable PostgreSQL persistence, tenant isolation integration tests, and the Next.js enterprise console.

## Database Direction

Production will use PostgreSQL. Development should also use PostgreSQL through `deploy/docker-compose/docker-compose.yml` so Row Level Security, JSONB, indexing, tenant context, and migrations behave like production.

The current local protocol server can run without a database to keep the first local URL easy to test. Durable product state should be implemented against `packages/db/migrations/0001_foundation.sql`.

## Research Basis

Research notes are tracked in `docs/research/RESEARCH_NOTES.md` and cover OpenTelemetry, SPIFFE/SPIRE, OPA, Cedar, OpenFGA, OAuth/OIDC, NIST Zero Trust, OWASP GenAI risks, and enterprise inventory-console UX patterns.

## vCenter-Style Fleet Console

The first console is now inventory-first:

- Left navigator: tenant, site, device group, device, Local Control Plane, agents.
- Main fleet datagrid: status, site, version, contract, active bundle, agent count, coverage, heartbeat.
- Working object detail tabs: Summary, Relationships, Policies, Telemetry, Alarms, Timeline, Audit.
- Policy Center MVP: AI-assisted deterministic draft generation, simulation, human approval gate, signed-bundle-ready state.
- Observe Center MVP: telemetry query and synthetic sample ingest for Cloud-side testing while LCP is still building.
- Timeline MVP: rollout records, enrollment sessions, and evidence export records.
- Operations rail: secure-channel probe, policy packs, open alarms, recent tasks, integration status.

Design research and the Pollek mapping are in `docs/research/VCENTER_UX_RESEARCH.md`.
