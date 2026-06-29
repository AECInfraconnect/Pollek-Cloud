# Pollek Cloud SRS Reference

The authoritative SRS for this repository is:

`C:\Users\DELL\Downloads\POLLEK_CLOUD_SRS_AI_AGENT_DEVELOPMENT.md`

Key invariants applied to this first implementation:

- Pollek Cloud is the commercial central control plane for SaaS and on-prem private cloud.
- Local Enforcement Kit and Local Control Plane must speak one canonical contract to both local and cloud endpoints.
- Cloud must provide Contract Hub discovery at `/.well-known/pollek-contract`.
- Cloud must support secure-channel bootstrapping concepts: OAuth/OIDC, mTLS-ready identity, SPIFFE/SPIRE identifiers, signed bundles, and hot reload.
- The UX should feel like an enterprise fleet console with inventory, object detail, tasks, alerts, telemetry, policy rollout, and evidence workflows.

This file is a pointer so the source SRS can remain unchanged while the repo stores implementation-facing decisions and generated artifacts.

Implementation progress is tracked in `docs/srs/IMPLEMENTATION_STATUS.md`.
