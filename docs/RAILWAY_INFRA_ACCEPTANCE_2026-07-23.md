# Railway Infrastructure Acceptance - 2026-07-23

This record covers only the Railway project `Pollek-Cloud` and the
`AECInfraconnect/Pollek-Cloud` repository at `origin/main`. It does not change or
make decisions for the DEK/LCP repository.

## Executive status

| Area | Status | Evidence |
| --- | --- | --- |
| Cloud service | Ready | `/health` returns HTTP 200 and `status=ok` |
| Cloud PostgreSQL | Accepted | Non-superuser connection, forced RLS, durable state survived a redeploy, acceptance data removed |
| PostgreSQL backups | Ready | Daily, weekly, and monthly volume schedules; initial manual backup completed |
| Cosmian KMS | Infrastructure ready with gates | Private Railway endpoint, four Ed25519 signing roles, detached sign/verify acceptance, persistent volume and backups |
| Keycloak | Baseline accepted | Realm, tenant claim, PKCE console, LCP device flow, short token TTL, acceptance users removed |
| SPIRE | Blocked by architecture decision | No Railway SPIRE service; no first-party Cosmian/KMIP SPIRE plugin exists |
| `dek-lcp` federated JWT | Blocked by SPIRE | Must not be created against a placeholder issuer or JWKS |
| mTLS ingress | Blocked by SPIRE | Cloud remains `POLLEK_MTLS_MODE=off`; no trusted bundle exists yet |

The production console is available at:

`https://pollek-cloud-production.up.railway.app`

The Keycloak issuer is:

`https://keycloak-production-a39c.up.railway.app/realms/pollek`

## Accepted controls

### PostgreSQL

- The Cloud service is linked to the uppercase `Postgres` service. The lowercase
  `postgres` service belongs to Keycloak.
- `DATABASE_URL` uses the dedicated `pollek_app` role, not the PostgreSQL
  superuser.
- The role is `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`,
  `NOREPLICATION`, and `NOBYPASSRLS`.
- The runtime store has forced row-level security. A two-tenant smoke test proved
  tenant A could not read tenant B and an unscoped session returned no tenant
  rows.
- `/api/persistence/status` returns `mode=postgres` and
  `load_status=loaded`.
- An approved policy bundle and a trust revocation were persisted, the Cloud
  service was redeployed, and both records survived.
- Acceptance-only records were then removed and a second redeploy confirmed no
  acceptance bundle or marker remained.
- The monotonic revocation epoch was not reduced during cleanup.
- Daily, weekly, and monthly volume backups are scheduled. An initial manual
  backup completed successfully.

Railway point-in-time recovery is currently off. Scheduled volume backups meet
the hand-off requirement, but PITR should be evaluated before general
availability according to the target RPO/RTO and Railway plan cost.

### Cosmian KMS

- KMS is reachable through Railway private networking and has no Railway public
  domain.
- A bearer-protected private endpoint is configured. An unauthenticated request
  was rejected.
- Four independent Ed25519 signing roles exist:
  - bundle and trust-spine signer;
  - kill-switch signer 1;
  - kill-switch signer 2;
  - offline-license signer.
- Detached sign and verify operations passed without exporting a private key.
- The JWKS endpoint returned the expected public verification keys.
- KMS state is stored on its Railway volume.
- Daily, weekly, and monthly volume backups are scheduled. An initial manual
  backup completed successfully.
- Temporary maintenance credentials used during acceptance were removed.

Two gates remain:

1. The current private Railway KMS endpoint uses HTTP inside Railway private
   networking. Native TLS for that private hop is not yet configured.
2. Automatic versioned key rotation with overlap and retirement is not yet
   configured.

The current `origin/main` application does not yet invoke Cosmian from the
production bundle-publishing path. Infrastructure sign/verify acceptance passed,
but the Cloud-side KMS adapter remains an application follow-up. Do not claim
that production bundles are KMS-signed until that adapter and its approval-path
tests pass.

### Keycloak

- Keycloak `26.6.4` is online with realm `pollek`.
- The console client uses Authorization Code with PKCE S256. Direct Access
  Grants are disabled.
- The LCP client supports OAuth 2.0 Device Authorization.
- Access tokens use a five-minute lifetime.
- The `tenant_id` managed attribute is mapped into tokens and the Cloud API
  audience is present.
- Two temporary tenants were used to verify distinct tenant claims, then all
  acceptance users were deleted.
- Device Authorization completed end to end and issued a token with the correct
  issuer, audience, tenant claim, and TTL.
- Brute-force protection, event retention, verified email, and external HTTPS
  requirements are configured.
- SPIFFE and federated-client-authentication preview features are enabled, but
  no placeholder SPIFFE identity provider was created.
- Daily, weekly, and monthly backups are scheduled on the Keycloak PostgreSQL
  volume. An initial manual backup completed successfully.

The `dek-lcp` client must remain pending until a real SPIFFE bundle endpoint is
available. At that point it must use `Signed JWT - Federated`, a unique SPIFFE
subject, and no client secret.

The current Cloud application does not yet enforce Keycloak bearer tokens at
every API boundary. Keycloak token isolation was accepted at the IAM layer and
PostgreSQL isolation was accepted at the data layer; a live Cloud API
cross-tenant bearer-replay test is still an application follow-up.

## Non-secret Cloud settings

These values are safe to share. Secret values stay only in Railway service
variables.

```text
POLLEK_CLOUD_PUBLIC_URL=https://pollek-cloud-production.up.railway.app
NODE_ENV=production
KEYCLOAK_BASE_URL=https://keycloak-production-a39c.up.railway.app
KEYCLOAK_REALM=pollek
KEYCLOAK_CLIENT_ID=pollek-cloud-console
OIDC_ISSUER=https://keycloak-production-a39c.up.railway.app/realms/pollek
KEYCLOAK_ISSUER_URL=https://keycloak-production-a39c.up.railway.app/realms/pollek
KEYCLOAK_CONSOLE_CLIENT_ID=pollek-cloud-console
KEYCLOAK_LCP_CLIENT_ID=pollek-local-control-plane
KEYCLOAK_TENANT_CLAIM=tenant_id
KEYCLOAK_EXPECTED_AUDIENCE=pollek-cloud-api
POLLEK_TRUST_DOMAIN=spiffe://pollek.io
SPIRE_TRUST_DOMAIN=spiffe://pollek.io
POLLEK_MTLS_MODE=off
POLLEK_MTLS_IDENTITY_HEADER=x-pollek-spiffe-id
POLLEK_JWT_SVID_AUDIENCE=https://keycloak-production-a39c.up.railway.app/realms/pollek/protocol/openid-connect/token
```

The following variables are configured in Railway and must never be copied into
Git, tickets, chat transcripts, or screenshots:

```text
DATABASE_URL
COSMIAN_KMS_API_TOKEN
COSMIAN_KMS_URL
COSMIAN_KMS_KEY_ID
POLLEK_KMS_BUNDLE_SIGNER_KEY_ID
POLLEK_KMS_KILLSWITCH_KEY_ID_1
POLLEK_KMS_KILLSWITCH_KEY_ID_2
POLLEK_KMS_LICENSE_SIGNER_KEY_ID
```

Do not set the following variables until a real SPIRE service and trust bundle
exist:

```text
SPIRE_SERVER_ADDRESS
SPIRE_SERVER_PORT
SPIRE_TRUST_BUNDLE
SPIRE_TRUST_BUNDLE_PATH
```

## SPIRE decision gate

The required trust domain identifier is `spiffe://pollek.io`. SPIRE configuration
uses `pollek.io` as the `trust_domain` value and emits identities in this form:

```text
spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>
spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>/agent/<agent_id>
```

SPIRE `1.15.2` has built-in server KeyManager plugins for AWS KMS, disk,
HashiCorp Vault, and memory. Its built-in UpstreamAuthority list does not include
Cosmian or generic KMIP. SPIRE supports external plugin binaries, but third-party
plugins are not supported by the SPIRE project and require an explicit review,
pinned checksum, build provenance, and upgrade plan.

Therefore, deploying SPIRE with a disk key and describing it as
Cosmian-backed would fail the hand-off security requirement.

The Cloud and DEK teams must record one of these decisions before provisioning:

1. Railway SPIRE is the root for `pollek.io`, using an audited external
   Cosmian/KMIP KeyManager or UpstreamAuthority plugin.
2. An existing DEK SPIRE deployment is the upstream authority and Railway uses a
   nested or federated topology, with explicit bundle distribution and trust
   domain ownership.

The decision must also define HA, datastore, backup, join-token lifecycle,
registration ownership, CA rotation, disaster recovery, and which team operates
the trust root.

## Completion runbook

1. Approve and record the SPIRE topology decision with Cloud and DEK owners.
2. Build or select the Cosmian integration. Pin the plugin binary checksum and
   produce a reproducible build plus threat review.
3. Deploy SPIRE with PostgreSQL, `trust_domain=pollek.io`, join-token node
   attestation for bootstrap, approximately 24-hour X.509-SVID TTL, and
   JWT-SVID TTL no greater than five minutes.
4. Publish a reachable SPIFFE bundle endpoint and configure the Cloud SPIRE
   variables. Confirm `/v1/trust/spiffe-bundle` changes from
   `pending_spire_provisioning` to `configured`.
5. Add the Keycloak SPIFFE identity provider using that bundle endpoint. Create
   `dek-lcp` with `Signed JWT - Federated`, no shared secret, and the exact
   device SPIFFE subject. Test JWT-SVID audience against the Keycloak token
   endpoint.
6. Deploy a dedicated Envoy, Nginx, or Caddy ingress for DEK-facing routes. It
   must require a client certificate, validate the SPIFFE chain, extract the URI
   SAN, and overwrite `x-pollek-spiffe-id`.
7. Prove that untrusted public requests cannot inject or preserve the identity
   header.
8. Set `POLLEK_MTLS_MODE=monitor`, inspect `mtls.identity_warning` audit events,
   and run the full route matrix.
9. Set `POLLEK_MTLS_MODE=enforce` only after:
   - a valid same-tenant SVID succeeds;
   - a certless client is rejected at TLS;
   - a different-tenant SVID returns 403;
   - a request without a verified forwarded identity returns 401;
   - `/enroll` remains available through its separate bootstrap controls.
10. Run restore drills for Cloud PostgreSQL, Keycloak PostgreSQL, and the KMS
    volume. Record measured RPO and RTO.

## KMS rotation runbook

1. Create a new versioned signing key in Cosmian; never overwrite or delete the
   current verification key.
2. Publish the new public key in JWKS and the trust signer allowlist.
3. Keep old and new verification keys active for at least the maximum bundle,
   license, and cached trust-document lifetime.
4. Switch new signatures to the new key after approval and canary verification.
5. Retire the old signing key only after all consumers report the new allowlist
   generation and the overlap window has elapsed.
6. Require two-person approval for kill-switch key rotation and recovery.
7. Verify a fresh backup and a documented restore path before each root or
   kill-switch rotation.

## Rollback

- Keep `POLLEK_MTLS_MODE=off` until the SPIRE and ingress acceptance matrix is
  complete.
- During monitor rollout, return to `off` if verified identities are absent or
  incorrectly scoped.
- During enforce rollout, return to `monitor` only under an approved incident or
  rollback record; do not bypass the proxy or trust client-supplied identity
  headers.
- Roll Keycloak client changes back before disabling the SPIFFE provider. Never
  replace federated JWT with a long-lived shared secret as an emergency shortcut.
- Restore database or KMS volume backups only into an isolated recovery
  environment first, validate integrity, then execute the production restore
  change record.

## Primary references

- SPIRE server configuration:
  <https://spiffe.io/docs/latest/deploying/spire_server/>
- Extending SPIRE:
  <https://spiffe.io/docs/latest/planning/extending/>
- Nested SPIRE:
  <https://spiffe.io/docs/latest/architecture/nested/readme/>
- Keycloak SPIFFE and federated client authentication:
  <https://www.keycloak.org/docs/latest/server_admin/>
- Cosmian JSON TTLV API:
  <https://docs.cosmian.com/key_management_system/kmip_support/json_ttlv_api/>
- Cosmian signature operations:
  <https://docs.cosmian.com/key_management_system/kmip_support/_signature/>
- Cosmian JWKS endpoint:
  <https://docs.cosmian.com/key_management_system/integrations/jose/jwks_endpoint/>
