-- Pollek Cloud PostgreSQL foundation schema.
-- Production and development should both target PostgreSQL to avoid migration drift.

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'saas',
  status text NOT NULL DEFAULT 'active',
  trust_domain text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  region text,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sites_tenant_idx ON sites(tenant_id);

CREATE TABLE IF NOT EXISTS device_groups (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id text REFERENCES sites(id) ON DELETE SET NULL,
  name text NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_groups_tenant_idx ON device_groups(tenant_id);
CREATE INDEX IF NOT EXISTS device_groups_site_idx ON device_groups(site_id);

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id text REFERENCES sites(id) ON DELETE SET NULL,
  device_group_id text REFERENCES device_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  hostname text,
  os text,
  arch text,
  status text NOT NULL DEFAULT 'pending',
  spiffe_id text,
  last_heartbeat_at timestamptz,
  capability_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrolled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_tenant_idx ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
CREATE INDEX IF NOT EXISTS devices_spiffe_idx ON devices(spiffe_id);

CREATE TABLE IF NOT EXISTS local_control_planes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version text,
  contract_version text,
  endpoint text,
  status text NOT NULL DEFAULT 'pending',
  active_bundle_id text,
  last_seen_at timestamptz,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_control_planes_tenant_idx ON local_control_planes(tenant_id);
CREATE INDEX IF NOT EXISTS local_control_planes_device_idx ON local_control_planes(device_id);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id text,
  source_type text,
  source_id text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  trace_id text,
  span_id text,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  entry_hash text
);

CREATE INDEX IF NOT EXISTS telemetry_events_tenant_time_idx ON telemetry_events(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_type_idx ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS telemetry_events_device_idx ON telemetry_events(device_id);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_tenant_status_idx ON tasks(tenant_id, status);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx ON audit_events(tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS enrollment_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id text REFERENCES sites(id) ON DELETE SET NULL,
  device_group_id text REFERENCES device_groups(id) ON DELETE SET NULL,
  device_name text NOT NULL,
  user_code text NOT NULL,
  device_code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'waiting_for_lcp',
  spiffe_id_template text NOT NULL,
  command text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollment_sessions_tenant_status_idx ON enrollment_sessions(tenant_id, status);

CREATE TABLE IF NOT EXISTS policy_projects (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_projects_tenant_idx ON policy_projects(tenant_id);

CREATE TABLE IF NOT EXISTS policy_drafts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id text REFERENCES policy_projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  intent text NOT NULL,
  status text NOT NULL DEFAULT 'requires_human_review',
  ai_generated boolean NOT NULL DEFAULT false,
  policy_ir jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_drafts_tenant_status_idx ON policy_drafts(tenant_id, status);

CREATE TABLE IF NOT EXISTS policy_simulations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id text NOT NULL REFERENCES policy_drafts(id) ON DELETE CASCADE,
  status text NOT NULL,
  summary text NOT NULL,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_simulations_tenant_draft_idx ON policy_simulations(tenant_id, draft_id);

CREATE TABLE IF NOT EXISTS policy_bundles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id text REFERENCES policy_drafts(id) ON DELETE SET NULL,
  name text NOT NULL,
  revision text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  hot_reload boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_bundles_tenant_status_idx ON policy_bundles(tenant_id, status);

CREATE TABLE IF NOT EXISTS rollout_plans (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bundle_id text NOT NULL,
  target_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  wave_strategy text NOT NULL DEFAULT 'canary-then-batch',
  status text NOT NULL DEFAULT 'planned',
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_stage integer NOT NULL DEFAULT -1,
  completed_target_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_target_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_pollek_compatibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rollout_plans_tenant_status_idx ON rollout_plans(tenant_id, status);

CREATE TABLE IF NOT EXISTS staged_rollout_results (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rollout_id text NOT NULL REFERENCES rollout_plans(id) ON DELETE CASCADE,
  stage_index integer NOT NULL,
  target_id text NOT NULL,
  status text NOT NULL DEFAULT 'dispatched',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staged_rollout_results_rollout_idx ON staged_rollout_results(tenant_id, rollout_id, stage_index);

CREATE TABLE IF NOT EXISTS hot_reload_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rollout_id text REFERENCES rollout_plans(id) ON DELETE SET NULL,
  lcp_id text REFERENCES local_control_planes(id) ON DELETE SET NULL,
  bundle_id text NOT NULL,
  event_type text NOT NULL,
  component text NOT NULL,
  status text NOT NULL,
  stage_index integer,
  wasm_generation integer,
  local_pollek_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hot_reload_events_tenant_time_idx ON hot_reload_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS adapter_catalog_entries (
  id text PRIMARY KEY,
  category text NOT NULL,
  display_name text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  direction text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integrations_tenant_type_idx ON integrations(tenant_id, type);

CREATE TABLE IF NOT EXISTS tenant_trust_scopes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trust_domain text NOT NULL,
  spire_server text NOT NULL,
  oidc_issuer text,
  mtls_profile text NOT NULL,
  oauth_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  entity_scope_template text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_trust_scopes_tenant_idx ON tenant_trust_scopes(tenant_id);

CREATE TABLE IF NOT EXISTS service_endpoints (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  endpoint text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_endpoints_tenant_type_idx ON service_endpoints(tenant_id, type);

CREATE TABLE IF NOT EXISTS device_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id text REFERENCES devices(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  user_subject text NOT NULL,
  oidc_subject text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_users_tenant_device_idx ON device_users(tenant_id, device_id);

CREATE TABLE IF NOT EXISTS local_entities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id text REFERENCES devices(id) ON DELETE SET NULL,
  lcp_id text REFERENCES local_control_planes(id) ON DELETE SET NULL,
  user_id text REFERENCES device_users(id) ON DELETE SET NULL,
  local_object_id text NOT NULL,
  entity_type text NOT NULL,
  class text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  risk text NOT NULL DEFAULT 'medium',
  source text NOT NULL,
  identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  enforcement jsonb NOT NULL DEFAULT '{}'::jsonb,
  observability jsonb NOT NULL DEFAULT '{}'::jsonb,
  wasm jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_entities_tenant_device_idx ON local_entities(tenant_id, device_id);
CREATE INDEX IF NOT EXISTS local_entities_type_status_idx ON local_entities(tenant_id, entity_type, status);
CREATE INDEX IF NOT EXISTS local_entities_lcp_idx ON local_entities(lcp_id);

CREATE TABLE IF NOT EXISTS entity_health_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id text NOT NULL REFERENCES local_entities(id) ON DELETE CASCADE,
  health_status text NOT NULL,
  score integer NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_health_snapshots_entity_idx ON entity_health_snapshots(tenant_id, entity_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS local_entity_relationships (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_object_id text NOT NULL,
  from_object_type text NOT NULL DEFAULT 'local_entity',
  to_object_id text NOT NULL,
  to_object_type text NOT NULL DEFAULT 'local_entity',
  label text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_entity_relationships_tenant_idx ON local_entity_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS local_entity_relationships_from_idx ON local_entity_relationships(tenant_id, from_object_id);
CREATE INDEX IF NOT EXISTS local_entity_relationships_to_idx ON local_entity_relationships(tenant_id, to_object_id);

CREATE TABLE IF NOT EXISTS local_entity_sync_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lcp_id text REFERENCES local_control_planes(id) ON DELETE SET NULL,
  device_id text REFERENCES devices(id) ON DELETE SET NULL,
  mode text NOT NULL,
  status text NOT NULL,
  entity_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_entity_sync_runs_tenant_time_idx ON local_entity_sync_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS policy_sandbox_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id text REFERENCES policy_drafts(id) ON DELETE SET NULL,
  profile_id text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  blast_radius jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_pollek_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_sandbox_runs_tenant_time_idx ON policy_sandbox_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS breakglass_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requester text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_approval',
  approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_pollek_semantics jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS breakglass_requests_tenant_status_idx ON breakglass_requests(tenant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS compliance_policy_bundles (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  edition text NOT NULL DEFAULT 'enterprise',
  enterprise_only boolean NOT NULL DEFAULT true,
  frameworks jsonb NOT NULL DEFAULT '[]'::jsonb,
  controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_engines jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract_hub_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_policy_bundles_tenant_status_idx ON compliance_policy_bundles(tenant_id, status);

CREATE TABLE IF NOT EXISTS evidence_exports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  format text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_exports_tenant_time_idx ON evidence_exports(tenant_id, requested_at DESC);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_control_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE staged_rollout_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_reload_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_trust_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_entity_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_sandbox_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE breakglass_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_policy_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_sites ON sites;
CREATE POLICY tenant_isolation_sites ON sites
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_device_groups ON device_groups;
CREATE POLICY tenant_isolation_device_groups ON device_groups
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_devices ON devices;
CREATE POLICY tenant_isolation_devices ON devices
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_lcps ON local_control_planes;
CREATE POLICY tenant_isolation_lcps ON local_control_planes
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_telemetry ON telemetry_events;
CREATE POLICY tenant_isolation_telemetry ON telemetry_events
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_audit_events ON audit_events;
CREATE POLICY tenant_isolation_audit_events ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_enrollment_sessions ON enrollment_sessions;
CREATE POLICY tenant_isolation_enrollment_sessions ON enrollment_sessions
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_projects ON policy_projects;
CREATE POLICY tenant_isolation_policy_projects ON policy_projects
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_drafts ON policy_drafts;
CREATE POLICY tenant_isolation_policy_drafts ON policy_drafts
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_simulations ON policy_simulations;
CREATE POLICY tenant_isolation_policy_simulations ON policy_simulations
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_bundles ON policy_bundles;
CREATE POLICY tenant_isolation_policy_bundles ON policy_bundles
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_rollout_plans ON rollout_plans;
CREATE POLICY tenant_isolation_rollout_plans ON rollout_plans
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_staged_rollout_results ON staged_rollout_results;
CREATE POLICY tenant_isolation_staged_rollout_results ON staged_rollout_results
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_hot_reload_events ON hot_reload_events;
CREATE POLICY tenant_isolation_hot_reload_events ON hot_reload_events
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
CREATE POLICY tenant_isolation_integrations ON integrations
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_tenant_trust_scopes ON tenant_trust_scopes;
CREATE POLICY tenant_isolation_tenant_trust_scopes ON tenant_trust_scopes
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_service_endpoints ON service_endpoints;
CREATE POLICY tenant_isolation_service_endpoints ON service_endpoints
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_device_users ON device_users;
CREATE POLICY tenant_isolation_device_users ON device_users
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_local_entities ON local_entities;
CREATE POLICY tenant_isolation_local_entities ON local_entities
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_entity_health_snapshots ON entity_health_snapshots;
CREATE POLICY tenant_isolation_entity_health_snapshots ON entity_health_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_local_entity_relationships ON local_entity_relationships;
CREATE POLICY tenant_isolation_local_entity_relationships ON local_entity_relationships
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_local_entity_sync_runs ON local_entity_sync_runs;
CREATE POLICY tenant_isolation_local_entity_sync_runs ON local_entity_sync_runs
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_sandbox_runs ON policy_sandbox_runs;
CREATE POLICY tenant_isolation_policy_sandbox_runs ON policy_sandbox_runs
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_breakglass_requests ON breakglass_requests;
CREATE POLICY tenant_isolation_breakglass_requests ON breakglass_requests
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_compliance_policy_bundles ON compliance_policy_bundles;
CREATE POLICY tenant_isolation_compliance_policy_bundles ON compliance_policy_bundles
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_evidence_exports ON evidence_exports;
CREATE POLICY tenant_isolation_evidence_exports ON evidence_exports
  USING (tenant_id = current_setting('app.tenant_id', true));
