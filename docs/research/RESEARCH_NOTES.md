# Pollek Cloud Research Notes

These notes anchor Pollek Cloud design decisions to external standards and enterprise-console patterns.

## Standards and Platform Inputs

| Area | Design Input | Pollek Cloud Decision |
|---|---|---|
| OpenTelemetry Collector | Collector configuration is organized around receivers, processors, exporters, and pipelines. | Build telemetry ingest as a pipeline: receive Pollek envelopes/OTLP, enrich tenant/device context, redact if needed, persist, then export to SIEM. |
| SPIFFE/SPIRE | SPIFFE IDs and SVIDs provide workload identity for mTLS and JWT-based identity propagation. | Use immutable SPIFFE IDs for Local Control Plane, Cloud API, ingest, and service identities. Surface SVID expiry and trust-bundle health in fleet status. |
| OPA Bundles | OPA bundle distribution supports packaged policy/data and management APIs. | Treat cloud-built policy bundles as immutable signed artifacts with metadata, rollback, last-known-good, and hot reload. |
| Cedar | Cedar models authorization around principal, action, resource, and context with schemas. | Use Cedar for contextual application authorization and human-readable policy artifacts. |
| OpenFGA | OpenFGA models authorization through relationship tuples and versioned authorization models. | Use OpenFGA/ReBAC for tenant, site, team, device, policy project, and evidence object relationships. |
| OAuth 2.0 / OIDC | OAuth Device Flow supports device/user enrollment where browser authorization and device polling are separated. | Use OAuth Device Flow for human-friendly Local Control Plane enrollment before mTLS/SPIFFE identity is fully established. |
| NIST Zero Trust | Zero Trust requires continuous authentication, authorization, and least privilege rather than network-location trust. | Every cloud/local request must be authenticated, tenant-scoped, authorized, and audited when sensitive. |
| OWASP GenAI Risks | GenAI application risks include prompt injection, sensitive information disclosure, insecure plugin design, excessive agency, and model DoS. | Initial compliance policy packs should cover PII/secrets leakage, prompt injection, unmanaged agents, high-risk tool approval, and token/cost controls. |

## Enterprise UX Inputs

Pollek Cloud should use an inventory-first master-detail model similar to enterprise infrastructure consoles:

- Persistent inventory hierarchy for tenant, site, device group, device, Local Control Plane, agent, MCP server, tool, resource, policy pack, and bundle.
- Object detail tabs: Summary, Relationships, Policies, Telemetry, Timeline, Alerts, Bundle Status, Audit, Settings.
- Task Center for enrollment, rollout, export, backup/restore, and long-running policy operations.
- Alert/incident workflow that links events to agents, resources, bundles, policies, users, and devices.

## Source Links

- OpenTelemetry Collector configuration: https://opentelemetry.io/docs/collector/configuration/
- SPIFFE concepts: https://spiffe.io/docs/latest/spiffe-about/overview/
- SPIRE documentation: https://spiffe.io/docs/latest/spire-about/spire-concepts/
- OPA bundle management: https://www.openpolicyagent.org/docs/latest/management-bundles/
- Cedar documentation: https://docs.cedarpolicy.com/
- OpenFGA concepts: https://openfga.dev/docs/concepts
- OpenID Connect overview: https://openid.net/developers/how-connect-works/
- OAuth 2.0 Device Authorization Grant RFC 8628: https://www.rfc-editor.org/rfc/rfc8628
- NIST SP 800-207 Zero Trust Architecture: https://csrc.nist.gov/pubs/sp/800/207/final
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
