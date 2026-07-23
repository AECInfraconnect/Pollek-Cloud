# Hand-off Prompt — Railway Phase B: mTLS / SVID / JWT-SVID (for Codex)

**Audience:** Codex, on the `Pollek-Cloud` Railway project.
**Author:** Pollek Cloud team. **Date:** 2026-07-23.
**Trigger:** the DEK/LCP team has built + verified its side of Phase B (real mutual-TLS with an
X.509-SVID, `private_key_jwt` token exchange) — see `docs/DEK_TO_CLOUD_PHASE_B_REQUEST.md`.
This is the Railway infrastructure that makes the live DEK↔Cloud handshake work. The Cloud
*application* relying-party is already built and tested (see "Already done in the app"); your
job is the platform pieces the app can't do itself.

Copy everything from "PROMPT FOR CODEX" down and give it to Codex.

---

## Corrected URLs (important)

- **Cloud public URL:** `https://pollek-cloud-production.up.railway.app` (NOT `pollek.io`).
- **Keycloak:** `https://keycloak-production-a39c.up.railway.app`.
- **`spiffe://pollek.io` is the SPIFFE trust-domain *identifier*, not a URL.** It does not need
  to resolve; it labels the cryptographic trust root. All reachable URLs (JWT-SVID `aud`,
  bundle endpoint, token endpoint) use the Railway domains above. If the team prefers a
  different trust-domain label, change it jointly with the DEK team and set
  `POLLEK_TRUST_DOMAIN` on the Cloud service — but keep it a stable identifier, not a URL.

## Already done in the app (do NOT rebuild — just feed it config)

The Cloud server already implements the relying-party and reads it from env:
- `GET /v1/trust/spiffe-bundle` — serves the SPIFFE trust bundle from
  `SPIRE_TRUST_BUNDLE` (inline PEM) or `SPIRE_TRUST_BUNDLE_PATH` (file); reports
  `pending_spire_provisioning` until you set one. No fabricated bundle.
- `POST /enroll` — returns the device SPIFFE ID under the DEK scheme
  (`spiffe://<trust_domain>/tenant/<tenant_id>/device/<device_id>`), plus
  `spire_server_address`/`spire_server_port` (from env), the `spiffe_bundle_url`, and the
  bundle status. Nulls until SPIRE env is set.
- **SPIFFE identity gate** on DEK-facing endpoints, controlled by `POLLEK_MTLS_MODE`
  (`off` default → `monitor` → `enforce`). It reads the verified SPIFFE ID from the header
  named by `POLLEK_MTLS_IDENTITY_HEADER` (default `x-pollek-spiffe-id`) or an Envoy-style
  `x-forwarded-client-cert` (`URI=spiffe://...`), parses the DEK SAN scheme, and requires the
  `tenant` path segment to equal the request tenant. In `enforce` it fails closed
  (401 no-SVID, 403 tenant-mismatch); `monitor` allows but audits mismatches; `off` is bearer.
  `/enroll` is intentionally exempt (a device enrolls to obtain its SVID).

So once you provision SPIRE + the mTLS ingress + Keycloak client and set the env below, the
app enforces identity with no code change.

---

# PROMPT FOR CODEX

Provision the Phase-B identity + transport infrastructure for **Pollek Cloud** on Railway. The
Cloud app already speaks the relying-party protocol; you set up SPIRE, the mTLS ingress, and
the Keycloak `private_key_jwt` client, then hand the Cloud service the env values it reads.
Never put secrets in the repo. Roll enforcement out `off → monitor → enforce`.

## Task 1 — SPIRE Server (issues the SVIDs the DEK presents)

- Trust domain **`pollek.io`**; NodeAttestor **`join_token`** (matches the DEK's
  `dek-spire-node` bootstrap).
- Issue **X.509-SVIDs** with SAN URI
  `spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>` (workload variant
  `.../agent/<agent_id>`), TTL ~24h, DEK renews before expiry.
- Serve **JWT-SVIDs** for `audience` = the **Keycloak token endpoint URL**
  (`https://keycloak-production-a39c.up.railway.app/realms/<realm>/protocol/openid-connect/token`).
- **UpstreamAuthority = Cosmian KMS** so the SPIRE signing key never sits on disk (reuse the
  `pollek-cosmian-kms` service; keep it on private networking).
- Publish the **SPIFFE trust bundle**. Give the Cloud service the bundle as
  `SPIRE_TRUST_BUNDLE` (inline PEM) or `SPIRE_TRUST_BUNDLE_PATH`, and set
  `SPIRE_SERVER_ADDRESS` / `SPIRE_SERVER_PORT`. (Keep the bundle fresh; the DEK also polls it
  from `GET /v1/trust/spiffe-bundle`.)

Acceptance: SPIRE issues an X.509-SVID with the SAN scheme above; a JWT-SVID minted for the
Keycloak token endpoint audience verifies against the bundle; the Cloud's
`/v1/trust/spiffe-bundle` returns `status: "configured"` with your bundle.

## Task 2 — mTLS ingress in front of DEK-facing endpoints

Railway's edge does **not** request client certificates, so put a **client-auth-required
proxy** (Envoy / Nginx / Caddy) in front of the Cloud service for the DEK-facing APIs
(`/enroll` is exempt, but protect `/api/entities/ingest`, `/api/entities/sync`,
`/api/lcp/usage-ledgers`, `/api/lcp/change-batches`, `/v1/telemetry/*`, `/v1/metrics`, and the
tenant/device-scoped `/v1/tenants/*` routes). The proxy must:

1. Require a client certificate and **verify it chains to the SPIFFE trust bundle**.
2. Extract the **SPIFFE ID from the client-cert URI SAN** and forward it to the Cloud app as
   the header `x-pollek-spiffe-id` (or set `POLLEK_MTLS_IDENTITY_HEADER` to whatever you use;
   Envoy's `x-forwarded-client-cert` `URI=` form is also accepted).
3. **Strip/overwrite that identity header from all untrusted inbound requests** — the app
   trusts it, so a client must never be able to spoof it. This is the security boundary.
4. Reject connections with no/invalid client cert at the TLS layer (fail closed).

Then set `POLLEK_MTLS_MODE=monitor` on Cloud, watch the `mtls.identity_warning` audit events,
and once clean flip to `POLLEK_MTLS_MODE=enforce`.

Acceptance: a DEK with a valid SVID reaches the protected endpoints; a certless client is
rejected at TLS; with `enforce`, a request whose SVID tenant != the request tenant gets 403,
and a request with no forwarded identity gets 401.

## Task 3 — Keycloak: accept JWT-SVID as `private_key_jwt`

- Configure the DEK client (`client_id` e.g. `dek-lcp`) for **`private_key_jwt`** (Signed JWT)
  client auth — **not** client secret.
- Trust the **SPIFFE JWT-SVID signer**: federate SPIRE's JWKS (or import the JWT-SVID signing
  keys, KMS-backed) so Keycloak validates the assertion. Expected form:
  `grant_type=client_credentials`,
  `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`,
  `client_assertion=<JWT-SVID>`.
- Return a normal access token; the DEK uses it as the bearer **on top of** mTLS.

Acceptance: presenting a JWT-SVID (aud = Keycloak token endpoint) yields an access token with
no shared secret on the DEK.

## Task 4 — Cosmian KMS (shared with Phase-A hand-off)

Lock `pollek-cosmian-kms` to **private networking** and use it as SPIRE's UpstreamAuthority
signing backend (Task 1). This is the same KMS the Cloud team will wire for bundle signing;
coordinate key naming so the two uses don't collide.

## Environment contract (set on the Pollek-Cloud service)

| Variable | Purpose |
|---|---|
| `POLLEK_TRUST_DOMAIN` | SPIFFE trust-domain identifier; keep `spiffe://pollek.io` unless changed with the DEK team |
| `SPIRE_SERVER_ADDRESS` / `SPIRE_SERVER_PORT` | SPIRE server coordinates returned by `/enroll` (port default 8081) |
| `SPIRE_TRUST_BUNDLE` **or** `SPIRE_TRUST_BUNDLE_PATH` | the SPIFFE trust bundle PEM (inline or file) served by `/v1/trust/spiffe-bundle` |
| `POLLEK_MTLS_MODE` | `off` (default) → `monitor` → `enforce` |
| `POLLEK_MTLS_IDENTITY_HEADER` | header the ingress uses for the verified SPIFFE ID (default `x-pollek-spiffe-id`) |
| `POLLEK_CLOUD_PUBLIC_URL` | `https://pollek-cloud-production.up.railway.app` |

## Shared acceptance criteria (from the DEK)

A DEK with a provisioned SVID: (1) connects to every DEK-facing endpoint over **mTLS**,
authenticated by its SPIFFE ID; (2) obtains a Keycloak token via **`private_key_jwt`** (no
shared secret); (3) renews its X.509-SVID + keeps the bundle fresh uninterrupted; (4) a DEK
**without** a valid SVID is rejected at the TLS layer (fail closed). When SPIRE + the Keycloak
`private_key_jwt` client + mTLS ingress are up, ping the DEK team to run the live end-to-end.

## What stays on the Cloud (app) side — not your task

Verifying the Keycloak-issued access token (JWKS/RS256, iss/aud/exp, tenant claim) inside the
app is a Cloud-side follow-up; today the app enforces the mTLS/SVID identity layer and its
existing bearer checks. You provision the platform; the Cloud team wires any remaining
token-verification code, contract-first.
