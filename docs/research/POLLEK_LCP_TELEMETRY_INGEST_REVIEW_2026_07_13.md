# Pollek LCP Telemetry Ingest Review - 2026-07-13

## Source Inspected

- Repository: `https://github.com/AECInfraconnect/Pollek`
- Surfaces reviewed: `crates/local-control-plane/src/telemetry.rs`, `crates/local-control-plane/src/cloud_sync.rs`, `crates/local-control-plane/src/main.rs`, `crates/mock-cloud/src/telemetry.rs`, `contracts/schemas/telemetry-envelope.v1.schema.json`, `contracts/schemas/ai-usage-event.v1.schema.json`
- Previous Cloud-side review: `docs/research/POLLEK_LCP_COMPATIBILITY_REVIEW_2026_06_30.md`

## Gaps Found (Cloud was not receiving observe/telemetry completely or correctly)

1. **Sampled instead of stored.** Every telemetry POST was collapsed into a single summary event with a 5-item sample in a 100-entry ring buffer. Events beyond the sample were dropped, so LCP spool pushes (up to 100 envelopes per batch every 5 minutes) were mostly discarded.
2. **Response contract drift.** The Cloud returned `accepted: true` while the LCP local sink and mock-cloud both return `telemetry-ingest-response.v1` with numeric `accepted`/`rejected` counts.
3. **No idempotency.** The LCP deletes spooled envelopes only after a successful push; any retry after a network failure re-sent the same `event_id`s and the Cloud counted them again.
4. **No secret quarantine.** The LCP sink rejects events containing unredacted credentials (`authorization:`, `bearer `, `"password"`); the Cloud persisted the raw body with only key-name redaction, which cannot mask secret values inside free-text fields.
5. **Read views not backed by data.** `/v1/telemetry/observations` and `/v1/telemetry/enforcement-status` returned entity-derived approximations; `/v1/tenants/{t}/telemetry/guard-events` wrongly returned the observation page; the LCP dashboard log family (`decision-logs`, `logs/decisions`, `logs/tool-invocations`, `logs/resource-access`, `logs/policy-deployments`, `logs/pep-health`, `telemetry/export`) had no Cloud counterpart.
6. **Registry sync discarded.** `POST /v1/tenants/{t}/registry/sync` recorded a 5-item sample and dropped the rest, while `cloud_sync.rs` pushes agents, MCP servers, tools, resources, entities, relationships, agent inventories, and `telemetry_*` records there.
7. **Usage bridging missing.** `ai_usage_event` and `agent_observation` token usage (the LCP's exact-usage bridge) were not mirrored into Cloud billing usage records.
8. **Envelope schema mismatch.** The served `telemetry-envelope.schema.json` described a Cloud-only signal envelope, not the `telemetry-envelope.v1` shape the LCP actually emits.

## Cloud Changes Made

- Added a durable, bounded telemetry envelope store (`telemetryEnvelopes`, `telemetryBatchReceipts`, `telemetryRejections`, `telemetryIngestTotals`) persisted via the runtime snapshot with an event-id idempotency index rebuilt on load.
- All ingest endpoints normalize each event into `telemetry-envelope.v1` (strict validation when the sender declares that schema, tolerant normalization for legacy events), apply Cloud-side redaction, dedupe by `tenant_id` + `event_id`, and answer with numeric `telemetry-ingest-response.v1` counts (`accepted` counts duplicates as received so LCP retries can safely clear their spool).
- Per-event secret quarantine: offending events are never persisted (only reason + payload hash), the rest of the batch is accepted, and an audit event records the rejection.
- Envelope-backed read views with LCP response parity: observations, enforcement status, resources/tools/identities pages, decision logs, the `logs/*` family, guard events (fixed), CSV/JSON export, and `GET /api/telemetry/ingest-status`.
- Registry sync now maps typed items into the local entity model via `ingestLocalEntitySnapshot` and routes `telemetry_*` items into the envelope store, with an entity sync run record and audit trail.
- `ai_usage_event` / `agent_observation` token usage bridged into `ai_model_usage` billing usage records; the `telemetry_events` meter now uses the durable accepted total instead of the 100-event ring buffer length.
- Contract Hub updated: new telemetry read paths and controls, feature flags (`lcp_telemetry_envelope_persistence`, `telemetry_event_id_idempotency`, `telemetry_secret_quarantine`, `lcp_telemetry_read_parity`, `lcp_registry_sync_entity_ingest`), contract version `2026.07.13`, TypeSpec ops, regenerated OpenAPI + SDK, and a served envelope schema that accepts both the LCP `telemetry-envelope.v1` and the Cloud signal envelope.

## Deferred Follow-Up

- Cloud-side SSE per-stream endpoints (`/v1/tenants/{t}/telemetry/*/stream`) remain Local Dashboard responsibilities; the Cloud console consumes the existing `/api/events` stream, which now also carries `telemetry.envelope` messages.
- Production PostgreSQL persistence for the envelope store (`telemetry_events` table indexes already exist in `packages/db/migrations/0001_foundation.sql`).
- OTLP-native ingest remains declared (`telemetry_otlp`) but unimplemented in the local dev server.
