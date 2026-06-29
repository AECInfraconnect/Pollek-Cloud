# Pollek Cloud SRS Implementation Status

This file maps the local MVP repository state to the SRS so later work can continue without re-reading the full source document every time.

## Implemented In Local MVP

- Contract Hub discovery at `/.well-known/pollek-contract`.
- Local Control Plane protocol probe paths for contract discovery, cloud profile update, cloud probe, and capability snapshot.
- vCenter-style fleet console with functional object tabs: Summary, Relationships, Policies, Telemetry, Alarms, Timeline, Audit.
- Fleet inventory model for tenants, sites, device groups, devices, Local Control Planes, agents, bundles, alarms, tasks, integrations, rollouts, evidence exports, and enrollment sessions.
- PostgreSQL foundation migration with RLS-ready tenant-scoped tables for inventory, telemetry, audit, enrollment, policy drafts, simulations, bundles, rollouts, integrations, and evidence exports.
- AI-assisted policy editor MVP using deterministic local generation, Policy IR, generated source, tests, simulation, and human approval gate.
- Telemetry ingest MVP for Pollek envelopes/batches plus Cloud-side sample telemetry for UI testing while LCP builds.
- SIEM/integration framework seed with OTLP, Splunk HEC, Syslog CEF, and Keycloak OIDC status plus test task recording.
- Evidence export and rollout planning workflows.

## Still Pending

- Durable PostgreSQL runtime persistence instead of in-memory dev state.
- TypeSpec/OpenAPI generation and contract drift tests.
- Real OIDC login, tenant switcher, RBAC/ReBAC/Cedar authorization checks, and OpenFGA tuple storage.
- Real bundle compiler/signing service and immutable object storage.
- SSE/WebSocket hot-reload push channel beyond current polling/probe flow.
- OTLP gateway and SIEM exporters that deliver to real external systems.
- Production-grade AI provider abstraction with redaction, citations, and policy test fixture management.
- Next.js/React app migration with virtualization for large LCP fleets.
