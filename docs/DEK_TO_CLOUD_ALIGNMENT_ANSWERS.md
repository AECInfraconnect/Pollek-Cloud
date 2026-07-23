# DEK/LCP → Pollek Cloud — Answers to the 7 Alignment Decisions

**From:** DEK/LCP (Rust enforcement) team · **To:** Pollek Cloud team
**Re:** `CLOUD_TO_DEK_LCP_ALIGNMENT.md` v1.0 (July 2026) §7
**Status:** decisions locked from the DEK side, grounded in what's already in `main`.

First — **we agree with the whole alignment doc.** The north star, the two
non-negotiable principles, the responsibility split (§1), the reconciled decisions
(§2: Cloud stays Node SaaS, pull+Contract-Hub+desired-state primary with webhook-push
as supported secondary, Cloud-is-not-the-PDP, shared `SHADOW→MONITOR→ADVISORY→ENFORCE→
Kill-Switch` vocabulary), the seams (§3), and your phase ordering (Cloud-Phase-1 trust
spine first to unblock our `dek-trust-gate`, then mTLS/SVID) all match our roadmap.
Cadence confirmed: **ship Cloud-Phase-1 first.**

Below, each answer states the decision, then what already exists on our side so you can
build the relying-party against something concrete.

---

## 1. SVID format & claims

**Decision:**
- **X.509-SVID SAN URI scheme:** `spiffe://<trust_domain>/tenant/<tenant_id>/device/<device_id>`,
  and for a specific agent workload `.../device/<device_id>/agent/<agent_id>`.
- **One SPIFFE trust domain per Cloud deployment** (default `spiffe://pollek.io`), **not
  per-tenant.** Tenant lives in the SVID *path*, not the trust domain. Rationale: a
  SPIFFE trust domain is one cryptographic trust root; per-tenant trust domains would
  force per-tenant CAs and a much heavier relying-party. Cloud pins the single trust
  domain and **authorizes by asserting the `tenant/<id>` path segment equals the enrolled
  tenant** for that mTLS/JWT identity. (If a customer ever demands hard crypto isolation,
  we revisit per-tenant domains then — not now.)
- **JWT-SVID claims** (used as OAuth `private_key_jwt` client assertion):
  `iss` = `sub` = the device SPIFFE ID; `aud` = the Cloud **token endpoint URL**;
  plus `exp` (≤5 min), `iat`, `jti` (replay defense). Signed with the SVID key; Cloud
  verifies against the SPIFFE trust bundle.

**Already in `main` (so you can test today):** `dek-spire-node` issues real X.509-SVIDs
via join-token attestation and can present JWT-SVIDs. Current default trust domain in
code is `spiffe://pollek.local` (dev). **We will standardize the default to
`spiffe://pollek.io` and adopt the `tenant/<id>/device/<id>` path** as part of Phase B
so it matches your relying-party. `describe_svid()` already parses the SPIFFE ID from the
URI SAN, and the Workload Identity page (LCP `/v1/tenants/:tenant/identity`, shipped #98)
surfaces SPIFFE ID + expiry + mTLS-readiness.

---

## 2. Trust-policy authority

**Decision:**
- **Cloud authors and distributes `trust-policy.yaml`; the DEK may only make it
  *stricter*, never weaker.** Effective policy = `max(cloud, local)` on every
  `require_*` flag. A compromised or spoofed Cloud push therefore cannot *lower* the gate
  — this is the "runtime trusts evidence, not location" principle applied to the policy
  itself. Local override is opt-in, additive-strictness only, and its provenance is
  audited.
- **Revocation-list format:** a **signed JSON document** verified by the *same
  chain-of-trust* we already use for key rotation (must be signed by a currently-trusted
  key — see §keys below). Shape:
  `{ "revocation_epoch": <u64 monotonic>, "revoked_key_ids": [...],
     "revoked_bundle_digests": [...], "revoked_revisions": [...],
     "issued_at": <unix>, "signatures": [{keyid,sig}] }`.
  Monotonic `revocation_epoch` prevents replay of an older (shorter) list.
- **Refresh interval / staleness:** DEK pulls the revocation list every sync cycle;
  target refresh **≤ 5 min**. The gate treats revocation data older than a configurable
  **max-staleness (default 1 h)** as **fail-closed for new activations** (existing
  activations keep running; new/changed bundles are quarantined until fresh revocation
  data returns). Deny-list semantics only.

**Already in `main`:** `dek-bundle-sync::keys::TrustedKeySet` already models revocation
via `KeyStatus::Revoked` and merges rotation only when the payload is signed by an
already-trusted key (`dek-policy-syncer::keys::fetch_and_merge` — the rogue-key-injection
guard). The revocation list rides the same rail.

---

## 3. Provenance / SBOM level

**Decision:**
- **SLSA target: Build L3** as the goal (hermetic build, non-falsifiable provenance
  signed by the builder identity, not the release signer). **We will *accept* L2
  initially** (provenance present + signed + builder id + source/commit + materials) and
  tighten the `require_*` to L3 once your build path emits it. The gate reads a
  **SLSA-style provenance** object.
- **SBOM format: CycloneDX (JSON) first** — matches your stated default. We verify the
  SBOM is present, non-empty, and its embedded digest matches the computed digest. SPDX
  acceptance can be added later behind a flag; don't block Phase 1 on it.
- **Signature scheme: ed25519-only for now.** It matches the shipped
  `dek-bundle-sync::keys` verifier (TUF-style detached `signatures[]` with `keyid`,
  `verify_strict`). **cosign/Sigstore verification is additive (our Phase A3)** for
  runtime + update packages — please *don't* gate Cloud-Phase-1 on Sigstore; ship
  ed25519 detached signatures and we integrate cosign in parallel.
- **Critical:** sign the **whole signed content including `data.json`**, not just
  `policy.wasm` — provenance/SBOM/attestation must live *inside* the signed bytes so
  tampering breaks the signature. (You already committed to this in §5 Cloud-Phase-1 —
  confirming it's exactly right.)

---

## 4. Desired-state model ("newest bundle you can run")

**Decision: both sides filter, DEK is authoritative.**
- **Cloud returns**, per device, `target_revision` + a small **candidate list** where
  each candidate carries its compatibility constraints (`min_dek_version`,
  `required_pep_types`, `required_os_modules`, contract-version range). This lets Cloud
  pre-filter and drive the Fleet view.
- **The DEK makes the final choice locally and authoritatively** using its own
  `DekContract` self-report through `evaluate_compatibility` / the `contract_adapter`
  (#95/#97): it picks the newest candidate it can *actually* run. This keeps the DEK
  correct offline / air-gapped and immune to a stale Cloud view. Cloud's filter is an
  optimization + visibility layer, not the source of truth.
- **Transport:** `GET /v1/tenants/{t}/devices/{d}/desired-state` with `ETag` /
  `If-None-Match` (your Phase-3 shape is exactly what we want). `304` = no change =
  cheap poll.

**Already in `main`:** Contract Hub version negotiation (`contract_api`, #95),
`DekContract` self-report + `evaluate_compatibility` (compatible / needs_upgrade /
unsupported), and the WASM `contract_adapter` for version-skew (#97). We plug your
desired-state response straight into these.

---

## 5. Kill-switch semantics

**Decision:**
- **Propagation SLA:** connected push / Relay LAN broadcast **target < 1 s**; air-gap =
  next sync **or** manual signed-lockfile import. Propagation tracked and reported back
  as telemetry.
- **Modes: deny-only** — `deny_all` or `deny_high_risk`. A kill-switch can **never**
  *allow* anything (SRS invariant). This composes with the existing PEP fail-closed gate
  (`dek-policy-syncer::gate` already denies on stale/absent status).
- **Signed control envelope:**
  `{ mode, scope, issued_at, expiry, nonce, revocation_epoch, signatures:[{keyid,sig}] }`.
  **Lock** may be single-authority + signed. **Unlock requires dual-control** (≥2 distinct
  authorized kill-switch signer keys) — same 2-person rule as the emergency bundle. This
  prevents a single compromised key from silently disabling enforcement.
- **Air-gap lockfile:** the same signed envelope written to
  `$DEK_LCP_DATA/killswitch/lock.json`; the enforcement loop reads it fail-closed on every
  cycle. Purpose-scoped, TTL-bound.

---

## 6. OCSF profile (OpenShell / PEP events)

**Decision — classes we'll emit** (mapped to OCSF 1.x categories):
- **Process Activity (1007)** — agent/tool process start/stop, exec.
- **Network Activity (4001)** — egress/connection attempts a PEP saw.
- **File System Activity (1001)** — file access a PEP mediated.
- **Detection Finding (2004)** — **policy denials / guard violations** (the core
  enforcement signal), with severity + policy revision + reason.
- **Authentication (3002)** — identity / SVID / token events.
- Plus a small **Pollek OCSF extension** carrying `policy_decision`,
  `agent_id`/lineage, `bundle_revision`, and `enforcement_mode`, since OCSF's
  agent/AI-policy classes are still stabilizing. When OCSF finalizes an AI-agent class we
  migrate the extension onto it.

Server-side/DEK-emitted events are authoritative for RCA/compliance; edge/Wasm signals
stay advisory (matches your §8.3 stance and ours).

---

## 7. Relay topology (air-gap / Enterprise-E2)

**Decision — the Relay is a caching, store-and-forward mirror of the trust spine +
desired-state + a kill-broker, and it holds NO signing keys** (keys stay in Cloud HSM).
It must cache/broker:
- **Bundle cache:** full signed bundles *with* provenance + SBOM + attestation +
  detached `signatures[]` — i.e. the complete `dek-trust-gate` inputs, so air-gapped DEKs
  verify entirely locally.
- **Trust-material mirror:** signer allowlist, revocation list, SPIFFE trust bundle,
  `trust-policy.yaml`, and `/v1/keys` rotation payloads (all still Cloud-signed; the Relay
  just relays them).
- **Desired-state mirror:** per-device `target_revision` + `ETag`.
- **Telemetry ingestor + spool:** accepts `telemetry-envelope.v1` from local DEKs,
  retains the local hash-chain, and store-and-forwards upstream when the link returns.
- **Local kill-broker:** receives the signed kill-switch envelope and LAN-broadcasts it
  to DEKs (<1 s); holds the air-gap lockfile.
- **Enroll / join-token broker:** hands out pre-provisioned join tokens for local
  attestation when Cloud is unreachable.

This maps to your Cloud-Phase-3 "Enterprise Relay mode" package (runtime registry +
bundle cache + desired-state mirror + audit ingestor + local kill-broker) — we're
aligned; the Relay is a *mirror + broker*, never a second root of trust.

---

## Working agreement — confirmed
Contract-first (every wire change in `pollek-contract.json` + OpenAPI + SDK, drift gate
green before either side codes); additive/back-compatible version bumps negotiated via
Contract Hub (`contract_adapter` #97 ⇄ your Hub); boots-empty/real-gated-ingest-only; and
**the SRS §26 trust-gate red-team vectors (unsigned / invalid-sig / poisoned-data /
wrong-tenant / revoked / downgrade / compiler-digest-mismatch) are shared acceptance
criteria** — we'll mirror your `smoke-sync.mjs` with a DEK↔Cloud integration test.

**Next on our side:** building `dek-trust-gate` (our Phase A1) now, shaped to exactly
these contracts, so the moment your Cloud-Phase-1 emits provenance/SBOM/attestation +
signer-allowlist + revocation + `trust-policy.yaml`, the gate consumes them unchanged.
