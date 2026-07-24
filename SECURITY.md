# Security Policy

Pollek Cloud is a multi-tenant control plane; we take security reports seriously.

## Reporting a vulnerability

- **Do not** open a public GitHub issue for a security vulnerability.
- Use GitHub's private vulnerability reporting for this repository
  (Security tab → "Report a vulnerability"), or contact the maintainers privately.
- Please include: affected version/commit, a description, reproduction steps or a proof of
  concept, and the impact you observed.

We aim to acknowledge a report within a few business days and will keep you updated on
remediation and disclosure timing.

## Do not include secrets in reports or commits

Never paste Railway tokens, database credentials, Keycloak admin credentials, KMS bearer
tokens, private keys, or production key IDs into issues, pull requests, logs, or screenshots.
Configuration secrets live only in the deployment environment's secret store.

## Security posture (current)

The security controls ship **enabled-when-configured** and default to `off` so they are turned
on deliberately, per the rollout runbooks in `docs/`:

- **Identity enforcement is boundary-class.** Machine (DEK-facing) boundaries verify a Keycloak
  bearer JWT (`POLLEK_KEYCLOAK_JWT_MODE`); human/console boundaries require a valid session
  (`POLLEK_SESSION_MODE`); transport uses an mTLS/SVID relying party (`POLLEK_MTLS_MODE`). Each
  rolls out `off -> monitor -> enforce`.
- **Tenant isolation** is enforced at the data layer with PostgreSQL row-level security (a
  non-superuser role) and at the API layer with explicit tenant context and JWT tenant-claim
  matching.
- **Trust spine.** Policy bundles are ed25519-signed (covering `data.json`, provenance, SBOM,
  and a test-pass attestation); the Cloud publishes a signed trust policy, signer allowlist
  (with rotation overlap), and a monotonic-epoch revocation list.
- **Secrets are never fabricated or logged**; verification paths fail closed.

See `docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md` and `docs/CLOUD_APP_PROGRESS_2026-07-24.md`
for the accepted state and open gates.

## Supported versions

This project is pre-1.0; only the latest `main` is supported for security fixes.
