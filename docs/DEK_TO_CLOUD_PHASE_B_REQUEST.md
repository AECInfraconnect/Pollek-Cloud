# Hand-off → Pollek Cloud: what the DEK needs for the live mTLS / SVID / JWT-SVID handshake (Phase B)

**From:** DEK/LCP team · **Context:** the DEK side of Phase B (identity + transport)
is built and verified locally (real mutual-TLS handshake with a real X.509-SVID;
`private_key_jwt` token exchange). The live DEK↔Cloud handshake now needs the Cloud
relying-party pieces below. Your stack already has **Keycloak** + **Cosmian KMS** and
**SPIRE Server is being installed** — this maps the remaining work onto those.

Paste this as the Cloud-side task list.

---

## 0. Shared identity decisions (locked from the DEK side)

- **SPIFFE trust domain:** one per deployment — `spiffe://pollek.io`. **Not** per-tenant.
- **X.509-SVID SAN URI:** `spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>`
  (workload variant `.../device/<id>/agent/<agent_id>`). Cloud authorizes by asserting
  the `tenant/<id>` path segment equals the enrolled tenant for that identity.
- **JWT-SVID (client assertion) claims:** `iss` = `sub` = the device SPIFFE ID;
  `aud` = the Keycloak token endpoint URL; `exp ≤ 300s`; `jti` present (replay defense).

## 1. SPIRE Server — issue the SVIDs the DEK presents

The DEK already knows how to enroll (join-token), receive an X.509-SVID, renew before
expiry, and fetch JWT-SVIDs. SPIRE Server must:

- **Trust domain** `pollek.io`; **NodeAttestor** `join_token` (matches the DEK's
  `dek-spire-node` bootstrap).
- Issue **X.509-SVIDs** with the SAN URI scheme above; TTL ~24h with the DEK renewing
  before expiry. Root/intermediate keys backed by **Cosmian KMS** (UpstreamAuthority) so
  the signing key never sits on disk.
- Serve **JWT-SVIDs** for a requested `audience` (the Keycloak token endpoint). The DEK
  fetches these via its SPIRE agent endpoint and presents them to Keycloak.
- Publish the **SPIFFE trust bundle** (the roots the DEK pins the transport to). Endpoint:
  `GET /v1/trust/spiffe-bundle` (or the SPIRE bundle endpoint) — the DEK's trust-bundle
  poller keeps it fresh.

## 2. mTLS on every DEK↔Cloud endpoint (transport)

- Require **client certificates** on the ingress fronting the DEK-facing APIs
  (`/enroll`, `/api/entities/ingest`, `/v1/telemetry/*`, `/v1/tenants/*`, bundle pull,
  desired-state). Verify the client cert chains to the SPIFFE trust bundle.
- Extract the **SPIFFE ID from the client cert URI SAN** and enforce it matches the
  `tenant_id`/`device_id` in the request body (defense in depth). Reject on mismatch.
- Until this is enabled, the DEK stays on bearer auth (dev). The DEK auto-upgrades to
  mTLS the moment its SVID triple is provisioned — no DEK redeploy needed.

**DEK side already proven:** a reqwest client built from the SVID triple completes a real
mutual-TLS handshake against a client-auth-required server, and a certless client is
rejected (integration test `dek-spire-node/tests/mtls_handshake.rs`).

## 3. Keycloak — accept JWT-SVID as `private_key_jwt` (user/tenant token)

- Configure the DEK client (`client_id` e.g. `dek-lcp`) for
  **`private_key_jwt`** client authentication (Signed JWT), **not** client-secret.
- Trust the **SPIFFE JWT-SVID signer** — federate SPIRE's JWKS (or import the JWT-SVID
  signing keys, KMS-backed) so Keycloak validates the assertion. Expected assertion:
  `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`,
  `client_assertion=<JWT-SVID>`, `grant_type=client_credentials`.
- Return a normal access token; the DEK uses it as the bearer on top of mTLS.

**DEK side already built:** `client_assertion_token()` sends exactly this form (verified
by `private_key_jwt_form_is_rfc7523_shaped`); the sync client prefers it over
client-secret whenever an assertion is available, and the Workload Identity page shows
`Auth: private_key_jwt (JWT-SVID)` + `Transport: mutual TLS` live off the SVID material.

## 4. Endpoints the DEK will call for identity (please confirm shapes)

- `POST /enroll` → returns join token + `{ spire_server_address, spire_server_port,
  spiffe_id, tenant_id }` (already implemented Cloud-side; just add SVID relying-party).
- `GET /v1/trust/spiffe-bundle` → the SPIFFE trust bundle (PEM/JWKS).
- SPIRE agent SVID endpoints (X.509 + JWT) per the SPIRE Workload API you expose.

## 5. Acceptance criteria (shared)

A DEK with a provisioned SVID:
1. Connects to every DEK-facing endpoint over **mTLS**, authenticated by its SPIFFE ID.
2. Obtains a Keycloak token via **`private_key_jwt`** (no shared secret on the DEK).
3. Renews its X.509-SVID before expiry and keeps the trust bundle fresh, uninterrupted.
4. A DEK **without** a valid SVID is rejected at the TLS layer (fail closed).

When SPIRE Server + the Keycloak `private_key_jwt` client + mTLS ingress are up on
Railway, ping us — we'll run the live end-to-end from a provisioned DEK and confirm
handshake + token + telemetry over the authenticated transport.
