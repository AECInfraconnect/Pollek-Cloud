# Hand-off → DEK/LCP and Codex — current Cloud state + coordination (2026-07-24)

**From:** Pollek Cloud team. **Repo:** `AECInfraconnect/Pollek-Cloud` only (we do not modify
the DEK repo). **Why:** the DEK survey left `docs/LCP_CLOUD_SYNC_RUNBOOK.md` in the DEK repo.
It is **well aligned** with the roadmap (gated flow, contract-first, no mock/seed/bypass,
idempotency, redaction) — please keep it. But several of its "known gaps / notes" describe a
**stale** Cloud that has since advanced. This corrects those so nobody builds on wrong
assumptions. **Nothing here changes the roadmap; where a note disagreed with the roadmap we
did not follow it.**

## 1. Aligned — no change needed

The ordered flow (`enroll → entities/ingest → telemetry/batches → usage-ledgers`), the gates
(unknown-LCP `400`, `tenant_id+event_id` idempotency, redaction of `authorization:`/`bearer `/
`password`, consistent tenant/device/lcp identity), and OIDC client-credentials via
`pollek-local-control-plane` are all correct and match the Cloud.

## 2. Corrections — the runbook's notes are now stale

| Runbook note (stale) | Current Cloud truth (origin/main) |
| --- | --- |
| "Cloud persistence is dev-grade (JSON snapshot); do not assume durability" | **Postgres is live.** Tenant-partitioned runtime store with forced RLS; `/api/persistence/status` returns `mode=postgres, load_status=loaded`; state survives redeploy. The "reset the Cloud state file / stale JSON" advice no longer applies. |
| "`/enroll` returns `lcp_id: null`" | **Fixed.** `/enroll` now echoes the registered `lcp_id` (the exact id the fleet gate recognizes). |
| enroll `spiffe_id` uses dev-default `.../lcp/lcp_local` | **Changed to the DEK-locked SAN scheme** `spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>` (no `site`/`lcp` segments). Agent workloads use `.../agent/<agent_id>`. Please parse this shape. |
| "auth is provisioned but planned; `auth=none` may succeed" | Still true **by default**, but the Cloud now has real **Keycloak bearer verification** (RS256/JWKS, iss/aud/exp) available. It is **off by default**; see coordination point 3 before it is enabled. |
| contract `2026.07.13` | Contract is now **`2026.07.23`** — additive/back-compatible (adds the trust spine + `GET /v1/trust/spiffe-bundle`). Your `2026.07.13` client keeps working; bump when convenient. |
| `/enroll` returns a fixed dev `trust_bundle_pem` | `/enroll` now returns **real** SPIRE bootstrap from env: `spire_server_address/port` (null until SPIRE exists), `spiffe_bundle_url`, and `trust_bundle_status=pending_spire_provisioning`. No fabricated bundle. |

## 3. What we need from the DEK team

1. **Ratify the SPIRE topology ADR.** `docs/adr/0001-spire-topology.md` (in this repo) proposes
   Railway-root-with-Cosmian-plugin vs. DEK-SPIRE-upstream (nested/federated). This is the
   blocker for mTLS/SVID; `POLLEK_MTLS_MODE` stays `off` until it is ratified and the trust
   bundle + ingress acceptance matrix pass.
2. **Confirm the LCP token can carry a `tenant_id` claim.** When Cloud enables Keycloak JWT
   enforcement (coordination point below), the DEK-facing gate requires the bearer's
   `tenant_id` claim to equal the request tenant. A Keycloak **client-credentials** token for
   `pollek-local-control-plane` must therefore include `tenant_id` (via a client scope /
   protocol mapper / hardcoded-claim per LCP client), or the LCP path needs an agreed
   alternative tenant binding. Please confirm which, so enforcement does not reject real LCP
   traffic.
3. **Adopt the mTLS/SVID relying-party contract** already implemented Cloud-side: present the
   verified SPIFFE ID via the trusted ingress header `x-pollek-spiffe-id` (or Envoy XFCC
   `URI=`); the Cloud enforces the `tenant/<id>` path segment equals the request tenant.

## 4. What we need from Codex (Railway infra)

1. Proceed only after ADR 0001 is ratified. Then follow
   `docs/HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md` (SPIRE, mTLS ingress, `dek-lcp`).
2. **Before flipping `POLLEK_KEYCLOAK_JWT_MODE` to `monitor`/`enforce`:** ensure the Keycloak
   `pollek-local-control-plane` client emits the `tenant_id` claim in its issued tokens
   (coordinate with the DEK per point 3.2). Roll out `off → monitor → enforce`, watching
   `iam.jwt_warning` audit events, exactly like the mTLS rollout.
3. Keep `POLLEK_MTLS_MODE=off` until SPIRE + trust bundle + proxy acceptance are complete.

## 5. What the Cloud is doing next (our lane)

- Cosmian signing adapter (approval-record enforcement, detached sign, verify, key-version
  overlap, rotation + negative tests) so production bundles are KMS-signed. Needs the Cosmian
  TTLV sign/verify contract to finish faithfully; until then production bundles are signed by
  the in-process key and we will **not** claim KMS-signed.
- Broaden Keycloak JWT verification beyond DEK-facing boundaries once console-token alignment
  is settled.

No roadmap change. We continue on the Cloud lane and will re-align when the DEK repo advances.
