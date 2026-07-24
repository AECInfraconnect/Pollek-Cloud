// Postgres persistence integration tests.
//
// These run only when PG_TEST_URL is set (a Postgres the test may migrate + write to), so the
// default `npm test` stays green without a database. RLS isolation assertions additionally
// require PG_TEST_APP_URL: a NON-SUPERUSER role with privileges on the schema. This mirrors
// production, where the Cloud must connect as a non-superuser or Postgres RLS is bypassed.

import test from "node:test";
import assert from "node:assert/strict";

const ADMIN_URL = process.env.PG_TEST_URL || "";
const APP_URL = process.env.PG_TEST_APP_URL || "";
const runDb = Boolean(ADMIN_URL);

if (runDb) {
  process.env.DATABASE_URL = ADMIN_URL;
  if (!process.env.PGSSLMODE) process.env.PGSSLMODE = "disable";
}

const db = runDb ? await import("../apps/api/db.mjs") : null;

const persistedFleetKeys = ["policyBundles", "bundleGeneration", "trustRevocations"];

function sampleSnapshot() {
  return {
    tenant: { id: "tnt_local_lab", name: "Local Lab" },
    events: [{ id: "evt1", tenant_id: "tenant_a" }],
    eventJournal: [],
    auditEvents: [],
    tasks: [],
    probes: [],
    devices: [["dev_a", { id: "dev_a", tenant_id: "tenant_a", name: "A" }]],
    enrollmentCodes: [],
    fleet: {
      policyBundles: [
        { id: "b1", tenant_id: "tenant_a", revision: "r1" },
        { id: "b2", tenant_id: "tenant_b", revision: "r2" }
      ],
      bundleGeneration: 7,
      trustRevocations: {
        revocation_epoch: 3,
        revoked_key_ids: [],
        revoked_bundle_digests: [],
        revoked_revisions: ["2026.06.29.001"],
        history: []
      }
    }
  };
}

test("postgres: migrations apply and are tracked", { skip: !runDb }, async () => {
  const result = await db.migrate();
  assert.ok(Array.isArray(result.ran));
  // Re-running is idempotent: nothing new applied the second time.
  const second = await db.migrate();
  assert.equal(second.ran.length, 0);
});

test("postgres: runtime store round-trips the snapshot", { skip: !runDb }, async () => {
  const snapshot = sampleSnapshot();
  await db.persistSnapshot(snapshot, persistedFleetKeys);
  const loaded = await db.loadSnapshot();
  assert.ok(loaded, "snapshot loads back");
  assert.equal(loaded.tenant.id, "tnt_local_lab");
  assert.equal(loaded.fleet.policyBundles.length, 2);
  assert.equal(loaded.fleet.policyBundles[0].id, "b1");
  assert.equal(loaded.fleet.bundleGeneration, 7);
  assert.equal(loaded.fleet.trustRevocations.revocation_epoch, 3);
  assert.deepEqual(loaded.fleet.trustRevocations.revoked_revisions, ["2026.06.29.001"]);
  assert.equal(loaded.devices.length, 1);
  assert.equal(loaded.devices[0][0], "dev_a");
});

test(
  "postgres: items are tagged with the owning tenant, system rows shared",
  { skip: !runDb },
  async () => {
    await db.persistSnapshot(sampleSnapshot(), persistedFleetKeys);
    const rows = await db.withTenant(
      db._internals.ALL_TENANTS,
      async (client) => (await client.query("SELECT collection, tenant_id FROM runtime_items")).rows
    );
    const byTenant = (t) => rows.filter((r) => r.tenant_id === t).length;
    assert.ok(byTenant("tenant_a") >= 1, "tenant_a rows tagged");
    assert.ok(byTenant("tenant_b") >= 1, "tenant_b rows tagged");
    // Non-tenant config (bundleGeneration/trustRevocations/tenant) lands in __system__.
    assert.ok(byTenant(db._internals.SYSTEM_TENANT) >= 1, "system rows present");
  }
);

test(
  "postgres: RLS isolates tenants for a non-superuser role",
  { skip: !runDb || !APP_URL },
  async () => {
    await db.persistSnapshot(sampleSnapshot(), persistedFleetKeys);
    const pg = (await import("pg")).default;
    const appPool = new pg.Pool({ connectionString: APP_URL, ssl: false });
    const scopedTenants = async (tenantId) => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const res = await client.query("SELECT DISTINCT tenant_id FROM runtime_items");
        await client.query("COMMIT");
        return res.rows.map((r) => r.tenant_id);
      } finally {
        client.release();
      }
    };
    try {
      const a = await scopedTenants("tenant_a");
      assert.ok(a.includes("tenant_a"), "tenant_a sees its own rows");
      assert.ok(!a.includes("tenant_b"), "tenant_a cannot see tenant_b rows");
      assert.ok(a.includes(db._internals.SYSTEM_TENANT), "tenant_a sees shared system rows");

      const b = await scopedTenants("tenant_b");
      assert.ok(b.includes("tenant_b"));
      assert.ok(!b.includes("tenant_a"), "tenant_b cannot see tenant_a rows");

      const none = await scopedTenants("");
      assert.ok(
        !none.includes("tenant_a") && !none.includes("tenant_b"),
        "unscoped session sees no tenant data (fail-closed)"
      );
    } finally {
      await appPool.end();
    }
  }
);

test.after(async () => {
  if (db) await db.close();
});
