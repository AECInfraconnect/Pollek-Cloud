# Handoff Prompt for Claude - Railway Infrastructure

Copy the prompt below into Claude when continuing this work.

---

You are Claude continuing Railway infrastructure and production-hardening work
for Pollek Cloud.

## Repository scope

Work only in:

`https://github.com/AECInfraconnect/Pollek-Cloud`

Do not modify:

`https://github.com/AECInfraconnect/Pollek`

The second repository is the Rust DEK/Local Pollek repository owned by a
different workstream.

Fetch `Pollek-Cloud` and read from `origin/main`. The accepted handoff state is:

```text
c98b5dd Document production LCP reconcile guard
fb4e2da Document Railway infrastructure acceptance
```

Do not rely on a stale local `main`.

## Required reading

Read these documents before changing code or Railway:

1. Railway infrastructure requirements:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/docs/HANDOFF_RAILWAY_INFRA.md`
2. Phase-B mTLS and SVID requirements:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/docs/HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md`
3. Accepted production state, evidence, residual risks, and completion runbook:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md`
4. Production LCP reconcile guard:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/docs/RAILWAY_PRODUCTION_RUNTIME_GUARDS.md`
5. Canonical environment-variable names:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/.env.example`
6. Repository agent rules:
   `https://github.com/AECInfraconnect/Pollek-Cloud/blob/main/AGENTS.md`

Local paths in the checked-out repository are:

```text
docs/HANDOFF_RAILWAY_INFRA.md
docs/HANDOFF_RAILWAY_PHASE_B_MTLS_SVID.md
docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md
docs/RAILWAY_PRODUCTION_RUNTIME_GUARDS.md
.env.example
AGENTS.md
```

## Railway scope

Use only the Railway project named `Pollek-Cloud`.

Public endpoints:

```text
Cloud:    https://pollek-cloud-production.up.railway.app
Keycloak: https://keycloak-production-a39c.up.railway.app
Issuer:   https://keycloak-production-a39c.up.railway.app/realms/pollek
```

The SPIFFE trust-domain identifier is:

```text
spiffe://pollek.io
```

This is an identity label, not a routable URL. SPIRE server configuration uses
`pollek.io` as the `trust_domain` value.

Never place Railway tokens, database credentials, Keycloak administrator
credentials, KMS bearer tokens, private keys, or production key IDs in Git,
logs, screenshots, or chat responses.

## Work already completed

### Cloud PostgreSQL

- The uppercase Railway service `Postgres` is the Pollek Cloud database.
- The lowercase service `postgres` is Keycloak's database.
- Cloud `DATABASE_URL` uses the dedicated `pollek_app` role.
- `pollek_app` is non-superuser and cannot bypass RLS.
- Forced RLS was tested with two tenants:
  - tenant A could not read tenant B;
  - an unscoped session returned no tenant-owned rows.
- `/api/persistence/status` returned:

```text
mode=postgres
load_status=loaded
```

- An approved policy bundle and revocation survived a Railway redeploy.
- All acceptance-only bundle, audit, task, and revocation-marker records were
  removed afterward.
- The revocation epoch was deliberately not decreased because it is monotonic
  replay protection.
- Daily, weekly, and monthly volume backups are scheduled.
- An initial manual backup completed.
- Railway PITR is still off and must be evaluated against production RPO/RTO
  before general availability.

### Cosmian KMS

- Railway service `pollek-cosmian-kms` is online.
- It has no public Railway domain.
- Cloud reaches it over Railway private networking.
- Authentication is bearer-token protected.
- Four independent Ed25519 signing roles were provisioned:
  - bundle and trust-spine signer;
  - kill-switch signer 1;
  - kill-switch signer 2;
  - offline-license signer.
- Detached sign and verify acceptance passed without exporting a private key.
- The JWKS endpoint returned the expected public keys.
- KMS state has a persistent Railway volume.
- Daily, weekly, and monthly volume backups are scheduled.
- An initial manual backup completed.
- Temporary maintenance credentials were deleted.

Do not overstate the KMS result:

- Native TLS on the Railway private KMS hop is not yet configured.
- Automated versioned key rotation with overlap and retirement is not yet
  configured.
- The current Cloud application does not yet call Cosmian in the production
  policy-bundle publishing path. The app-side KMS adapter and tests remain work
  to do.

### Keycloak

- Keycloak `26.6.4` is online with realm `pollek`.
- Console client: `pollek-cloud-console`.
- API audience/client: `pollek-cloud-api`.
- LCP device client: `pollek-local-control-plane`.
- Console login uses Authorization Code with PKCE S256.
- Console Direct Access Grants are disabled.
- LCP Device Authorization passed end to end.
- Tokens contain the expected `tenant_id` claim and API audience.
- Access-token TTL is five minutes.
- Two-tenant claim isolation was tested.
- All temporary acceptance users were deleted.
- Brute-force protection, external HTTPS requirements, verified email, and
  event retention are configured.
- SPIFFE and federated-client-authentication features are enabled.
- Keycloak PostgreSQL has daily, weekly, and monthly backups plus an initial
  manual backup.

Do not create a placeholder `dek-lcp` client or placeholder SPIFFE identity
provider. They require a real SPIFFE bundle endpoint.

The current Cloud application does not yet enforce Keycloak bearer tokens at
every API boundary. IAM token isolation and PostgreSQL RLS were accepted
separately; Cloud API cross-tenant bearer-replay tests remain application work.

### Production runtime guard

Railway production has:

```text
POLLEK_LCP_WATCH=disabled
```

This prevents the Cloud container from polling the local-development default:

```text
http://127.0.0.1:43891
```

Fifty-six failed localhost reconcile artifacts were removed from production.
The production UI was then verified with:

```text
no LCP snapshot reconcile failures
no acceptance revocation task
empty fleet
watcher disabled
```

Do not re-enable the watcher until `POLLEK_LCP_URL` points to an approved,
reachable, authenticated, tenant-scoped relay. LCP push/change-batch ingest
remains available while the watcher is disabled.

## Current production acceptance

The latest verified deployment used commit `c98b5dd` and reached `SUCCESS`.

Expected live checks:

```text
GET /health                         -> HTTP 200, status=ok
GET /api/persistence/status         -> mode=postgres, load_status=loaded
GET /api/entities/watch             -> enabled=false
GET /v1/trust/spiffe-bundle         -> status=pending_spire_provisioning
GET Keycloak OIDC discovery         -> HTTP 200 with device authorization endpoint
```

Repository verification passed:

```text
Contract Hub artifacts in sync
33 tests passed
0 tests failed
4 PostgreSQL integration tests skipped because no local test database was supplied
```

## Non-secret production values

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
POLLEK_LCP_WATCH=disabled
```

Secret values exist only as Railway service variables. Confirm their presence
by variable name without printing their values:

```text
DATABASE_URL
COSMIAN_KMS_URL
COSMIAN_KMS_API_TOKEN
COSMIAN_KMS_KEY_ID
POLLEK_KMS_BUNDLE_SIGNER_KEY_ID
POLLEK_KMS_KILLSWITCH_KEY_ID_1
POLLEK_KMS_KILLSWITCH_KEY_ID_2
POLLEK_KMS_LICENSE_SIGNER_KEY_ID
```

Do not set these until a real SPIRE deployment exists:

```text
SPIRE_SERVER_ADDRESS
SPIRE_SERVER_PORT
SPIRE_TRUST_BUNDLE
SPIRE_TRUST_BUNDLE_PATH
```

## Work intentionally not completed

### SPIRE

No SPIRE server has been deployed.

SPIRE `1.15.2` has no built-in Cosmian or generic KMIP KeyManager or
UpstreamAuthority plugin. Do not deploy SPIRE with a disk key and call it
Cosmian-backed.

Before provisioning, Cloud and DEK owners must approve one topology:

1. Railway SPIRE is the `pollek.io` root and uses an audited external
   Cosmian/KMIP plugin; or
2. an existing DEK SPIRE is upstream and Railway uses nested SPIRE or explicit
   federation.

The decision must cover trust-domain ownership, HA, PostgreSQL datastore,
backups, join-token lifecycle, registration ownership, CA rotation, recovery,
and operator ownership.

### Keycloak `dek-lcp`

Create `dek-lcp` only after a real SPIFFE bundle endpoint exists. It must use:

```text
Signed JWT - Federated
no client secret
unique SPIFFE subject
JWT-SVID audience = Keycloak token endpoint
JWT-SVID TTL <= 5 minutes
```

### mTLS ingress

Railway's public edge does not request LCP client certificates. A dedicated
Envoy, Nginx, or Caddy ingress is still required for DEK-facing routes.

The proxy must:

- require and verify the client certificate;
- validate against the SPIFFE trust bundle;
- extract the URI SAN;
- overwrite `x-pollek-spiffe-id`;
- strip any untrusted inbound identity header;
- reject certless clients at TLS.

Keep:

```text
POLLEK_MTLS_MODE=off
```

The rollout sequence is:

```text
off -> monitor -> enforce
```

Do not move to `monitor` or `enforce` without the trust bundle and proxy
acceptance matrix.

## Recommended next actions

1. Re-read the acceptance and runtime-guard documents.
2. Confirm `origin/main` and Railway have not changed since commit `c98b5dd`.
3. Do not repeat or replace completed infrastructure.
4. Create an ADR with the DEK team for SPIRE root versus nested/federated
   topology.
5. Design and security-review the Cosmian/KMIP SPIRE plugin path.
6. Implement the Cloud-side Cosmian signing adapter with:
   - approval-record enforcement;
   - detached signing;
   - public-key verification;
   - key-version overlap;
   - negative and rotation tests.
7. Implement Cloud Keycloak JWT verification and tenant-context enforcement,
   then add live cross-tenant bearer-replay tests.
8. Provision SPIRE only after the ADR and plugin decision are approved.
9. Configure `dek-lcp`, then deploy and accept the mTLS ingress.
10. Run restore drills for Cloud PostgreSQL, Keycloak PostgreSQL, and the KMS
    volume before GA.

When reporting progress, distinguish:

- infrastructure provisioned;
- integration tested;
- application path enforced;
- production acceptance complete.

Never label a task complete only because a service exists.

---
