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

## Delivered — signer abstraction + rotation overlap (partial of next action #6)

`apps/api/signer.mjs` + wiring. This is the part of the Cosmian adapter that is real and
testable **without** a live KMS:
- **Key-version overlap (rotation):** previous signing keys still inside their overlap window
  (`POLLEK_TRUST_RETIRED_PUBKEYS`) are published as `active` (unless revoked) in the signer
  allowlist and accepted by trust-document and policy-bundle verification, so a bundle signed
  just before a rotation stays valid during overlap. Revoked overlap keys publish as `revoked`.
- **Public-key verification** consolidated in `verifyAgainstKeys` (real ed25519).
- **Approval-record enforcement** centralized (`enforceApprovalRecord`, AGENTS.md rule 6) in
  the bundle signing path.
- **Honest backend gate:** `POLLEK_SIGNER_BACKEND` other than `local` **fails loudly at
  startup** rather than signing with the in-process key and mislabeling it KMS-backed.

Level reached: **application path implemented + integration/unit-tested** (6 signer unit tests +
2 allowlist overlap HTTP tests; 47 total pass, 4 PG skip).

**Still open in #6 (blocked on external inputs):** the **Cosmian KMS transport** (KMIP
JSON-TTLV detached sign/verify) is deliberately NOT implemented — its docs were unreachable
(403) and there is no live KMS in this environment to validate against. Shipping a guessed
transport would violate the roadmap's "no faking" rule. It is handed to Codex/DEK to validate
against the live Cosmian service; until then production bundles are signed by the in-process
key and we do NOT claim KMS-signed.

## Delivered — boundary-class identity enforcement (every API boundary covered)

Decision (chosen by the owner): **boundary-class**. Each API boundary is now covered by the
identity mechanism appropriate to it, gated independently (all default off):

- **Machine / DEK-facing** boundaries (`/v1/telemetry/*`, `/v1/metrics`, tenant/device-scoped
  `/v1/tenants/*`, `/api/entities/ingest|sync`, `/api/lcp/usage-ledgers|change-batches`) →
  **Keycloak JWT** (`POLLEK_KEYCLOAK_JWT_MODE`), with tenant-claim match.
- **Human / console-admin** boundaries (everything not machine and not public) → **app
  session token** (`POLLEK_SESSION_MODE`): `enforce` requires an explicit bearer token that
  hashes to an active session (401 otherwise), `monitor` audits but allows, `off` = current.
- **Public** boundaries (health, `/.well-known/pollek-contract`, `/contracts/*`, OAuth/enroll
  bootstrap, `/v1/auth/*`, signup/invitations, event streams, and the signed `/v1/trust/*`
  anchors) → always open.

Status surfaces `iam_jwt`, `session_gate`, and `mtls` modes on `GET /api/cloud/status`.

Level reached: **application path implemented + integration-tested** (3 new session-gate
tests; 50 total pass, 4 PG skip). NOT enabled in production (default off).

### Console-token prerequisite — DONE
The console now attaches its session token on **every** API call: all fetches route through a
single `authFetch` wrapper (and the existing `requestJson` path) that injects
`Authorization: Bearer <app.currentSessionToken>` when present. So enabling
`POLLEK_SESSION_MODE=enforce` no longer 401s the console. (Asset cache-busting version bumped
so browsers load the new bundle.) Turning enforce on in production is now safe from the
console's side; it remains a deliberate Railway env change.

## Delivered — Codex security-gate follow-up (JWT exp fail-closed)

Per `docs/HANDOFF_CODEX_RAILWAY_SECURITY_GATES_2026-07-24.md` (Cloud application team item):
`apps/api/keycloak.mjs` now **fails closed on a missing or non-numeric `exp`** (reason
`missing_exp`), not just an expired numeric one, and `nbf` must be numeric when present.
Negative tests added for both the missing and non-numeric `exp` cases. This satisfies JWT
rollout acceptance item 5 before any production enforcement.

## Delivered — revocation reflected in the Trust & Provenance view

The Cloud published a signed revocation list but its own console view did not show whether a
bundle was actually revoked. Now the Trust & Provenance view (`GET /api/trust/provenance`) and
the console Trust tab compute per-bundle `revocation` status against the current deny-list
(by revision, signer keyid, or manifest/artifact digest) and mark revoked bundles clearly.
This is a read-side status for operators; it does not alter the DEK-consumed signed manifest
(the manifest contract is unchanged), and the DEK gate remains the enforcement point. Tested:
deploy a bundle, revoke its revision via the signed revocation path, and the view flips to
`revoked: true` with reason `revoked_revision`.

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
