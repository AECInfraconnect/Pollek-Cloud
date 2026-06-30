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
- OpenAPI artifact: `http://127.0.0.1:8790/contracts/openapi.json`
- Event schema artifact: `http://127.0.0.1:8790/contracts/events.schema.json`
- Bundle manifest schema artifact: `http://127.0.0.1:8790/contracts/bundle-manifest.schema.json`
- Telemetry envelope schema artifact: `http://127.0.0.1:8790/contracts/telemetry-envelope.schema.json`
- Contract drift report: `http://127.0.0.1:8790/api/contract-hub/drift`
- Contract Hub SSE stream: `http://127.0.0.1:8790/api/events`
- Runtime persistence status: `http://127.0.0.1:8790/api/persistence/status`
- Live LCP entity/config watch: `http://127.0.0.1:8790/api/entities/watch`
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

## Cross-OS LCP Usage Ledger Testing

Pollek Cloud now includes Contract Hub fixtures for Local Control Plane usage ledgers from Windows, macOS, and Linux:

- `packages/contracts/fixtures/lcp-usage-ledger/windows.json`
- `packages/contracts/fixtures/lcp-usage-ledger/macos.json`
- `packages/contracts/fixtures/lcp-usage-ledger/linux.json`

When the dev server is running, the same fixtures are served from:

- `http://127.0.0.1:8790/contracts/fixtures/lcp-usage-ledger/windows.json`
- `http://127.0.0.1:8790/contracts/fixtures/lcp-usage-ledger/macos.json`
- `http://127.0.0.1:8790/contracts/fixtures/lcp-usage-ledger/linux.json`

Each fixture uses `pollek.lcp.usage-ledger.v1`, includes `os_family`, `os_version`, and `capture_method`, and is accepted through:

```powershell
curl.exe -X POST http://127.0.0.1:8790/v1/tenants/local/lcp/usage-ledgers `
  -H "content-type: application/json" `
  --data-binary "@packages/contracts/fixtures/lcp-usage-ledger/windows.json"
```

Run the cross-OS smoke tests locally with:

```powershell
npm test
```

GitHub Actions also has an `OS Compatibility Fixtures` workflow that runs contract generation checks and the Node test suite on `windows-latest`, `macos-latest`, and `ubuntu-latest`.

## Local Pollek Entity Sync

The console now has an `Entities` tab for Cloud-side aggregation of Local Pollek state by device and user. It tracks:

- Registered Agents from Local Pollek registry and agent inventory.
- Found Agents from discovery candidates and unregistered agent inventory.
- Policies from Local Pollek policy endpoints.
- Enforcement points from capability snapshots.
- Observability entities from resources, tools, identities, and observations.

Contract Hub is the mediator for connection updates across many Local Pollek instances:

- `GET /.well-known/pollek-contract` publishes supported Cloud interfaces and endpoint paths.
- `GET /api/contract-hub/connection-updates?tenant_id=local&lcp_id=lcp_local` returns tenant trust scope, service endpoints, identity requirements, and per-LCP connection profile.
- `POST /api/entities/ingest` accepts push snapshots from Local Pollek.
- `POST /api/entities/sync` pulls from Local Pollek protocol endpoints when the LCP is running.
- `GET /api/entities/watch` reports the near-real-time Cloud watcher for Local Pollek entity/config changes.
- `POST /api/entities/watch` forces a signed/audited manual refresh cycle.
- `POST /api/lcp/config/dispatch` sends an allowlisted, signed Cloud-to-Local configuration update to the LCP cloud profile endpoint.
- `POST /api/lcp/hot-reload/dispatch` sends a signed hot-reload intent and records which LCP apply endpoints are supported or missing.

For the current Local Pollek build, Cloud-to-Local config dispatch applies successfully through `PATCH /v1/tenants/local/pdp/cloud`. Hot-reload dispatch currently records `partially_applied`: the Cloud profile update succeeds, while Local Pollek still needs a signed bundle apply endpoint for actual WASM/policy activation.

Security design for this bidirectional channel is documented in `docs/architecture/SECURE_CONTROL_CHANNEL.md`. Production must enforce OAuth/OIDC audience-bound tokens, SPIFFE/SPIRE identity, mTLS certificate-bound access tokens, signed control envelopes, replay protection, allowlisted paths, secret redaction, and fail-closed dispatch.

## Current Scope

This repository is intentionally starting with a dependency-light local foundation so it can run immediately. The SRS-driven monorepo boundaries remain:

- `apps/api` for the control-plane API and protocol test server.
- `apps/web` for the enterprise console UX.
- `packages/contracts` for Contract Hub artifacts.
- `docs` for architecture, SRS, UX, and runbooks.

The next production phase should add full TypeSpec compiler execution, Drizzle/runtime repository implementation for PostgreSQL, multi-language package publishing, production identity/billing provider integrations, and the Next.js enterprise console. The local MVP already includes generated OpenAPI, dependency-light JavaScript SDK, tenant-scoped PostgreSQL migrations, and smoke tests for admin tenant isolation/security flows.

Contract artifacts can be regenerated and checked with:

```powershell
npm run contracts:openapi
npm run contracts:sdk
npm run contracts:check
npm test
```

Run the release-readiness audit gate with:

```powershell
npm run audit:foundation
```

The local server also exposes production-oriented guard rails that can be tuned before larger load tests:

- `POLLEK_CLOUD_MAX_JSON_BODY_BYTES`: request body limit for JSON and form payloads. Default: `1048576`.
- `POLLEK_CLOUD_RATE_WINDOW_MS` and `POLLEK_CLOUD_RATE_MAX`: per-client request budget. Defaults: `60000` and `900`.
- `POLLEK_CLOUD_DEFAULT_API_PAGE_LIMIT` and `POLLEK_CLOUD_MAX_API_PAGE_LIMIT`: bounded API response sizes for high-cardinality fleet data.
- `POLLEK_CLOUD_PRETTY_JSON=1`: opt in to pretty JSON for local debugging. Compact JSON is the default for lower bandwidth.
- `POLLEK_CLOUD_MAX_AUDIT_PAYLOAD_BYTES`: audit payload redaction/truncation threshold. Default: `32768`.

## Database Direction

Production will use PostgreSQL. Development should also use PostgreSQL through `deploy/docker-compose/docker-compose.yml` so Row Level Security, JSONB, indexing, tenant context, and migrations behave like production.

The current local protocol server can run without a database to keep the first local URL easy to test. It persists local runtime state to `pollek-cloud-dev-state.json` by default, including telemetry events, audit events, tasks, probes, policy drafts, sandbox runs, breakglass requests, entity syncs, rollouts, hot-reload events, evidence exports, enrollments, tenant members, sessions, billing records, and current fleet status. The file is ignored by git.

Useful local persistence commands:

```powershell
curl.exe http://127.0.0.1:8790/api/persistence/status
curl.exe -X POST http://127.0.0.1:8790/api/persistence/flush
```

Set `POLLEK_CLOUD_STATE_FILE` to move the dev state file, or set `POLLEK_CLOUD_PERSISTENCE=disabled` for a seed-only run. Production durable product state should be implemented against `packages/db/migrations/0001_foundation.sql` and `packages/db/migrations/0002_identity_billing.sql`.

## Research Basis

Research notes are tracked in `docs/research/RESEARCH_NOTES.md` and cover OpenTelemetry, SPIFFE/SPIRE, OPA, Cedar, OpenFGA, OAuth/OIDC, NIST Zero Trust, OWASP GenAI risks, and enterprise inventory-console UX patterns.

## vCenter-Style Fleet Console

The first console is now inventory-first:

- Left navigator: tenant, site, device group, device, Local Control Plane, agents.
- Main fleet datagrid: status, site, version, contract, active bundle, agent count, coverage, heartbeat.
- Working object detail tabs: Summary, Entities, Relationships, Policies, Telemetry, Alerts, Timeline, Bundle Status, Compliance, Audit, Settings, and Administration.
- Entities tab: device/user scoped Local Pollek entity inventory with OAuth/OIDC/SPIFFE/mTLS/WASM readiness.
- Policy Center MVP: AI-assisted deterministic draft generation, simulation, human approval gate, signed-bundle-ready state.
- Observe Center MVP: telemetry query and synthetic sample ingest for Cloud-side testing while LCP is still building.
- Timeline MVP: rollout records, enrollment sessions, and evidence export records.
- Administration MVP: tenant switcher, local-dev login/session, signup, invitation accept, seeded role test users, member role update/remove, IDP config, SCIM User/Group provisioning, subscription update, payment reference, invoice preview, webhook idempotency test, and offline license issue.
- Operations rail: secure-channel probe, policy packs, open alarms, recent tasks, integration status.
- Live Sync rail: near-real-time entity/config watch status, manual refresh, config dispatch, and hot-reload dispatch outcomes.

Design research and the Pollek mapping are in `docs/research/VCENTER_UX_RESEARCH.md`.
