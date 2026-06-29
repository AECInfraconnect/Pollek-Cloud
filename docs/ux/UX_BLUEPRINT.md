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

Future app-framework work should keep this master-detail pattern and add real CRUD, table virtualization, relationship graphs, policy diff viewers, rollout timelines, and evidence exports.
