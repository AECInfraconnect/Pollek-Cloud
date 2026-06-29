import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("contract discovery declares required cloud protocol features", async () => {
  const contract = JSON.parse(await readFile("packages/contracts/pollek-contract.json", "utf8"));

  assert.equal(contract.schema_version, "pollek-cloud-contract-discovery.v1");
  assert.equal(contract.features.hot_reload, true);
  assert.equal(contract.features.signed_bundles, true);
  assert.equal(contract.features.oauth_device_flow, true);
  assert.ok(contract.supported_transports.includes("mtls"));
  assert.ok(contract.interfaces["pollek.cloud.telemetry"]);
});

test("postgres foundation migration includes tenant RLS policies", async () => {
  const migration = await readFile("packages/db/migrations/0001_foundation.sql", "utf8");

  assert.match(migration, /ALTER TABLE devices ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY tenant_isolation_devices/);
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
  assert.match(server, /\/api\\\/alarms\\\/\(\[\^\/\]\+\)\\\/ack/);
  assert.match(server, /pathname === "\/api\/policy\/packs"/);
  assert.match(server, /pathname === "\/api\/integrations\/summary"/);
});

test("console wires fleet operations controls", async () => {
  const app = await readFile("apps/web/static/app.js", "utf8");
  const html = await readFile("apps/web/static/index.html", "utf8");

  assert.match(html, /id="rolloutButton"/);
  assert.match(html, /id="evidenceButton"/);
  assert.match(html, /id="policyPackList"/);
  assert.match(app, /async function createRollout/);
  assert.match(app, /async function exportEvidence/);
  assert.match(app, /async function acknowledgeAlarm/);
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
