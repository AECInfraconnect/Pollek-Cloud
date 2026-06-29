# AGENTS.md - Pollek Cloud AI Coding Agent Rules

1. Preserve Contract Hub as the source of truth.
2. Never collapse Local Control Plane or Local Dashboard responsibilities into Pollek Cloud. Pollek Cloud is the commercial central control plane.
3. Keep Local Control Plane compatibility first: local/cloud must share contract, bundle format, telemetry envelope, and hot reload semantics.
4. Every tenant-owned persisted record must include `tenant_id` when the database layer is introduced.
5. Every API handler that writes tenant data must receive explicit tenant context.
6. No production policy bundle can be published without an approval record.
7. Bundle signing and verification must be covered by tests.
8. Any new telemetry event requires schema, sample fixture, parser test, and analytics-store mapping.
9. All long-running operations must create task records and be visible in Task Center.
10. All security-sensitive actions must emit audit events.
11. UI must follow the object detail pattern: Summary, Relationships, Policies, Telemetry, Timeline, Alerts, Bundle Status, Audit, Settings.
12. Thai and English i18n keys must be added for user-facing text once the app framework is introduced.
13. Do not hard-code production tenant IDs, secrets, keys, URLs, or cloud provider assumptions.
