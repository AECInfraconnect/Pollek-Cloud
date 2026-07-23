-- Durable, tenant-partitioned runtime store for Pollek Cloud.
--
-- The Cloud server keeps its working model in memory (state.fleet.*) and, when a
-- DATABASE_URL is configured, write-throughs the full runtime snapshot into this table so
-- state survives redeploys. Each persisted collection item becomes one row tagged with the
-- tenant it belongs to, so row-level tenant isolation is enforced by Postgres RLS, not just
-- by application code.
--
-- Isolation contract (matches the app.tenant_id convention used across 0001/0002):
--   * a session scoped to a tenant sets  SET app.tenant_id = '<tenant_id>'  and sees only
--     that tenant's rows plus shared '__system__' rows (global config / non-tenant data);
--   * the aggregator/admin path sets      SET app.tenant_id = '__all__'      to read or
--     write across every tenant (the console legitimately aggregates all tenants);
--   * with no app.tenant_id set, current_setting(...) is NULL and the row is hidden
--     (fail-closed).
--
-- FORCE ROW LEVEL SECURITY makes the policy apply even to the table owner, so RLS is real
-- regardless of which role the app connects as.

CREATE TABLE IF NOT EXISTS runtime_items (
  collection text NOT NULL,
  ordinal integer NOT NULL,
  tenant_id text NOT NULL DEFAULT '__system__',
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, ordinal)
);

CREATE INDEX IF NOT EXISTS runtime_items_tenant_idx ON runtime_items(tenant_id);
CREATE INDEX IF NOT EXISTS runtime_items_collection_idx ON runtime_items(collection);

ALTER TABLE runtime_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_runtime_items ON runtime_items;
CREATE POLICY tenant_isolation_runtime_items ON runtime_items
  USING (
    tenant_id = '__system__'
    OR current_setting('app.tenant_id', true) = '__all__'
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.tenant_id', true) = '__all__'
    OR tenant_id = current_setting('app.tenant_id', true)
    OR (tenant_id = '__system__' AND current_setting('app.tenant_id', true) = '__all__')
  );
