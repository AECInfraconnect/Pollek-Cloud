# Codex Railway Security Gate Audit - 2026-07-24

This evidence addendum covers only the Railway project `Pollek-Cloud` and the
`AECInfraconnect/Pollek-Cloud` repository. It does not modify or make decisions
for the DEK/LCP repository.

Read this after:

1. `docs/HANDOFF_TO_DEK_AND_CODEX_2026-07-24.md`
2. `docs/HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md`
3. `docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md`
4. `docs/adr/0001-spire-topology.md`

## Executive result

No identity or transport enforcement mode was changed.

| Gate | Result | Required action |
| --- | --- | --- |
| Cloud deployment | Accepted at `a830acc` | Continue normal health monitoring |
| LCP `client_credentials` tenant binding | Failed: issued token has no `tenant_id` | Agree on a tenant-binding model with DEK before JWT monitor/enforce |
| Keycloak JWT rollout | Held at `off` | Complete token claim and fail-closed verifier acceptance first |
| SPIRE topology | Blocked: ADR 0001 is still `Proposed` | Cloud and DEK owners must ratify the ADR |
| Cloud mTLS | Held at `off` | Provision accepted SPIRE, bundle, and trusted ingress first |
| KMS private-hop TLS | Not configured | Stabilize the service, then canary a pinned TLS-enabled deployment |
| KMS key rotation | Not configured | Finish key-version-aware Cloud consumers before enabling rotation |

This is deliberate fail-closed sequencing. A service existing is not the same
as an integration being accepted or an application path being enforced.

## Evidence captured

### Repository and Cloud

- Local `main` was fast-forwarded from `origin/main` and inspected at
  `a830acc070c72fae70d69ba34e4d9a9538bdad24`.
- Railway deployment `29f2bec3-dada-4a95-9ef0-f88767b14a04` reported
  `SUCCESS` for that commit.
- Production health returned HTTP 200 with `status=ok`.
- Production persistence reported `mode=postgres` and `load_status=loaded`.
- Production Keycloak JWT mode remained `off`.
- Production mTLS mode remained `off`.
- The SPIFFE bundle endpoint remained
  `status=pending_spire_provisioning`.
- `npm run audit:foundation` reported 43 tests: 39 passed, 0 failed, and 4
  PostgreSQL integration tests skipped because no local test database was
  supplied.

### Keycloak LCP machine token

The production Keycloak client `pollek-local-control-plane` was inspected
without printing its secret or token. Its current machine-authentication shape
is:

```text
enabled=true
public_client=false
service_accounts_enabled=true
standard_flow=false
direct_access_grants=false
device_authorization=true
client_authenticator=client-secret
```

Its default scopes include `pollek-tenant`. That scope has an OIDC
user-attribute mapper from `tenant_id` to the `tenant_id` token claim.

However, the client's service-account user has no `tenant_id` attribute. A
fresh `client_credentials` token was issued successfully and had:

```text
iss=https://keycloak-production-a39c.up.railway.app/realms/pollek
aud=["pollek-cloud-api","account"]
azp=pollek-local-control-plane
ttl=300 seconds
tenant_id=missing
```

This differs from the previously accepted interactive/device authorization
flow, where a real user supplied the mapped tenant attribute. It proves only
that the shared LCP service account is not tenant-bound; it does not invalidate
the accepted user/device-flow result.

### Cosmian KMS runtime

Railway showed the KMS service online with active deployment
`0b65677c-9f50-44bc-8c04-ade1aa3d9371`.

Observed non-secret runtime facts:

```text
image=ghcr.io/cosmian/kms:latest
public_domain=none
private_dns=pollek-cosmian-kms.railway.internal
volume_mount=/var/lib/cosmian-kms/sqlite-data
```

The configured application variables include the existing KMS authentication,
rate-limit, logging, UI, CORS, and JWKS controls. There are no visible TLS
certificate, private-key, CA-bundle, or TLS configuration-path variables.

Railway also reports that the configured `sfo` region is no longer valid and
will block a future deployment until a replacement region is selected. The
active deployment is online, but this makes an in-place TLS experiment unsafe.
The image also uses the mutable `latest` tag, which prevents a reproducible
rollback.

## Decision required: LCP tenant binding

Do not add one hardcoded `tenant_id` claim to the shared
`pollek-local-control-plane` service account. One shared identity cannot safely
represent many tenants, and doing so would make every LCP token assert the same
tenant.

Cloud and DEK must choose and record one of these patterns:

### Recommended interim pattern

Issue one confidential machine client per registered LCP/device. Give each
client a unique service account with immutable `tenant_id`, `device_id`, and
`lcp_id` attributes sourced from the approved enrollment record. Map only
`tenant_id` into the access token, limit role scopes and audience, accept
`client_secret_basic` only, rotate each credential independently, and revoke
the client when the LCP is retired.

This limits credential blast radius and gives the Cloud an `azp` that can be
mapped back to one enrolled LCP. It is an interim bridge, not the Phase-B end
state.

### Preferred Phase-B pattern

Use the ratified SPIFFE identity as the machine identity and obtain the
Keycloak access token with a JWT-SVID/federated client assertion or an approved
token-exchange broker. Tenant and device binding must be derived from the
verified SPIFFE subject and the enrollment record, never from an untrusted
request field.

### Rejected shortcuts

- One tenant claim hardcoded on the shared multi-tenant client.
- A caller-supplied `tenant_id` accepted without binding it to a verified
  credential.
- Enabling JWT enforcement while real LCP tokens still lack the claim.
- Replacing the planned SVID path with a long-lived shared production secret.

DEK must confirm which token-acquisition path it will implement and how it will
select the tenant/device-specific credential or SVID subject.

## JWT rollout acceptance

Keep `POLLEK_KEYCLOAK_JWT_MODE=off` until all of these pass:

1. The tenant-binding model above is approved by Cloud and DEK owners.
2. A token issued through the exact LCP production flow has the expected
   `iss`, `aud`, `azp`, non-empty `tenant_id`, and a lifetime no greater than
   five minutes.
3. The credential/SVID subject maps to the same tenant, device, and LCP as the
   enrollment record.
4. Same-tenant requests succeed, cross-tenant replay fails, a missing tenant
   claim fails, an unknown/revoked LCP fails, and expired or not-yet-valid
   tokens fail.
5. The Cloud verifier rejects a token whose `exp` claim is missing or is not a
   number.
6. `monitor` produces clean `iam.jwt_warning` evidence across the real LCP
   route matrix before `enforce` is approved.

Application follow-up: `apps/api/keycloak.mjs` currently rejects an expired
numeric `exp`, but does not reject a missing or non-numeric `exp`. Keycloak
normally issues a numeric expiry, but the verifier should still fail closed
before production enforcement. Add negative tests for both cases in the Cloud
application lane.

## SPIRE and mTLS gate

ADR 0001 remains `Proposed`. Do not provision a SPIRE root, a placeholder
SPIFFE provider, `dek-lcp`, or an mTLS ingress until Cloud and DEK owners change
the ADR to `Accepted` and name the trust-root operator.

Until then:

```text
POLLEK_MTLS_MODE=off
SPIRE_SERVER_ADDRESS=unset
SPIRE_SERVER_PORT=unset
SPIRE_TRUST_BUNDLE=unset
SPIRE_TRUST_BUNDLE_PATH=unset
```

After ratification, execute the acceptance order already recorded in
`docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md`: SPIRE, bundle distribution,
Keycloak federation, trusted mTLS ingress, `off -> monitor -> enforce`.

## KMS native TLS plan

Railway private networking is already isolated to the project/environment and
uses an encrypted mesh. Native KMS HTTPS remains useful defense in depth and is
recommended by the KMS documentation for a zero-trust environment.

Do not change the active service in place. Use this sequence:

1. Fix deployment reproducibility first:
   - select a supported Railway region compatible with the attached volume;
   - take and verify a fresh backup;
   - pin the Cosmian KMS image by reviewed version and preferably digest;
   - record the current health, auth rejection, JWKS, sign, and verify results.
2. Create an internal CA-managed server certificate whose SAN includes
   `pollek-cosmian-kms.railway.internal`.
3. Store the private material only in Railway secret variables or an approved
   secret backend. Do not commit it or persist plaintext key material on the
   KMS data volume.
4. Use a reviewed, pinned entrypoint or thin wrapper image to write the
   certificate and key to an ephemeral, permission-restricted path and start
   KMS with a TLS TOML configuration. The default FIPS build expects PEM
   certificate/key file paths.
5. Give Cloud consumers the CA bundle through a secret path, change the KMS URL
   to `https://pollek-cosmian-kms.railway.internal:<port>`, and require hostname
   verification. Do not set a global insecure TLS bypass.
6. Canary this against an isolated restore or parallel KMS service. Verify TLS
   chain and hostname validation, unauthenticated rejection, authenticated
   JWKS, detached sign/verify, restart persistence, and rollback.
7. Cut over only after the Cloud KMS adapter is ready to consume HTTPS and the
   acceptance evidence is attached to a change record.

If KMS client-certificate authentication is added later, use a separate client
CA and least-privilege workload certificates. Do not reuse the SPIFFE trust
root without an explicit architecture decision.

## KMS versioned rotation plan

Cosmian supports EC key re-keying and automatic rotation policies with
`interval`, `offset`, and a keyset name addressable as `name@latest`,
`name@first`, or `name@N`. Do not enable that policy on the current production
keys yet.

The consuming application must first:

1. Address signing roles through stable keyset aliases while recording the
   immutable generation-specific key ID in every signature.
2. Publish old and new public verification keys concurrently in JWKS and trust
   allowlists.
3. Verify signatures by their generation-specific `kid`, never by assuming
   only the latest key exists.
4. Keep the previous verification generation for at least the maximum bundle,
   license, revocation document, cache, and offline-client lifetime.
5. Canary a manual re-key, new signature, old-signature verification, rollback,
   and restored-backup verification before scheduling automatic rotation.
6. Require two-person approval for kill-switch signer rotation and recovery.
7. Retire, then revoke, then destroy an old private generation only after every
   consumer reports the new allowlist generation and the overlap window has
   elapsed.

The Cloud-side Cosmian adapter, approval-path tests, negative verification
tests, and rotation-overlap tests are therefore prerequisites. Until they pass,
do not claim that production bundles are KMS-signed or rotation-ready.

## Immediate owners

### DEK/LCP team

- Confirm the exact LCP machine-token acquisition flow.
- Choose the interim per-LCP client or the accepted SVID/federated path.
- Confirm how LCP stores, rotates, and revokes interim credentials.
- Ratify ADR 0001 with the Cloud owner.

### Cloud application team

- Require a valid numeric `exp` in Keycloak token verification and add negative
  tests.
- Implement the Cosmian signing adapter and generation-aware verification.
- Add same-tenant and cross-tenant live bearer-replay tests.

### Railway infrastructure

- Keep JWT and mTLS modes off while the gates are open.
- Repair the KMS region setting and pin the image before the next KMS change.
- Implement KMS native TLS only through a canary and tested CA distribution.
- Enable rotation only after generation-aware consumers are accepted.
- Provision SPIRE only after ADR 0001 is accepted.

## Primary references

- Railway private networking:
  <https://docs.railway.com/private-networking>
- Cosmian KMS TLS:
  <https://docs.cosmian.com/key_management_system/configuration/tls/>
- Cosmian KMS server configuration:
  <https://docs.cosmian.com/key_management_system/configuration/server_configuration_file/>
- Cosmian CLI rotation commands:
  <https://docs.cosmian.com/kms_clients/cli/main_commands/>
- Cosmian Re-Key Key Pair:
  <https://docs.cosmian.com/key_management_system/kmip/_re-key_key_pair/>
- Keycloak service accounts, client scopes, protocol mappers, and federated
  client authentication:
  <https://www.keycloak.org/docs/latest/server_admin/>
- Keycloak protocol mapper API:
  <https://www.keycloak.org/admin-api/protocol-mappers>

## Secret-handling record

No Railway token, database credential, Keycloak administrator credential,
client secret, access token, KMS bearer token, private key, or production KMS
key ID is included in this document. The audit printed only non-secret
configuration and decoded claim metadata.
