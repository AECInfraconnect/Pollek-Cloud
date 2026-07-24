# Pollek Cloud documentation

Index of the `docs/` tree. Start with the root [`README.md`](../README.md) for the product
overview and quickstart, [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the dev workflow, and
[`AGENTS.md`](../AGENTS.md) for the codebase rules.

## Architecture

- [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) — system architecture
- [architecture/IAM_BILLING_ARCHITECTURE.md](architecture/IAM_BILLING_ARCHITECTURE.md) — identity & billing
- [architecture/SECURE_CONTROL_CHANNEL.md](architecture/SECURE_CONTROL_CHANNEL.md) — Cloud→Local control channel
- [architecture/RAILWAY_DEPLOYMENT.md](architecture/RAILWAY_DEPLOYMENT.md) — Railway topology & deploy

## Specification & status

- [srs/POLLEK_CLOUD_SRS.md](srs/POLLEK_CLOUD_SRS.md) — software requirements
- [srs/IMPLEMENTATION_STATUS.md](srs/IMPLEMENTATION_STATUS.md) — implementation status
- [SYSTEM_DEVELOPMENT_DIRECTION.md](SYSTEM_DEVELOPMENT_DIRECTION.md) — forward development direction
- [CLOUD_APP_PROGRESS_2026-07-24.md](CLOUD_APP_PROGRESS_2026-07-24.md) — latest app-layer progress & open gates

## Decisions (ADRs)

- [adr/0001-spire-topology.md](adr/0001-spire-topology.md) — SPIRE topology for `spiffe://pollek.io` (Proposed)

## Trust spine, identity & security

- [CLOUD_PHASE1_TRUST_SPINE.md](CLOUD_PHASE1_TRUST_SPINE.md) — Phase-1 trust spine (provenance/SBOM/attestation)
- [RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md](RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md) — accepted infra state, evidence, gates
- [RAILWAY_PRODUCTION_RUNTIME_GUARDS.md](RAILWAY_PRODUCTION_RUNTIME_GUARDS.md) — production runtime guard
- [../SECURITY.md](../SECURITY.md) — security policy & posture

## Cross-team alignment (Cloud ⇄ DEK/LCP)

- [CLOUD_TO_DEK_LCP_ALIGNMENT.md](CLOUD_TO_DEK_LCP_ALIGNMENT.md) — Cloud → DEK/LCP alignment spec
- [DEK_TO_CLOUD_ALIGNMENT_ANSWERS.md](DEK_TO_CLOUD_ALIGNMENT_ANSWERS.md) — DEK's locked answers
- [DEK_TO_CLOUD_PHASE_B_REQUEST.md](DEK_TO_CLOUD_PHASE_B_REQUEST.md) — DEK's Phase-B (mTLS/SVID) request
- [HANDOFF_TO_DEK_AND_CODEX_2026-07-24.md](HANDOFF_TO_DEK_AND_CODEX_2026-07-24.md) — current Cloud state + coordination

## Hand-offs & runbooks (infra / Codex / LCP)

- [HANDOFF_RAILWAY_INFRA.md](HANDOFF_RAILWAY_INFRA.md) — Railway infra hand-off (Postgres, KMS, Keycloak, SPIRE)
- [HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md](HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md) — Phase-B mTLS/SVID infra
- [HANDOFF_CLAUDE_RAILWAY_INFRA_2026-07-24.md](HANDOFF_CLAUDE_RAILWAY_INFRA_2026-07-24.md) — infra continuation hand-off
- [HANDOFF_CODEX_RAILWAY_SECURITY_GATES_2026-07-24.md](HANDOFF_CODEX_RAILWAY_SECURITY_GATES_2026-07-24.md) — security-gate audit
- [HANDOFF_CODEX_RAILWAY_SIGNER_UPDATE_2026-07-24.md](HANDOFF_CODEX_RAILWAY_SIGNER_UPDATE_2026-07-24.md) — signer-update addendum
- [HANDOFF_LCP_SYNC.md](HANDOFF_LCP_SYNC.md) — LCP → Cloud sync contract

## Research

- [research/RESEARCH_NOTES.md](research/RESEARCH_NOTES.md) — standards & prior-art notes
- [research/VCENTER_UX_RESEARCH.md](research/VCENTER_UX_RESEARCH.md) — fleet-console UX research
- [research/LOCAL_POLLEK_ENTITY_MAPPING.md](research/LOCAL_POLLEK_ENTITY_MAPPING.md) — entity mapping
- [research/POLLEK_LCP_COMPATIBILITY_REVIEW_2026_06_30.md](research/POLLEK_LCP_COMPATIBILITY_REVIEW_2026_06_30.md) — LCP compatibility review
- [research/POLLEK_LCP_TELEMETRY_INGEST_REVIEW_2026_07_13.md](research/POLLEK_LCP_TELEMETRY_INGEST_REVIEW_2026_07_13.md) — telemetry ingest review
- [research/POLLENWITHCLAW_REUSE_RESEARCH.md](research/POLLENWITHCLAW_REUSE_RESEARCH.md) — reuse research

## UX

- [ux/UX_BLUEPRINT.md](ux/UX_BLUEPRINT.md) — console UX blueprint
