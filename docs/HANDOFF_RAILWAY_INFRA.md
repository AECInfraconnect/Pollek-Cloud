# Hand-off Prompt — Railway Infrastructure for Pollek Cloud (for Codex)

**Audience:** Codex, operating on the Railway project that hosts Pollek Cloud.
**Author:** Pollek Cloud team. **Date:** 2026-07-23.
**Goal:** provision and wire the platform services Pollek Cloud needs to run
production-grade, multi-tenant, with correct guardrails from front end to back
end — reusing the Cosmian KMS and Keycloak already running on Railway, and
adding a SPIRE Server for the trust/identity spine.

Copy everything from "PROMPT FOR CODEX" onward and give it to Codex.

---

## Context you (Codex) must respect

- **North star:** "OpenShell secures the agent — Pollek governs the fleet."
  Pollek Cloud is a Node.js, dependency-light aggregator + Contract Hub. It is
  **not** the policy decision point (that is the Rust DEK/LCP). Cloud emits the
  trust spine and governs the fleet.
- **Already on Railway:** Cosmian KMS, Keycloak, and the Pollek Cloud service
  (`pollek-cloud-production`). Do not re-provision those from scratch; integrate
  with them.
- **Two hard principles (do not violate):**
  1. *Runtime trusts evidence, not location.* Everything the DEK consumes is
     signed; a service being "inside" the network grants no trust.
  2. *The signer never hands out private keys.* Signing keys live in Cosmian KMS
     and are used via the KMS API. Private key material must never be exported to
     the Cloud app, logged, or committed.
- **Contract-first:** any wire-format change goes through
  `packages/contracts/pollek-contract.json` + OpenAPI + SDK with the drift gate
  green **before** code. Infra you provision must match the env-var contract in
  §"Environment contract" below; if you need a different variable name or shape,
  propose it back to the Cloud team rather than inventing one silently.
- **Boots empty:** Cloud fabricates no operational data. Do not seed tenants,
  devices, or bundles. Real data arrives only through gated enrollment/sync.

## Current Railway inventory (observed 2026-07-23)

In the `Pollek-Cloud` project, `production` environment:
- **Pollek-Cloud** (GitHub deploy) - `pollek-cloud-production.up.railway.app` - Online.
- **pollek-cosmian-kms** - `pollek-cosmian-kms-production.up.railway.app` - Online
  (currently a **public** URL; Task A2 locks it to private networking).
- **keycloak** - `keycloak-production-a39c.up.railway.app` - Online.
- **Postgres** (with `postgres-volume`) and **postgres** (with `postgres-volume-mrIW`)
  - two instances Online. One backs Keycloak; confirm which is free for Pollek Cloud.
- **No SPIRE server yet** (Task C adds it).

The Cloud app has just been wired (in code) to persist to Postgres with tenant-scoped
RLS when `DATABASE_URL` is set; until you link a database it runs on an in-container
file snapshot that is **lost on every redeploy**. Task 0 is therefore the acute fix.

---

# PROMPT FOR CODEX

You are provisioning Railway infrastructure for **Pollek Cloud**, a multi-tenant
control plane. Cosmian KMS and Keycloak already run in this Railway project;
Pollek Cloud (Node.js) also runs here. Add a **SPIRE Server**, wire the KMS and
Keycloak into Pollek Cloud, and make the whole deployment multi-tenant with
correct guardrails front end to back end. Work task by task; each task lists
concrete acceptance criteria. Never put secrets in the repo — set them as
Railway service variables. Report back the values Pollek Cloud needs (as
secrets) plus a short runbook.

## Task 0 — Postgres persistence + RLS (do this first)

The Cloud app now speaks Postgres: when `DATABASE_URL` is set it runs the migrations in
`packages/db/migrations/` at boot and write-throughs its runtime state into a
tenant-partitioned `runtime_items` table with row-level security. Without a database it
falls back to an ephemeral in-container file, so **enrolled tenants/devices and the
revocation epoch are lost on every redeploy today.** Fix that:

1. **Link a Postgres to Pollek Cloud.** Use one of the two Postgres instances (confirm which
   is not Keycloak's) or provision a dedicated one. Set `DATABASE_URL` on the Pollek-Cloud
   service.
2. **Connect as a NON-SUPERUSER role — this is mandatory for RLS to work.** Postgres
   **bypasses RLS for superusers and (without FORCE) for table owners**. Railway's default
   `DATABASE_URL` user is a superuser, which would silently disable tenant isolation. Create a
   dedicated login role (e.g. `pollek_app`, `NOSUPERUSER`) with `USAGE` on the schema and
   `SELECT/INSERT/UPDATE/DELETE` on its tables (and default privileges for future tables), and
   point `DATABASE_URL` at that role. The runtime store also sets `FORCE ROW LEVEL SECURITY`
   so even the owner is subject to the policy.
3. **Do not enable `POLLEK_CLOUD_PERSISTENCE=disabled`** in production.
4. A persistent volume for the old JSON snapshot is **no longer needed** once Postgres is
   linked (Postgres is the durable store). Keep automated Postgres backups instead.

Acceptance (verified locally against Postgres 16 already; reproduce on Railway):
- After linking, `GET /api/persistence/status` shows `status.mode: "postgres"`,
  `load_status: "loaded"`, and the migrations tracked in `schema_migrations`.
- Deploy a bundle through the gated compliance flow, add a revocation, **redeploy the Cloud
  service**, and confirm the bundle and revocation epoch survive (they are read back from
  `runtime_items`).
- Connected as the non-superuser role, a session with `SET app.tenant_id = '<tenant>'` sees
  only that tenant's rows plus shared `__system__` rows; an unscoped session sees no tenant
  data (fail-closed). (The Cloud team's `test/postgres.test.mjs` asserts exactly this against
  `PG_TEST_URL` + a non-superuser `PG_TEST_APP_URL`.)

## Task A — Cosmian KMS: real signing keys (highest priority)

Pollek Cloud today signs policy bundles and trust documents with an **ephemeral
in-process ed25519 key** that is regenerated on every restart. That must become a
KMS-custodied key. Provision in Cosmian KMS and expose to Pollek Cloud:

1. **Bundle + trust-spine signer** — one ed25519 key for the deployment's trust
   domain. Used to sign policy-bundle manifests (incl. `data.json`),
   `trust-policy`, `signer-allowlist`, and the `revocation-list`.
2. **Kill-switch signer pair** — **two distinct** ed25519 keys held by different
   authorities. Unlock requires dual control (>=2 signatures); lock may be single.
3. **Offline-license signer** — key(s) for signed offline licenses. May be
   per-tenant if you support hard per-tenant crypto isolation; otherwise one
   deployment key with the tenant asserted in the payload.
4. **Rotation** — enable KMS key rotation; old key ids stay verifiable until the
   revocation list retires them. Rotation payloads must be signed by an
   already-trusted key (rogue-key-injection guard).

Acceptance:
- Pollek Cloud can request a **detached ed25519 signature over an arbitrary byte
  string** from Cosmian KMS using only the env vars below — **without** the app
  ever seeing the private key.
- The raw 32-byte ed25519 public key (and its stable `keyid` =
  `pollek-cloud-ed25519-<sha256(rawkey)[:16]>`) is retrievable so the app can
  publish the signer allowlist.
- KMS is reachable only over Railway private networking + TLS; API
  token/credentials are Railway secrets, not in code.
- Killing and restarting the Cloud service does **not** change the signer keyid.

> Cloud-side follow-up (Cloud team, not you): replace the in-process
> `crypto.generateKeyPairSync("ed25519")` with a KMS signing adapter that reads
> these env vars. You only need to provision the keys + expose the endpoint/creds.

## Task B — Keycloak: multi-tenant OIDC

Pollek Cloud uses OAuth/OIDC for console login and for the LCP device-enrollment
flow, and (Phase 2) will accept **JWT-SVID as an OAuth `private_key_jwt` client
assertion**. Configure Keycloak for multi-tenancy:

1. **Realm strategy:** a single realm with a **`tenant_id` claim** mapped into
   access/ID tokens (via group or attribute mapper), plus tenant-scoped client
   scopes. (Realm-per-tenant only if a customer demands hard isolation — default
   to single-realm-with-tenant-claim to keep the relying party light.)
2. **Clients:**
   - Console SPA client (Authorization Code + PKCE, no client secret in browser).
   - LCP enrollment client supporting the **device authorization grant**.
   - A relying-party configuration that accepts `private_key_jwt` client
     assertions where `aud` = the Cloud token endpoint URL (for Phase-2 JWT-SVID).
3. **BYO-OIDC federation:** keep identity-provider federation available so a
   tenant can bring its own IdP; the `tenant_id` claim must survive federation.
4. **SCIM:** if SCIM user/group provisioning is enabled, scope it per tenant.

Acceptance:
- A console login yields a token carrying a correct `tenant_id` claim; JWKS and
  issuer are reachable by Pollek Cloud over private networking.
- The device-authorization grant completes end to end for an LCP client.
- Cross-tenant token replay is rejected (a token minted for tenant A cannot act
  on tenant B) — verify with two test tenants, then delete the test data.

## Task C — SPIRE Server (Cloud-Phase-2 blocker)

Stand up a **SPIRE Server** as the authoritative trust root for the deployment's
SPIFFE trust domain. This unblocks mTLS + JWT-SVID between the DEK/LCP fleet and
Cloud.

1. **Trust domain:** `spiffe://pollek.io` (one per deployment; **not**
   per-tenant). Tenant lives in the SVID **path**, not the trust domain.
2. **SVID SAN URI scheme:**
   `spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>` and, for a specific
   workload, `.../device/<device_id>/agent/<agent_id>`.
3. **JWT-SVID:** `aud` = the Cloud token endpoint URL; short TTL (<=5 min); with
   `jti` for replay defense. Signed with the SVID key, verifiable against the
   trust bundle.
4. **Node attestation:** join-token attestation for enrolling LCPs; provide a
   join-token issuance path Cloud/Relay can broker when Cloud is reachable.
5. **Trust bundle:** publish the SPIFFE trust bundle (CA roots) so Pollek Cloud
   can verify presented X.509-SVID (mTLS) and JWT-SVID. Provide a stable path/URL
   or bundle-reload mechanism.
6. **Coordination item (flag to both teams, do not guess):** the DEK side runs
   `dek-spire-node` issuing SVIDs today with dev trust domain
   `spiffe://pollek.local`. Decide with the DEK team whether the Railway SPIRE
   Server is the upstream root that edge nodes attest to, or whether the two
   federate. Standardize the default to `spiffe://pollek.io`. Do not finalize the
   topology unilaterally.

Acceptance:
- SPIRE Server issues an X.509-SVID whose SAN URI follows the scheme above.
- The trust bundle is retrievable by Pollek Cloud over private networking.
- A JWT-SVID minted with `aud` = Cloud token endpoint verifies against the bundle.
- Trust domain and SAN scheme are documented in the runbook you return.

## Task D — Railway platform guardrails

1. **Private networking:** KMS, Keycloak, and SPIRE are reachable from Pollek
   Cloud over Railway's private network; do not expose KMS or the SPIRE server
   admin API to the public internet.
2. **TLS everywhere; preserve client certs.** If you put any proxy/edge in front
   of Cloud for the mTLS/SVID channel, it must **not** strip or terminate the
   client certificate in a way that hides the SPIFFE identity from the app
   (pass-through or forward the verified identity). Public HTTPS for the console.
3. **Secrets:** every credential (KMS token, Keycloak client secrets, DB creds)
   is a Railway service variable, never in the repo or logs.
4. **State durability:** handled by Postgres once Task 0 is done (the durable store is
   `runtime_items`, not a file). Ensure automated Postgres backups; no app volume needed.
5. **Health checks & limits:** wire `/health` as the Railway healthcheck; set
   sane memory/CPU limits and restart policy.
6. **Egress:** confirm outbound access Pollek Cloud needs (Keycloak JWKS, KMS,
   SPIRE, and any billing/webhook providers) is allowed; keep the rest closed.

## Multi-tenant + guardrails, front end to back end (must hold after your work)

Back end (Pollek Cloud already enforces; your infra must not undermine):
- Every tenant-scoped route requires explicit tenant context; authorization is
  **default-deny** (RBAC/ReBAC via Cedar/OpenFGA tuples). Do not add any
  network-level bypass that skips app authz.
- Bearer OAuth today; Phase-2 adds mTLS/SVID with the tenant path segment
  asserted to equal the enrolled tenant. Secret redaction and per-event secret
  quarantine are on — do not route logs around them.
- Tenant isolation extends to persistence (row-level isolation in the SQL
  migration). Any DB you provision must enforce it, not just the app.
- Rate limiting, strict CSP, `nosniff`, `frame-ancestors 'none'` are set by the
  app; if a proxy rewrites headers, keep these intact.

Front end (console):
- The console scopes all reads by the selected tenant and shows honest empty
  states; it holds no secrets. Serve it only over HTTPS with the app's CSP
  preserved.

## Environment contract (what Pollek Cloud reads / will read)

Set these as Railway variables on the Pollek Cloud service. Already consumed by
the app today:

| Variable | Purpose |
|---|---|
| `PORT` / `HOST` | listen address (Railway sets `PORT`) |
| `RAILWAY_PUBLIC_DOMAIN` | used to derive the public URL if `POLLEK_CLOUD_PUBLIC_URL` is unset |
| `POLLEK_CLOUD_PUBLIC_URL` | canonical external URL (token endpoint / manifest URLs) |
| `DATABASE_URL` | Postgres connection. **Must be a NON-SUPERUSER role** or RLS is bypassed. When set, Cloud migrates + persists to Postgres; when unset it uses the ephemeral file. |
| `PGSSLMODE` | set `disable` only for private-network/no-TLS Postgres; otherwise leave default (TLS) |
| `POLLEK_CLOUD_PG_POOL_MAX` | max pool connections (default 8) |
| `POLLEK_CLOUD_STATE_FILE` | file-snapshot path used only when `DATABASE_URL` is unset (dev/test) |
| `POLLEK_CLOUD_PERSISTENCE` | persistence mode (`disabled` turns it off — do not disable in prod) |
| `POLLEK_TRUST_DOMAIN` | SPIFFE trust domain; set to `spiffe://pollek.io` |
| `POLLEK_CLOUD_CONTROL_SIGNING_KEY` | control-envelope signing secret (move to KMS-backed) |
| `NODE_ENV` | set `production` (disables verbose error exposure) |
| `POLLEK_CLOUD_RATE_WINDOW_MS`, `POLLEK_CLOUD_RATE_MAX` | rate limiting |

The repo's `.env.example` is the canonical starting set and already lists `DATABASE_URL`,
`KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `OIDC_ISSUER`, `COSMIAN_KMS_URL`,
and `COSMIAN_KMS_KEY_ID`. Prefer those names; the rows below are additions/clarifications
(names proposed; confirm with the Cloud team before depending on them — their app integration
is Cloud-side follow-up):

| Variable | Purpose |
|---|---|
| `COSMIAN_KMS_URL` | KMS API base (private networking) |
| `COSMIAN_KMS_API_TOKEN` | KMS auth (secret) |
| `POLLEK_KMS_BUNDLE_SIGNER_KEY_ID` | ed25519 key id for bundle + trust-spine signing |
| `POLLEK_KMS_KILLSWITCH_KEY_ID_1`, `_2` | dual-control kill-switch signer key ids |
| `POLLEK_KMS_LICENSE_SIGNER_KEY_ID` | offline-license signer key id |
| `KEYCLOAK_ISSUER_URL` | OIDC issuer |
| `KEYCLOAK_JWKS_URL` | JWKS endpoint |
| `KEYCLOAK_CONSOLE_CLIENT_ID` | console SPA client |
| `KEYCLOAK_LCP_CLIENT_ID` | LCP device-flow client |
| `KEYCLOAK_TENANT_CLAIM` | claim name carrying `tenant_id` (e.g. `tenant_id`) |
| `KEYCLOAK_EXPECTED_AUDIENCE` | expected token audience |
| `SPIRE_TRUST_DOMAIN` | `spiffe://pollek.io` |
| `SPIRE_TRUST_BUNDLE_URL` or `_PATH` | where Cloud reads the SPIFFE trust bundle |
| `SPIRE_SERVER_ENDPOINT` | SPIRE server API (private) for join-token brokering |
| `POLLEK_JWT_SVID_AUDIENCE` | expected `aud` for JWT-SVID = Cloud token endpoint URL |

## What stays on the Pollek Cloud (app) side — for awareness, not your task

Already done in the app: Postgres persistence + tenant-scoped RLS runtime store (Task 0 is
just linking a database + non-superuser role). Still Cloud-side follow-up: swap the in-process
ed25519 key for a Cosmian KMS signing adapter; add SVID/JWT-SVID verification middleware
(Phase 2); and add the Keycloak token verification path. You provision the services +
variables; we wire the remaining code, contract-first.

## Deliverables to return

1. The Railway variable values Pollek Cloud needs (as secrets), per the contract
   above — delivered securely, not in the repo.
2. A short runbook: what you provisioned, endpoints, the SPIRE trust domain + SAN
   scheme, rotation procedure for KMS keys, and the SPIRE topology decision (once
   agreed with the DEK team).
3. Confirmation of the acceptance criteria for Tasks A–D, including the two-tenant
   isolation test result (then delete the test tenants).
