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

CREATE TABLE IF NOT EXISTS event_stream_journal (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  channel text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_stream_journal_tenant_sequence_idx ON event_stream_journal(tenant_id, sequence);
CREATE INDEX IF NOT EXISTS event_stream_journal_tenant_channel_idx ON event_stream_journal(tenant_id, channel, sequence DESC);

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

CREATE TABLE IF NOT EXISTS authorization_tuples (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principal text NOT NULL,
  relation text NOT NULL,
  object text NOT NULL,
  condition jsonb,
  source text NOT NULL DEFAULT 'cloud_admin',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_tuples_tenant_object_idx ON authorization_tuples(tenant_id, object, relation);
CREATE INDEX IF NOT EXISTS authorization_tuples_tenant_principal_idx ON authorization_tuples(tenant_id, principal);

CREATE TABLE IF NOT EXISTS authorization_decisions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principal text NOT NULL,
  action text NOT NULL,
  object text NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  engine_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_decisions_tenant_time_idx ON authorization_decisions(tenant_id, checked_at DESC);

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

CREATE TABLE IF NOT EXISTS ai_policy_provider_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id text NOT NULL REFERENCES policy_drafts(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  mode text NOT NULL,
  prompt_hash text NOT NULL,
  redacted_prompt_hash text NOT NULL,
  redaction_applied boolean NOT NULL DEFAULT false,
  recommended_engine text NOT NULL,
  citation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_policy_provider_runs_tenant_draft_idx ON ai_policy_provider_runs(tenant_id, draft_id, created_at DESC);

CREATE TABLE IF NOT EXISTS policy_test_fixtures (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id text NOT NULL REFERENCES policy_drafts(id) ON DELETE CASCADE,
  name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected text NOT NULL,
  source text NOT NULL DEFAULT 'ai_policy_assistant',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_test_fixtures_tenant_draft_idx ON policy_test_fixtures(tenant_id, draft_id);

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

CREATE TABLE IF NOT EXISTS policy_bundle_signatures (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bundle_id text NOT NULL REFERENCES policy_bundles(id) ON DELETE CASCADE,
  revision text NOT NULL,
  approval_id text,
  alg text NOT NULL,
  key_id text NOT NULL,
  public_key_pem text NOT NULL,
  payload_hash text NOT NULL,
  signature text NOT NULL,
  signed_by text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS policy_bundle_signatures_tenant_bundle_idx ON policy_bundle_signatures(tenant_id, bundle_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS policy_bundle_artifacts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bundle_id text NOT NULL REFERENCES policy_bundles(id) ON DELETE CASCADE,
  revision text NOT NULL,
  artifact_hash text NOT NULL,
  storage_uri text NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS policy_bundle_artifacts_hash_idx ON policy_bundle_artifacts(tenant_id, artifact_hash);
CREATE INDEX IF NOT EXISTS policy_bundle_artifacts_tenant_bundle_idx ON policy_bundle_artifacts(tenant_id, bundle_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS local_change_cursors (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lcp_id text REFERENCES local_control_planes(id) ON DELETE SET NULL,
  device_id text REFERENCES devices(id) ON DELETE SET NULL,
  last_sequence bigint NOT NULL DEFAULT 0,
  last_event_id text,
  last_batch_id text,
  last_content_hash text,
  recent_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'created',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS local_change_cursors_scope_idx ON local_change_cursors(tenant_id, lcp_id, device_id);

CREATE TABLE IF NOT EXISTS local_change_batches (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lcp_id text REFERENCES local_control_planes(id) ON DELETE SET NULL,
  device_id text REFERENCES devices(id) ON DELETE SET NULL,
  source text NOT NULL,
  status text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  ack_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_change_batches_tenant_time_idx ON local_change_batches(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS local_change_batches_lcp_idx ON local_change_batches(tenant_id, lcp_id, received_at DESC);

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
ALTER TABLE event_stream_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_tuples ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_policy_provider_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_test_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_bundle_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_bundle_artifacts ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE local_change_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_change_batches ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS tenant_isolation_event_stream_journal ON event_stream_journal;
CREATE POLICY tenant_isolation_event_stream_journal ON event_stream_journal
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_audit_events ON audit_events;
CREATE POLICY tenant_isolation_audit_events ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_authorization_tuples ON authorization_tuples;
CREATE POLICY tenant_isolation_authorization_tuples ON authorization_tuples
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_authorization_decisions ON authorization_decisions;
CREATE POLICY tenant_isolation_authorization_decisions ON authorization_decisions
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

DROP POLICY IF EXISTS tenant_isolation_ai_policy_provider_runs ON ai_policy_provider_runs;
CREATE POLICY tenant_isolation_ai_policy_provider_runs ON ai_policy_provider_runs
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_test_fixtures ON policy_test_fixtures;
CREATE POLICY tenant_isolation_policy_test_fixtures ON policy_test_fixtures
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_simulations ON policy_simulations;
CREATE POLICY tenant_isolation_policy_simulations ON policy_simulations
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_bundles ON policy_bundles;
CREATE POLICY tenant_isolation_policy_bundles ON policy_bundles
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_bundle_signatures ON policy_bundle_signatures;
CREATE POLICY tenant_isolation_policy_bundle_signatures ON policy_bundle_signatures
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_bundle_artifacts ON policy_bundle_artifacts;
CREATE POLICY tenant_isolation_policy_bundle_artifacts ON policy_bundle_artifacts
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

DROP POLICY IF EXISTS tenant_isolation_local_change_cursors ON local_change_cursors;
CREATE POLICY tenant_isolation_local_change_cursors ON local_change_cursors
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_local_change_batches ON local_change_batches;
CREATE POLICY tenant_isolation_local_change_batches ON local_change_batches
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
