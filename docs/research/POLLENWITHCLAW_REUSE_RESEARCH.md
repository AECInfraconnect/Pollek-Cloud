# Pollenwithclaw Reuse and Enterprise Cloud Research

Date: 2026-06-29

This note records what was reused from the legacy `AECInfraconnect/pollenwithclaw`
repository, what was intentionally rejected, and how the new Pollek Cloud design
stays compatible with the current Local Pollek repository.

## What Was Reused

### 1. Adapter catalog pattern

Legacy Pollen had a broad adapter catalog with provider categories, integration
modes, auth modes, discovery capability, probe endpoints, and entity kinds. The
new Cloud keeps the pattern but uses a smaller curated catalog in `/api/adapters/catalog`.
It covers LLM providers, code assistants, MCP servers, A2A agent cards, and custom
HTTP agents. The old raw file was not copied because it is too broad, carries old
product assumptions, and is not aligned to the new Local Pollek boundary.

### 2. Entity health and dedupe

Legacy entity code had useful ideas for health aggregation and duplicate matching.
The new Cloud implements this as:

- `GET /api/entities/health`
- `POST /api/entities/dedupe`

The scoring is Cloud-side and checks registration status, SPIFFE trace readiness,
policy binding, telemetry streams, WASM hot-reload readiness, and last-seen data.

### 3. Staged rollout and hot reload

Legacy staged rollout ideas were retained: stages, canary/batch strategy,
pause/resume/cancel/advance actions, and per-target result tracking. The new
Cloud implements:

- `POST /api/rollouts`
- `POST /api/rollouts/{rollout_id}/advance`
- `POST /api/rollouts/{rollout_id}/pause`
- `POST /api/rollouts/{rollout_id}/resume`
- `POST /api/rollouts/{rollout_id}/cancel`
- `GET /api/hot-reload/events`

These events map to Local Pollek bundle sync and SSE semantics.

### 4. Sandbox and breakglass concepts

Legacy Pollen included sandbox and breakglass flows, but the implementation was
coupled to the old tRPC/MySQL stack. The new Cloud keeps the product concepts:

- Policy dry-run sandbox before deployment.
- WASM-oriented isolated tool execution profile.
- Breakglass request, approval, rejection, and close lifecycle.
- Audit task/event generation for each action.

### 5. Compliance mapping idea, not Local catalog

Legacy Pollen had compliance templates and mappings. In the new architecture this
belongs to Pollek Cloud Enterprise, not Local Pollek. Local Pollek does not own
the compliance policy bundle catalog. It only receives signed policy bundle
artifacts selected by Cloud Enterprise through Contract Hub.

## What Was Rejected

- Direct tRPC router code, Drizzle/MySQL schemas, and React page code from the old repo.
- DEK/SEK naming when it would confuse the Local Pollek / Cloud boundary.
- Full legacy adapter catalog content, because the new platform needs a curated
  and tenant-scoped Cloud catalog.
- Compliance policy templates as Local Pollek presets. Local presets are useful
  local quickstart controls, but enterprise compliance bundle selection belongs
  to Cloud.

## Local Pollek Compatibility

The current Local Pollek repository exposes the following relevant interfaces:

- `/.well-known/pollek-contract`
- `/v1/tenants/{tenant_id}/registry/agents`
- `/v1/tenants/{tenant_id}/registry/entities`
- `/v1/tenants/{tenant_id}/registry/relationships`
- `/v1/tenants/local/telemetry/resources`
- `/v1/tenants/local/telemetry/tools`
- `/v1/tenants/local/telemetry/identities`
- `/v1/tenants/local/telemetry/observations`
- `/v1/tenants/{tenant_id}/pdp/routes/simulate`
- `/v1/tenants/{tenant_id}/policy-presets/{preset_id}/simulate`
- `/v1/tenants/{tenant_id}/devices/{device_id}/events`
- `/v1/tenants/{tenant_id}/bundles/latest`
- `/v1/tenants/{tenant_id}/devices/{device_id}/bundles/manifest`

Pollek Cloud now keeps these paths in Contract Hub connection updates, and sends
enterprise compliance content to Local Pollek as signed bundle delivery, not as a
Local compliance catalog.

## Enterprise Compliance Bundle Model

Pollek Cloud Enterprise owns:

- Compliance bundle catalog.
- Regulation/framework mapping.
- Human approval and sandbox simulation.
- Evidence mapping.
- Entitlement checks.
- Signed bundle creation and rollout.

Local Pollek receives:

- Latest bundle envelope.
- Bundle manifest.
- Hot-reload signal.
- Runtime policy artifacts compatible with local PEP/PDP capabilities.

Current Cloud Enterprise bundles:

- EU AI Act High-Risk AI Controls.
- NIST AI RMF Agentic Governance.
- SOC2 and GDPR Data Access Evidence.

## Competitor and Similar Product Research

The product space splits into several patterns:

- AI Security Posture Management: inventory, risk scoring, and exposure management.
  Examples include Wiz AI-SPM, Protect AI, and Prompt Security.
- Runtime AI guardrails: prompt injection detection, data loss prevention, and
  app-level controls. Examples include Lakera Guard and Palo Alto AI Access Security.
- Cloud authorization and policy engines: OPA/Rego, Cedar, OpenFGA, and SPIFFE/SPIRE.
- Fleet control plane UX: vCenter/vCloud Director style inventory tree, object
  detail tabs, task/event timeline, alerts, rollout status, and evidence export.

Pollek Cloud should differentiate by combining fleet control, identity trace,
runtime policy lifecycle, enterprise compliance bundles, and Local Pollek hot
reload delivery in one console.

## Source Links

- OpenTelemetry GenAI semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- OpenTelemetry overview: https://opentelemetry.io/docs/what-is-opentelemetry/
- SPIFFE/SPIRE concepts: https://spiffe.io/docs/latest/spire-about/spire-concepts/
- OPA bundles: https://www.openpolicyagent.org/docs/latest/management-bundles/
- Cedar policy docs: https://docs.cedarpolicy.com/
- OpenFGA concepts: https://openfga.dev/docs/concepts
- Model Context Protocol specification: https://modelcontextprotocol.io/specification/
- VMware vSphere/vCenter documentation: https://docs.vmware.com/en/VMware-vSphere/
- Wiz AI-SPM: https://www.wiz.io/solutions/ai-security-posture-management
- Protect AI: https://protectai.com/
- Prompt Security: https://www.prompt.security/
- Lakera Guard: https://www.lakera.ai/lakera-guard
- Palo Alto AI Access Security: https://www.paloaltonetworks.com/sase/ai-access-security
