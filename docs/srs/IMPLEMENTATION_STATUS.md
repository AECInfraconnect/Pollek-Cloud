# Pollek Cloud SRS Implementation Status

This file maps the local MVP repository state to the SRS so later work can continue without re-reading the full source document every time.

## Implemented In Local MVP

- Contract Hub discovery at `/.well-known/pollek-contract`.
- Contract Hub connection updates at `/api/contract-hub/connection-updates` for distributing tenant trust scopes, service endpoints, registry sync paths, telemetry ingest paths, bundle paths, and hot-reload paths to many Local Pollek instances.
- Local Control Plane protocol probe paths for contract discovery, cloud profile update, cloud probe, and capability snapshot.
- vCenter-style fleet console with functional object tabs: Summary, Entities, Relationships, Policies, Telemetry, Alerts, Timeline, Bundle Status, Compliance, Audit, Settings, and Administration.
- Fleet inventory model for tenants, sites, device groups, devices, Local Control Planes, agents, bundles, alarms, tasks, integrations, rollouts, evidence exports, and enrollment sessions.
- Local Pollek entity aggregation for Registered Agents, Found Agents, Policies, Enforcement, Observability, device users, identity trace readiness, and WASM hot-reload readiness.
- Tenant trust scope and service endpoint model for future SPIRE Server, OPA, Cedar, OpenFGA, NER model, and WASM registry integration.
- Authorization MVP with RBAC/ReBAC tuple storage, Cedar-style high-risk guard, OpenFGA-shaped model output, default-deny checks, decision records, task/audit evidence, and explicit tenant context on new authz write/check APIs.
- Adapter catalog, entity health scoring, and entity duplicate detection derived from legacy pollenwithclaw patterns but aligned to Local Pollek entities.
- Enterprise-only compliance policy bundle catalog, sandbox simulation, deploy-to-signed-bundle flow, and Contract Hub entitlement publishing.
- Breakglass request/approve/reject/close lifecycle with time-bound audited semantics and no kernel deny bypass by default.
- Staged rollout actions and hot-reload event records aligned with Local Pollek bundle manifest and SSE `bundle_ready` delivery.
- SSE event stream at `/api/events` and `/api/hot-reload/stream` for Contract Hub task, telemetry, and hot-reload push updates with console EventSource fallback to polling.
- Durable local event-stream replay at `/api/events/replay` with SSE `id`, `Last-Event-ID`/`since` resume, bounded replay window, persisted runtime journal, and PostgreSQL migration mapping.
- Near-real-time Local Pollek entity/config watcher at `/api/entities/watch` with stable fingerprinting, volatile telemetry dedupe, SSE refresh, and UI live-sync status.
- Secure bidirectional control-channel MVP using signed control envelopes, allowlisted LCP targets/paths, local configuration snapshots, Cloud-to-Local dispatch ledger, and security posture reporting.
- Cloud-to-Local config dispatch at `/api/lcp/config/dispatch` applies to the current Local Pollek `/v1/tenants/local/pdp/cloud` endpoint with task/audit/event evidence.
- Cloud-to-Local hot-reload dispatch at `/api/lcp/hot-reload/dispatch` records signed attempts and unsupported LCP hot-reload paths; current LCP profile update succeeds but hot-reload POST apply endpoints still need Local Pollek support.
- Generated OpenAPI artifact at `/contracts/openapi.json`, concrete event/bundle-manifest/telemetry JSON Schema artifacts under `/contracts/*.schema.json`, contract drift status at `/api/contract-hub/drift`, and local drift checker script for Contract Hub path coverage.
- TypeSpec source seed at `packages/contracts/typespec/main.tsp` plus dependency-light generated SDK client at `packages/sdk/pollek-cloud-client.mjs`; contract drift checker validates both OpenAPI and SDK artifacts.
- Durable local runtime persistence snapshot at `pollek-cloud-dev-state.json`, persistence status/flush endpoints, and automatic save hooks for telemetry, audit, tasks, probes, policy authoring, sandbox, breakglass, entity sync, rollouts, hot-reload events, evidence exports, enrollments, and fleet state.
- PostgreSQL foundation migration with RLS-ready tenant-scoped tables for inventory, telemetry, audit, enrollment, policy drafts, simulations, bundles, rollouts, integrations, trust scopes, service endpoints, local entities, local entity relationships, sync runs, enterprise compliance bundles, sandbox runs, breakglass, hot-reload events, and evidence exports.
- Policy bundle signing/verification MVP with approval-gated Ed25519 local-dev signatures, deterministic manifest payload hashing, signature ledger records, Contract Hub sign/verify endpoints, and manifest verification metadata for Local Pollek hot reload.
- Content-addressed policy bundle artifact endpoint at `/v1/policy-bundles/{bundle_id}/artifact` with immutable cache headers, artifact hash/ETag, manifest linkage, artifact ledger, and PostgreSQL artifact mapping.
- AI-assisted policy editor MVP using deterministic local generation, Policy IR, generated source, tests, simulation, and human approval gate.
- AI policy provider abstraction MVP with local deterministic provider metadata, prompt/secret redaction, citation manifests, provider run evidence, and managed policy test fixtures.
- Telemetry ingest MVP for Pollek envelopes/batches plus Cloud-side sample telemetry for UI testing while LCP builds.
- SIEM/integration framework seed with OTLP, Splunk HEC, Syslog CEF, and Keycloak OIDC status plus test task recording.
- Evidence export, compliance readiness scoring, and rollout planning workflows.
- Identity and Trust Plane MVP for self-service tenant signup, local-dev OIDC login/session, invitation accept, tenant member listing, role assignment, identity-provider configuration, SCIM User/Group create/list, and account/member separation from Local Pollek device users.
- Commerce Plane MVP for tenant billing accounts, plan/subscription state, seat/LCP/device usage counters, invoice previews, hashed payment method references, webhook idempotency records, private-cloud offline license issuance, and KMS health reporting.
- Administration console tab for Organization, Users and Roles, Identity Providers, Billing, Invoices/Licenses, and KMS/Keys with tenant switcher, local-dev login/session controls, role test user seeding, invitation accept, role update/remove, IDP config, SCIM User/Group provisioning, subscription update, payment reference, invoice preview, webhook idempotency test, and license issuance wired to real local API endpoints.
- API smoke tests now cover tenant-scoped admin writes, cross-tenant authorization denial, secret redaction, SCIM provisioning, billing idempotency, offline license issue, and concrete Contract Hub schema artifact serving.
- PostgreSQL identity/billing migration at `packages/db/migrations/0002_identity_billing.sql` with tenant-scoped RLS-ready tables for members, invitations, sessions, IDPs, SCIM, KMS, billing, usage, invoices, payment methods, licenses, and billing events.
- IAM/Billing architecture note at `docs/architecture/IAM_BILLING_ARCHITECTURE.md` documenting Keycloak/OIDC, SCIM, metering, webhook, and KMS production hardening decisions.

## Still Pending

- Production PostgreSQL runtime repository implementation beyond the current dependency-light local state snapshot.
- Full TypeSpec compiler integration, generated multi-language SDK packages, and package publishing beyond the current source seed and dependency-light JavaScript SDK.
- Real Keycloak-hosted OIDC login/callback validation, production Cedar/OpenFGA service integration, and external tuple-store synchronization beyond the local authorization MVP.
- Production billing provider integration, webhook signature verification, tax/payment workflow, subscription lifecycle automation, and invoice PDF generation beyond the local provider-neutral accounting model.
- Production KMS/HSM integration for licenses and signing keys beyond the local-dev Ed25519 test signer.
- Real SPIRE Server deployment, tenant trust-domain provisioning, SPIFFE ID issuance, and mTLS enforcement.
- Production bundle compiler service, KMS/HSM-backed signing keys, transparency/attestation workflow, and external immutable object storage beyond the local-dev signing/artifact MVP.
- Local Pollek hot-reload apply endpoint implementation for signed bundle activation beyond current Cloud dispatch/profiling.
- WebSocket/gRPC production push channel beyond the current durable SSE hot-reload/event stream.
- OTLP gateway and SIEM exporters that deliver to real external systems.
- External production AI provider connectors, tenant KMS-backed prompt handling, and provider-specific citation/fixture validation beyond the local deterministic provider abstraction.
- Next.js/React app migration with virtualization for large LCP fleets.
