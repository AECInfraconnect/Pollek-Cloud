# Pollek Cloud UX Blueprint

Pollek Cloud should feel like an enterprise infrastructure console, closer to vCenter or Cloud Director than a simple dashboard.

## Main Navigation

- Overview
- Inventory
- Policy Center
- Observe Center
- Compliance
- Contract Hub
- Integrations
- Administration

## First Local Console

The local dev console implements the first object-management shell:

- Left inventory tree with tenant, site, device group, device, Local Control Plane, and agent objects.
- Main object detail surface with posture, contract, capability, telemetry, and task sections.
- Dense Local Control Plane datagrid for scanning many LCPs.
- Right operations column for Cloud protocol probe, open alarms, task center, and recent events.
- Local Cloud UI must stay usable while LCP is compiling; LCP-specific status becomes connected only after a protocol probe against a running LCP succeeds.
- Every action that changes operational state should create a visible task and event so administrators can audit what happened without leaving the object view.
- Detail tabs are functional panels, not just visual buttons: Summary, Entities, Relationships, Policies, Telemetry, Alarms, Timeline, and Audit.
- The Entities tab is the fleet-scale Local Pollek object browser. It must let administrators filter Registered Agents, Found Agents, Policies, Enforcement, and Observability objects by device, user, LCP, type, and trace readiness.
- Entity detail must show identity and control-plane continuity in one place: OAuth client/scope, OIDC issuer/subject, SPIFFE ID, mTLS confirmation, policy bindings, PDP/PEP enforcement mode, telemetry streams, and WASM hot-reload generation.
- Contract Hub belongs in the operational flow, not as a hidden developer artifact. The console should expose connection profiles, tenant trust scopes, and Cloud service endpoints so administrators can understand which settings many Local Pollek instances will pick up.
- The Policy tab keeps the SRS guardrail that AI-assisted output cannot deploy directly. A draft must be simulated and human-approved before rollout.
- The Telemetry tab can ingest a synthetic Cloud-side sample so Observe Center behavior can be tested while a real LCP build is still pending.
- Object icons are semantic, not decorative color blocks: tenant/site/device/LCP/agent/policy/enforcement/observe/identity/telemetry/rollout/compliance all use one shared visual vocabulary.
- Summary includes an operations focus board for triage: open alarms, worst LCP, found agents, identity trace coverage, policy binding coverage, and WASM hot-reload readiness.
- Entities are sorted for operator triage rather than raw ingest order: found/unregistered agents first, registered agents next, then policy, enforcement, and observability records.

Future app-framework work should keep this master-detail pattern and add real CRUD, table virtualization, relationship graphs, policy diff viewers, rollout timelines, and evidence exports.
