# Pollek LCP Compatibility Review - 2026-06-30

## Source Inspected

- Repository: `https://github.com/AECInfraconnect/Pollek`
- Current LCP commit inspected: `cca1f378de45a15eb431f94eb87091a1b4271eb9`
- Latest commit summary: `fix(ci): satisfy clippy in discovery grouping test`
- Previous Cloud-side mapping note inspected: `docs/research/LOCAL_POLLEK_ENTITY_MAPPING.md`

## Current Drift Found

The latest LCP contract remains compatible with Pollek Cloud contract version `2026.06.29`, but the Cloud needed broader path coverage for the shared local/cloud protocol.

Important LCP-side surfaces observed:

- Telemetry family now includes single-event endpoints such as `/v1/telemetry/events`, `/v1/telemetry/decision-logs`, `/v1/telemetry/security-events`, `/v1/telemetry/traces`, `/v1/telemetry/ebpf-events`, `/v1/metrics`, and `/v1/telemetry/runtime-metrics`, in addition to `/v1/telemetry/batches`.
- Telemetry read views include `/v1/telemetry/observations`, `/v1/telemetry/resources`, `/v1/telemetry/tools`, `/v1/telemetry/identities`, and `/v1/telemetry/enforcement-status`.
- LCP generated contract includes device-scoped bundle retrieval at `/v1/tenants/{tenant_id}/devices/{device_id}/bundles/latest`.
- Local capability snapshot remains `local-capability-snapshot.v2`, exposed by LCP at `/v1/tenants/{tenant}/capability-snapshot` and `/v1/tenants/{tenant}/devices/{device}/capability-snapshot-v2`.
- Registry and discovery have explicit read surfaces for agents, entities, relationships, resources, tools, discovery candidates, and discovery entities.
- Browser observe metadata is represented through `/v1/tenants/{tenant_id}/browser-extension/events` and `/v1/tenants/{tenant_id}/browser-extension/status`.

## Cloud Changes Made

- Added Cloud telemetry ingest compatibility for the LCP telemetry family while preserving `/v1/telemetry/batches`.
- Added Cloud read views for observations, resources, tools, identities, and enforcement status.
- Added central registry/discovery read views backed by Cloud's aggregated Local Pollek entity model.
- Added browser extension metadata ingest/status endpoints.
- Added capability snapshot compatibility views and device-scoped latest bundle endpoint.
- Updated Contract Hub discovery, generated OpenAPI, TypeSpec source, SDK generator, and tests.

## Deferred Follow-Up

- Full Local Dashboard deployment-session, local scan-session, policy suggestion, policy preset, PDP runtime, and discovery enrichment workflows remain Local Dashboard responsibilities. Cloud should expose only central coordination, aggregation, approval, rollout, billing, tenant, and policy distribution workflows unless a Cloud-specific cross-tenant use case is introduced.
