# Pollek Cloud — System Development Direction

**Status:** working draft v0.2 (DEK/LCP roadmap aligned) · **Owner:** Cloud team · **Date:** July 2026
**Purpose:** a single, honest reference that (A) captures the original design idea from the founding documents, (B) adds deep research against current real-world standards, (C) states what the current system actually is, (D) analyzes the gap, and (E) proposes a phased development direction that also lands the DEK/LCP integration roadmap.

> This document is written to be truthful about scope. Where the current system does **not** yet implement something in the original vision, it says so plainly. It is a map for building forward in the right direction — not a claim that the vision is already built.

---

## 0. How to use this document

- Product/architecture: read Part A → B → D → E.
- Cloud engineers: read Part C → D → E (Part E is the buildable plan).
- DEK/LCP integration: read Part F (the concrete Cloud↔DEK contract) — this is the near-term alignment surface.
- **Part F alignment with the *new* DEK/LCP roadmap is intentionally left open** and will be completed when that roadmap document arrives.

---

## Part A — The original idea (synthesis of the founding documents)

Five founding documents were provided. Together they describe one coherent product told at three altitudes:

**A1. `AI Agent Control & Observe Architecture Spec` (15 Apr 2026) — the architectural keystone.**
A compact **control-and-observe layer for agentic runtimes** (Claude/Claude-Code-like agents, desktop/CLI agents, MCP assistants). Core decisions:
- **Dual-plane architecture:** a **Control Plane** (policy authoring, compilation, distribution, identity/trust, session admission, enforcement orchestration) and an **Observe Plane** (telemetry ingest, normalization, trace correlation, replay, risk analytics, evidence) — *logically separate bounded contexts, one unified console, shared trace IDs and object vocabulary.*
- **Canonical Policy IR** as the keystone: natural language → **Policy IR** (validated, explainable) → target policies for **Rego (OPA), Cedar, OpenFGA**. Two-stage, never one-shot NL→target.
- **Risk-tiered decisions**, not binary allow/deny: `allow | allow-with-redaction | ask-user | ask-admin | simulate | block | quarantine`, plus **obligations** (redact/mask/notify/require-reason).
- **Enforcement at action boundaries** (bootstrap, session, tool call, data access, memory, egress, config change) — not just at the prompt.
- **Evidence-grade normalized events** (`session.*`, `decision.*`, `approval.*`, `tool.*`, `mcp.*`, `file.*`, `memory.*`, `network.*`, `config.*`, `security.*`, `evidence.*`) with a shared envelope (`event_id`, `trace_id`, `tenant_id`, `policy_version_refs`, `risk_score`, `payload`, integrity).
- **Declared degradation by policy class:** enforcement must keep working (fail-closed for destructive/exfil, fail-safe-degraded for low-risk) even if observe/analytics lag.

**A2. `Enterprise AI Policy Engine — Enhanced SRS (Implementation Reality Edition) v3.0`.**
The productized platform with five engineered "reality" mitigations: **Unified Diagnostic Control Plane** ("Explain My Deny" + `x-correlation-id` everywhere), **Semantic Translation & Blast-Radius Simulation** for AI-generated policy, **Edge caching + local PDP sidecars** for ≤20ms P50, **Risk-based auto-approval + escalation** to fight approval fatigue, and **context-aware header injection + adapter SDKs** for legacy. Stack named: React 19 portal, Node 22/Express microservices, Drizzle + PostgreSQL 16 (RLS), Redis/Valkey, Cedar (HTTP) + OPA (sidecar), Istio/k8s, OpenTelemetry.

**A3. `Enterprise AI Policy Engine SRS v2.8 — DB Physical Schema / Migration`.**
The canonical data model and contracts: **Trust Profiles TP-01..TP-05**, auto-discovery lifecycle (discovered → active → retired, soft-deprecation), OpenAPI + JSON-RPC contracts, an **Event Catalog**, field-level data dictionary, enum catalogs, and a **physical schema** of ~20 canonical tables (`registry_entities`, `registry_entity_bindings`, `trust_profiles`, `credentials_vc_records`, `policy_definitions`, `policy_versions`, `policy_semantic_diffs`, `policy_blast_radius_reports`, `bundle_publications`, `pep_targets`, `pep_deployments`, `discovery_sources`, `discovery_observations`, `break_glass_requests`, `ephemeral_token_grants`, `decision_logs`, `security_findings`, `release_evidence`, …) with RLS, retention, and migration gates.

**A4. `Pollen Cloud: DEK/SEK Hot Reload Integration Guide v1.0` (DEK/SEK v0.4.0).**
The concrete **Cloud ↔ local enforcement** contract. DEK/SEK (Desktop/Server Enforcement Kernel) already implements the receiver side (marked ✅ done). The Cloud must provide: a **webhook dispatcher** with **HMAC-SHA256 signing** (`X-Pollen-Signature`, `X-Pollen-Timestamp`, `X-Pollen-Event-Id`, 5-min replay window), **asset download endpoints** (config / WASM policy bundle / PII policy / PII patterns / NER ONNX model / binary), **webhook management**, **hot-reload status/history**, **telemetry ingest** for `hot_reload` and `pii_detected` audit events (batched, no raw PII), **asset version history + rollback**, retry with backoff, and a **pending-updates polling** fallback. Events: `ConfigUpdate`, `PolicyUpdate`, `PiiPolicyUpdated`, `PiiPatternsUpdated`, `PiiNerModelUpdated`, `GithubRelease`.

**A5. `Pollen — Strategic Positioning Report`.**
Market thesis: Pollen/Pollek is the **Business Policy Control Plane (Layer 4)** sitting above runtime-security layers and model registries, differentiating on multi-PDP + natural-language policy + compliance (PDPA/GDPR/HIPAA/SOC2) + audit + SaaS. *Note: this doc's specific competitor/product claims (named runtimes, CVEs, launch events) are treated here as company positioning, not verified external fact.*

**The through-line:** a tenant-scoped, evidence-first **Control + Observe** platform that turns human-readable policy into portable enforcement across many local enforcement kits (DEK/SEK/LCP), governs AI agents/MCP/tools at action boundaries, and produces compliance-grade evidence.

---

## Part B — Deep research: what current real-world standards require

Grounding the vision in stable, external standards (not the speculative market claims):

- **Authorization engines are real and complementary — use each where it fits (as A1 says).** OPA/Rego for rich context + obligations; AWS **Cedar** for readable principal-action-resource ABAC/RBAC with a schema; **OpenFGA** (Zanzibar-style) for relationship/graph checks. None alone covers obligations + relationships + rich context, which validates the **Policy IR + multi-target compiler + orchestration wrapper** approach rather than betting on one engine.
- **Identity: OAuth 2.1 + RFC 8693 Token Exchange + SPIFFE/SPIRE** are the right primitives for TP-01..TP-05. Sender-constrained/audience-bound tokens and short-lived SVIDs are now expected for machine identity.
- **MCP security has firmed up and must be a first-class target.** The MCP spec now classifies MCP servers as **OAuth 2.1 Resource Servers**, mandates PKCE (S256) for internet-exposed servers, and requires **Resource Indicators (RFC 8707 / 8707-compliant)** to prevent token mis-redemption. A release candidate is dated 2026-07-28. → The MCP Gateway/trust model in A1/A3 aligns with where the ecosystem is going; build to the RS + resource-indicator model. ([MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Auth0 MCP auth update](https://auth0.com/blog/mcp-specs-update-all-about-auth/))
- **Telemetry should converge on the OpenTelemetry GenAI semantic conventions.** As of 2026 they cover GenAI + MCP spans/metrics/events (`gen_ai.client.operation.duration`, `gen_ai.client.token.usage`, `create_agent`/`invoke_agent`/`execute_tool`) but are still pre-1.0/Development. → Keep our `telemetry-envelope.v1` as the transport, but **map its fields to OTel GenAI names** so the Observe Plane is standards-aligned and export-ready without a rewrite. ([OTel GenAI semconv repo](https://github.com/open-telemetry/semantic-conventions-genai), [MLflow GenAI semconv](https://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv/))
- **Compliance clocks are real and create buyer pull.** EU AI Act **GPAI obligations applied 2 Aug 2025**; the Commission's **supervision/enforcement powers start 2 Aug 2026**; pre-existing GPAI models must comply by **2 Aug 2027**. Combined with Thailand PDPA, this makes **immutable audit + evidence export + policy-version provenance** a near-term requirement, not a nice-to-have. ([EU AI Act enforcement of Chapter V](https://artificialintelligenceact.eu/enforcement-of-chapter-v-under-the-eu-ai-act/), [implementation timeline](https://artificialintelligenceact.eu/implementation-timeline/))
- **Agentic threat models (OWASP GenAI/MCP Top 10, MITRE ATLAS, NIST AI RMF)** confirm A1's control points: prompt/indirect injection, tool abuse, MCP trust abuse, covert egress, memory poisoning, config tampering. → Enforcement must attach to **action boundaries** and observability must capture **pre-decision context + rationale + outcome**.

**Research takeaways for our direction:**
1. The **Policy IR + multi-target** decision is well-founded; do not shortcut it.
2. Make the Observe Plane **OTel-GenAI-mappable** now (cheap later insurance).
3. Treat **MCP as an OAuth Resource Server** with resource indicators.
4. **Evidence/audit + version provenance** is the fastest path to real enterprise value given the compliance clock.
5. **Local enforcement + hot reload (DEK/SEK/LCP)** is the deployable enforcement surface today — prioritize that contract over a from-scratch central PDP.

---

## Part C — What the current system actually is (honest baseline)

Pollek Cloud today (`apps/api/server.mjs`, ~8.5k lines) is a **dependency-light Node.js reference/aggregator**, not the microservice platform in A2/A3. Concretely:

**Implemented and real:**
- **Observe Plane slice:** durable, idempotent, secret-quarantining telemetry ingest (`telemetry-envelope.v1`), LCP-parity read views, cost/token reporting by device/user/agent/tenant/model/provider with time ranges, `ingest-status`.
- **Entity/registry model:** dedup/merge `localEntities` + relationships; registry sync + entity ingest; derived fleet tree.
- **Thin Control Plane coordination:** LCP enroll → fleet registration; policy **bundle** endpoints (latest, manifest, artifact, ed25519 sign/verify); **hot-reload/config dispatch** to a live LCP (real HTTP, honest `partially_applied`); ReBAC-lite `authorization_tuples` + `checkAuthorization`; compliance-bundle deploy; break-glass; rollout plan records.
- **IAM/billing scaffolding:** tenant signup, members/roles, IdP config, usage ledgers, invoice preview, KMS health.
- **Boots empty** — no fabricated data; populated only through real gated flows (see `HANDOFF_LCP_SYNC.md`). Persists to a JSON snapshot.

**Not yet implemented (vs the vision) — stated plainly:**
- **No real PDP.** No embedded OPA/Cedar/OpenFGA evaluation; `checkAuthorization` is a tuple-match, not a policy engine. No `/pdp/evaluate` decision path with obligations/risk tiers.
- **No Policy IR and no compiler.** No NL→IR→Rego/Cedar/OpenFGA pipeline, no semantic diff, no blast-radius simulation (A2/A3 core features).
- **No identity/trust runtime.** No SPIFFE/SPIRE issuance, no OAuth/OIDC enforcement on ingest (auth is "planned"; loopback dev is open), no RFC 8693 STS/token exchange, no VC/credential records.
- **No DEK/SEK hot-reload pipeline per A4.** No HMAC-signed webhook dispatcher, no asset download endpoints (config/policy/PII policy/PII patterns/NER model/binary), no `hot_reload`/`pii_detected` telemetry handling, no asset version history/rollback store, no pending-updates polling.
- **No production datastore.** PostgreSQL/Drizzle migrations exist in `packages/db` but the runtime uses in-memory + file snapshot; no RLS enforcement at runtime.
- **Console is static HTML/JS**, not the React 19 portal; no Redis, no service mesh, no microservice split.
- **No MCP Gateway / PEP orchestrator / discovery connectors** as runtime services.

**Honest framing:** the current system is a faithful **Observe-Plane + coordination MVP** and a good contract/reference surface. It is roughly **Phase 1** of A1's roadmap, missing the Control-Plane engine (Policy IR/PDP), the identity/trust runtime, and the DEK/SEK hot-reload pipeline.

---

## Part D — Gap analysis (original + research → current)

| Capability (from A1–A4 + Part B) | Vision | Current | Gap | Priority |
|---|---|---|---|---|
| Normalized telemetry / evidence events | dual-plane, evidence-grade | ✅ `telemetry-envelope.v1` ingest + reads | Map to OTel GenAI names; add event families (`session.*`, `approval.*`, `memory.*`) | High |
| Cost/token & usage analytics | risk/usage analytics | ✅ reports by dimension + ranges | Add risk score, approval-fatigue, anomaly views | Medium |
| Entity registry + relationships | canonical registry, lifecycle | ✅ dedup model + derived tree | Add lifecycle states (discovered→active→retired), bindings, trust profiles | High |
| **DEK/SEK hot-reload pipeline (A4)** | signed webhooks + asset dist + version/rollback | ⚠️ dispatch stub only | **Build full pipeline** (see Part F) | **Highest (near-term)** |
| Policy IR + multi-target compiler | NL→IR→Rego/Cedar/OpenFGA | ❌ none | Introduce IR + Rego-first compiler + diagnostics | High |
| PDP / decision path + obligations + risk tiers | `/pdp/evaluate`, 7 outcomes | ❌ tuple-match only | Add decision service (embedded OPA/Cedar first) | High |
| Blast-radius simulation + semantic diff | mandatory pre-deploy | ❌ none | Add replay-based simulation on ingested decisions | Medium |
| Identity/trust (OAuth2.1, RFC 8693, SPIFFE, VC) | TP-01..TP-05 | ⚠️ config only, not enforced | Enforce OAuth on ingest; add STS + SPIFFE; VC records | High |
| MCP-as-Resource-Server + resource indicators | MCP gateway/trust | ⚠️ entity model only | Model MCP servers as RS; validate resource indicators | Medium |
| Immutable audit + evidence export + provenance | 7-yr retention, signed packs | ⚠️ audit events + bundle signing | Add tamper-evident chain + evidence export packs | High (compliance clock) |
| Durable datastore (Postgres/RLS) | Drizzle + RLS | ❌ in-memory/file (migrations exist) | Wire runtime to Postgres behind a repository interface | High (before real load) |
| Portal (React 19) | full portal | ⚠️ static console | Keep static console until Control-Plane APIs stabilize; then portal | Low/Deferred |
| Diagnostic "Explain My Deny" + correlation IDs | UDCP | ⚠️ decision explain exists locally | Add `x-correlation-id` end-to-end; unified trace timeline | Medium |

---

## Part E — Proposed development direction (phased, buildable)

> **Re-prioritized by the DEK/LCP roadmap — see Part F4.** The phases below remain the buildable menu, but the *near-term order* is now driven by what the Rust DEK/LCP roadmap blocks on: **trust-spine emission + mTLS/SVID first**, and the Cloud is **not** the PDP (the DEK runs the multi-PDP). Read Part F4 for the authoritative sequence.

Design rules carried from A1 + Part B, to hold at every phase:
1. **Contract-first.** Every new capability lands as a Contract Hub artifact (schema + OpenAPI + SDK) before/with the server code; drift gate stays green.
2. **Boots empty; real gated ingest only.** No fabricated data, ever (already enforced by tests).
3. **Two-stage policy** (NL→IR→target) — never one-shot.
4. **Evidence-grade + OTel-mappable** events from day one of each new stream.
5. **Repository interface** in front of state so the in-memory/file store can be swapped for Postgres/Drizzle without touching handlers.
6. **Declared degradation** per policy class; enforcement independent of analytics.

**Phase 0 — Hardening the honest baseline (now → near-term).**
Introduce a `Store` repository interface wrapping `state.fleet.*`; keep JSON snapshot as one implementation. Add `x-correlation-id` propagation across ingest/dispatch/audit. Map `telemetry-envelope.v1` payload fields to OTel GenAI attribute names in the read views (additive). Enforce optional bearer-token auth on ingest when `POLLEK_CLOUD_REQUIRE_AUTH=1` (default off for loopback dev).

**Phase 1 — DEK/SEK hot-reload pipeline (highest near-term value; unblocks the shipped DEK/SEK v0.4.0).** See Part F for the concrete endpoint list. Deliver: signed webhook dispatcher (HMAC-SHA256 + timestamp + event-id), asset download endpoints, `asset_versions` store + rollback, webhook management + test/trigger, hot-reload status/history proxy, `hot_reload`/`pii_detected` telemetry handling, retry/backoff, pending-updates polling fallback. This is the fastest way the Cloud delivers real enforcement value because the local side is already done.

**Phase 2 — Policy IR + Rego-first decision path.** Add the canonical **Policy IR** schema (from A1 §10 / A3), a `/api/v1/policies/drafts:generate` (NL→IR with diagnostics) and `/policies/{id}/compile` (IR→Rego first; Cedar/OpenFGA as preview with lossiness warnings), and a `/pdp/evaluate` decision service returning the 7-outcome contract + obligations + `risk_score` + `matched_policies`. Start with embedded OPA/Cedar evaluation; keep decisions as first-class evidence events.

**Phase 3 — Trust/identity runtime.** OAuth 2.1 enforcement (audience-bound), RFC 8693 token exchange for delegation, SPIFFE/SPIRE workload identity for TP-01..TP-05, credential/VC records, MCP-server-as-Resource-Server with resource-indicator validation.

**Phase 4 — Evidence, simulation, analytics.** Blast-radius simulation (replay ingested decisions against a candidate policy), semantic diff, tamper-evident audit chain + signed evidence-export packs (compliance clock), risk/anomaly/approval-fatigue analytics.

**Phase 5 — Scale-out (only when load demands).** Wire the repository to PostgreSQL + Drizzle + RLS; extract latency-sensitive PDP to a sidecar/edge cache (Redis/Valkey); split services per A2; React 19 portal once Control-Plane APIs are stable.

**Sequencing rationale:** Phase 1 unblocks an already-built local kit and delivers enforcement value immediately; Phases 2–3 build the Control-Plane brain the vision is really about; Phase 4 monetizes the compliance clock; Phase 5 is deferred until real load — consistent with the current dependency-light philosophy.

---

## Part F — DEK/LCP integration alignment

### F1. Existing contract to implement now (from A4 — DEK/SEK v0.4.0, receiver side already ✅)

Cloud endpoints to build (Phase 1). All asset downloads require Bearer token; all webhooks are HMAC-SHA256 signed with a per-node secret, `X-Pollen-Timestamp` (≤5-min window), `X-Pollen-Event-Id`.

- **Webhook dispatcher + signing** for events: `ConfigUpdate`, `PolicyUpdate`, `PiiPolicyUpdated`, `PiiPatternsUpdated`, `PiiNerModelUpdated`, `GithubRelease` (payloads defined in A4 §2).
- **Asset download:** `/v1/config/download`, `/v1/policies/{bundle_id}/download`, `/v1/pii/policies/{policy_id}/download`, `/v1/pii/patterns/download`, `/v1/pii/models/{model_name}`, `/v1/releases/{version}/{binary_name}` — each with SHA-256 checksum published in the triggering webhook.
- **Webhook management:** `/v1/webhooks/register`, `GET|DELETE /v1/webhooks/{node_id}`, `/v1/webhooks/{node_id}/test`, `/v1/webhooks/{node_id}/trigger`.
- **Hot-reload status:** `/v1/nodes/{node_id}/health` (proxy), `/v1/nodes/{node_id}/hot-reload/status|history`.
- **Telemetry:** accept `hot_reload` and `pii_detected` audit events (batched, metadata-only — no raw PII) — extends our existing telemetry ingest.
- **Asset version history + rollback** (`asset_versions` table per A4 §8.1) and **pending-updates polling** `/v1/nodes/{node_id}/pending-updates` for the webhook-failure fallback.
- **Retry/backoff** (5s→30s→2m→10m→30m→1h, mark node `unreachable` after 24h) and per-node **webhook secret** issuance/rotation at enrollment.

> Mapping note: our current `/enroll` (LCP registration) and hot-reload **dispatch stub** are the seams to extend. `/enroll` should also mint the per-node webhook secret and register the node's webhook receiver URL/port (DEK 8443 / SEK 8444; health 9090/9091).

### F2. Reconciliation with the DEK/LCP forward roadmap (received)

The DEK/LCP forward roadmap (`POLLEK_FORWARD_ROADMAP_FROM_ORIGINAL_VISION.md`) is authoritative for the **enforcement side** and changes three of our earlier assumptions. Reconciled honestly:

1. **The Node "Enterprise AI Policy Engine" SRS was a *superseded prototype*.** The DEK/LCP is now a **Rust platform** (embedded Wasmtime, SQLite, 70+ `dek-*` crates) and already realises most enforcement breadth. → Our Part A2/A3 (Node/Drizzle/microservices) is the *early vision*, not the target for the enforcement kernel. **Pollek Cloud (this repo) remains the SaaS control-plane / trust-spine coordinator and stays Node — it is a different concern from the Rust enforcement kernel and does not need a rewrite.** The founding **thesis** (EAIPE — enforce across every environment, SPIFFE identity foundation, signed-bundle supply chain) still holds fully.
2. **Two non-negotiable security principles** the Cloud must serve, not just the DEK:
   - *"Runtime trusts evidence, not location"* — a bundle activates only after the **full Trust Policy Gate** (signature + provenance + SBOM + test-pass attestation + signer allowlist + revocation + generation monotonicity + tenant/target match). The registry is *storage, not root of trust*.
   - *"Compiler never holds signing keys"* — hermetic compile; signing out-of-band via HSM/KMS + 2-person approval.
3. **Integration model shifts from webhook-push toward pull + Contract Hub + Trust Gate + mTLS/SVID.** The A4 webhook-push lanes (config/PII/NER, DEK/SEK v0.4.0) and this roadmap's pull/desired-state model are **complementary, not contradictory**: A4 is the *delivery mechanism* for some artifact lanes; this roadmap says unify **all** artifact types (policy + definitions + config + signature) under **one activation/trust gate** (roadmap gap #8). The current Cloud already leans pull (`bundles/latest`, contract discovery, telemetry batch pull-push, dispatch). → **Primary model: pull + Contract Hub version negotiation + desired-state reconcile, hardened by the Trust Policy Gate; webhook-push lanes remain a supported secondary mechanism.**

**North star (adopted):** Pollek = *the fleet policy control plane and trust spine for AI agents* — a vendor-neutral orchestrator that treats OpenShell, eBPF, Envoy/ext_authz, MCP-proxy, and the DEK's own PEPs as interchangeable enforcement backends, unified by one Trust Policy Gate, one SPIFFE identity fabric, and one signed-bundle supply chain. (Market framing: "OpenShell secures the *agent* — Pollek governs the *fleet*.")

### F3. DEK/LCP phase → Cloud-side work it depends on

The DEK/LCP owns the enforcement crates; the Cloud must provide the counterpart surfaces. "Blocking" = the DEK roadmap explicitly waits on the Cloud.

| DEK/LCP phase | DEK-side (theirs) | **Cloud-side work (ours)** | Blocking? | Current Cloud state |
|---|---|---|---|---|
| **A — Trust spine** | `dek-trust-gate` single choke point; provenance/SBOM/attestation *consumption* | **Emit** signed bundles *including data.json*, SLSA provenance, CycloneDX SBOM, test-pass attestation; publish **signer allowlist + revocation list**; carry **generation/monotonicity + tenant/target** metadata; distribute `trust-policy.yaml`; **Trust & Provenance dashboard** (per-bundle gate results) | Partial-blocking (gate can verify only what Cloud emits) | ⚠️ ed25519 sign/verify + manifest/artifact + signing ledger only; no provenance/SBOM/attestation/allowlist/revocation |
| **B — Identity + transport** | mTLS via SVID; JWT-SVID as OAuth client assertion (`private_key_jwt`); SVID renewal | **Require client certs (mTLS)** on the DEK↔Cloud transport; accept **JWT-SVID as OAuth client assertion**; distribute **SPIFFE trust bundle**; Workload Identity page (live renewal) | **Blocking** ("needs the Cloud side to require client certs"; "live Cloud handshake pending Cloud side") | ❌ auth "planned", loopback open; no mTLS, no JWT-SVID acceptance |
| **C — Fleet control plane** | Etag/revision pull loop + desired-state reconcile; Relay client | **Desired-state / "newest bundle you can run" via Contract Hub** (Etag/revision negotiation); **Enterprise Relay mode** package (runtime registry + bundle cache + desired-state mirror + audit ingestor + local kill-broker); **Fleet dashboard** (version-skew, per-device trust-gate status, drift, kill-switch state) | Partial-blocking | ⚠️ `bundles/latest` + contract discovery + entity watch + cost/token exist; no revision negotiation, no Relay, no fleet-trust dashboard |
| **D — Enforcement reach** | OpenShell PEP adapter; deepen OS PEPs; Shell/File/Clipboard guards | Model **OpenShell as an enforcement backend** in the capability/entity model; **ingest OCSF events** into the Observe Plane; represent PEP coverage per device | Non-blocking (DEK-led) | ⚠️ entity/capability model exists; no OCSF ingest, no OpenShell backend type |
| **E — Safety + operability** | kill-switch client; SIEM emit; staged auto-update; red-team drills | **Emergency kill-switch dispatch** (Cloud push + Relay broadcast + air-gap lockfile; signed unlock; <1s propagation tracking); **SIEM forwarding transports** (Splunk HEC / syslog / Elastic / Kafka / webhook); **staged rollout + rollback slot + version pin** | Partial-blocking | ⚠️ hot-reload/config dispatch (real HTTP) + rollout-plan records + break-glass exist; no kill-switch semantics, no SIEM transports |

### F4. Revised Cloud priorities (supersedes Part E ordering)

Because the DEK/LCP roadmap orders by **security leverage first** and explicitly waits on the Cloud for identity/transport and trust-spine emission, the Cloud's near-term order is re-set to match:

1. **Cloud-Phase 1 = Trust-spine emission + Trust & Provenance dashboard** (serves DEK Phase A; the #1 principle). Extend the existing bundle signing: emit provenance + SBOM + attestation, sign including `data.json`, publish signer-allowlist + revocation endpoints, add generation/tenant/target metadata, distribute `trust-policy.yaml`, surface a Trust & Provenance page.
2. **Cloud-Phase 2 = mTLS/SVID transport + JWT-SVID acceptance** (serves DEK Phase B — **the explicit blocker**). Require client certs on ingest/dispatch, accept JWT-SVID (`private_key_jwt`), distribute the SPIFFE trust bundle, Workload Identity page.
3. **Cloud-Phase 3 = Fleet control plane** (serves DEK Phase C): desired-state/revision negotiation via Contract Hub, Fleet dashboard (version-skew / per-device trust-gate / drift / kill-switch), then Enterprise Relay mode package.
4. **Cloud-Phase 4 = Safety/operability** (serves DEK Phase E): first-class kill-switch dispatch + signed unlock + propagation tracking; SIEM forwarding transports; staged rollout/rollback/pin.
5. **Cloud-Phase 5 = Enforcement-reach support** (serves DEK Phase D): OpenShell-as-backend modeling + OCSF event ingest.
6. **Policy IR + PDP + Postgres scale-out** (original Part E Phases 2/5) move *later* — the Rust DEK already runs the multi-PDP (`dek-decision`/`dek-cedar`/`dek-opa-wasm`/`dek-openfga`), so the Cloud's job is **authoring + distribution + trust + fleet**, not runtime decisioning. This is a real course-correction from Part E: **the Cloud is not the PDP; the DEK is.** Cloud focuses on the trust spine, identity, fleet orchestration, authoring/compilation, and evidence.

> Net change vs Part E: the webhook hot-reload pipeline (old "Phase 1") is **demoted** to a secondary mechanism; **Trust-spine emission + mTLS/SVID become the top Cloud priorities** because the DEK roadmap blocks on them.

### F5. Concrete next deliverables + contract artifacts + tests

- **Contract Hub additions:** `trust-policy.schema.json` (require_* flags), `bundle-provenance.schema.json` (SLSA-style), `sbom` reference (CycloneDX), `signer-allowlist` + `revocation-list` endpoints, `spiffe-trust-bundle` distribution endpoint, kill-switch + desired-state (Etag/revision) endpoints — each added to `pollek-contract.json` + OpenAPI + SDK with the drift gate green.
- **Acceptance tests (extend `test/foundation.test.mjs` + `scripts/smoke-sync.mjs`):** sign a bundle → publish provenance/SBOM/attestation → assert a DEK-style gate would accept it, and that a tampered/wrong-tenant/revoked/downgraded bundle is rejected (mirrors SRS §26 red-team vectors); mTLS handshake self-test; desired-state "newest bundle you can run" negotiation; kill-switch propagation record.
- **Recommended immediate increment:** **Cloud-Phase 1, step 1** — emit signed bundle provenance + a `trust-policy.yaml` + signer-allowlist/revocation endpoints, and a Trust & Provenance read view. It is fully buildable and verifiable on one box, retroactively hardens every hot-reload lane already shipped, and directly unblocks `dek-trust-gate` (DEK Phase A1).

**Alignment complete — ready to start Cloud-Phase 1 on your go.**

---

## Appendix — terminology & canonical model reconciliation

- **Naming:** founding docs say "Pollen / Enterprise AI Policy Engine"; this repo is "**Pollek** Cloud"; local enforcement is "**DEK/SEK**" (Desktop/Server Enforcement Kernel) and "**LCP**" (Local Control Plane). Treated as the same ecosystem: **Cloud (Pollek) ↔ local enforcement (DEK/SEK/LCP)**.
- **Canonical tables to converge on** (A3 §32, when Postgres lands): `registry_entities`, `registry_entity_bindings`, `trust_profiles`, `credentials_vc_records`, `policy_definitions`, `policy_versions`, `policy_semantic_diffs`, `policy_blast_radius_reports`, `bundle_publications`, `pep_targets`, `pep_deployments`, `discovery_sources`, `discovery_observations`, `break_glass_requests`, `ephemeral_token_grants`, `decision_logs`, `security_findings`, `release_evidence`, plus `asset_versions` (A4). Current in-memory collections should be renamed/shaped toward these as the repository interface is introduced.
- **Sources (external research):** EU AI Act ([Chapter V enforcement](https://artificialintelligenceact.eu/enforcement-of-chapter-v-under-the-eu-ai-act/), [timeline](https://artificialintelligenceact.eu/implementation-timeline/)); MCP authorization ([spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/)); OpenTelemetry GenAI ([semconv repo](https://github.com/open-telemetry/semantic-conventions-genai), [MLflow](https://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv/)).
