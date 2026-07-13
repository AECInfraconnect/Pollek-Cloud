import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

async function waitForJson(url, options = {}, attempts = 80) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      return { response, payload };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function withDevServer(t, callback) {
  const stateDir = await mkdtemp(path.join(tmpdir(), "pollek-cloud-test-"));
  const stateFile = path.join(stateDir, "state.json");
  const port = 19000 + Math.floor(Math.random() * 3000);
  const child = spawn(process.execPath, ["apps/api/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      POLLEK_CLOUD_DEV_PORT: String(port),
      POLLEK_CLOUD_STATE_FILE: stateFile,
      POLLEK_LCP_WATCH_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(stateDir, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForJson(`${baseUrl}/health`);
  assert.equal(health.response.status, 200, stderr);
  return callback(baseUrl);
}

async function api(baseUrl, pathName, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  return { response, payload };
}

test("contract discovery declares required cloud protocol features", async () => {
  const contract = JSON.parse(await readFile("packages/contracts/pollek-contract.json", "utf8"));

  assert.equal(contract.schema_version, "pollek-cloud-contract-discovery.v1");
  assert.equal(contract.schemas.lcp_usage_ledger, "/contracts/lcp-usage-ledger.schema.json");
  assert.equal(contract.features.hot_reload, true);
  assert.equal(contract.features.signed_bundles, true);
  assert.equal(contract.features.content_addressed_bundle_artifacts, true);
  assert.equal(contract.features.oauth_device_flow, true);
  assert.equal(contract.features.ai_policy_editor, true);
  assert.equal(contract.features.ai_policy_provider_redaction_citations, true);
  assert.ok(contract.supported_transports.includes("mtls"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"]);
  assert.ok(contract.interfaces["pollek.cloud.local_entities"]);
  assert.ok(contract.interfaces["pollek.cloud.trust_scope"]);
  assert.ok(contract.interfaces["pollek.cloud.authorization"]);
  assert.ok(contract.interfaces["pollek.cloud.identity"]);
  assert.ok(contract.interfaces["pollek.cloud.billing"]);
  assert.ok(contract.interfaces["pollek.cloud.kms"]);
  assert.ok(contract.interfaces["pollek.cloud.connection_update"]);
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"]);
  assert.ok(contract.interfaces["pollek.cloud.policy_authoring"]);
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle_signing"]);
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"]);
  assert.ok(contract.interfaces["pollek.cloud.enterprise_compliance"]);
  assert.ok(contract.interfaces["pollek.cloud.breakglass"]);
  assert.ok(contract.interfaces["pollek.cloud.adapter_catalog"]);
  assert.equal(contract.interfaces["pollek.cloud.policy_authoring"].human_approval_required, true);
  assert.ok(contract.interfaces["pollek.cloud.policy_authoring"].paths.includes("/api/policy/providers"));
  assert.ok(contract.interfaces["pollek.cloud.policy_authoring"].controls.includes("secret_redaction"));
  assert.ok(contract.interfaces["pollek.cloud.policy_authoring"].controls.includes("policy_test_fixtures"));
  assert.equal(contract.interfaces["pollek.cloud.enterprise_compliance"].enterprise_only, true);
  assert.equal(contract.interfaces["pollek.cloud.enterprise_compliance"].local_catalog_visible, false);
  assert.equal(contract.features.local_entity_inventory, true);
  assert.equal(contract.features.tenant_trust_scopes, true);
  assert.equal(contract.features.authorization_rbac_rebac_cedar_openfga, true);
  assert.equal(contract.features.contract_hub_connection_updates, true);
  assert.equal(contract.features.wasm_hot_reload_registry, true);
  assert.equal(contract.features.enterprise_compliance_policy_bundles, true);
  assert.equal(contract.features.policy_bundle_signing_verification, true);
  assert.equal(contract.features.policy_sandbox, true);
  assert.equal(contract.features.breakglass, true);
  assert.equal(contract.features.staged_rollouts, true);
  assert.equal(contract.features.adapter_catalog, true);
  assert.equal(contract.features.entity_health, true);
  assert.equal(contract.features.entity_dedupe, true);
  assert.equal(contract.features.openapi_artifact, true);
  assert.equal(contract.features.contract_drift_guard, true);
  assert.equal(contract.features.sse_event_stream, true);
  assert.equal(contract.features.durable_event_stream_replay, true);
  assert.equal(contract.features.near_real_time_lcp_watch, true);
  assert.equal(contract.features.hybrid_lcp_delta_push, true);
  assert.equal(contract.features.lcp_ai_usage_ledger, true);
  assert.equal(contract.features.lcp_change_batch_ack_cursor, true);
  assert.equal(contract.features.secure_cloud_to_local_dispatch, true);
  assert.equal(contract.features.signed_control_envelopes, true);
  assert.equal(contract.features.saas_signup, true);
  assert.equal(contract.features.keycloak_oidc, true);
  assert.equal(contract.features.byo_idp_federation, true);
  assert.equal(contract.features.scim_provisioning, true);
  assert.equal(contract.features.tenant_member_management, true);
  assert.equal(contract.features.metered_billing_seat_device, true);
  assert.equal(contract.features.offline_license, true);
  assert.equal(contract.features.kms_abstraction, true);
  assert.equal(contract.features.billing_webhook_idempotency, true);
  assert.equal(contract.features.lcp_telemetry_endpoint_family, true);
  assert.equal(contract.features.lcp_contract_compatibility_2026_06_30, true);
  assert.equal(contract.features.lcp_telemetry_envelope_persistence, true);
  assert.equal(contract.features.telemetry_event_id_idempotency, true);
  assert.equal(contract.features.telemetry_secret_quarantine, true);
  assert.equal(contract.features.lcp_telemetry_read_parity, true);
  assert.equal(contract.features.lcp_registry_sync_entity_ingest, true);
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/telemetry/decision-logs"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/telemetry/export"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/logs/decisions"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/logs/tool-invocations"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/logs/resource-access"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/logs/policy-deployments"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/logs/pep-health"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/api/telemetry/ingest-status"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].controls.includes("event_id_idempotency"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].controls.includes("per_event_secret_quarantine"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].controls.includes("telemetry_envelope_persistence"));
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/v1/signup/tenant"));
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/v1/tenants/{tenant_id}/members/{account_id}/roles"));
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/scim/v2/Users"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].paths.includes("/v1/tenants/{tenant_id}/billing/license/issue"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].paths.includes("/api/lcp/usage-ledgers"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].paths.includes("/v1/tenants/{tenant_id}/lcp/usage-ledgers"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].controls.includes("lcp_reported_agent_usage_ledger"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].controls.includes("cross_os_usage_fixtures"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].controls.includes("credit_pool_allocation"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].controls.includes("webhook_idempotency"));
  assert.ok(contract.interfaces["pollek.cloud.kms"].paths.includes("/v1/kms/health"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/events.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/bundle-manifest.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/telemetry-envelope.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/lcp-usage-ledger.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/api/lcp/change-batches"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/lcp/change-batches"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/registry/resources"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/registry/tools"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/discovery/entities"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/devices/{device_id}/capability-snapshot-v2"));
  assert.ok(contract.interfaces["pollek.cloud.connection_update"].paths.includes("/api/events"));
  assert.ok(contract.interfaces["pollek.cloud.connection_update"].paths.includes("/api/events/replay"));
  assert.ok(contract.interfaces["pollek.cloud.connection_update"].paths.includes("/api/hot-reload/stream"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].paths.includes("/api/entities/watch"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].paths.includes("/api/lcp/change-batches"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].paths.includes("/api/lcp/config/dispatch"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].paths.includes("/api/lcp/hot-reload/dispatch"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].controls.includes("signed-control-envelope"));
  assert.ok(contract.interfaces["pollek.cloud.secure_control_channel"].controls.includes("ack_cursor"));
  assert.equal(contract.interfaces["pollek.cloud.policy_bundle_signing"].human_approval_required, true);
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle_signing"].paths.includes("/api/policy-bundles/{bundle_id}/sign"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle_signing"].paths.includes("/api/policy-bundles/{bundle_id}/verify"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle_signing"].controls.includes("approval_record_required"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle_signing"].controls.includes("ed25519_signature"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle"].paths.includes("/v1/policy-bundles/{bundle_id}/artifact"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle"].paths.includes("/v1/tenants/{tenant_id}/devices/{device_id}/bundles/latest"));
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle"].controls.includes("content_addressed_artifact"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/telemetry/events"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/telemetry/enforcement-status"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].paths.includes("/v1/tenants/{tenant_id}/browser-extension/events"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"].controls.includes("tenant_device_headers"));
  assert.ok(contract.interfaces["pollek.cloud.authorization"].paths.includes("/api/authz/model"));
  assert.ok(contract.interfaces["pollek.cloud.authorization"].paths.includes("/api/authz/tuples"));
  assert.ok(contract.interfaces["pollek.cloud.authorization"].paths.includes("/api/authz/check"));
  assert.ok(contract.interfaces["pollek.cloud.authorization"].controls.includes("default_deny"));
  assert.ok(contract.interfaces["pollek.cloud.authorization"].engines.includes("openfga"));
});

test("openapi artifact covers every contract discovery path", async () => {
  const contract = JSON.parse(await readFile("packages/contracts/pollek-contract.json", "utf8"));
  const openapi = JSON.parse(await readFile("packages/contracts/openapi.json", "utf8"));
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const declaredPaths = new Set(
    Object.values(contract.interfaces).flatMap((spec) => spec.paths || [])
  );
  const openApiPaths = new Set(Object.keys(openapi.paths || {}));
  const allowedRuntimePaths = new Set(["/health", "/api/cloud/status", "/api/persistence/status", "/api/persistence/flush"]);
  const missing = [...declaredPaths].filter((apiPath) => !openApiPaths.has(apiPath)).sort();
  const extra = [...openApiPaths]
    .filter((apiPath) => !declaredPaths.has(apiPath) && !allowedRuntimePaths.has(apiPath))
    .sort();

  assert.equal(openapi.openapi, "3.1.0");
  assert.equal(openapi["x-pollek-contract-version"], contract.contract_version);
  assert.ok(openapi.paths["/contracts/openapi.json"].get);
  assert.ok(openapi.paths["/contracts/events.schema.json"].get);
  assert.ok(openapi.paths["/contracts/bundle-manifest.schema.json"].get);
  assert.ok(openapi.paths["/contracts/telemetry-envelope.schema.json"].get);
  assert.ok(openapi.paths["/contracts/lcp-usage-ledger.schema.json"].get);
  assert.ok(openapi.paths["/contracts/fixtures/lcp-usage-ledger/windows.json"].get);
  assert.ok(openapi.paths["/contracts/fixtures/lcp-usage-ledger/macos.json"].get);
  assert.ok(openapi.paths["/contracts/fixtures/lcp-usage-ledger/linux.json"].get);
  assert.ok(openapi.paths["/api/contract-hub/drift"].get);
  assert.ok(openapi.paths["/api/persistence/status"].get);
  assert.ok(openapi.paths["/api/persistence/flush"].post);
  assert.ok(openapi.paths["/api/entities/watch"].get);
  assert.ok(openapi.paths["/api/entities/watch"].post);
  assert.ok(openapi.paths["/api/lcp/change-batches"].post);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/lcp/change-batches"].post);
  assert.ok(openapi.paths["/api/lcp/config/dispatch"].post);
  assert.ok(openapi.paths["/api/lcp/hot-reload/dispatch"].post);
  assert.ok(openapi.paths["/v1/policy-bundles/{bundle_id}/artifact"].get);
  assert.ok(openapi.paths["/api/policy-bundles/{bundle_id}/sign"].post);
  assert.ok(openapi.paths["/api/policy-bundles/{bundle_id}/verify"].get);
  assert.ok(openapi.paths["/api/authz/model"].get);
  assert.ok(openapi.paths["/api/authz/tuples"].get);
  assert.ok(openapi.paths["/api/authz/tuples"].post);
  assert.ok(openapi.paths["/api/authz/check"].post);
  assert.ok(openapi.paths["/api/authz/decisions"].get);
  assert.ok(openapi.paths["/v1/signup/tenant"].post);
  assert.ok(openapi.paths["/v1/auth/session"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/members"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/members/{account_id}"].delete);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/identity-providers"].put);
  assert.ok(openapi.paths["/scim/v2/Users"].post);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/billing/usage"].get);
  assert.ok(openapi.paths["/api/lcp/usage-ledgers"].post);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/lcp/usage-ledgers"].post);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/billing/license/issue"].post);
  assert.ok(openapi.paths["/v1/kms/health"].get);
  assert.ok(openapi.paths["/api/policy/providers"].get);
  assert.ok(openapi.paths["/api/events"].get);
  assert.ok(openapi.paths["/api/events/replay"].get);
  assert.ok(openapi.paths["/api/hot-reload/stream"].get);
  assert.ok(openapi.paths["/v1/telemetry/events"].post);
  assert.ok(openapi.paths["/v1/telemetry/observations"].get);
  assert.ok(openapi.paths["/v1/telemetry/enforcement-status"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/browser-extension/events"].post);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/registry/resources"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/discovery/entities"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/devices/{device_id}/capability-snapshot-v2"].get);
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/devices/{device_id}/bundles/latest"].post);
  assert.equal(packageJson.scripts["contracts:sdk"], "node scripts/generate-sdk.mjs");
  assert.match(packageJson.scripts["audit:foundation"], /contracts:check/);
  assert.match(packageJson.scripts["audit:foundation"], /npm test/);
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
});

test("typespec source and sdk artifact cover core Contract Hub APIs", async () => {
  const typespec = await readFile("packages/contracts/typespec/main.tsp", "utf8");
  const sdk = await readFile("packages/sdk/pollek-cloud-client.mjs", "utf8");
  const generator = await readFile("scripts/generate-sdk.mjs", "utf8");
  const drift = await readFile("scripts/check-contract-drift.mjs", "utf8");

  assert.match(typespec, /namespace Pollek\.Cloud/);
  assert.match(typespec, /op getContract/);
  assert.match(typespec, /op replayEvents/);
  assert.match(typespec, /op checkAuthorization/);
  assert.match(typespec, /op signupTenant/);
  assert.match(typespec, /op inviteMember/);
  assert.match(typespec, /op getEventSchema/);
  assert.match(typespec, /op getLcpUsageLedgerSchema/);
  assert.match(typespec, /op ingestLcpUsageLedger/);
  assert.match(typespec, /op ingestTenantLcpUsageLedger/);
  assert.match(typespec, /op updateMemberRoles/);
  assert.match(typespec, /op removeMember/);
  assert.match(typespec, /op createScimUser/);
  assert.match(typespec, /op getBillingUsage/);
  assert.match(typespec, /op addPaymentMethod/);
  assert.match(typespec, /op sendBillingWebhook/);
  assert.match(typespec, /op issueOfflineLicense/);
  assert.match(typespec, /op getKmsHealth/);
  assert.match(typespec, /op signPolicyBundle/);
  assert.match(typespec, /op getBundleArtifact/);
  assert.match(typespec, /op ingestTelemetryEvent/);
  assert.match(typespec, /op getTelemetryEnforcementStatus/);
  assert.match(typespec, /op getLatestDeviceBundle/);
  assert.match(typespec, /op listRegistryAgents/);
  assert.match(typespec, /op listDiscoveryCandidates/);
  assert.match(sdk, /export class PollekCloudClient/);
  assert.match(sdk, /POLLEK_CONTRACT_VERSION = "2026\.07\.13"/);
  assert.match(sdk, /replayEvents/);
  assert.match(sdk, /checkAuthorization/);
  assert.match(sdk, /signupTenant/);
  assert.match(sdk, /inviteMember/);
  assert.match(sdk, /getEventSchema/);
  assert.match(sdk, /getBundleManifestSchema/);
  assert.match(sdk, /getTelemetryEnvelopeSchema/);
  assert.match(sdk, /getLcpUsageLedgerSchema/);
  assert.match(sdk, /ingestLcpUsageLedger/);
  assert.match(sdk, /ingestTenantLcpUsageLedger/);
  assert.match(sdk, /updateMemberRoles/);
  assert.match(sdk, /removeMember/);
  assert.match(sdk, /createScimUser/);
  assert.match(sdk, /addPaymentMethod/);
  assert.match(sdk, /sendBillingWebhook/);
  assert.match(sdk, /getBillingUsage/);
  assert.match(sdk, /issueOfflineLicense/);
  assert.match(sdk, /getKmsHealth/);
  assert.match(sdk, /signPolicyBundle/);
  assert.match(sdk, /getBundleArtifact/);
  assert.match(sdk, /ingestTelemetryEvent/);
  assert.match(sdk, /listTelemetryObservations/);
  assert.match(sdk, /getTelemetryEnforcementStatus/);
  assert.match(sdk, /getLatestDeviceBundle/);
  assert.match(sdk, /getDeviceCapabilitySnapshot/);
  assert.match(sdk, /listRegistryAgents/);
  assert.match(sdk, /listDiscoveryCandidates/);
  assert.match(generator, /export function sdkSource/);
  assert.match(generator, /ingestTelemetryEvent/);
  assert.match(generator, /getLatestDeviceBundle/);
  assert.match(drift, /SDK artifact is not generated/);
});

test("postgres foundation migration includes tenant RLS policies", async () => {
  const migration = await readFile("packages/db/migrations/0001_foundation.sql", "utf8");

  assert.match(migration, /ALTER TABLE devices ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_drafts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_policy_provider_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_test_fixtures/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS enrollment_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS integrations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tenant_trust_scopes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS service_endpoints/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS device_users/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entities/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entity_relationships/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entity_sync_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_change_cursors/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_change_batches/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS event_stream_journal/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS entity_health_snapshots/);
  assert.match(migration, /telemetry_events_tenant_device_time_idx/);
  assert.match(migration, /telemetry_events_payload_gin_idx/);
  assert.match(migration, /local_entities_tenant_lcp_type_idx/);
  assert.match(migration, /local_entities_observability_gin_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS adapter_catalog_entries/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staged_rollout_results/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hot_reload_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_sandbox_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS breakglass_requests/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS compliance_policy_bundles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_bundle_signatures/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_bundle_artifacts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS authorization_tuples/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS authorization_decisions/);
  assert.match(migration, /CREATE POLICY tenant_isolation_devices/);
  assert.match(migration, /CREATE POLICY tenant_isolation_policy_drafts/);
  assert.match(migration, /CREATE POLICY tenant_isolation_ai_policy_provider_runs/);
  assert.match(migration, /CREATE POLICY tenant_isolation_policy_test_fixtures/);
  assert.match(migration, /CREATE POLICY tenant_isolation_enrollment_sessions/);
  assert.match(migration, /CREATE POLICY tenant_isolation_local_entities/);
  assert.match(migration, /CREATE POLICY tenant_isolation_local_change_cursors/);
  assert.match(migration, /CREATE POLICY tenant_isolation_local_change_batches/);
  assert.match(migration, /CREATE POLICY tenant_isolation_event_stream_journal/);
  assert.match(migration, /CREATE POLICY tenant_isolation_hot_reload_events/);
  assert.match(migration, /CREATE POLICY tenant_isolation_breakglass_requests/);
  assert.match(migration, /CREATE POLICY tenant_isolation_compliance_policy_bundles/);
  assert.match(migration, /CREATE POLICY tenant_isolation_policy_bundle_signatures/);
  assert.match(migration, /CREATE POLICY tenant_isolation_policy_bundle_artifacts/);
  assert.match(migration, /CREATE POLICY tenant_isolation_authorization_tuples/);
  assert.match(migration, /CREATE POLICY tenant_isolation_authorization_decisions/);
  assert.match(migration, /CREATE POLICY tenant_isolation_tenant_trust_scopes/);
  assert.match(migration, /current_setting\('app\.tenant_id'/);
});

test("identity and billing migration keeps tenant ownership explicit", async () => {
  const migration = await readFile("packages/db/migrations/0002_identity_billing.sql", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS accounts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tenant_members/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS member_role_assignments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS invitations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS identity_providers/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS scim_users/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS scim_groups/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kms_keys/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing_accounts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS usage_records/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS usage_counters/);
  assert.match(migration, /usage_records_source_time_idx/);
  assert.match(migration, /usage_records_metadata_gin_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS invoices/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_methods/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS licenses/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing_events/);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(migration, /reference_hash text NOT NULL/);
  assert.match(migration, /tenant_id text NOT NULL REFERENCES tenants\(id\) ON DELETE CASCADE/);
  assert.match(migration, /ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY tenant_isolation_tenant_members/);
  assert.match(migration, /CREATE POLICY tenant_isolation_identity_providers/);
  assert.match(migration, /CREATE POLICY tenant_isolation_usage_records/);
  assert.match(migration, /CREATE POLICY tenant_isolation_licenses/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS device_users/);
});

test("dev server exposes fleet inventory endpoints", async () => {
  const server = await readFile("apps/api/server.mjs", "utf8");

  assert.match(server, /pathname === "\/api\/fleet"/);
  assert.match(server, /\/api\\\/fleet\\\/objects/);
  assert.match(server, /localControlPlanes/);
  assert.match(server, /applyProbeToFleet/);
});

test("dev server exposes fleet operations endpoints", async () => {
  const server = await readFile("apps/api/server.mjs", "utf8");

  assert.match(server, /pathname === "\/api\/rollouts"/);
  assert.match(server, /pathname === "\/api\/evidence\/exports"/);
  assert.match(server, /pathname === "\/api\/policy\/providers"/);
  assert.match(server, /pathname === "\/api\/policy\/assist"/);
  assert.match(server, /pathname === "\/api\/enrollments"/);
  assert.match(server, /pathname === "\/api\/telemetry\/query"/);
  assert.match(server, /pathname === "\/api\/telemetry\/sample"/);
  assert.match(server, /pathname === "\/api\/entities"/);
  assert.match(server, /pathname === "\/api\/entities\/summary"/);
  assert.match(server, /pathname === "\/api\/entities\/health"/);
  assert.match(server, /pathname === "\/api\/entities\/dedupe"/);
  assert.match(server, /pathname === "\/api\/entities\/ingest"/);
  assert.match(server, /pathname === "\/api\/entities\/sync"/);
  assert.match(server, /pathname === "\/api\/entities\/watch"/);
  assert.match(server, /pathname === "\/api\/lcp\/change-batches"/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/lcp\\\/change-batches/);
  assert.match(server, /pathname === "\/api\/lcp\/config\/dispatch"/);
  assert.match(server, /pathname === "\/api\/lcp\/hot-reload\/dispatch"/);
  assert.match(server, /pathname === "\/api\/adapters\/catalog"/);
  assert.match(server, /pathname === "\/api\/trust\/scopes"/);
  assert.match(server, /pathname === "\/api\/services\/endpoints"/);
  assert.match(server, /pathname === "\/api\/authz\/model"/);
  assert.match(server, /pathname === "\/api\/authz\/tuples"/);
  assert.match(server, /pathname === "\/api\/authz\/check"/);
  assert.match(server, /pathname === "\/api\/authz\/decisions"/);
  assert.match(server, /pathname === "\/v1\/signup\/tenant"/);
  assert.match(server, /pathname === "\/v1\/invitations\/accept"/);
  assert.match(server, /pathname === "\/v1\/auth\/login"/);
  assert.match(server, /pathname === "\/v1\/auth\/callback"/);
  assert.match(server, /pathname === "\/v1\/auth\/logout"/);
  assert.match(server, /pathname === "\/v1\/auth\/session"/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/invitations/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/members/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/identity-providers/);
  assert.match(server, /pathname === "\/scim\/v2\/Users"/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/billing\\\/usage/);
  assert.match(server, /\/v1\\\/tenants\\\/\(\[\^\/\]\+\)\\\/billing\\\/license\\\/issue/);
  assert.match(server, /\/v1\\\/billing\\\/webhooks\\\/\(\[\^\/\]\+\)/);
  assert.match(server, /pathname === "\/v1\/kms\/health"/);
  assert.match(server, /pathname === "\/api\/contract-hub\/connection-updates"/);
  assert.match(server, /pathname === "\/api\/contract-hub\/drift"/);
  assert.match(server, /pathname === "\/api\/persistence\/status"/);
  assert.match(server, /pathname === "\/api\/persistence\/flush"/);
  assert.match(server, /pathname === "\/api\/dev\/seed-role-users"/);
  assert.match(server, /pathname === "\/contracts\/openapi\.json"/);
  assert.match(server, /contractArtifactPaths/);
  assert.match(server, /contract_artifact_not_found/);
  assert.match(server, /pathname === "\/api\/events"/);
  assert.match(server, /pathname === "\/api\/events\/replay"/);
  assert.match(server, /pathname === "\/api\/hot-reload\/stream"/);
  assert.match(server, /pathname === "\/api\/policy\/sandbox"/);
  assert.match(server, /pathname === "\/api\/compliance\/policy-bundles"/);
  assert.match(server, /pathname === "\/api\/compliance\/score"/);
  assert.match(server, /\/api\\\/policy-bundles\\\/\(\[\^\/\]\+\)\\\/sign/);
  assert.match(server, /\/api\\\/policy-bundles\\\/\(\[\^\/\]\+\)\\\/verify/);
  assert.match(server, /\/v1\\\/policy-bundles\\\/\(\[\^\/\]\+\)\\\/artifact/);
  assert.match(server, /pathname === "\/api\/breakglass"/);
  assert.match(server, /pathname === "\/api\/hot-reload\/events"/);
  assert.match(server, /function openEventStream/);
  assert.match(server, /function replayStreamEntries/);
  assert.match(server, /last-event-id/);
  assert.match(server, /broadcastSse\("hot_reload\.event"/);
  assert.match(server, /contractDriftReport/);
  assert.match(server, /function runtimeStateSnapshot/);
  assert.match(server, /async function loadRuntimeState/);
  assert.match(server, /async function persistRuntimeState/);
  assert.match(server, /function securityPostureStatus/);
  assert.match(server, /function createControlEnvelope/);
  assert.match(server, /function signPolicyBundle/);
  assert.match(server, /function verifyPolicyBundle/);
  assert.match(server, /function policyBundleArtifact/);
  assert.match(server, /function authorizationModel/);
  assert.match(server, /function createAuthorizationTuple/);
  assert.match(server, /function checkAuthorization/);
  assert.match(server, /function createTenantSignup/);
  assert.match(server, /function createInvitation/);
  assert.match(server, /function acceptInvitation/);
  assert.match(server, /function tokenHash/);
  assert.match(server, /function upsertIdentityProvider/);
  assert.match(server, /function billingUsageSnapshot/);
  assert.match(server, /function invoicePreview/);
  assert.match(server, /function ingestLcpUsageLedger/);
  assert.match(server, /function validateLcpUsageLedger/);
  assert.match(server, /\/api\/lcp\/usage-ledgers/);
  assert.match(server, /lcp_usage_ledger\.ingested/);
  assert.match(server, /function issueOfflineLicense/);
  assert.match(server, /function kmsHealth/);
  assert.match(server, /function ensureRoleTestUsers/);
  assert.match(server, /function setTenantMemberRoles/);
  assert.match(server, /session_tokens_hashed_at_rest/);
  assert.match(server, /payment_tokens_hashed_at_rest/);
  assert.match(server, /function aiPolicyProviders/);
  assert.match(server, /function redactPromptText/);
  assert.match(server, /function buildPolicyCitations/);
  assert.match(server, /function createPolicyFixtures/);
  assert.match(server, /crypto\.sign\(null, Buffer\.from\(payload\), bundleSigningKeyPair\.privateKey\)/);
  assert.match(server, /crypto\.verify\(null, Buffer\.from\(payload\), key/);
  assert.doesNotMatch(server, /dev-placeholder/);
  assert.match(server, /async function pollLcpEntityWatch/);
  assert.match(server, /function ingestLcpChangeBatch/);
  assert.match(server, /function changeCursorFor/);
  assert.match(server, /lcp_outbox_delta_push/);
  assert.match(server, /async function dispatchControlToLcp/);
  assert.match(server, /function allowedControlPaths/);
  assert.match(server, /pullLocalEntitySnapshot/);
  assert.match(server, /pullLocalConfigurationSnapshot/);
  assert.match(server, /ingestLocalEntitySnapshot/);
  assert.match(server, /\/api\\\/alarms\\\/\(\[\^\/\]\+\)\\\/ack/);
  assert.match(server, /\/api\\\/policy\\\/drafts\\\/\(\[\^\/\]\+\)\\\/simulate/);
  assert.match(server, /\/api\\\/policy\\\/drafts\\\/\(\[\^\/\]\+\)\\\/approve/);
  assert.match(server, /\/api\\\/rollouts\\\/\(\[\^\/\]\+\)\\\/\(advance\|pause\|resume\|cancel\)/);
  assert.match(server, /pathname === "\/api\/policy\/packs"/);
  assert.match(server, /pathname === "\/api\/integrations\/summary"/);
  assert.match(server, /const telemetryIngestKinds = new Map/);
  assert.match(server, /function recordTelemetryPayload/);
  assert.match(server, /function cloudCapabilitySnapshot/);
  assert.match(server, /function registryPage/);
  assert.match(server, /function discoveryPage/);
  assert.match(server, /function latestBundleEnvelope/);
  assert.match(server, /browser-extension\\\/events/);
  assert.match(server, /registry\\\/\(agents\|entities\|relationships\|resources\|tools\)/);
  assert.match(server, /discovery\\\/\(candidates\|entities\)/);
  assert.match(server, /capability-snapshot-v2/);
  assert.match(server, /devices\\\/\(\[\^\/\]\+\)\\\/bundles\\\/latest/);
});

test("api foundation enforces security headers, bounded responses, and body limits", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.match(health.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.ok(health.headers.get("x-pollek-request-id"));

    const fleet = await api(baseUrl, "/api/fleet?local_entities_limit=2&usage_records_limit=1");
    assert.equal(fleet.response.status, 200);
    assert.equal(fleet.payload.local_entities.length, 2);
    assert.equal(fleet.payload.usage_records.length, 1);
    assert.equal(fleet.payload.response_limits.local_entities.limit, 2);
    assert.equal(fleet.payload.response_limits.local_entities.returned, 2);
    assert.equal(fleet.payload.response_limits.usage_records.limit, 1);

    const invalidJson = await fetch(`${baseUrl}/api/lcp/usage-ledgers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalidJson.status, 400);
    const invalidJsonPayload = await invalidJson.json();
    assert.equal(invalidJsonPayload.error, "invalid_json_body");

    const oversized = await fetch(`${baseUrl}/api/lcp/usage-ledgers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: "local", payload: "x".repeat(1024 * 1024 + 256) })
    });
    assert.equal(oversized.status, 413);
    const oversizedPayload = await oversized.json();
    assert.equal(oversizedPayload.error, "request_body_too_large");
  });
});

test("dev server serves latest LCP compatibility endpoints", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const telemetryEvent = await api(baseUrl, "/v1/telemetry/events", {
      method: "POST",
      headers: {
        "x-pollek-tenant-id": "local",
        "x-pollek-device-id": "device_local_windows"
      },
      body: {
        event_id: "evt_test_lcp_observation",
        event_type: "agent.observation.v1",
        payload: { agent: "Antigravity", signal: "tool_usage", api_token: "lcp-secret-token" }
      }
    });
    assert.equal(telemetryEvent.response.status, 202);
    assert.equal(telemetryEvent.payload.schema_version, "telemetry-ingest-response.v1");
    assert.equal(telemetryEvent.payload.accepted, 1);
    assert.equal(telemetryEvent.payload.rejected, 0);
    assert.equal(telemetryEvent.payload.tenant_id, "local");

    const observations = await api(baseUrl, "/v1/telemetry/observations");
    assert.equal(observations.response.status, 200);
    assert.equal(observations.payload.schema_version, "observation-page.v1");
    assert.ok(observations.payload.items.length >= 1);

    const enforcement = await api(baseUrl, "/v1/telemetry/enforcement-status");
    assert.equal(enforcement.response.status, 200);
    assert.equal(enforcement.payload.schema_version, "enforcement-status-list.v1");
    assert.ok(Array.isArray(enforcement.payload.items));

    const resources = await api(baseUrl, "/v1/telemetry/resources");
    assert.equal(resources.response.status, 200);
    assert.equal(resources.payload.schema_version, "pollek.cloud.telemetry-resources-page.v1");

    const extension = await api(baseUrl, "/v1/tenants/local/browser-extension/events", {
      method: "POST",
      body: {
        device_id: "device_local_windows",
        url: "https://example.invalid",
        event_type: "browser_extension.discovery.v1",
        extension_secret: "browser-extension-secret"
      }
    });
    assert.equal(extension.response.status, 202);
    assert.equal(extension.payload.accepted, 1);

    const extensionStatus = await api(baseUrl, "/v1/tenants/local/browser-extension/status");
    assert.equal(extensionStatus.response.status, 200);
    assert.equal(extensionStatus.payload.schema_version, "pollek.cloud.browser-extension-status.v1");

    const registryResources = await api(baseUrl, "/v1/tenants/local/registry/resources");
    assert.equal(registryResources.response.status, 200);
    assert.equal(registryResources.payload.schema_version, "pollek.cloud.registry-resources-page.v1");

    const discoveryEntities = await api(baseUrl, "/v1/tenants/local/discovery/entities");
    assert.equal(discoveryEntities.response.status, 200);
    assert.equal(discoveryEntities.payload.schema_version, "pollek.cloud.discovery-entities-page.v1");

    const capability = await api(baseUrl, "/v1/tenants/local/devices/device_local_windows/capability-snapshot-v2");
    assert.equal(capability.response.status, 200);
    assert.equal(capability.payload.schema_version, "local-capability-snapshot.v2");
    assert.equal(capability.payload.tenant_id, "local");

    const latestBundle = await api(baseUrl, "/v1/tenants/local/devices/device_local_windows/bundles/latest", {
      method: "POST",
      body: { installed_revision: "2026.06.29.000" }
    });
    assert.equal(latestBundle.response.status, 200);
    assert.equal(latestBundle.payload.schema_version, "bundle-envelope.v1");
    assert.equal(latestBundle.payload.tenant_id, "local");
    assert.equal(latestBundle.payload.device_id, "device_local_windows");
    assert.equal(latestBundle.payload.signature_status, "valid");

    const fleet = await api(baseUrl, "/api/fleet");
    assert.equal(fleet.response.status, 200);
    assert.doesNotMatch(JSON.stringify(fleet.payload.events), /lcp-secret-token|browser-extension-secret/);
  });
});

test("cloud persists full LCP telemetry batches with idempotency, quarantine, and read parity", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const batchBody = {
      schema_version: "telemetry-batch.v1",
      tenant_id: "local",
      device_id: "device_local_windows",
      batch_id: "batch_full_lcp_1",
      events: [
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_obs_1",
          event_type: "agent_observation",
          timestamp: "2026-07-13T01:00:00Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: { agent_id: "agent_cursor", provider: "Anthropic", model: "claude-sonnet-4", token_usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 } }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_decision_1",
          event_type: "decision_log",
          timestamp: "2026-07-13T01:00:01Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: { decision: "deny", reason: "policy denied", pep_plane: "McpProxy" }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_guard_1",
          event_type: "guard_incident",
          timestamp: "2026-07-13T01:00:02Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: { guard: "prompt_guard", verdict: "blocked" }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_usage_1",
          event_type: "ai_usage_event",
          timestamp: "2026-07-13T01:00:03Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: {
            agent_id: "agent_claude",
            provider: "Anthropic",
            model: "claude-sonnet-4",
            tokens: { input_tokens: 500, output_tokens: 200, total_tokens: 700, estimated: false },
            cost: { currency: "USD", total_cost: 0.42 }
          }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_enforce_1",
          event_type: "enforcement_result",
          timestamp: "2026-07-13T01:00:04Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: { method_id: "mcp_proxy", status: "enforced" }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_tool_1",
          event_type: "tool_invocation",
          timestamp: "2026-07-13T01:00:05Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: true,
          payload: { tool_id: "fs_read", agent_id: "agent_cursor" }
        },
        {
          event_id: "evt_secret_1",
          event_type: "decision_log",
          payload: { reason: "authorization: Bearer sk-should-never-persist" }
        },
        {
          schema_version: "telemetry-envelope.v1",
          event_id: "evt_invalid_1",
          event_type: "decision_log",
          timestamp: "2026-07-13T01:00:06Z",
          tenant_id: "local",
          device_id: "device_local_windows",
          redaction_applied: "yes",
          payload: {}
        }
      ]
    };

    const first = await api(baseUrl, "/v1/telemetry/batches", { method: "POST", body: batchBody });
    assert.equal(first.response.status, 202);
    assert.equal(first.payload.schema_version, "telemetry-ingest-response.v1");
    assert.equal(first.payload.accepted, 6);
    assert.equal(first.payload.stored, 6);
    assert.equal(first.payload.rejected, 2);
    assert.equal(first.payload.duplicates, 0);
    assert.equal(first.payload.batch_id, "batch_full_lcp_1");
    assert.equal(first.payload.received_events, 8);
    assert.ok(first.payload.rejection_reasons.some((item) => item.reason === "unredacted_secret_detected"));
    assert.ok(first.payload.rejection_reasons.some((item) => item.reason === "invalid_envelope"));

    const replay = await api(baseUrl, "/v1/telemetry/batches", { method: "POST", body: { ...batchBody, batch_id: "batch_full_lcp_1_retry" } });
    assert.equal(replay.response.status, 202);
    assert.equal(replay.payload.accepted, 6);
    assert.equal(replay.payload.stored, 0);
    assert.equal(replay.payload.duplicates, 6);
    assert.equal(replay.payload.rejected, 2);

    const observations = await api(baseUrl, "/v1/telemetry/observations");
    assert.equal(observations.response.status, 200);
    assert.equal(observations.payload.schema_version, "observation-page.v1");
    assert.ok(observations.payload.items.some((item) => item.event_id === "evt_obs_1" && item.event_type === "agent_observation"));

    const enforcement = await api(baseUrl, "/v1/telemetry/enforcement-status");
    assert.ok(enforcement.payload.items.some((item) => item.event_id === "evt_enforce_1"));

    const decisions = await api(baseUrl, "/v1/tenants/local/telemetry/decision-logs");
    assert.equal(decisions.response.status, 200);
    assert.equal(decisions.payload.count, 1);
    assert.equal(decisions.payload.decisions[0].event_id, "evt_decision_1");

    const decisionsAlias = await api(baseUrl, "/v1/tenants/local/logs/decisions");
    assert.equal(decisionsAlias.payload.count, 1);

    const toolInvocations = await api(baseUrl, "/v1/tenants/local/logs/tool-invocations");
    assert.equal(toolInvocations.payload.count, 1);
    assert.equal(toolInvocations.payload.tool_invocations[0].event_id, "evt_tool_1");

    const guardEvents = await api(baseUrl, "/v1/tenants/local/telemetry/guard-events");
    assert.equal(guardEvents.payload.schema_version, "guard-events.v1");
    assert.equal(guardEvents.payload.count, 1);
    assert.equal(guardEvents.payload.items[0].event_id, "evt_guard_1");

    const exportJson = await api(baseUrl, "/v1/tenants/local/telemetry/export");
    assert.equal(exportJson.response.status, 200);
    assert.ok(Array.isArray(exportJson.payload));
    assert.ok(exportJson.payload.some((item) => item.event_id === "evt_usage_1"));

    const exportCsvResponse = await fetch(`${baseUrl}/v1/tenants/local/telemetry/export?format=csv`);
    assert.equal(exportCsvResponse.status, 200);
    assert.match(exportCsvResponse.headers.get("content-type") || "", /text\/csv/);
    const exportCsv = await exportCsvResponse.text();
    assert.match(exportCsv, /timestamp,event_type,event_id,tenant_id,details/);
    assert.match(exportCsv, /evt_decision_1/);

    const ingestStatus = await api(baseUrl, "/api/telemetry/ingest-status");
    assert.equal(ingestStatus.payload.schema_version, "pollek.cloud.telemetry-ingest-status.v1");
    assert.equal(ingestStatus.payload.stored_envelopes, 6);
    const localTotals = ingestStatus.payload.totals.find((item) => item.tenant_id === "local");
    assert.equal(localTotals.accepted, 6);
    assert.equal(localTotals.duplicates, 6);
    assert.equal(localTotals.quarantined_secrets, 2);
    assert.equal(localTotals.invalid_envelopes, 2);
    assert.equal(localTotals.by_event_type.agent_observation, 1);

    const billingUsage = await api(baseUrl, "/v1/tenants/local/billing/usage");
    assert.equal(billingUsage.response.status, 200);
    assert.equal(billingUsage.payload.summary.telemetry_events, 6);

    const persisted = JSON.stringify((await api(baseUrl, "/api/fleet")).payload);
    assert.doesNotMatch(persisted, /sk-should-never-persist/);
  });
});

test("registry sync ingests LCP registry objects and bridged telemetry", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const sync = await api(baseUrl, "/v1/tenants/local/registry/sync", {
      method: "POST",
      headers: { "x-pollek-device-id": "device_local_windows", "x-pollek-lcp-id": "lcp_local" },
      body: {
        tenant_id: "local",
        items: [
          { type: "agent", data: { agent_id: "agent_sync_test", name: "Synced Agent", trust_level: "trusted" } },
          { type: "tool", data: { tool_id: "tool_sync_test", name: "Synced Tool" } },
          { type: "resource", data: { resource_id: "res_sync_test", name: "Synced Resource" } },
          { type: "mcp_server", data: { id: "mcp_sync_test", name: "Synced MCP Server" } },
          { type: "telemetry_tool_invocation", data: { event_id: "evt_sync_tool_inv", tool_id: "tool_sync_test", agent_id: "agent_sync_test" } },
          { type: "telemetry_policy_deployment", data: { event_id: "evt_sync_policy_dep", policy_id: "pol_sync" } }
        ]
      }
    });
    assert.equal(sync.response.status, 202);
    assert.equal(sync.payload.schema_version, "pollek.cloud.registry-sync-response.v1");
    assert.equal(sync.payload.item_count, 6);
    assert.ok(sync.payload.ingested_entities >= 4);
    assert.equal(sync.payload.telemetry.accepted, 2);
    assert.equal(sync.payload.telemetry.rejected, 0);

    const agents = await api(baseUrl, "/v1/tenants/local/registry/agents");
    assert.ok(JSON.stringify(agents.payload).includes("agent_sync_test"));

    const toolInvocations = await api(baseUrl, "/v1/tenants/local/logs/tool-invocations");
    assert.ok(toolInvocations.payload.tool_invocations.some((item) => item.event_id === "evt_sync_tool_inv"));

    const policyDeployments = await api(baseUrl, "/v1/tenants/local/logs/policy-deployments");
    assert.ok(policyDeployments.payload.policy_deployments.some((item) => item.event_id === "evt_sync_policy_dep"));
  });
});

test("admin IAM and billing workflows enforce tenant context and redact secrets", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const tenantId = "tenant_smoke";
    const seed = await api(baseUrl, "/api/dev/seed-role-users", {
      method: "POST",
      body: { tenant_id: tenantId }
    });
    assert.equal(seed.response.status, 200);
    assert.equal(seed.payload.users.length, 6);

    const iamAdmin = seed.payload.users.find((user) => user.roles.includes("iam_admin"));
    const billingAdmin = seed.payload.users.find((user) => user.roles.includes("billing_admin"));
    const admin = seed.payload.users.find((user) => user.roles.includes("admin"));
    assert.ok(iamAdmin);
    assert.ok(billingAdmin);
    assert.ok(admin);

    const invite = await api(baseUrl, `/v1/tenants/${tenantId}/invitations`, {
      method: "POST",
      body: {
        email: "new-user@pollek.test",
        roles: ["viewer"],
        principal: `user:${iamAdmin.account_id}`,
        actor_id: iamAdmin.account_id
      }
    });
    assert.equal(invite.response.status, 201);
    assert.ok(invite.payload.token);

    const crossTenantInvite = await api(baseUrl, "/v1/tenants/other_tenant/invitations", {
      method: "POST",
      body: {
        email: "cross-tenant@pollek.test",
        roles: ["viewer"],
        principal: `user:${iamAdmin.account_id}`,
        actor_id: iamAdmin.account_id
      }
    });
    assert.equal(crossTenantInvite.response.status, 403);
    assert.equal(crossTenantInvite.payload.authorization.decision, "deny");

    const accepted = await api(baseUrl, "/v1/invitations/accept", {
      method: "POST",
      body: { token: invite.payload.token, display_name: "Accepted Smoke User" }
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.payload.membership.tenant_id, tenantId);
    assert.equal(accepted.payload.session.token_type, "Bearer");

    const roleUpdate = await api(baseUrl, `/v1/tenants/${tenantId}/members/${accepted.payload.account.id}/roles`, {
      method: "POST",
      body: {
        roles: ["operator"],
        principal: `user:${admin.account_id}`,
        actor_id: admin.account_id
      }
    });
    assert.equal(roleUpdate.response.status, 200);
    assert.deepEqual(roleUpdate.payload.member.roles, ["operator"]);

    const removed = await api(baseUrl, `/v1/tenants/${tenantId}/members/${accepted.payload.account.id}`, {
      method: "DELETE",
      body: {
        principal: `user:${admin.account_id}`,
        actor_id: admin.account_id
      }
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload.member.status, "removed");

    const idp = await api(baseUrl, `/v1/tenants/${tenantId}/identity-providers`, {
      method: "PUT",
      body: {
        id: "idp_smoke",
        provider_type: "keycloak_oidc",
        display_name: "Smoke Keycloak",
        status: "configured",
        issuer_url: "http://127.0.0.1:8080/realms/smoke",
        client_id: "pollek-cloud-console",
        client_secret: "super-secret-value",
        principal: `user:${iamAdmin.account_id}`,
        actor_id: iamAdmin.account_id
      }
    });
    assert.equal(idp.response.status, 200);
    assert.equal(idp.payload.provider.secret_ref, "sealed");
    assert.equal(idp.payload.provider.client_secret, undefined);

    const scimUser = await api(baseUrl, "/scim/v2/Users", {
      method: "POST",
      headers: { "x-pollek-tenant-id": tenantId },
      body: { userName: "scim-smoke@pollek.test", displayName: "SCIM Smoke" }
    });
    assert.equal(scimUser.response.status, 201);
    assert.equal(scimUser.payload.tenant_id, tenantId);

    const subscription = await api(baseUrl, `/v1/tenants/${tenantId}/billing/subscription`, {
      method: "POST",
      body: {
        plan_id: "plan_private_cloud",
        status: "active",
        actor_id: billingAdmin.account_id
      }
    });
    assert.equal(subscription.response.status, 200);
    assert.equal(subscription.payload.subscription.tenant_id, tenantId);

    const payment = await api(baseUrl, `/v1/tenants/${tenantId}/billing/payment-methods`, {
      method: "POST",
      body: {
        provider: "manual-dev",
        type: "purchase_order",
        reference: "po-secret-reference",
        provider_token: "payment-token-secret",
        actor_id: billingAdmin.account_id
      }
    });
    assert.equal(payment.response.status, 201);
    assert.doesNotMatch(JSON.stringify(payment.payload), /payment-token-secret|po-secret-reference/);

    const invoices = await api(baseUrl, `/v1/tenants/${tenantId}/billing/invoices`);
    assert.equal(invoices.response.status, 200);
    assert.equal(invoices.payload.tenant_id, tenantId);
    assert.ok(invoices.payload.invoices[0].line_items.length);

    const webhookBody = {
      id: "evt_smoke_idempotent",
      tenant_id: tenantId,
      type: "invoice.payment_succeeded",
      data: { tenant_id: tenantId }
    };
    const webhook1 = await api(baseUrl, "/v1/billing/webhooks/manual-dev", { method: "POST", body: webhookBody });
    const webhook2 = await api(baseUrl, "/v1/billing/webhooks/manual-dev", { method: "POST", body: webhookBody });
    assert.equal(webhook1.response.status, 202);
    assert.equal(webhook2.response.status, 200);
    assert.equal(webhook2.payload.event.status, "duplicate");

    const license = await api(baseUrl, `/v1/tenants/${tenantId}/billing/license/issue`, {
      method: "POST",
      body: { deployment_mode: "private_cloud", max_seats: 10 }
    });
    assert.equal(license.response.status, 201);
    assert.equal(license.payload.license.tenant_id, tenantId);

    const fleet = await api(baseUrl, "/api/fleet");
    const fleetJson = JSON.stringify(fleet.payload);
    assert.equal(fleet.response.status, 200);
    assert.doesNotMatch(fleetJson, /super-secret-value|payment-token-secret|po-secret-reference/);
    assert.ok(fleet.payload.tenant_members.some((member) => member.tenant_id === tenantId && member.account_id === accepted.payload.account.id && member.status === "removed"));
  });
});

test("billing usage exposes organization AI token and cost allocation", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const usage = await api(baseUrl, "/v1/tenants/local/billing/usage");
    assert.equal(usage.response.status, 200);
    assert.ok(usage.payload.summary.ai_model_tokens > 0);
    assert.ok(usage.payload.summary.ai_model_estimated_cost_cents > 0);

    const invoices = await api(baseUrl, "/v1/tenants/local/billing/invoices");
    assert.equal(invoices.response.status, 200);
    const metrics = invoices.payload.invoices[0].line_items.map((item) => item.metric);
    assert.ok(metrics.includes("ai_model_cost_allocation"));
  });
});

test("LCP usage ledger ingestion validates agent-first credit allocation", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const valid = await api(baseUrl, "/v1/tenants/local/lcp/usage-ledgers", {
      method: "POST",
      body: {
        schema_version: "pollek.lcp.usage-ledger.v1",
        ledger_id: "ledger_smoke_lcp_usage",
        tenant_id: "local",
        lcp_id: "lcp_local",
        observed_at: "2026-06-30T00:00:00.000Z",
        usage_entries: [
          {
            id: "usage_smoke_antigravity_gemini",
            entity_id: "entity_agent_antigravity",
            agent_id: "entity_agent_antigravity",
            agent_name: "Antigravity",
            device_id: "device_local_windows",
            device_name: "DELL-WINDOWS",
            user_subject: "DELL\\LocalAdmin",
            provider: "Google",
            model: "gemini-2.5-pro",
            pricing_model: "credit_pool",
            billing_pool_id: "credit_pool_local_gemini_agents",
            allocation_method: "lcp_reported_agent_share",
            call_count: 3,
            input_tokens: 1000,
            output_tokens: 500,
            total_tokens: 1500,
            billed_credits: 1.5,
            allocated_cost_cents: 150,
            confidence: "reported_by_lcp"
          },
          {
            id: "usage_smoke_claw_same_model",
            entity_id: "agent_openclaw_gateway",
            agent_id: "agent_openclaw_gateway",
            agent_name: "OpenClaw Gateway",
            device_id: "device_local_windows",
            device_name: "DELL-WINDOWS",
            user_subject: "DELL\\LocalAdmin",
            provider: "Google",
            model: "gemini-2.5-pro",
            pricing_model: "credit_pool",
            billing_pool_id: "credit_pool_local_gemini_agents",
            allocation_method: "lcp_reported_agent_share",
            call_count: 2,
            input_tokens: 700,
            output_tokens: 300,
            total_tokens: 1000,
            billed_credits: 1,
            allocated_cost_cents: 100,
            confidence: "reported_by_lcp"
          }
        ]
      }
    });
    assert.equal(valid.response.status, 202);
    assert.equal(valid.payload.ledger.accepted_count, 2);
    assert.equal(valid.payload.ledger.billed_credits, 2.5);
    assert.equal(valid.payload.usage_records[0].source, "lcp_usage_ledger");

    const usage = await api(baseUrl, "/v1/tenants/local/billing/usage");
    assert.equal(usage.response.status, 200);
    assert.ok(usage.payload.summary.ai_model_tokens >= 2500);
    assert.ok(usage.payload.summary.ai_model_credits >= 2.5);

    const invalid = await api(baseUrl, "/api/lcp/usage-ledgers", {
      method: "POST",
      body: {
        schema_version: "pollek.lcp.usage-ledger.v1",
        ledger_id: "ledger_missing_pool",
        tenant_id: "local",
        lcp_id: "lcp_local",
        observed_at: "2026-06-30T00:00:00.000Z",
        usage_entries: [
          {
            id: "usage_missing_pool",
            agent_id: "entity_agent_antigravity",
            agent_name: "Antigravity",
            device_id: "device_local_windows",
            user_subject: "DELL\\LocalAdmin",
            provider: "Google",
            model: "gemini-2.5-pro",
            pricing_model: "credit_pool",
            total_tokens: 1
          }
        ]
      }
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.error, "invalid_lcp_usage_ledger");
    assert.match(invalid.payload.detail, /billing_pool_id is required/);
  });
});

test("cross-OS LCP usage ledger fixtures ingest through tenant endpoint", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    const fixtureNames = ["windows", "macos", "linux"];
    for (const fixtureName of fixtureNames) {
      const fixture = JSON.parse(await readFile(`packages/contracts/fixtures/lcp-usage-ledger/${fixtureName}.json`, "utf8"));
      assert.equal(fixture.schema_version, "pollek.lcp.usage-ledger.v1");
      assert.equal(fixture.os_family, fixtureName);
      assert.ok(fixture.usage_entries.length >= 1);
      assert.ok(fixture.usage_entries.every((entry) => entry.device_id === fixture.device_id));

      const servedFixture = await api(baseUrl, `/contracts/fixtures/lcp-usage-ledger/${fixtureName}.json`);
      assert.equal(servedFixture.response.status, 200);
      assert.equal(servedFixture.payload.ledger_id, fixture.ledger_id);

      const result = await api(baseUrl, `/v1/tenants/${fixture.tenant_id}/lcp/usage-ledgers`, {
        method: "POST",
        body: fixture
      });
      assert.equal(result.response.status, 202);
      assert.equal(result.payload.ledger.accepted_count, fixture.usage_entries.length);
      assert.equal(result.payload.ledger.os_family, fixture.os_family);
      assert.ok(result.payload.usage_records.every((record) => record.source === "lcp_usage_ledger"));
      assert.ok(result.payload.usage_records.every((record) => record.os_family === fixture.os_family));
    }

    const fleet = await api(baseUrl, "/api/fleet");
    assert.equal(fleet.response.status, 200);
    const osFamilies = new Set(fleet.payload.usage_records.map((record) => record.os_family).filter(Boolean));
    assert.ok(osFamilies.has("windows"));
    assert.ok(osFamilies.has("macos"));
    assert.ok(osFamilies.has("linux"));

    const usage = await api(baseUrl, "/v1/tenants/local/billing/usage");
    assert.equal(usage.response.status, 200);
    assert.ok(usage.payload.summary.ai_model_tokens > 0);
    assert.ok(usage.payload.summary.ai_model_estimated_cost_cents > 0);
  });
});

test("contract hub serves concrete schema artifacts", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    for (const artifactPath of ["/contracts/events.schema.json", "/contracts/bundle-manifest.schema.json", "/contracts/telemetry-envelope.schema.json", "/contracts/lcp-usage-ledger.schema.json"]) {
      const artifact = await api(baseUrl, artifactPath);
      assert.equal(artifact.response.status, 200);
      assert.equal(artifact.payload.$schema, "https://json-schema.org/draft/2020-12/schema");
      assert.ok(artifact.payload.title);
    }
    const missing = await api(baseUrl, "/contracts/missing.schema.json");
    assert.equal(missing.response.status, 404);
    assert.equal(missing.payload.error, "contract_artifact_not_found");
  });
});

test("console wires fleet operations controls", async () => {
  const app = await readFile("apps/web/static/app.js", "utf8");
  const html = await readFile("apps/web/static/index.html", "utf8");
  const css = await readFile("apps/web/static/styles.css", "utf8");

  assert.match(html, /styles\.css\?v=20260630-os-fixtures/);
  assert.match(html, /app\.js\?v=20260630-os-fixtures/);
  assert.match(html, /id="rolloutButton"/);
  assert.match(html, /id="evidenceButton"/);
  assert.match(html, /id="appShell"/);
  assert.match(html, /id="navCollapseButton"/);
  assert.match(html, /id="opsCollapseButton"/);
  assert.match(html, /id="policyPackList"/);
  assert.match(html, /data-ops-section="policy-packs"/);
  assert.match(html, /data-ops-section="secure-channel"/);
  assert.match(html, /data-ops-section="live-sync"/);
  assert.match(html, /data-ops-section="alarms"/);
  assert.match(html, /data-ops-section="tasks"/);
  assert.match(html, /data-ops-section="integrations"/);
  assert.match(html, /data-tab-panel="policies"/);
  assert.match(html, /data-tab-panel="telemetry"/);
  assert.match(html, /data-tab-panel="entities"/);
  assert.match(html, /data-tab-panel="compliance"/);
  assert.match(html, /data-tab-panel="bundle_status"/);
  assert.match(html, /data-tab-panel="settings"/);
  assert.match(html, /data-tab-panel="administration"/);
  assert.doesNotMatch(html, /class="tab" data-tab="administration"/);
  assert.match(html, /id="bundleStatusCenterList"/);
  assert.match(html, /id="bundleDeliveryList"/);
  assert.match(html, /id="objectSettingsList"/);
  assert.match(html, /id="contractSettingsList"/);
  assert.match(html, /id="signupTenantButton"/);
  assert.match(html, /id="tenantSwitcher"/);
  assert.match(html, /id="tenantContextSummary"/);
  assert.match(html, /id="seedRoleUsersButton"/);
  assert.match(html, /id="loginDemoButton"/);
  assert.match(html, /id="logoutDemoButton"/);
  assert.match(html, /id="inviteMemberButton"/);
  assert.match(html, /id="acceptInviteButton"/);
  assert.match(html, /id="configureIdpButton"/);
  assert.match(html, /id="provisionScimUserButton"/);
  assert.match(html, /id="provisionScimGroupButton"/);
  assert.match(html, /id="updateSubscriptionButton"/);
  assert.match(html, /id="addPaymentButton"/);
  assert.match(html, /id="refreshInvoicesButton"/);
  assert.match(html, /id="billingWebhookButton"/);
  assert.match(html, /id="issueLicenseButton"/);
  assert.match(html, /id="adminOrgList"/);
  assert.match(html, /id="adminMembersList"/);
  assert.match(html, /id="adminIdpList"/);
  assert.match(html, /id="billingUsageList"/);
  assert.match(html, /id="billingInvoiceList"/);
  assert.match(html, /id="kmsHealthList"/);
  assert.match(html, /id="entityList"/);
  assert.match(html, /id="entityTracePanel"/);
  assert.match(html, /id="selectedEntityDetail"/);
  assert.match(html, /id="aiUsageSummary"/);
  assert.match(html, /id="aiUsageDeviceList"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab" id="tab-timeline" aria-controls="panel-timeline"/);
  assert.match(html, /id="activitySourceFilter"/);
  assert.match(html, /id="activitySeverityFilter"/);
  assert.match(html, /id="activitySearch"/);
  assert.match(html, /id="activitySummaryStrip"/);
  assert.match(html, /id="activityLedger"/);
  assert.match(html, /id="entitySyncButton"/);
  assert.match(html, /id="liveRefreshButton"/);
  assert.match(html, /id="pushConfigButton"/);
  assert.match(html, /id="hotReloadButton"/);
  assert.match(html, /id="liveSyncStatus"/);
  assert.match(html, /id="connectionProfileList"/);
  assert.match(html, /id="serviceEndpointList"/);
  assert.match(html, /id="aiPolicyButton"/);
  assert.match(html, /id="sandboxButton"/);
  assert.match(html, /id="breakglassButton"/);
  assert.match(html, /id="complianceDeployButton"/);
  assert.match(html, /id="telemetryQueryButton"/);
  assert.match(html, /id="enrollmentButton"/);
  assert.match(app, /async function createRollout/);
  assert.match(app, /async function exportEvidence/);
  assert.match(app, /async function acknowledgeAlarm/);
  assert.match(app, /function setActiveTab/);
  assert.match(app, /function renderEntities/);
  assert.match(app, /function buildActivityLedger/);
  assert.match(app, /function renderActivityLedger/);
  assert.match(app, /function ledgerNextAction/);
  assert.match(app, /function renderAiUsageOverview/);
  assert.match(app, /function aiUsageRecords/);
  assert.match(app, /function syntheticUsageRecords/);
  assert.match(app, /function usageAgentKey/);
  assert.match(app, /function usageModelKey/);
  assert.match(app, /agent first/);
  assert.match(app, /Awaiting LCP ledger/);
  assert.match(app, /LCP ledger records/);
  assert.match(app, /function renderSelectedEntityDetail/);
  assert.match(app, /Agent Cost & Tokens/);
  assert.match(app, /function safeDomId/);
  assert.match(app, /aria-controls="\$\{scopePanelId\}"/);
  assert.match(app, /role="region" aria-labelledby="\$\{scopeButtonId\}"/);
  assert.match(app, /activitySourceFilter/);
  assert.match(app, /Payload and evidence/);
  assert.match(css, /\.activity-ledger/);
  assert.match(css, /\.ledger-entry/);
  assert.match(css, /\.ledger-next-action/);
  assert.match(css, /\.ledger-evidence/);
  assert.match(css, /\.usage-overview/);
  assert.match(css, /\.usage-device-card/);
  assert.match(css, /\.usage-model-chip/);
  assert.match(css, /\.entity-detail-card/);
  assert.ok(app.includes('const sideNavAgentKinds = new Set(["agent", "registered_agent", "found_agent"]);'));
  assert.match(app, /const sideNavEntityGroups = \[/);
  assert.match(app, /function navigationAgentGroup/);
  assert.match(app, /if \(!groupKind\) continue/);
  assert.match(app, /function isSideNavAgentItem/);
  assert.match(app, /function revealEntityInList/);
  assert.match(app, /app\.collapsedEntityGroups\.delete\(categoryKey\)/);
  assert.match(app, /app\.activeTab = "entities"/);
  assert.ok(app.includes("button.style.paddingLeft = `${6 + depth * 10}px`;"));
  assert.match(app, /function entityGroupCollapsed\(key, defaultCollapsed, hasActiveEntity\)/);
  assert.match(app, /if \(app\.collapsedEntityGroups\.has\(key\)\) return true/);
  assert.match(app, /function toggleEntityGroup\(key, defaultCollapsed = false, hasActiveEntity = false\)/);
  assert.match(app, /toggleEntityGroup\(scopeGroup\.key, scopeDefaultCollapsed, scopeHasActive\)/);
  assert.match(app, /toggleEntityGroup\(categoryKey, categoryDefaultCollapsed, categoryHasActive\)/);
  assert.match(app, /async function syncEntities/);
  assert.match(app, /async function refreshLiveWatch/);
  assert.match(app, /async function dispatchConfigUpdate/);
  assert.match(app, /async function dispatchHotReload/);
  assert.match(app, /function reportActionError/);
  assert.match(app, /Human review: verify the Local Control Plane contract/);
  assert.match(app, /Config dispatch needs review/);
  assert.match(app, /Hot reload needs review/);
  assert.match(app, /function renderLiveSyncStatus/);
  assert.match(app, /function renderConnectionProfiles/);
  assert.match(app, /function renderServiceEndpoints/);
  assert.match(app, /async function generatePolicyDraft/);
  assert.match(app, /async function simulateLatestPolicy/);
  assert.match(app, /async function approveLatestPolicy/);
  assert.match(app, /function renderComplianceWorkspace/);
  assert.match(app, /function renderBundleStatusCenter/);
  assert.match(app, /function renderSettingsWorkspace/);
  assert.match(app, /function renderAdministrationWorkspace/);
  assert.match(app, /function selectedTenantId/);
  assert.match(app, /function tenantCatalog/);
  assert.match(app, /function osFamilyForRecord/);
  assert.match(app, /function osFamilyForEntity/);
  assert.match(app, /Fixtures ready: Windows, macOS, Linux/);
  assert.match(app, /OS pending/);
  assert.match(app, /async function seedRoleUsers/);
  assert.match(app, /async function loginDemoUser/);
  assert.match(app, /async function logoutDemoUser/);
  assert.match(app, /async function createDemoTenant/);
  assert.match(app, /async function inviteDemoMember/);
  assert.match(app, /async function acceptLatestInvite/);
  assert.match(app, /async function updateMemberRoles/);
  assert.match(app, /async function removeTenantMember/);
  assert.match(app, /async function configureIdentityProvider/);
  assert.match(app, /async function provisionScimUser/);
  assert.match(app, /async function provisionScimGroup/);
  assert.match(app, /async function updateSubscriptionPlan/);
  assert.match(app, /async function addPaymentReference/);
  assert.match(app, /async function refreshInvoicePreview/);
  assert.match(app, /async function sendBillingWebhookTest/);
  assert.match(app, /async function issueAdminLicense/);
  assert.match(app, /\/v1\/signup\/tenant/);
  assert.match(app, /\/v1\/tenants\/\{tenant_id\}\/invitations/);
  assert.match(app, /\/v1\/tenants\/\{tenant_id\}\/members\/\{account_id\}\/roles/);
  assert.match(app, /\/v1\/tenants\/\{tenant_id\}\/identity-providers/);
  assert.match(app, /\/v1\/tenants\/\{tenant_id\}\/billing\/license\/issue/);
  assert.match(app, /async function runComplianceSandbox/);
  assert.match(app, /async function requestBreakglass/);
  assert.match(app, /async function deployComplianceBundle/);
  assert.match(app, /async function queryTelemetry/);
  assert.match(app, /async function createEnrollment/);
  assert.match(app, /function connectEventStream/);
  assert.match(app, /function applyShellState/);
  assert.match(app, /function toggleOpsSection/);
  assert.match(app, /pollek\.cloud\.nav\.collapsed/);
  assert.match(app, /pollek\.cloud\.ops\.collapsed/);
  assert.match(app, /new EventSource\(streamUrl\)/);
  assert.match(app, /pollek\.cloud\.event_stream\.last_event_id/);
  assert.match(app, /local_entities\.updated/);
  assert.match(app, /cloud_to_local\.dispatched/);
  assert.match(app, /Cloud API streaming/);
  assert.match(app, /detailTabs\.hidden = nextTab === "administration"/);
  assert.match(css, /grid-template-columns: minmax\(760px, 1fr\) var\(--ops-width\)/);
  assert.match(css, /\.app-shell\.ops-collapsed \.ops-rail-content/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /\.tree-row \{[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
  assert.match(css, /\.node-name strong \{[\s\S]*font-weight: 400;/);
  assert.match(css, /\.node-icon \{[\s\S]*width: 18px;/);
});

test("static console assets stay ascii-only", async () => {
  const files = [
    "apps/web/static/index.html",
    "apps/web/static/app.js",
    "apps/web/static/styles.css"
  ];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.equal([...content].every((char) => char.charCodeAt(0) <= 127), true, `${file} contains non-ascii characters`);
  }
});
