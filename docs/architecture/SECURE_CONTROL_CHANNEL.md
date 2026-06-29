# Secure Bidirectional Control Channel

Pollek Cloud and Local Pollek must treat every synchronization and control operation as a zero-trust transaction. The local development loop can use HTTP loopback for testing, but production requires OAuth/OIDC, SPIFFE/SPIRE, mTLS, signed control envelopes, audit evidence, and fail-closed behavior.

## Research Synthesis

| Source | Design Requirement |
|---|---|
| NIST SP 800-207 Zero Trust Architecture | Authenticate and authorize every subject, device, application, and data flow continuously. Do not trust a network location. |
| OAuth 2.0 Security Best Current Practice and OAuth mTLS certificate-bound tokens | Use audience-restricted, sender-constrained tokens so stolen bearer tokens cannot be replayed from another client. |
| SPIFFE/SPIRE | Bind Cloud and LCP workloads to SPIFFE IDs and short-lived SVIDs; use trust domains per tenant. |
| OWASP API Security Top 10 | Prevent broken object/function authorization, SSRF, mass assignment, security misconfiguration, and unmanaged API inventory. |
| OpenTelemetry | Correlate security events with trace/resource identity instead of storing unrelated logs. |
| SLSA/in-toto style supply-chain controls | Treat policy bundles and WASM artifacts as signed, versioned supply-chain artifacts with provenance. |

## Production Guardrails

- **Identity**: every Cloud-to-Local and Local-to-Cloud call must bind tenant, LCP, device, user, and workload identity through OAuth/OIDC claims and SPIFFE ID.
- **Transport**: production traffic must use mTLS; dev HTTP loopback is allowed only for local protocol testing.
- **Authorization**: actions are scope-bound, for example `registry.sync`, `configuration.write`, `bundle.read`, `policy.rollout`, and `hot_reload.dispatch`.
- **Signed Intent**: Cloud-to-Local commands are signed control envelopes with `control_id`, `nonce`, `issued_at`, `expires_at`, `audience`, `scope`, `allowed_paths`, and `payload_hash`.
- **Replay Defense**: LCP should reject expired envelopes, reused nonces/control IDs, wrong audience, wrong tenant, path mismatch, and payload hash mismatch.
- **Delta Sync**: LCP should write every local entity/configuration mutation into a durable local outbox before acknowledging the local change, then push signed change batches to Cloud with `event_id`, monotonic `sequence`, and optional `content_hash`.
- **ACK Cursor**: Cloud acknowledges the last durable `(tenant_id, lcp_id, device_id, sequence)` cursor. LCP must retain outbox events until the cursor is acknowledged and retry with backoff and jitter.
- **Allowlist**: Cloud never dispatches to arbitrary LCP URLs or arbitrary paths. The LCP target must already exist in inventory and the path must be valid for the action.
- **Secrets**: tokens, secrets, passwords, private keys, and authorization headers must never be persisted in runtime snapshots or audit payloads.
- **Audit**: every entity sync, configuration pull, config dispatch, and hot-reload attempt creates task, telemetry, and audit records.
- **Fail Closed**: unsupported LCP endpoints are recorded as unsupported/failed, not treated as success.

## Implemented Local Dev Behavior

- `POST /api/lcp/change-batches` and `POST /v1/tenants/{tenant_id}/lcp/change-batches` accept LCP-originated delta batches and return an ACK cursor.
- Change batches support entity upsert/delete, relationship updates, configuration snapshots, and full snapshot events for resync.
- Cloud deduplicates by recent `event_id`, monotonic `sequence`, and optional content hash validation before applying changes.
- `GET/POST /api/entities/watch` remains as a low-frequency snapshot reconciliation and manual refresh fallback, not the production primary sync path.
- The reconcile watcher pulls Local Pollek entities and configuration snapshots, fingerprints them, and only broadcasts `local_entities.updated` when data changes.
- Watch fingerprints strip volatile timestamps and latency fields so snapshot reconciliation does not create false inventory changes.
- Telemetry observations are aggregated into stable observability entities instead of creating a new entity for every event timestamp.
- `POST /api/lcp/config/dispatch` sends signed configuration intent to the allowlisted LCP cloud-sync endpoint.
- `POST /api/lcp/hot-reload/dispatch` sends signed hot-reload intent and records unsupported LCP hot-reload paths explicitly.
- `/api/fleet` exposes `hybrid_sync`, `lcp_watch`, ACK cursors, recent change batches, local configuration snapshots, and cloud-to-local dispatches for UI visibility.

## References

- NIST SP 800-207 Zero Trust Architecture: https://csrc.nist.gov/publications/detail/sp/800-207/final
- OAuth 2.0 Security Best Current Practice, RFC 9700: https://www.rfc-editor.org/rfc/rfc9700.html
- OAuth 2.0 mTLS certificate-bound access tokens, RFC 8705: https://www.rfc-editor.org/rfc/rfc8705.html
- SPIFFE overview: https://spiffe.io/docs/latest/spiffe-about/overview/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- OpenTelemetry concepts: https://opentelemetry.io/docs/concepts/
- SLSA specification: https://slsa.dev/spec/v1.0/
