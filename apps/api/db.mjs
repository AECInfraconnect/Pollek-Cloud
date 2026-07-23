// Postgres persistence for Pollek Cloud.
//
// Active only when DATABASE_URL is set (Railway). When absent, the server keeps its
// file-snapshot persistence for local dev and tests. This module owns: the connection pool,
// idempotent migration runner, the tenant-scoped RLS session helper, and the write-through /
// load of the runtime snapshot into the tenant-partitioned runtime_items store.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../packages/db/migrations");

// Sentinel tenant ids used by the runtime store RLS policy.
const ALL_TENANTS = "__all__";
const SYSTEM_TENANT = "__system__";

// Root snapshot fields that are plain arrays.
const ROOT_ARRAYS = ["events", "eventJournal", "auditEvents", "tasks", "probes"];
// Root snapshot fields serialized as [key, value] entry arrays (rehydrated into Maps).
const ROOT_MAPS = ["devices", "enrollmentCodes"];

let pool = null;
let pgModule = null;

export function isEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

async function getPool() {
  if (pool) return pool;
  if (!pgModule) pgModule = (await import("pg")).default;
  const ssl = process.env.PGSSLMODE === "disable" || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "")
    ? false
    : { rejectUnauthorized: false };
  pool = new pgModule.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: Number(process.env.POLLEK_CLOUD_PG_POOL_MAX || 8),
    idleTimeoutMillis: 30000
  });
  return pool;
}

// Run every migration file once, tracked in schema_migrations. Files are idempotent
// (IF NOT EXISTS / DROP POLICY IF EXISTS) so re-running is safe even if tracking is lost.
export async function migrate() {
  const db = await getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await db.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }
  return { applied: [...applied], ran };
}

// Run a callback inside a transaction scoped to a tenant for RLS. Pass "__all__" for the
// cross-tenant aggregator/admin path. SET LOCAL keeps the scope bound to this transaction.
export async function withTenant(tenantId, fn) {
  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function tenantOf(doc) {
  if (Array.isArray(doc)) {
    const value = doc[1];
    return (value && typeof value === "object" && typeof value.tenant_id === "string" && value.tenant_id) || SYSTEM_TENANT;
  }
  if (doc && typeof doc === "object" && typeof doc.tenant_id === "string" && doc.tenant_id) return doc.tenant_id;
  return SYSTEM_TENANT;
}

// Flatten the runtime snapshot into (collection, ordinal, tenant_id, doc) rows.
function snapshotToRows(snapshot, persistedFleetKeys) {
  const rows = [];
  const push = (collection, doc) => rows.push({ collection, ordinal: 0, tenant_id: tenantOf(doc), doc });
  const pushArray = (collection, arr) => {
    (Array.isArray(arr) ? arr : []).forEach((item, index) => {
      rows.push({ collection, ordinal: index, tenant_id: tenantOf(item), doc: item });
    });
  };

  if (snapshot.tenant && typeof snapshot.tenant === "object") push("root-obj:tenant", snapshot.tenant);
  for (const key of ROOT_ARRAYS) pushArray(`root-arr:${key}`, snapshot[key]);
  for (const key of ROOT_MAPS) pushArray(`root-map:${key}`, snapshot[key]);

  const fleet = snapshot.fleet && typeof snapshot.fleet === "object" ? snapshot.fleet : {};
  for (const key of persistedFleetKeys) {
    const value = fleet[key];
    if (Array.isArray(value)) pushArray(`fleet-arr:${key}`, value);
    else if (value !== undefined) push(`fleet-val:${key}`, value);
  }
  return rows;
}

// Rebuild the snapshot object (the shape applyRuntimeStateSnapshot consumes) from rows.
function rowsToSnapshot(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.collection)) grouped.set(row.collection, []);
    grouped.get(row.collection).push(row);
  }
  const orderedDocs = (collection) => (grouped.get(collection) || [])
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((row) => row.doc);

  const snapshot = { fleet: {} };
  const tenantRows = grouped.get("root-obj:tenant");
  if (tenantRows && tenantRows.length) snapshot.tenant = tenantRows[0].doc;
  for (const key of ROOT_ARRAYS) if (grouped.has(`root-arr:${key}`)) snapshot[key] = orderedDocs(`root-arr:${key}`);
  for (const key of ROOT_MAPS) if (grouped.has(`root-map:${key}`)) snapshot[key] = orderedDocs(`root-map:${key}`);

  for (const collection of grouped.keys()) {
    if (collection.startsWith("fleet-arr:")) snapshot.fleet[collection.slice("fleet-arr:".length)] = orderedDocs(collection);
    else if (collection.startsWith("fleet-val:")) snapshot.fleet[collection.slice("fleet-val:".length)] = grouped.get(collection)[0].doc;
  }
  return snapshot;
}

// Write-through the whole snapshot. Delete-all + insert inside one transaction as the
// aggregator (__all__) guarantees an exact round-trip with no orphaned rows.
export async function persistSnapshot(snapshot, persistedFleetKeys) {
  const rows = snapshotToRows(snapshot, persistedFleetKeys);
  await withTenant(ALL_TENANTS, async (client) => {
    await client.query("DELETE FROM runtime_items");
    if (!rows.length) return;
    const chunkSize = 500;
    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize);
      const values = [];
      const params = [];
      chunk.forEach((row, index) => {
        const base = index * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(row.collection, row.ordinal, row.tenant_id, JSON.stringify(row.doc));
      });
      await client.query(
        `INSERT INTO runtime_items (collection, ordinal, tenant_id, doc) VALUES ${values.join(", ")}`,
        params
      );
    }
  });
}

// Load the durable snapshot. Returns null when the store is empty (fresh database).
export async function loadSnapshot() {
  const rows = await withTenant(ALL_TENANTS, async (client) => {
    const result = await client.query("SELECT collection, ordinal, tenant_id, doc FROM runtime_items");
    return result.rows;
  });
  if (!rows.length) return null;
  return rowsToSnapshot(rows);
}

export async function ping() {
  const db = await getPool();
  const result = await db.query("SELECT now() AS now");
  return result.rows[0]?.now || null;
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export const _internals = { snapshotToRows, rowsToSnapshot, tenantOf, ALL_TENANTS, SYSTEM_TENANT };
