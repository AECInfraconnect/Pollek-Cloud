# Local Pollek Entity Mapping

This note records the Cloud aggregation design for Local Pollek entities. It is based on the local Pollek checkout inspected on 2026-06-29 and should be refreshed after pulling the latest upstream repo.

## Inspected Local Source

- Local checkout: `C:\Users\DELL\Documents\Codex\2026-06-26\chat-github-aecinfraconnect-antig-pollen-dek\repo`
- Remote: `https://github.com/AECInfraconnect/Pollek.git`
- Local HEAD inspected: `e496d41b726b093c82082ed4bb85496a0ec0a294`
- GitHub remote HEAD observed: `5858320cb69b1719bf10cfdfb5930175f70e1481`
- Important note: the local checkout was not pulled during this Cloud work, so the remote repository may contain newer changes.

## Local Endpoint Sources

Pollek Cloud should aggregate these Local Control Plane sources into one tenant/device/user-scoped entity model:

- Registered Agents:
  - `GET /v1/tenants/:tenant/registry/agents`
  - `GET /v1/tenants/:tenant/agent-inventory`
  - `POST /v1/tenants/:tenant/agents/:agent_id/register`
- Found Agents:
  - `GET /v1/tenants/:tenant/discovery/candidates`
  - `GET /v1/tenants/:tenant/discovery/entities`
  - Candidate control-plan/register/confirm/apply/rollback endpoints.
- Policies:
  - `GET /v1/tenants/:tenant_id/policies`
  - Policy validate/simulate/publish endpoints.
- Enforcement:
  - `GET /v1/tenants/local/devices/local/capability-snapshot-v2`
  - `GET /v1/tenants/:tenant/bundles`
  - `GET /v1/tenants/:tenant/devices/:device/bundles/latest`
- Observability:
  - `GET /v1/tenants/local/telemetry/resources`
  - `GET /v1/tenants/local/telemetry/tools`
  - `GET /v1/tenants/local/telemetry/identities`
  - `GET /v1/tenants/local/telemetry/observations`

## Cloud Entity Model

The Cloud model stores entities as:

- `registered_agent`
- `found_agent`
- `policy`
- `enforcement`
- `observability`

Each entity keeps:

- Tenant, LCP, device, user, and source endpoint.
- Local object ID and raw source payload.
- Identity trace fields for OAuth, OIDC, SPIFFE ID, mTLS confirmation, and token binding.
- Policy bindings and enforcement fields for PDP/PEP mode.
- Observability streams and last event time.
- WASM hot-reload readiness, active bundle, active module, and generation.

## Contract Hub Role

Contract Hub is the mediator for large-scale Cloud-to-Local connection updates. Local Pollek instances should poll or subscribe to the Contract Hub profile instead of hardcoding Cloud endpoint paths.

The profile should include:

- Tenant trust scope and SPIFFE trust domain.
- SPIRE Server endpoint and enrollment requirements.
- Required OAuth scopes and OIDC issuer.
- mTLS requirement and SVID confirmation mode.
- Registry sync, telemetry ingest, latest bundle, hot-reload manifest, and service catalog endpoint paths.
- OPA, Cedar, OpenFGA, NER model, and WASM registry service endpoint entries.

## External Design References

- OpenTelemetry defines observability around signals such as traces, metrics, and logs: `https://opentelemetry.io/docs/what-is-opentelemetry/`
- SPIRE uses server/agent components to issue and manage SPIFFE identities: `https://spiffe.io/docs/latest/spire-about/spire-concepts/`
- OPA supports bundle distribution as a management API pattern for policy/data delivery: `https://www.openpolicyagent.org/docs/latest/management-bundles/`

