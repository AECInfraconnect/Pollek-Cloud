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
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/v1/signup/tenant"));
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/v1/tenants/{tenant_id}/members/{account_id}/roles"));
  assert.ok(contract.interfaces["pollek.cloud.identity"].paths.includes("/scim/v2/Users"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].paths.includes("/v1/tenants/{tenant_id}/billing/license/issue"));
  assert.ok(contract.interfaces["pollek.cloud.billing"].controls.includes("webhook_idempotency"));
  assert.ok(contract.interfaces["pollek.cloud.kms"].paths.includes("/v1/kms/health"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/events.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/bundle-manifest.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.contract_artifacts"].paths.includes("/contracts/telemetry-envelope.schema.json"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/api/lcp/change-batches"));
  assert.ok(contract.interfaces["pollek.cloud.local_entities"].paths.includes("/v1/tenants/{tenant_id}/lcp/change-batches"));
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
  assert.ok(contract.interfaces["pollek.cloud.policy_bundle"].controls.includes("content_addressed_artifact"));
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
  assert.ok(openapi.paths["/v1/tenants/{tenant_id}/billing/license/issue"].post);
  assert.ok(openapi.paths["/v1/kms/health"].get);
  assert.ok(openapi.paths["/api/policy/providers"].get);
  assert.ok(openapi.paths["/api/events"].get);
  assert.ok(openapi.paths["/api/events/replay"].get);
  assert.ok(openapi.paths["/api/hot-reload/stream"].get);
  assert.equal(packageJson.scripts["contracts:sdk"], "node scripts/generate-sdk.mjs");
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
  assert.match(sdk, /export class PollekCloudClient/);
  assert.match(sdk, /POLLEK_CONTRACT_VERSION = "2026\.06\.29"/);
  assert.match(sdk, /replayEvents/);
  assert.match(sdk, /checkAuthorization/);
  assert.match(sdk, /signupTenant/);
  assert.match(sdk, /inviteMember/);
  assert.match(sdk, /getEventSchema/);
  assert.match(sdk, /getBundleManifestSchema/);
  assert.match(sdk, /getTelemetryEnvelopeSchema/);
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
  assert.match(generator, /export function sdkSource/);
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

test("contract hub serves concrete schema artifacts", async (t) => {
  await withDevServer(t, async (baseUrl) => {
    for (const artifactPath of ["/contracts/events.schema.json", "/contracts/bundle-manifest.schema.json", "/contracts/telemetry-envelope.schema.json"]) {
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

  assert.match(html, /styles\.css\?v=20260629-agent-nav-polish/);
  assert.match(html, /app\.js\?v=20260629-agent-nav-focus/);
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
