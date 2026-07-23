# Pollek Cloud → DEK/LCP — Alignment Design & Roadmap

**From:** Pollek Cloud team · **To:** DEK/LCP (Rust enforcement) team
**Status:** shareable v1.0 · **Date:** July 2026
**Purpose:** confirm one shared direction between the SaaS control plane (Pollek Cloud) and the local enforcement platform (DEK/SEK/LCP), so both sides build to the same contracts. This is the Cloud-side counterpart to your `POLLEK_FORWARD_ROADMAP_FROM_ORIGINAL_VISION.md`.

> Written to be honest: "**Available now**" = already in `main` and testable today; "**Committed (Phase N)**" = we will build it and it is not there yet; "**Needs your input**" = a joint decision we should lock before coding.

---

## 1. Shared north star & responsibility split

**North star (adopted from your roadmap):** Pollek is *the fleet policy control plane and trust spine for AI agents* — vendor-neutral, treating OpenShell, eBPF, Envoy/ext_authz, MCP-proxy, and the DEK's own PEPs as interchangeable enforcement backends, unified by **one Trust Policy Gate, one SPIFFE identity fabric, one signed-bundle supply chain.** *"OpenShell secures the agent — Pollek governs the fleet."*

**Two non-negotiable principles we both enforce:**
1. *Runtime trusts evidence, not location* — a bundle activates only after the full Trust Policy Gate (signature + provenance + SBOM + test-pass attestation + signer allowlist + revocation + generation monotonicity + tenant/target match). The registry is storage, not root of trust.
2. *Compiler never holds signing keys* — hermetic compile; signing out-of-band via HSM/KMS with 2-person approval.

**Responsibility split (so we don't build the same thing twice):**

| Concern | Owner | Notes |
|---|---|---|
| Runtime policy **decisioning** (PDP: Cedar/OPA-WASM/OpenFGA) | **DEK/LCP** | You already run the multi-PDP. **The Cloud is NOT a runtime PDP.** |
| Local **Trust Policy Gate** (activation choke point) | **DEK/LCP** (`dek-trust-gate`) | Cloud must *emit* everything the gate verifies. |
| OS/MCP/A2A/Envoy **PEP enforcement** | **DEK/LCP** | Cloud models coverage + ingests events. |
| Workload identity **SVID issuance / renewal** | **DEK/LCP + SPIRE** | Cloud is the *relying party* (verifies, requires mTLS). |
| Policy **authoring, compilation, versioning, distribution** | **Cloud** | NL → Policy IR → targets; signed bundles + Contract Hub. |
| **Trust spine emission** (provenance/SBOM/attestation/signing/allowlist/revocation) | **Cloud** | Feeds your gate. |
| **Fleet orchestration** (desired-state, version-skew, drift, Relay) | **Cloud** | "Newest bundle you can run" per node. |
| **Identity relying-party** (mTLS termination, JWT-SVID acceptance, trust-bundle distribution) | **Cloud** | The explicit blocker in your Phase B. |
| **Evidence, audit, compliance, dashboards** | **Cloud** | Trust & Provenance, Fleet, Cost/Token, Observe. |
| **Kill-switch orchestration** (push/relay/air-gap, signed unlock) | **Cloud dispatch + DEK enforce** | Shared. |
| **Telemetry / observe** (normalized events, cost/token, correlation) | **Cloud** ingests; **DEK** emits | `telemetry-envelope.v1` today. |

---

## 2. Reconciled decisions (please confirm)

1. **Cloud stays a Node.js SaaS control plane.** Your Rust move (Wasmtime/SQLite/70+ crates) is correct for the enforcement kernel; the Cloud is a different concern and will not be rewritten in Rust. No cross-language coupling beyond the wire contracts below.
2. **Primary integration model = pull + Contract Hub + desired-state reconcile, hardened by the Trust Policy Gate.** The earlier webhook-push hot-reload lanes (DEK/SEK v0.4.0 guide: config/PII/NER) remain a **supported secondary mechanism**; all artifact types (policy, definitions, config, signature) converge under one activation gate (your gap #8).
3. **The Cloud is not the PDP.** Cloud focuses on trust spine, identity relying-party, fleet, authoring/distribution, evidence.
4. **Enforcement modes** are shared vocabulary: `SHADOW → MONITOR → ADVISORY → ENFORCE → Kill-Switch`.

---

## 3. Integration seams (the wire between us)

```
                 ┌─────────────────────────── Pollek Cloud (SaaS) ───────────────────────────┐
   enroll  ─────▶│ /enroll  → node registry + per-node secret + (future) SVID relying-party   │
   pull    ◀────▶│ Contract Hub  /.well-known/pollek-contract  + desired-state (Etag/revision) │
   bundles ◀─────│ bundles/latest + manifest + artifact + (future) provenance/SBOM/attestation │
   telemetry ───▶│ /v1/telemetry/* (telemetry-envelope.v1)  → Observe + Cost/Token + evidence  │
   dispatch ◀────│ config/hot-reload dispatch + (future) kill-switch (signed)                  │
   identity ◀───▶│ (future) mTLS client-cert required + JWT-SVID accepted + trust-bundle dist   │
                 └────────────────────────────────────────────────────────────────────────────┘
        DEK/SEK/LCP (Rust): trust-gate · multi-PDP · PEPs · SVID · spool · hot-reload lanes
```

---

## 4. Available now (build against these today)

All of this is in `main`, boots empty, and is populated only through real gated flows (`docs/HANDOFF_LCP_SYNC.md`, verifiable with `npm run smoke:sync <url>`):

- **Enroll / node registration:** `POST /enroll` (registers the LCP into the fleet; returns tenant/device/spiffe ids + join token).
- **Contract Hub discovery:** `GET /.well-known/pollek-contract` (contract `2026.07.13`), OpenAPI at `/contracts/openapi.json`, dependency-light JS SDK.
- **Telemetry ingest (durable, idempotent, secret-quarantining):** `POST /v1/telemetry/batches` + split family; `telemetry-envelope.v1`; dedup by `tenant_id`+`event_id`; `telemetry-ingest-response.v1` counts; `GET /api/telemetry/ingest-status`.
- **Observe read views:** observations, enforcement-status, resources/tools/identities, decision-logs, `logs/*`, guard-events, export (json/csv).
- **Cost & Token reporting:** per device/user/agent/tenant/model/provider + time ranges + CSV/JSON (`/api/reports/cost-tokens*`).
- **Registry/entity sync:** `POST /api/entities/ingest`, `POST /v1/tenants/{t}/registry/sync`; deduped entity + relationship model; derived fleet tree.
- **Policy bundles:** `bundles/latest`, `/policy-bundles/{id}/manifest`, `/artifact`, **ed25519 sign/verify** + signing ledger; compliance-bundle deploy; rollout-plan records.
- **Cloud→LCP dispatch:** config + hot-reload dispatch (real HTTP; honest `partially_applied`).
- **Usage ledgers:** `POST /v1/tenants/{t}/lcp/usage-ledgers` (rejected from an unregistered LCP — gate enforced).

**Not yet (do not build against these; see Section 5):** mTLS/SVID transport, JWT-SVID acceptance, provenance/SBOM/attestation emission, signer-allowlist/revocation endpoints, desired-state revision negotiation, first-class kill-switch, SIEM forwarding, OCSF ingest.

---

## 5. Cloud delivery roadmap, mapped to your phases

Ordered to unblock you first (your roadmap orders by security leverage; ours matches).

### Cloud-Phase 1 — Trust-spine emission + Trust & Provenance (serves your Phase A)
Committed. Cloud will:
- Sign bundles **including `data.json`** (not just `policy.wasm`); emit **SLSA-style provenance** + **CycloneDX SBOM** + **test-pass attestation** alongside each `bundle_publications` record.
- Publish **signer allowlist** and **revocation list** endpoints; carry **generation/monotonicity + tenant/target** metadata in the bundle envelope.
- Distribute a real **`trust-policy.yaml`** (the `require_*` flags your `dek-trust-gate` consumes).
- Surface a **Trust & Provenance** dashboard (per-bundle gate inputs).
- Acceptance test (mirrors SRS §26): a valid bundle is accepted; tampered / wrong-tenant / revoked / downgraded / unsigned bundles are rejected.
- **This directly unblocks `dek-trust-gate` (your A1).**

### Cloud-Phase 2 — mTLS/SVID transport + JWT-SVID acceptance (serves your Phase B — your explicit blocker)
Committed. Cloud will require client certs (mTLS) on the DEK↔Cloud transport, accept **JWT-SVID as OAuth client assertion (`private_key_jwt`)**, and distribute the **SPIFFE trust bundle**; Workload Identity page shows live renewal. Until this ships, dev runs loopback auth-disabled.

### Cloud-Phase 3 — Fleet control plane (serves your Phase C)
Committed. **Desired-state / "newest bundle you can run"** via Contract Hub with **Etag/revision** negotiation; **Fleet dashboard** (version-skew, per-device trust-gate status, drift, kill-switch state); then **Enterprise Relay mode** package (runtime registry + bundle cache + desired-state mirror + audit ingestor + local kill-broker).

### Cloud-Phase 4 — Safety & operability (serves your Phase E)
Committed. First-class **emergency kill-switch** dispatch (Cloud push + Relay broadcast + air-gap lockfile; **signed unlock**; propagation tracking); **SIEM forwarding** transports (Splunk HEC / syslog / Elastic / Kafka / webhook) with immediate security-event flush + local hash-chain fallback; staged rollout + rollback slot + version pin.

### Cloud-Phase 5 — Enforcement-reach support (serves your Phase D)
Committed. Model **OpenShell as an enforcement backend** in the capability/entity model; **ingest OCSF events** into the Observe Plane; represent PEP coverage per device.

> Policy IR + NL→target authoring/compilation is Cloud-owned and lands incrementally alongside Phases 1/3 (authoring + distribution), **not** as a runtime PDP.

---

## 6. Interface commitments per phase (what you code against)

We will land each as a Contract Hub artifact (schema + OpenAPI + SDK, drift-gated) **before** you need it. Proposed shapes (final fields in Section 7 with you):

- **Phase 1:** `bundle-provenance.schema.json` (SLSA-style), CycloneDX SBOM reference in the bundle manifest, `trust-policy.schema.json` (`require_signature/provenance/sbom/test_pass_attestation/signer_allowlist/revocation/generation_monotonicity/tenant_target`), `GET /v1/trust/signer-allowlist`, `GET /v1/trust/revocations`, extended bundle envelope (`generation`, `tenant_id`, `target`, `signed_fields:["policy.wasm","data.json"]`).
- **Phase 2:** mTLS on all DEK↔Cloud endpoints; `token_endpoint` accepting `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` with a JWT-SVID; `GET /v1/trust/spiffe-bundle`.
- **Phase 3:** `GET /v1/tenants/{t}/devices/{d}/desired-state` (returns target revision + "newest allowed bundle") with `ETag`/`If-None-Match`; fleet read views.
- **Phase 4:** `POST /v1/tenants/{t}/kill-switch` (signed control envelope; `mode: deny_all|deny_high_risk`; `unlock` signed); kill-switch state in desired-state + fleet views.
- **Phase 5:** OCSF event acceptance on the telemetry ingest; `enforcement_backend: openshell|ebpf|wfp|nefilter|mcp_proxy|ext_authz` on capability records.

---

## 7. Decisions we need from you (let's lock these before coding)

1. **SVID format & claims:** X.509-SVID SAN URI scheme + JWT-SVID `aud`/`iss` you'll present, and whether the Cloud should pin a specific SPIFFE trust domain per tenant.
2. **Trust-policy authority:** who authors `trust-policy.yaml` (Cloud-distributed vs DEK-local override precedence) and the revocation-list format/refresh interval the gate expects.
3. **Provenance/SBOM level:** target SLSA level and SBOM format (CycloneDX vs SPDX) your `dek-trust-gate` will verify; whether you want cosign/Sigstore bundle verification or ed25519-only for now.
4. **Desired-state model:** the exact "newest bundle you can run" contract — do you want per-DEK contract-version constraints returned so the Cloud filters, or does the DEK filter locally from the Contract Hub?
5. **Kill-switch semantics:** propagation SLA, signed-unlock authority, and air-gap lockfile format.
6. **OCSF profile:** which OCSF classes you'll emit for OpenShell/PEP events.
7. **Relay topology:** what the Relay must cache/broker for your air-gapped/E2 mode.

---

## 8. Working agreement

- **Contract-first:** every wire change lands in `pollek-contract.json` + OpenAPI + SDK with the drift gate green before either side codes to it.
- **Versioned + backward-compatible:** contract version bumps are additive; the Contract Hub advertises supported versions so version-skew is negotiated, not broken (your `contract_adapter` #97 + our Contract Hub).
- **Boots empty, real gated ingest only:** no fabricated data on either side of the demo.
- **Acceptance tests as the definition of done:** each integration path gets an end-to-end test (Cloud extends `scripts/smoke-sync.mjs` + `test/foundation.test.mjs`; ideally you mirror with a DEK↔Cloud integration test). Trust-gate red-team vectors (SRS §26) are shared acceptance criteria.
- **Cadence:** Cloud ships Phase 1 first (unblocks `dek-trust-gate`); Phase 2 (mTLS/SVID) next since it blocks your Phase B.

---

## Appendix — terminology & current endpoint catalog

- **Ecosystem:** Cloud = **Pollek Cloud** (this repo, Node SaaS). Local enforcement = **DEK/SEK** (Desktop/Server Enforcement Kernel, Rust) / **LCP** (Local Control Plane). Same product family.
- **References:** `docs/SYSTEM_DEVELOPMENT_DIRECTION.md` (full internal analysis + gap matrix), `docs/HANDOFF_LCP_SYNC.md` (how to sync real data), `scripts/smoke-sync.mjs` (end-to-end proof). Live contract: `GET /.well-known/pollek-contract`.
- **Current base URL (staging):** the Railway deployment provided by the Cloud team; discover endpoints from the contract rather than hardcoding.
