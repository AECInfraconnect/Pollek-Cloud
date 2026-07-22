# Hand-off: Syncing real data into Pollek Cloud

**Audience:** the team/agent building the **Wallet** (Local Control Plane / DEK-side sync client).
**Goal:** make the Wallet push real fleet, telemetry, and cost/token data into Pollek Cloud so the console shows live data — no fabricated seed, no fallbacks.

**Cloud contract version:** `2026.07.13` (see `/.well-known/pollek-contract`).

---

## 1. What Pollek Cloud is now

Pollek Cloud is a central aggregator that **boots completely empty**. There is no seeded fleet, no fake devices/agents/usage. Everything you see in the console is only what a Local Control Plane / DEK has actually reported through the **real, gated ingest endpoints**. The org tree is a live projection of that real state.

Already implemented and verified on the Cloud side (nothing for the Wallet to build here):

- Durable, idempotent telemetry ingest (`telemetry-envelope.v1`), per-event secret quarantine, `telemetry-ingest-response.v1` counts.
- Registry/entity ingest into a deduped entity + relationship model.
- LCP usage-ledger ingest with agent-first credit allocation.
- Cost & Token reporting by device / user / agent / tenant / model / provider, with time-range filters and CSV/JSON export.
- LCP registration on enrollment; org tree derived from real state.

The Wallet's job is to be a **correct client** of these endpoints.

---

## 2. The sync contract (what the Wallet must call, in order)

Base URL in local dev: `http://127.0.0.1:8790`. Discover everything machine-readably at `GET /.well-known/pollek-contract` (paths live under `interfaces.*.paths` and `endpoints`).

Common headers (recommended on every call):

```
content-type: application/json
x-pollek-tenant-id: <tenant_id>      # default "local" in dev
x-pollek-device-id: <device_id>
x-pollek-lcp-id: <lcp_id>
authorization: Bearer <token>        # required in production (OAuth/OIDC); optional in local auth-disabled dev
```

### Step 1 — Enroll (register the LCP). REQUIRED FIRST.

An LCP is unknown until it enrolls. Usage ledgers from an unregistered LCP are **rejected with 400** — this gate is enforced, not bypassed.

```
POST /enroll
{
  "hostname": "DELL-WINDOWS",
  "device_id": "device_local_windows",
  "lcp_id": "lcp_local",
  "os": "windows",
  "os_family": "windows",
  "os_version": "Windows 11 Pro 24H2",
  "arch": "x86_64",
  "capabilities": { }
}
```
Response includes `join_token`, `spiffe_id`, `device_id`, `tenant_id`, `cloud_url`, trust bundle. After this, `GET /api/fleet` shows the LCP and the derived tree gains `device` + `lcp` nodes.

### Step 2 — Sync inventory (agents, tools, resources, relationships)

Two equivalent options — use either:

**(a) Snapshot push**
```
POST /api/entities/ingest
{
  "device_id": "device_local_windows",
  "lcp_id": "lcp_local",
  "user_subject": "DELL\\LocalAdmin",
  "snapshot": {
    "agents": [ { "agent_id": "...", "name": "...", "trust_level": "trusted", "declared_tools": [], "declared_resources": [] } ],
    "tools": [ { "tool_id": "...", "name": "...", "agent_id": "..." } ],
    "resources": [ { "resource_id": "...", "name": "...", "sensitivity": "..." } ],
    "entities": [ ],
    "relationships": [ { "from": "...", "to": "...", "label": "uses_tool" } ],
    "candidates": [ ],
    "agent_inventory": [ ]
  }
}
```
Response: `{ accepted: true, run, summary }`.

**(b) Typed registry sync**
```
POST /v1/tenants/{tenant_id}/registry/sync
{
  "tenant_id": "local",
  "device_id": "device_local_windows",
  "lcp_id": "lcp_local",
  "items": [
    { "type": "agent",        "data": { "agent_id": "...", "name": "..." } },
    { "type": "tool",         "data": { "tool_id": "...", "name": "..." } },
    { "type": "resource",     "data": { "resource_id": "...", "name": "..." } },
    { "type": "mcp_server",   "data": { "id": "...", "name": "..." } },
    { "type": "relationship", "data": { "from": "...", "to": "...", "label": "..." } },
    { "type": "telemetry_tool_invocation",  "data": { "event_id": "...", "tool_id": "...", "agent_id": "..." } },
    { "type": "telemetry_policy_deployment","data": { "event_id": "...", "policy_id": "..." } }
  ]
}
```
`telemetry_*` items are routed into the telemetry envelope store; everything else into the entity model.

### Step 3 — Push telemetry (observe/decisions/usage/guard/enforcement)

Batch endpoint (preferred). Every event is normalized to `telemetry-envelope.v1`.

```
POST /v1/telemetry/batches
{
  "schema_version": "telemetry-batch.v1",
  "tenant_id": "local",
  "device_id": "device_local_windows",
  "batch_id": "batch_<uuid>",
  "events": [ <telemetry-envelope.v1>, ... ]
}
```

`telemetry-envelope.v1` — **all fields required**:
```
{
  "schema_version": "telemetry-envelope.v1",
  "event_id": "evt_<stable-unique-id>",       // idempotency key (per tenant_id)
  "event_type": "agent_observation",          // see event types below
  "timestamp": "2026-07-13T01:00:00Z",
  "tenant_id": "local",
  "device_id": "device_local_windows",
  "payload": { ... },                          // object
  "redaction_applied": true                    // must be a boolean
}
```
Optional: `workspace_id`, `environment_id`, `trace_id`, `span_id`.

Useful `event_type` values the Cloud understands specially:
- `agent_observation` — with `payload.token_usage` bridges into AI usage/billing.
- `ai_usage_event` — with `payload.tokens` + `payload.cost` bridges into AI usage/billing (see shape below).
- `decision_log`, `tool_invocation`, `resource_access`, `enforcement_result`, `guard_incident`, `security_event` — surfaced in the matching read views.

`ai_usage_event` payload shape (for cost/token reporting):
```
"payload": {
  "agent_id": "...", "agent_name": "...", "user_subject": "...",
  "device_id": "...", "lcp_id": "...", "os_family": "...", "os_version": "...",
  "provider": "Anthropic", "model": "claude-sonnet-4",
  "tokens": { "input_tokens": 500, "output_tokens": 200, "total_tokens": 700, "cached_input_tokens": 0, "estimated": false },
  "cost": { "currency": "USD", "total_cost": 0.42 }
}
```

Split single-event endpoints also exist (same envelope): `/v1/telemetry/events`, `/v1/telemetry/decision-logs`, `/v1/telemetry/security-events`, `/v1/telemetry/traces`, `/v1/telemetry/ebpf-events`, `/v1/metrics`, `/v1/telemetry/runtime-metrics`, and tenant-scoped `/v1/tenants/{tenant_id}/telemetry/events`.

Response (`telemetry-ingest-response.v1`): `{ accepted, rejected, stored, duplicates, tenant_id, batch_id, received_events, rejection_reasons }`.

### Step 4 — Push cost/token usage ledgers (billing-grade)

Requires the LCP to be enrolled (Step 1). Schema `pollek.lcp.usage-ledger.v1`:

```
POST /v1/tenants/{tenant_id}/lcp/usage-ledgers
{
  "schema_version": "pollek.lcp.usage-ledger.v1",
  "ledger_id": "ledger_<uuid>",
  "tenant_id": "local",
  "lcp_id": "lcp_local",
  "device_id": "device_local_windows",
  "os_family": "windows",
  "os_version": "Windows 11 Pro 24H2",
  "capture_method": "windows_etw_wmi",
  "observed_at": "2026-06-30T01:10:00.000Z",
  "usage_entries": [
    {
      "id": "...", "agent_id": "...", "agent_name": "...",
      "device_id": "...", "user_subject": "...",
      "provider": "Google", "model": "gemini-2.5-pro",
      "pricing_model": "credit_pool",                  // or "token_metered"
      "billing_pool_id": "credit_pool_...",            // REQUIRED when pricing_model contains "credit"
      "allocation_method": "lcp_reported_agent_share",
      "call_count": 9, "input_tokens": 28500, "output_tokens": 9200, "total_tokens": 37700,
      "billed_credits": 3.77, "allocated_cost_cents": 377,
      "currency": "USD", "confidence": "reported_by_lcp"
    }
  ]
}
```
See working per-OS fixtures in `packages/contracts/fixtures/lcp-usage-ledger/{windows,macos,linux}.json`.

---

## 3. Rules the Wallet MUST honor (gates — do not work around them)

1. **Enroll before usage ledgers.** Unknown `lcp_id` → `400 unknown_lcp:<id>`.
2. **Idempotency.** Dedup key is `tenant_id` + `event_id` for telemetry (and `id` for usage entries). Reuse the *same* `event_id` on retries so replays don't double-count; the Cloud returns them under `duplicates` and it is safe to clear the spool on any 2xx.
3. **Redaction.** Set `redaction_applied` honestly and never send secrets. Events containing `authorization:`, `bearer `, or `"password"` are quarantined (rejected per-event) and counted in `rejected` / `rejection_reasons`; the rest of the batch is still accepted.
4. **Envelope validity.** When `schema_version` is `telemetry-envelope.v1`, all required fields must be present and `payload` must be an object, `redaction_applied` a boolean — otherwise the event is rejected as `invalid_envelope`.
5. **Tenant/device/lcp identity.** Send them in the body and/or headers consistently; the Cloud attributes usage/entities by these.

---

## 4. Verify the sync worked (read side)

- `GET /api/fleet` — LCPs, entities, usage records, derived tree, summary.
- `GET /api/telemetry/ingest-status` — per-tenant accepted/duplicate/rejected totals + recent batches/quarantines.
- `GET /v1/telemetry/observations`, `/v1/telemetry/enforcement-status`, `/v1/telemetry/{resources,tools,identities}`.
- `GET /v1/tenants/{tenant_id}/telemetry/{decision-logs,guard-events,export}` and `/v1/tenants/{tenant_id}/logs/{decisions,tool-invocations,resource-access,policy-deployments,pep-health}`.
- Cost & Tokens: `GET /api/reports/cost-tokens/overview` and `GET /api/reports/cost-tokens?group_by=device|user|agent|tenant|model|provider&format=json|csv[&from=YYYY-MM-DD&to=YYYY-MM-DD]` (tenant-scoped variants under `/v1/tenants/{tenant_id}/reports/cost-tokens...`).

A correct minimal happy path (enroll → telemetry `ai_usage_event` → read report) should show the usage in the overview totals and the per-agent breakdown.

### One-command end-to-end smoke test

`scripts/smoke-sync.mjs` drives the whole gated flow (reachability → gate rejection of an unregistered LCP → enroll → entity ingest → telemetry batch → idempotent replay → usage ledger → verify via ingest-status and cost/token reports) and prints PASS/FAIL with a non-zero exit on failure. Point it at any deployment:

```
node scripts/smoke-sync.mjs https://<your-cloud-host>
# or
POLLEK_CLOUD_URL=https://<your-cloud-host> POLLEK_TOKEN=<bearer-if-auth-enabled> npm run smoke:sync
```

It uses a unique per-run `lcp_id`/`device_id` (`*_claude_smoke_<ts>`) so it will not collide with other testers on a shared instance.

---

## 5. Known gaps / not yet built (be honest, develop in the right direction)

- **Production identity is not enforced in local dev.** OAuth/OIDC audience-bound tokens, SPIFFE/SPIRE, and mTLS certificate binding are documented (`docs/architecture/SECURE_CONTROL_CHANNEL.md`) but the dev server runs auth-disabled over loopback. The Wallet should be built to present these in production.
- **No persistent DB yet.** The Cloud persists to a JSON snapshot in dev; PostgreSQL migrations exist (`packages/db/migrations`) but the runtime store is in-memory/file. Do not assume long-term durability.
- **`/enroll` LCP registration is minimal.** It records the LCP with the fields you send; richer capability negotiation (capability-snapshot-v2) is a separate follow-up.
- **Default identifiers.** When a caller omits `lcp_id`/`device_id`, the Cloud falls back to dev-tenant names (`lcp_local`/`device_local_windows`). Always send explicit ids from the Wallet for correct multi-device attribution.
- **OTLP-native ingest** is declared in the contract but not implemented; use the JSON telemetry endpoints above.

---

## 6. Local dev quickstart

```
# Cloud
npm run dev            # http://127.0.0.1:8790  (boots empty)

# Contract discovery
curl http://127.0.0.1:8790/.well-known/pollek-contract

# Sanity: fresh cloud is empty
curl http://127.0.0.1:8790/api/fleet         # local_control_planes: [], local_entities: [], usage_records: []
```

Reference commits (main): telemetry ingest, cost/token reporting, time-range filtering, and the de-fake / boot-empty change (PR #5). The full test suite (`npm test`) establishes every fixture through these same real endpoints — read `test/foundation.test.mjs` for concrete request/response examples.
