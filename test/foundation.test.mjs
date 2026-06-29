import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("contract discovery declares required cloud protocol features", async () => {
  const contract = JSON.parse(await readFile("packages/contracts/pollek-contract.json", "utf8"));

  assert.equal(contract.schema_version, "pollek-cloud-contract-discovery.v1");
  assert.equal(contract.features.hot_reload, true);
  assert.equal(contract.features.signed_bundles, true);
  assert.equal(contract.features.oauth_device_flow, true);
  assert.equal(contract.features.ai_policy_editor, true);
  assert.ok(contract.supported_transports.includes("mtls"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"]);
  assert.ok(contract.interfaces["pollek.cloud.local_entities"]);
  assert.ok(contract.interfaces["pollek.cloud.trust_scope"]);
  assert.ok(contract.interfaces["pollek.cloud.connection_update"]);
  assert.ok(contract.interfaces["pollek.cloud.policy_authoring"]);
  assert.equal(contract.interfaces["pollek.cloud.policy_authoring"].human_approval_required, true);
  assert.equal(contract.features.local_entity_inventory, true);
  assert.equal(contract.features.tenant_trust_scopes, true);
  assert.equal(contract.features.contract_hub_connection_updates, true);
  assert.equal(contract.features.wasm_hot_reload_registry, true);
});

test("postgres foundation migration includes tenant RLS policies", async () => {
  const migration = await readFile("packages/db/migrations/0001_foundation.sql", "utf8");

  assert.match(migration, /ALTER TABLE devices ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_drafts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS enrollment_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS integrations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tenant_trust_scopes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS service_endpoints/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS device_users/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entities/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entity_relationships/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS local_entity_sync_runs/);
  assert.match(migration, /CREATE POLICY tenant_isolation_devices/);
  assert.match(migration, /CREATE POLICY tenant_isolation_policy_drafts/);
  assert.match(migration, /CREATE POLICY tenant_isolation_enrollment_sessions/);
  assert.match(migration, /CREATE POLICY tenant_isolation_local_entities/);
  assert.match(migration, /CREATE POLICY tenant_isolation_tenant_trust_scopes/);
  assert.match(migration, /current_setting\('app\.tenant_id'/);
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
  assert.match(server, /pathname === "\/api\/policy\/assist"/);
  assert.match(server, /pathname === "\/api\/enrollments"/);
  assert.match(server, /pathname === "\/api\/telemetry\/query"/);
  assert.match(server, /pathname === "\/api\/telemetry\/sample"/);
  assert.match(server, /pathname === "\/api\/entities"/);
  assert.match(server, /pathname === "\/api\/entities\/summary"/);
  assert.match(server, /pathname === "\/api\/entities\/ingest"/);
  assert.match(server, /pathname === "\/api\/entities\/sync"/);
  assert.match(server, /pathname === "\/api\/trust\/scopes"/);
  assert.match(server, /pathname === "\/api\/services\/endpoints"/);
  assert.match(server, /pathname === "\/api\/contract-hub\/connection-updates"/);
  assert.match(server, /pullLocalEntitySnapshot/);
  assert.match(server, /ingestLocalEntitySnapshot/);
  assert.match(server, /\/api\\\/alarms\\\/\(\[\^\/\]\+\)\\\/ack/);
  assert.match(server, /\/api\\\/policy\\\/drafts\\\/\(\[\^\/\]\+\)\\\/simulate/);
  assert.match(server, /\/api\\\/policy\\\/drafts\\\/\(\[\^\/\]\+\)\\\/approve/);
  assert.match(server, /pathname === "\/api\/policy\/packs"/);
  assert.match(server, /pathname === "\/api\/integrations\/summary"/);
});

test("console wires fleet operations controls", async () => {
  const app = await readFile("apps/web/static/app.js", "utf8");
  const html = await readFile("apps/web/static/index.html", "utf8");

  assert.match(html, /id="rolloutButton"/);
  assert.match(html, /id="evidenceButton"/);
  assert.match(html, /id="policyPackList"/);
  assert.match(html, /data-tab-panel="policies"/);
  assert.match(html, /data-tab-panel="telemetry"/);
  assert.match(html, /data-tab-panel="entities"/);
  assert.match(html, /id="entityList"/);
  assert.match(html, /id="entityTracePanel"/);
  assert.match(html, /id="entitySyncButton"/);
  assert.match(html, /id="connectionProfileList"/);
  assert.match(html, /id="serviceEndpointList"/);
  assert.match(html, /id="aiPolicyButton"/);
  assert.match(html, /id="telemetryQueryButton"/);
  assert.match(html, /id="enrollmentButton"/);
  assert.match(app, /async function createRollout/);
  assert.match(app, /async function exportEvidence/);
  assert.match(app, /async function acknowledgeAlarm/);
  assert.match(app, /function setActiveTab/);
  assert.match(app, /function renderEntities/);
  assert.match(app, /async function syncEntities/);
  assert.match(app, /function renderConnectionProfiles/);
  assert.match(app, /function renderServiceEndpoints/);
  assert.match(app, /async function generatePolicyDraft/);
  assert.match(app, /async function simulateLatestPolicy/);
  assert.match(app, /async function approveLatestPolicy/);
  assert.match(app, /async function queryTelemetry/);
  assert.match(app, /async function createEnrollment/);
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
