-- Pollek Cloud identity, tenant administration, and commerce schema.
-- This migration keeps console accounts separate from Local Pollek device_users.

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  primary_idp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS account_identities (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, issuer, subject)
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  invited_by text,
  joined_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS tenant_members_tenant_status_idx ON tenant_members(tenant_id, status);

CREATE TABLE IF NOT EXISTS member_role_assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role text NOT NULL,
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_id, role)
);

CREATE INDEX IF NOT EXISTS member_role_assignments_tenant_idx ON member_role_assignments(tenant_id, role);

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL,
  account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_tenant_status_idx ON invitations(tenant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  method text NOT NULL,
  idp_id text,
  status text NOT NULL DEFAULT 'active',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_tenant_account_idx ON auth_sessions(tenant_id, account_id, status);

CREATE TABLE IF NOT EXISTS identity_providers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_type text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  issuer_url text NOT NULL,
  client_id text NOT NULL,
  discovery_url text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS identity_providers_tenant_status_idx ON identity_providers(tenant_id, status);

CREATE TABLE IF NOT EXISTS scim_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id text,
  user_name text NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  resource jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scim_users_tenant_user_name_idx ON scim_users(tenant_id, user_name);

CREATE TABLE IF NOT EXISTS scim_groups (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scim_groups_tenant_idx ON scim_groups(tenant_id);

CREATE TABLE IF NOT EXISTS kms_keys (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  algorithm text NOT NULL,
  key_ref text,
  rotation_status text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz
);

CREATE INDEX IF NOT EXISTS kms_keys_tenant_provider_idx ON kms_keys(tenant_id, provider, status);

CREATE TABLE IF NOT EXISTS billing_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  deployment_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'USD',
  monthly_base_cents integer NOT NULL DEFAULT 0,
  included_seats integer NOT NULL DEFAULT 0,
  included_lcps integer NOT NULL DEFAULT 0,
  included_devices integer NOT NULL DEFAULT 0,
  seat_overage_cents integer NOT NULL DEFAULT 0,
  lcp_overage_cents integer NOT NULL DEFAULT 0,
  device_overage_cents integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  billing_email text NOT NULL,
  deployment_mode text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  tax_region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES billing_plans(id),
  status text NOT NULL DEFAULT 'trialing',
  billing_period text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  source text NOT NULL,
  external_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_tenant_status_idx ON subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS usage_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric text NOT NULL,
  quantity numeric NOT NULL,
  source text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS usage_records_tenant_metric_idx ON usage_records(tenant_id, metric, recorded_at DESC);
CREATE INDEX IF NOT EXISTS usage_records_source_time_idx ON usage_records(tenant_id, source, recorded_at DESC);
CREATE INDEX IF NOT EXISTS usage_records_metadata_gin_idx ON usage_records USING gin (metadata);

CREATE TABLE IF NOT EXISTS usage_counters (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric text NOT NULL,
  quantity numeric NOT NULL,
  period text NOT NULL DEFAULT 'current',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric, period)
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id text REFERENCES subscriptions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'preview',
  currency text NOT NULL DEFAULT 'USD',
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_invoice_id text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx ON invoices(tenant_id, status, generated_at DESC);

CREATE TABLE IF NOT EXISTS payment_methods (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  type text NOT NULL,
  reference_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  billing_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_methods_tenant_status_idx ON payment_methods(tenant_id, status);

CREATE TABLE IF NOT EXISTS licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id text REFERENCES subscriptions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'issued',
  kms_key_id text REFERENCES kms_keys(id) ON DELETE SET NULL,
  algorithm text NOT NULL,
  payload_hash text NOT NULL,
  signature text NOT NULL,
  license jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS licenses_tenant_status_idx ON licenses(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE kms_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tenant_members ON tenant_members;
CREATE POLICY tenant_isolation_tenant_members ON tenant_members
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_member_role_assignments ON member_role_assignments;
CREATE POLICY tenant_isolation_member_role_assignments ON member_role_assignments
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_invitations ON invitations;
CREATE POLICY tenant_isolation_invitations ON invitations
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_auth_sessions ON auth_sessions;
CREATE POLICY tenant_isolation_auth_sessions ON auth_sessions
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_identity_providers ON identity_providers;
CREATE POLICY tenant_isolation_identity_providers ON identity_providers
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_scim_users ON scim_users;
CREATE POLICY tenant_isolation_scim_users ON scim_users
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_scim_groups ON scim_groups;
CREATE POLICY tenant_isolation_scim_groups ON scim_groups
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_kms_keys ON kms_keys;
CREATE POLICY tenant_isolation_kms_keys ON kms_keys
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_billing_accounts ON billing_accounts;
CREATE POLICY tenant_isolation_billing_accounts ON billing_accounts
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_usage_records ON usage_records;
CREATE POLICY tenant_isolation_usage_records ON usage_records
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_usage_counters ON usage_counters;
CREATE POLICY tenant_isolation_usage_counters ON usage_counters
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
CREATE POLICY tenant_isolation_invoices ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_payment_methods ON payment_methods;
CREATE POLICY tenant_isolation_payment_methods ON payment_methods
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_licenses ON licenses;
CREATE POLICY tenant_isolation_licenses ON licenses
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_billing_events ON billing_events;
CREATE POLICY tenant_isolation_billing_events ON billing_events
  USING (tenant_id = current_setting('app.tenant_id', true));
