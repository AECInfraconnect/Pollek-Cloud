# ADR 0001 — SPIRE topology for trust domain `spiffe://pollek.io`

- **Status:** Proposed (awaiting ratification by Cloud + DEK owners)
- **Date:** 2026-07-24
- **Deciders:** Pollek Cloud owner, DEK/LCP owner
- **Scope:** This ADR proposes a decision; it does not provision anything. No SPIRE service
  is deployed and `POLLEK_MTLS_MODE` stays `off` until this is ratified and the completion
  runbook in `docs/RAILWAY_INFRA_ACCEPTANCE_2026-07-23.md` is executed.

## Context

Phase B (mTLS / X.509-SVID / JWT-SVID) is blocked on a single cross-team decision: **who owns
the SPIRE root for `spiffe://pollek.io`, and how is the signing key custodied.** The facts,
from the accepted infrastructure record:

- The required trust-domain identifier is `spiffe://pollek.io` (an identity label, not a URL).
  SVIDs take the form `spiffe://pollek.io/tenant/<tenant_id>/device/<device_id>[/agent/<id>]`.
- Cosmian KMS is provisioned on Railway (private networking, bearer-protected, four Ed25519
  signing roles, detached sign/verify accepted, backed up).
- **SPIRE 1.15.2 has no first-party Cosmian or generic KMIP KeyManager/UpstreamAuthority
  plugin.** Built-in server KeyManagers are AWS KMS, disk, HashiCorp Vault, and memory.
- Deploying SPIRE with a **disk** key and calling it "Cosmian-backed" would be false and fails
  the hand-off security requirement. The Cloud principle is "the signer never holds private
  keys on disk."
- The DEK/LCP side already runs `dek-spire-node` (join-token attestation, X.509-SVID issue +
  renew, JWT-SVID fetch) in its own workstream.

## Decision drivers

- Trust-domain ownership must be unambiguous (one root of trust for `pollek.io`).
- Signing keys must stay in an audited HSM/KMS, not on disk.
- Air-gap / Enterprise-Relay support (per the DEK alignment) needs a distributable trust bundle.
- Minimize third-party, unsupported plugin risk (any external SPIRE plugin needs review,
  pinned checksum, reproducible build, upgrade plan).
- HA, datastore (PostgreSQL), backups, join-token lifecycle, registration ownership, CA
  rotation, and disaster recovery must all have a named operator.

## Options

### Option 1 — Railway SPIRE is the `pollek.io` root, with an audited Cosmian/KMIP plugin

Railway hosts the authoritative SPIRE server for `pollek.io`. Its Upstream signing key lives
in Cosmian via an **external** UpstreamAuthority/KeyManager plugin (KMIP or a purpose-built
Cosmian plugin).

- **Pros:** single root the Cloud operates; keys in Cosmian (matches the on-disk-key
  prohibition); trust bundle published directly from the Cloud side.
- **Cons:** depends on a non-first-party SPIRE plugin — requires threat review, pinned binary
  checksum, reproducible build, and an upgrade plan; Cloud team must operate SPIRE HA + its
  PostgreSQL datastore + CA rotation; the DEK's existing `dek-spire-node` must attest into
  this root (join-token lifecycle owned by Cloud).

### Option 2 — DEK SPIRE is upstream; Railway is nested / federated

The existing DEK SPIRE deployment is the upstream authority for `pollek.io`. Railway runs a
**nested** SPIRE server (downstream) or the two **federate** with explicit bundle exchange.

- **Pros:** reuses the DEK team's already-built SPIRE + its key custody; Cloud does not operate
  the root CA; clear separation of the enforcement plane's identity source.
- **Cons:** cross-team trust-bundle distribution + refresh must be defined and monitored;
  trust-domain ownership sits with the DEK team (Cloud is a relying party + optional nested
  intermediate); federation/nesting adds operational moving parts.

## Recommendation (for discussion, not yet decided)

Lean **Option 2 (DEK upstream, Railway nested/federated)** for the first GA:

- The DEK team already operates `dek-spire-node` and owns the enforcement plane's identity;
  making them the trust-domain authority avoids standing up a second, plugin-dependent root.
- It sidesteps the unsupported-plugin risk in the near term. Cloud consumes the trust bundle
  as a relying party (the Cloud app already serves `GET /v1/trust/spiffe-bundle` from a
  configured bundle and enforces the SAN scheme + tenant match).
- Revisit Option 1 later if the Cloud must issue identities independently (e.g. fully
  Cloud-operated enrollment without a DEK SPIRE reachable).

This is a recommendation only. Ratify jointly before any provisioning.

## Consequences / what ratification must nail down

Regardless of option, the ratified ADR must specify:

- trust-domain owner and root operator;
- SPIRE datastore (PostgreSQL), HA topology, and backup/restore with measured RPO/RTO;
- key custody (Cosmian/KMIP) and the plugin review + provenance plan if Option 1;
- bundle distribution + refresh mechanism and how the Cloud's
  `SPIRE_TRUST_BUNDLE` / `SPIRE_TRUST_BUNDLE_PATH` are populated (they stay unset until then);
- join-token lifecycle and registration-entry ownership;
- CA/signing-key rotation with overlap windows (see the KMS rotation runbook);
- disaster-recovery ownership and drill cadence.

Only after this ADR is `Accepted` do the completion-runbook steps (deploy SPIRE → publish
bundle → set Cloud SPIRE vars → create Keycloak `dek-lcp` → deploy mTLS ingress → move
`POLLEK_MTLS_MODE` off → monitor → enforce) begin.
