# Pollek Cloud SRS Implementation Status

This file maps the local MVP repository state to the SRS so later work can continue without re-reading the full source document every time.

## Implemented In Local MVP

- Contract Hub discovery at `/.well-known/pollek-contract`.
- Contract Hub connection updates at `/api/contract-hub/connection-updates` for distributing tenant trust scopes, service endpoints, registry sync paths, telemetry ingest paths, bundle paths, and hot-reload paths to many Local Pollek instances.
- Local Control Plane protocol probe paths for contract discovery, cloud profile update, cloud probe, and capability snapshot.
- vCenter-style fleet console with functional object tabs: Summary, Entities, Relationships, Policies, Telemetry, Alarms, Timeline, Compliance, Audit.
- Fleet inventory model for tenants, sites, device groups, devices, Local Control Planes, agents, bundles, alarms, tasks, integrations, rollouts, evidence exports, and enrollment sessions.
- Local Pollek entity aggregation for Registered Agents, Found Agents, Policies, Enforcement, Observability, device users, identity trace readiness, and WASM hot-reload readiness.
- Tenant trust scope and service endpoint model for future SPIRE Server, OPA, Cedar, OpenFGA, NER model, and WASM registry integration.
- Adapter catalog, entity health scoring, and entity duplicate detection derived from legacy pollenwithclaw patterns but aligned to Local Pollek entities.
- Enterprise-only compliance policy bundle catalog, sandbox simulation, deploy-to-signed-bundle flow, and Contract Hub entitlement publishing.
- Breakglass request/approve/reject/close lifecycle with time-bound audited semantics and no kernel deny bypass by default.
- Staged rollout actions and hot-reload event records aligned with Local Pollek bundle manifest and SSE `bundle_ready` delivery.
- SSE event stream at `/api/events` and `/api/hot-reload/stream` for Contract Hub task, telemetry, and hot-reload push updates with console EventSource fallback to polling.
- Generated OpenAPI artifact at `/contracts/openapi.json`, contract drift status at `/api/contract-hub/drift`, and local drift checker script for Contract Hub path coverage.
- Durable local runtime persistence snapshot at `pollek-cloud-dev-state.json`, persistence status/flush endpoints, and automatic save hooks for telemetry, audit, tasks, probes, policy authoring, sandbox, breakglass, entity sync, rollouts, hot-reload events, evidence exports, enrollments, and fleet state.
- PostgreSQL foundation migration with RLS-ready tenant-scoped tables for inventory, telemetry, audit, enrollment, policy drafts, simulations, bundles, rollouts, integrations, trust scopes, service endpoints, local entities, local entity relationships, sync runs, enterprise compliance bundles, sandbox runs, breakglass, hot-reload events, and evidence exports.
- AI-assisted policy editor MVP using deterministic local generation, Policy IR, generated source, tests, simulation, and human approval gate.
- Telemetry ingest MVP for Pollek envelopes/batches plus Cloud-side sample telemetry for UI testing while LCP builds.
- SIEM/integration framework seed with OTLP, Splunk HEC, Syslog CEF, and Keycloak OIDC status plus test task recording.
- Evidence export, compliance readiness scoring, and rollout planning workflows.

## Still Pending

- Production PostgreSQL runtime repository implementation beyond the current dependency-light local state snapshot.
- Full TypeSpec source model and generated SDK pipeline beyond the current OpenAPI artifact and drift checker.
- Real OIDC login, tenant switcher, RBAC/ReBAC/Cedar authorization checks, and OpenFGA tuple storage.
- Real SPIRE Server deployment, tenant trust-domain provisioning, SPIFFE ID issuance, and mTLS enforcement.
- Real bundle compiler/signing service and immutable object storage.
- WebSocket/gRPC production push channel and durable stream resume beyond the current SSE hot-reload/event stream.
- OTLP gateway and SIEM exporters that deliver to real external systems.
- Production-grade AI provider abstraction with redaction, citations, and policy test fixture management.
- Next.js/React app migration with virtualization for large LCP fleets.
