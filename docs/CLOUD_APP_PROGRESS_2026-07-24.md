# Cloud application progress — 2026-07-24

Continues from `docs/HANDOFF_CLAUDE_RAILWAY_INFRA_2026-07-24.md` (accepted infra state
`c98b5dd`). Scope: `AECInfraconnect/Pollek-Cloud` only. No change to the DEK/LCP repo. No
Railway provisioning. `POLLEK_MTLS_MODE` remains `off`; no SPIRE deployed.

Reporting uses the hand-off's four levels: **provisioned / integration-tested /
application-path-enforced / production-acceptance-complete.**

## Delivered this round (Recommended next action #7)

**Cloud Keycloak JWT verification + tenant-context enforcement.**
- New module `apps/api/keycloak.mjs`: RS256 verification against the realm JWKS (fetch +
  cache with rotation-aware refresh on unknown `kid`), issuer / audience / expiry / nbf
  checks, and tenant-claim extraction. No token material is logged.
- Gate in `handleApi` on DEK-facing boundaries (same path set as the mTLS gate), controlled by
  `POLLEK_KEYCLOAK_JWT_MODE` (`off` default → `monitor` → `enforce`):
  - `enforce`: JWT-shaped bearer verified; invalid/missing → 401, tenant-claim mismatch with
    the request tenant → 403 (cross-tenant bearer replay blocked).
  - `monitor`: same checks, audited (`iam.jwt_warning`) but allowed (fail-open for observation).
  - `off`: no verification — current behavior; opaque/dev/session tokens are untouched.
- Status surfaced (no secrets) on `GET /api/cloud/status` as `iam_jwt` and `mtls`.

Level reached: **application path implemented + integration-tested.** NOT yet enabled in
production (default `off`), so this is not production-acceptance-complete and production
bundles/boundaries are not yet Keycloak-enforced.

### Evidence
- 5 new integration tests use a local JWKS server + real RS256 tokens (no live Keycloak):
  valid same-tenant token passes; cross-tenant replay → 403; missing/expired/wrong-audience/
  wrong-issuer/bad-signature → 401 with specific reasons; `monitor` fails open; status shows
  `mode=off` by default.
- Full gate: `npm run audit:foundation` green — 38 tests pass, 4 PostgreSQL integration tests
  skip without a test DB (they pass when `PG_TEST_URL` + a non-superuser `PG_TEST_APP_URL` are
  supplied; verified locally against PostgreSQL 16).

## Also delivered

- `docs/adr/0001-spire-topology.md` (Recommended next action #4): a **Proposed** ADR framing
  the two SPIRE topologies, decision drivers, and what ratification must nail down. Decision is
  for Cloud + DEK owners; nothing is provisioned.

## Explicitly NOT done (unchanged from the hand-off)

- **SPIRE** not deployed — blocked on ADR 0001. `SPIRE_*` vars stay unset.
- **mTLS ingress** not deployed — `POLLEK_MTLS_MODE=off` retained.
- **Keycloak `dek-lcp`** not created — needs a real SPIFFE bundle endpoint first.
- **Cosmian signing adapter (next action #6)** not started — the Cloud still signs bundles with
  its in-process Ed25519 key; production bundles are NOT yet KMS-signed. This is the next
  app-layer item; it needs the Cosmian TTLV sign/verify contract and a faithful test path
  before it can be called complete.

## To enable JWT verification in production later (deliberate, staged)

1. Set `POLLEK_KEYCLOAK_JWT_MODE=monitor` on the Cloud Railway service (JWKS URL derives from
   `KEYCLOAK_ISSUER_URL`; `KEYCLOAK_EXPECTED_AUDIENCE=pollek-cloud-api`,
   `KEYCLOAK_TENANT_CLAIM=tenant_id`).
2. Watch `iam.jwt_warning` audit events across the real DEK-facing traffic.
3. Flip to `enforce` once clean. Roll back to `monitor`/`off` under an incident record.
