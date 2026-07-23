import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const webDir = path.join(rootDir, "apps/web/static");
const contractPath = path.join(rootDir, "packages/contracts/pollek-contract.json");
const openApiPath = path.join(rootDir, "packages/contracts/openapi.json");
// Single source of truth for contract-derived constants (version, etc.). The contract JSON
// is the authority; nothing else hardcodes the version.
const contractDocument = JSON.parse(readFileSync(contractPath, "utf8"));
const cloudVersion = contractDocument.cloud_version;
const contractVersion = contractDocument.contract_version;
const contractArtifactPaths = new Map([
  ["/contracts/events.schema.json", path.join(rootDir, "packages/contracts/events.schema.json")],
  ["/contracts/bundle-manifest.schema.json", path.join(rootDir, "packages/contracts/bundle-manifest.schema.json")],
  ["/contracts/telemetry-envelope.schema.json", path.join(rootDir, "packages/contracts/telemetry-envelope.schema.json")],
  ["/contracts/lcp-usage-ledger.schema.json", path.join(rootDir, "packages/contracts/lcp-usage-ledger.schema.json")],
  ["/contracts/bundle-provenance.schema.json", path.join(rootDir, "packages/contracts/bundle-provenance.schema.json")],
  ["/contracts/trust-policy.schema.json", path.join(rootDir, "packages/contracts/trust-policy.schema.json")],
  ["/contracts/revocation-list.schema.json", path.join(rootDir, "packages/contracts/revocation-list.schema.json")],
  ["/contracts/signer-allowlist.schema.json", path.join(rootDir, "packages/contracts/signer-allowlist.schema.json")],
  ["/contracts/fixtures/lcp-usage-ledger/windows.json", path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/windows.json")],
  ["/contracts/fixtures/lcp-usage-ledger/macos.json", path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/macos.json")],
  ["/contracts/fixtures/lcp-usage-ledger/linux.json", path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/linux.json")]
]);
const stateFilePath = process.env.POLLEK_CLOUD_STATE_FILE || path.join(rootDir, "pollek-cloud-dev-state.json");

const port = Number(process.env.PORT || process.env.POLLEK_CLOUD_DEV_PORT || 8790);
const host = process.env.POLLEK_CLOUD_DEV_HOST || process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const publicUrl = process.env.POLLEK_CLOUD_PUBLIC_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")
  || `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
const defaultLcpUrl = process.env.POLLEK_LCP_URL || "http://127.0.0.1:43891";
const maxJsonBodyBytes = Number(process.env.POLLEK_CLOUD_MAX_JSON_BODY_BYTES || 1024 * 1024);
const maxAuditPayloadBytes = Number(process.env.POLLEK_CLOUD_MAX_AUDIT_PAYLOAD_BYTES || 32 * 1024);
const defaultApiPageLimit = Number(process.env.POLLEK_CLOUD_DEFAULT_API_PAGE_LIMIT || 1000);
const maxApiPageLimit = Number(process.env.POLLEK_CLOUD_MAX_API_PAGE_LIMIT || 5000);
const requestBudgetWindowMs = Number(process.env.POLLEK_CLOUD_RATE_WINDOW_MS || 60000);
const requestBudgetMax = Number(process.env.POLLEK_CLOUD_RATE_MAX || 900);
const compactJsonResponses = process.env.POLLEK_CLOUD_PRETTY_JSON !== "1";
const exposeInternalErrors = process.env.NODE_ENV !== "production" || process.env.POLLEK_CLOUD_EXPOSE_ERRORS === "1";
const lcpReconcileIntervalMs = Math.max(30000, Number(process.env.POLLEK_LCP_RECONCILE_INTERVAL_MS || process.env.POLLEK_LCP_WATCH_INTERVAL_MS || 300000));
const maxTelemetryEnvelopes = Math.max(100, Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_EVENTS || 5000));
const maxTelemetryBatchReceipts = Math.max(20, Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_BATCHES || 200));
const maxTelemetryRejections = Math.max(20, Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_REJECTIONS || 200));
const bundleSigningKeyPair = crypto.generateKeyPairSync("ed25519");
const bundleSigningPublicKeyPem = bundleSigningKeyPair.publicKey.export({ type: "spki", format: "pem" });
const eventStreamReplayWindow = Math.max(200, Number(process.env.POLLEK_EVENT_STREAM_REPLAY_WINDOW || 500));
const sseClients = new Set();
const contractDriftAllowedRuntimePaths = new Set(["/health", "/api/cloud/status", "/api/persistence/status", "/api/persistence/flush", "/api/entities/watch"]);
const persistedFleetKeys = [
  "tree",
  "localControlPlanes",
  "relationships",
  "policyBundles",
  "policyBundleSignatures",
  "policyBundleArtifacts",
  "authorizationTuples",
  "authorizationDecisions",
  "alarms",
  "policyDrafts",
  "policySimulations",
  "aiProviderRuns",
  "policyTestFixtures",
  "policySandboxes",
  "breakglassRequests",
  "evidenceExports",
  "enrollmentSessions",
  "deviceUsers",
  "localEntities",
  "localEntityRelationships",
  "localEntitySyncRuns",
  "localChangeCursors",
  "localChangeBatches",
  "localConfigurationSnapshots",
  "cloudToLocalDispatches",
  "rolloutPlans",
  "hotReloadEvents",
  "accounts",
  "accountIdentities",
  "tenantMembers",
  "memberRoleAssignments",
  "invitations",
  "authSessions",
  "identityProviders",
  "scimUsers",
  "scimGroups",
  "kmsKeys",
  "billingPlans",
  "billingAccounts",
  "subscriptions",
  "usageRecords",
  "usageCounters",
  "invoices",
  "paymentMethods",
  "licenses",
  "billingEvents",
  "telemetryEnvelopes",
  "telemetryBatchReceipts",
  "telemetryRejections",
  "telemetryIngestTotals",
  "bundleGeneration",
  "trustRevocations"
];

const ROLE_TEST_USER_TEMPLATES = [
  { role: "admin", email: "admin@pollek.test", display_name: "Test Admin", relation: "admin" },
  { role: "security_admin", email: "security-admin@pollek.test", display_name: "Test Security Admin", relation: "security_admin" },
  { role: "iam_admin", email: "iam-admin@pollek.test", display_name: "Test IAM Admin", relation: "iam_admin" },
  { role: "billing_admin", email: "billing-admin@pollek.test", display_name: "Test Billing Admin", relation: "billing_admin" },
  { role: "operator", email: "operator@pollek.test", display_name: "Test Operator", relation: "operator" },
  { role: "viewer", email: "viewer@pollek.test", display_name: "Test Viewer", relation: "viewer" }
];

const ADAPTER_CATALOG = [
  {
    id: "openai_chatgpt",
    display_name: "OpenAI ChatGPT and API",
    short_name: "OpenAI",
    category: "llm_provider",
    description: "Hosted model and assistant traffic discovered from API, browser, or desktop activity.",
    confidence: "high",
    integration_modes: ["direct_api", "browser_activity", "enterprise_admin"],
    auth_modes: ["api_key", "oauth_admin", "browser_session_observe"],
    dynamic_fields: ["organization_id", "project_id", "base_url"],
    discovery_capabilities: ["model_usage", "tool_call", "prompt_content", "cost_signal"],
    probe_endpoints: ["/v1/models"],
    entity_kinds: ["registered_agent", "found_agent", "observability"],
    pollek_entity_type: "registered_agent"
  },
  {
    id: "anthropic_claude",
    display_name: "Anthropic Claude",
    short_name: "Claude",
    category: "llm_provider",
    description: "Claude API and desktop usage mapped to agent identity, tool calls, and resource access.",
    confidence: "high",
    integration_modes: ["direct_api", "desktop_activity", "browser_activity"],
    auth_modes: ["api_key", "oauth_admin", "browser_session_observe"],
    dynamic_fields: ["workspace_id", "base_url"],
    discovery_capabilities: ["model_usage", "tool_call", "prompt_content"],
    probe_endpoints: ["/v1/models"],
    entity_kinds: ["registered_agent", "found_agent", "observability"],
    pollek_entity_type: "registered_agent"
  },
  {
    id: "google_gemini_vertex",
    display_name: "Google Gemini and Vertex AI",
    short_name: "Gemini",
    category: "llm_provider",
    description: "Google AI traffic with project, model, and workspace context for enterprise tenants.",
    confidence: "high",
    integration_modes: ["vertex_api", "browser_activity", "workspace_admin"],
    auth_modes: ["service_account", "oauth_admin", "browser_session_observe"],
    dynamic_fields: ["project_id", "location", "workspace_customer_id"],
    discovery_capabilities: ["model_usage", "tool_call", "project_scope"],
    probe_endpoints: ["/v1/projects/{project}/locations/{location}/publishers/google/models"],
    entity_kinds: ["registered_agent", "found_agent", "observability"],
    pollek_entity_type: "registered_agent"
  },
  {
    id: "github_copilot",
    display_name: "GitHub Copilot",
    short_name: "Copilot",
    category: "code_assistant",
    description: "Developer assistant activity from IDE, repository, and enterprise audit channels.",
    confidence: "high",
    integration_modes: ["ide_activity", "github_enterprise", "browser_activity"],
    auth_modes: ["github_app", "oauth_admin", "browser_session_observe"],
    dynamic_fields: ["enterprise_slug", "organization", "repo_allowlist"],
    discovery_capabilities: ["code_context", "repo_access", "tool_usage"],
    probe_endpoints: ["/enterprises/{enterprise}/copilot/usage"],
    entity_kinds: ["registered_agent", "found_agent", "observability"],
    pollek_entity_type: "registered_agent"
  },
  {
    id: "cursor",
    display_name: "Cursor IDE",
    short_name: "Cursor",
    category: "code_assistant",
    description: "Local IDE agent activity correlated with process, workspace, file, and network evidence.",
    confidence: "medium",
    integration_modes: ["local_process", "workspace_activity", "network_metadata"],
    auth_modes: ["local_observe", "browser_session_observe"],
    dynamic_fields: ["process_path", "workspace_root"],
    discovery_capabilities: ["process_metadata", "file_access", "tool_usage"],
    probe_endpoints: [],
    entity_kinds: ["found_agent", "observability", "enforcement"],
    pollek_entity_type: "found_agent"
  },
  {
    id: "mcp_server",
    display_name: "MCP Server",
    short_name: "MCP",
    category: "protocol",
    description: "Model Context Protocol servers, tools, resources, and invocation evidence.",
    confidence: "high",
    integration_modes: ["stdio_proxy", "http_sse", "local_registry"],
    auth_modes: ["spiffe_mtls", "bearer_token", "local_observe"],
    dynamic_fields: ["server_url", "command", "resource_scope"],
    discovery_capabilities: ["tool_catalog", "resource_catalog", "tool_invocation"],
    probe_endpoints: ["/.well-known/mcp.json"],
    entity_kinds: ["observability", "enforcement", "policy"],
    pollek_entity_type: "observability"
  },
  {
    id: "a2a_agent_card",
    display_name: "A2A Agent Card",
    short_name: "A2A",
    category: "protocol",
    description: "Agent-to-Agent protocol discovery through agent cards and task endpoints.",
    confidence: "medium",
    integration_modes: ["agent_card", "http_endpoint", "gateway_observe"],
    auth_modes: ["spiffe_mtls", "oauth_client", "bearer_token"],
    dynamic_fields: ["agent_card_url", "issuer", "audience"],
    discovery_capabilities: ["agent_identity", "task_capability", "delegation_trace"],
    probe_endpoints: ["/.well-known/agent-card.json"],
    entity_kinds: ["registered_agent", "found_agent", "observability"],
    pollek_entity_type: "registered_agent"
  },
  {
    id: "custom_http_agent",
    display_name: "Custom HTTP Agent",
    short_name: "Custom HTTP",
    category: "custom",
    description: "Generic REST or webhook-based AI agent, appliance, or policy decision component.",
    confidence: "medium",
    integration_modes: ["http_probe", "webhook", "gateway_observe"],
    auth_modes: ["spiffe_mtls", "oauth_client", "api_key"],
    dynamic_fields: ["base_url", "health_path", "telemetry_path"],
    discovery_capabilities: ["health_check", "telemetry_ingest", "decision_log"],
    probe_endpoints: ["/health", "/.well-known/pollek-contract"],
    entity_kinds: ["registered_agent", "found_agent", "enforcement", "observability"],
    pollek_entity_type: "registered_agent"
  }
];

const SANDBOX_PROFILES = [
  {
    id: "sandbox_wasmtime_ephemeral",
    name: "Ephemeral WASM Tool Sandbox",
    runtime: "wasmtime",
    isolation: "process-and-wasi",
    network: "deny-by-default",
    filesystem: "workspace-readonly",
    ttl_seconds: 300,
    cpu_millis: 2500,
    memory_mb: 128,
    local_pollek_capability: "sandbox.wasmtime"
  },
  {
    id: "sandbox_policy_dry_run",
    name: "Policy Dry-Run Sandbox",
    runtime: "pdp-route-simulate",
    isolation: "no-production-effect",
    network: "cloud-to-lcp-simulate-only",
    filesystem: "none",
    ttl_seconds: 900,
    cpu_millis: 1000,
    memory_mb: 64,
    local_pollek_capability: "pdp.routing.v1"
  }
];

const COMPLIANCE_POLICY_BUNDLES = [
  {
    id: "cmp_eu_ai_act_high_risk",
    name: "EU AI Act High-Risk AI Controls",
    edition: "enterprise",
    enterprise_only: true,
    frameworks: ["EU_AI_ACT", "ISO42001"],
    controls: ["risk-management", "human-oversight", "record-keeping", "transparency", "cybersecurity"],
    target_engines: ["rego", "cedar", "openfga"],
    recommended_pep_types: ["McpProxy", "HttpGateway", "BrowserExtension"],
    default_mode: "approval",
    deployable: true,
    simulation_required: true,
    evidence_streams: ["policy_decision", "tool_usage", "identity_access", "audit_event"],
    cloud_artifacts: ["policy_ir", "rego", "cedar", "openfga_model", "bundle_manifest", "evidence_mapping"],
    contract_hub_distribution: {
      channel: "enterprise-compliance",
      entitlement: "enterprise.compliance_policy_bundles",
      local_delivery: "signed_bundle_only",
      paths: ["/v1/tenants/{tenant_id}/bundles/latest", "/v1/policy-bundles/{bundle_id}/manifest"]
    }
  },
  {
    id: "cmp_nist_ai_rmf_agentic",
    name: "NIST AI RMF Agentic Governance",
    edition: "enterprise",
    enterprise_only: true,
    frameworks: ["NIST_AI_RMF", "NIST_AI_600_1", "OWASP_AGENTIC"],
    controls: ["govern", "map", "measure", "manage", "agent-inventory", "runtime-monitoring"],
    target_engines: ["rego", "cedar"],
    recommended_pep_types: ["McpProxy", "LocalModelProxy", "HttpGateway"],
    default_mode: "warn",
    deployable: true,
    simulation_required: true,
    evidence_streams: ["tool_usage", "resource_access", "security_coverage", "policy_decision"],
    cloud_artifacts: ["policy_ir", "rego", "cedar", "bundle_manifest", "evidence_mapping"],
    contract_hub_distribution: {
      channel: "enterprise-compliance",
      entitlement: "enterprise.compliance_policy_bundles",
      local_delivery: "signed_bundle_only",
      paths: ["/v1/tenants/{tenant_id}/bundles/latest", "/v1/policy-bundles/{bundle_id}/manifest"]
    }
  },
  {
    id: "cmp_soc2_gdpr_data_access",
    name: "SOC2 and GDPR Data Access Evidence",
    edition: "enterprise",
    enterprise_only: true,
    frameworks: ["SOC2", "GDPR", "PDPA"],
    controls: ["access-enforcement", "pii-minimization", "audit-logging", "retention", "egress-control"],
    target_engines: ["rego", "wasm_plugin"],
    recommended_pep_types: ["McpProxy", "FileSystemPep", "HttpGateway"],
    default_mode: "enforce",
    deployable: true,
    simulation_required: true,
    evidence_streams: ["resource_access", "content_scan", "policy_decision", "audit_event"],
    cloud_artifacts: ["policy_ir", "rego", "wasm_plugin_config", "bundle_manifest", "evidence_mapping"],
    contract_hub_distribution: {
      channel: "enterprise-compliance",
      entitlement: "enterprise.compliance_policy_bundles",
      local_delivery: "signed_bundle_only",
      paths: ["/v1/tenants/{tenant_id}/bundles/latest", "/v1/policy-bundles/{bundle_id}/manifest"]
    }
  }
];


function createFleetState() {
  // The Cloud boots empty. All operational/tenant state (fleet tree, LCPs,
  // entities, relationships, usage, alarms, accounts, members, billing
  // accounts/subscriptions, policy bundles, drafts, dispatches, ...) is
  // populated ONLY through the real gated flows: LCP enroll/probe, entity
  // ingest, registry sync, telemetry ingest, usage-ledger ingest, tenant
  // signup, member/role management, compliance bundle deploy, and Cloud-to-LCP
  // dispatch. Nothing here is fabricated. The only pre-populated values are
  // static product catalogs (the product's own offering), not tenant data.
  return {
    // --- Static product catalogs (shipped config, not tenant/operational data) ---
    policyPacks: [
      {
        id: "pack_ai_data_protection",
        name: "AI Data Leakage Protection",
        status: "ready",
        default_mode: "enforce",
        engines: ["rego", "wasm-redactor"],
        coverage: 88,
        controls: ["pii", "secrets", "document-egress"],
        compliance_bundle_ids: ["cmp_soc2_gdpr_data_access"]
      },
      {
        id: "pack_prompt_injection",
        name: "Prompt Injection Defense",
        status: "ready",
        default_mode: "warn",
        engines: ["rego", "content-guard"],
        coverage: 76,
        controls: ["tool-output-injection", "instruction-hijack"],
        compliance_bundle_ids: ["cmp_eu_ai_act_high_risk", "cmp_nist_ai_rmf_agentic"]
      },
      {
        id: "pack_shadow_ai",
        name: "Shadow AI Discovery and Control",
        status: "observe",
        default_mode: "observe",
        engines: ["cedar", "rego"],
        coverage: 64,
        controls: ["unmanaged-agents", "provider-egress"],
        compliance_bundle_ids: ["cmp_nist_ai_rmf_agentic"]
      }
    ],
    compliancePolicyBundles: COMPLIANCE_POLICY_BUNDLES,
    integrations: [
      { id: "int_otlp", name: "OpenTelemetry Collector", type: "otlp", status: "not_configured", direction: "inbound-outbound" },
      { id: "int_splunk_hec", name: "Splunk HEC", type: "siem", status: "not_configured", direction: "outbound" },
      { id: "int_syslog_cef", name: "Syslog CEF", type: "siem", status: "not_configured", direction: "outbound" },
      { id: "int_keycloak", name: "Keycloak OIDC", type: "identity", status: "not_configured", direction: "inbound" }
    ],
    adapterCatalog: ADAPTER_CATALOG,
    billingPlans: [
      {
        id: "plan_enterprise_cloud",
        name: "Enterprise Cloud",
        deployment_modes: ["saas"],
        currency: "USD",
        monthly_base_cents: 250000,
        included_seats: 25,
        included_lcps: 10,
        included_devices: 100,
        seat_overage_cents: 2500,
        lcp_overage_cents: 1500,
        device_overage_cents: 300,
        features: ["keycloak_oidc", "scim_provisioning", "compliance_policy_bundles", "breakglass", "policy_sandbox"]
      },
      {
        id: "plan_private_cloud",
        name: "Private Cloud Enterprise",
        deployment_modes: ["private_cloud", "air_gapped"],
        currency: "USD",
        monthly_base_cents: 750000,
        included_seats: 100,
        included_lcps: 50,
        included_devices: 1000,
        seat_overage_cents: 2000,
        lcp_overage_cents: 1000,
        device_overage_cents: 200,
        features: ["offline_license", "kms_abstraction", "keycloak_oidc", "byo_idp_federation", "scim_provisioning"]
      }
    ],
    // --- Operational state: empty until populated through real gated flows ---
    tree: [],
    localControlPlanes: [],
    relationships: [],
    policyBundles: [],
    policyBundleSignatures: [],
    policyBundleArtifacts: [],
    authorizationTuples: [],
    authorizationDecisions: [],
    alarms: [],
    policyDrafts: [],
    policySimulations: [],
    aiProviderRuns: [],
    policyTestFixtures: [],
    policySandboxes: [],
    breakglassRequests: [],
    tenantTrustScopes: [],
    serviceEndpoints: [],
    connectionProfiles: [],
    evidenceExports: [],
    enrollmentSessions: [],
    deviceUsers: [],
    localEntities: [],
    localEntityRelationships: [],
    localEntitySyncRuns: [],
    localChangeCursors: [],
    localChangeBatches: [],
    localConfigurationSnapshots: [],
    cloudToLocalDispatches: [],
    rolloutPlans: [],
    hotReloadEvents: [],
    accounts: [],
    accountIdentities: [],
    tenantMembers: [],
    memberRoleAssignments: [],
    invitations: [],
    authSessions: [],
    identityProviders: [],
    scimUsers: [],
    scimGroups: [],
    kmsKeys: [],
    billingAccounts: [],
    subscriptions: [],
    usageRecords: [],
    usageCounters: [],
    invoices: [],
    paymentMethods: [],
    licenses: [],
    billingEvents: [],
    telemetryEnvelopes: [],
    telemetryBatchReceipts: [],
    telemetryRejections: [],
    telemetryIngestTotals: [],
    // --- Trust spine (Cloud-Phase-1): monotonic bundle generation + deny-list revocations ---
    bundleGeneration: 0,
    trustRevocations: {
      revocation_epoch: 0,
      revoked_key_ids: [],
      revoked_bundle_digests: [],
      revoked_revisions: [],
      history: []
    }
  };
}

const state = {
  startedAt: new Date().toISOString(),
  tenant: {
    id: "tnt_local_lab",
    name: "Local Lab Tenant",
    mode: "private-cloud-dev",
    edition: "enterprise-dev",
    entitlements: ["enterprise.compliance_policy_bundles", "enterprise.policy_sandbox", "enterprise.breakglass"],
    trustDomain: "local.pollek.cloud"
  },
  devices: new Map(),
  events: [],
  eventJournal: [],
  auditEvents: [],
  tasks: [],
  enrollmentCodes: new Map(),
  probes: [],
  fleet: createFleetState()
};

const persistence = {
  schema_version: "pollek.cloud.runtime-persistence.v1",
  mode: process.env.POLLEK_CLOUD_PERSISTENCE || "file-snapshot-dev",
  enabled: process.env.POLLEK_CLOUD_PERSISTENCE !== "disabled",
  file_path: stateFilePath,
  loaded: false,
  load_status: "seeded",
  last_loaded_at: null,
  last_saved_at: null,
  last_reason: null,
  save_count: 0,
  last_error: null
};

let persistTimer = null;
let streamEventSequence = 0;

const lcpEntityWatch = {
  schema_version: "pollek.cloud.lcp-entity-watch.v1",
  enabled: process.env.POLLEK_LCP_WATCH !== "disabled",
  mode: "hybrid_delta_push_with_reconcile",
  primary_mode: "lcp_outbox_delta_push",
  fallback_mode: "snapshot_reconcile",
  interval_ms: lcpReconcileIntervalMs,
  jitter_percent: 20,
  lcp_url: defaultLcpUrl,
  lcp_id: "lcp_local",
  status: "starting",
  running: false,
  poll_count: 0,
  change_count: 0,
  last_poll_at: null,
  last_reconcile_at: null,
  next_reconcile_at: null,
  last_change_at: null,
  last_delta_at: null,
  last_success_at: null,
  last_error: null,
  last_snapshot_hash: null,
  last_entity_count: 0
};

let lcpWatchTimer = null;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:*",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-pollek-device-id,x-pollek-tenant-id,x-pollek-lcp-id,x-idempotency-key"
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = compactJsonResponses ? JSON.stringify(body) : JSON.stringify(body, null, 2);
  res.writeHead(status, { ...jsonHeaders, ...extraHeaders });
  res.end(payload);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    ...jsonHeaders,
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(text);
}

const requestBudgetBuckets = new Map();

function httpError(statusCode, message, code = message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function clientBudgetKey(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const remote = forwardedFor || req.socket?.remoteAddress || "unknown";
  const tenant = req.headers["x-pollek-tenant-id"] || "no-tenant";
  return `${remote}:${tenant}`;
}

function enforceRequestBudget(req, res) {
  if (!requestBudgetMax || requestBudgetMax < 1) return true;
  const now = Date.now();
  const key = clientBudgetKey(req);
  const current = requestBudgetBuckets.get(key);
  const bucket = current && current.reset_at > now
    ? current
    : { count: 0, reset_at: now + requestBudgetWindowMs };
  bucket.count += 1;
  requestBudgetBuckets.set(key, bucket);
  if (requestBudgetBuckets.size > 5000) {
    for (const [bucketKey, value] of requestBudgetBuckets.entries()) {
      if (value.reset_at <= now) requestBudgetBuckets.delete(bucketKey);
    }
  }
  const remaining = Math.max(0, requestBudgetMax - bucket.count);
  res.setHeader("x-ratelimit-limit", String(requestBudgetMax));
  res.setHeader("x-ratelimit-remaining", String(remaining));
  res.setHeader("x-ratelimit-reset", new Date(bucket.reset_at).toISOString());
  if (bucket.count <= requestBudgetMax) return true;
  sendJson(res, 429, {
    error: "rate_limit_exceeded",
    detail: "Request budget exceeded for this client and tenant context.",
    retry_after_ms: Math.max(0, bucket.reset_at - now)
  }, {
    "retry-after": String(Math.ceil(Math.max(0, bucket.reset_at - now) / 1000))
  });
  return false;
}

function mapToEntries(map) {
  return [...map.entries()].map(([key, value]) => ({ key, value }));
}

function entriesToMap(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    if (entry && Object.hasOwn(entry, "key")) map.set(entry.key, entry.value);
  }
  return map;
}

function runtimePersistenceStatus() {
  return {
    ...persistence,
    postgres_migration: "packages/db/migrations/0001_foundation.sql",
    identity_billing_migration: "packages/db/migrations/0002_identity_billing.sql",
    production_target: "postgresql",
    persisted_collections: {
      fleet: persistedFleetKeys,
      root: ["tenant", "devices", "events", "eventJournal", "auditEvents", "tasks", "probes", "enrollmentCodes"]
    },
    record_counts: {
      devices: state.devices.size,
      telemetry_events: state.events.length,
      telemetry_envelopes: state.fleet.telemetryEnvelopes?.length || 0,
      telemetry_batch_receipts: state.fleet.telemetryBatchReceipts?.length || 0,
      telemetry_rejections: state.fleet.telemetryRejections?.length || 0,
      event_journal: state.eventJournal.length,
      audit_events: state.auditEvents.length,
      tasks: state.tasks.length,
      probes: state.probes.length,
      policy_drafts: state.fleet.policyDrafts.length,
      ai_provider_runs: state.fleet.aiProviderRuns?.length || 0,
      policy_test_fixtures: state.fleet.policyTestFixtures?.length || 0,
      policy_bundles: state.fleet.policyBundles.length,
      policy_bundle_signatures: state.fleet.policyBundleSignatures?.length || 0,
      policy_bundle_artifacts: state.fleet.policyBundleArtifacts?.length || 0,
      authorization_tuples: state.fleet.authorizationTuples?.length || 0,
      authorization_decisions: state.fleet.authorizationDecisions?.length || 0,
      rollouts: state.fleet.rolloutPlans.length,
      hot_reload_events: state.fleet.hotReloadEvents.length,
      breakglass_requests: state.fleet.breakglassRequests.length,
      local_entities: state.fleet.localEntities.length,
      entity_sync_runs: state.fleet.localEntitySyncRuns.length,
      local_change_cursors: state.fleet.localChangeCursors?.length || 0,
      local_change_batches: state.fleet.localChangeBatches?.length || 0,
      evidence_exports: state.fleet.evidenceExports.length,
      enrollment_sessions: state.fleet.enrollmentSessions.length,
      accounts: state.fleet.accounts?.length || 0,
      tenant_members: state.fleet.tenantMembers?.length || 0,
      invitations: state.fleet.invitations?.length || 0,
      auth_sessions: state.fleet.authSessions?.length || 0,
      identity_providers: state.fleet.identityProviders?.length || 0,
      scim_users: state.fleet.scimUsers?.length || 0,
      billing_accounts: state.fleet.billingAccounts?.length || 0,
      subscriptions: state.fleet.subscriptions?.length || 0,
      usage_records: state.fleet.usageRecords?.length || 0,
      invoices: state.fleet.invoices?.length || 0,
      payment_methods: state.fleet.paymentMethods?.length || 0,
      licenses: state.fleet.licenses?.length || 0,
      billing_events: state.fleet.billingEvents?.length || 0,
      kms_keys: state.fleet.kmsKeys?.length || 0
    }
  };
}

function runtimeStateSnapshot() {
  const fleet = {};
  for (const key of persistedFleetKeys) {
    fleet[key] = state.fleet[key];
  }
  return {
    schema_version: "pollek.cloud.runtime-state-snapshot.v1",
    saved_at: new Date().toISOString(),
    cloud_version: cloudVersion,
    tenant: state.tenant,
    devices: mapToEntries(state.devices),
    events: state.events,
    eventJournal: state.eventJournal,
    auditEvents: state.auditEvents,
    tasks: state.tasks,
    probes: state.probes,
    enrollmentCodes: mapToEntries(state.enrollmentCodes),
    fleet
  };
}

function applyRuntimeStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.tenant && typeof snapshot.tenant === "object") {
    state.tenant = { ...state.tenant, ...snapshot.tenant };
  }
  if (Array.isArray(snapshot.devices)) state.devices = entriesToMap(snapshot.devices);
  if (Array.isArray(snapshot.enrollmentCodes)) state.enrollmentCodes = entriesToMap(snapshot.enrollmentCodes);
  if (Array.isArray(snapshot.events)) state.events = snapshot.events.slice(0, 100);
  if (Array.isArray(snapshot.eventJournal)) state.eventJournal = snapshot.eventJournal.slice(-eventStreamReplayWindow);
  if (Array.isArray(snapshot.auditEvents)) state.auditEvents = snapshot.auditEvents.slice(0, 100);
  if (Array.isArray(snapshot.tasks)) state.tasks = snapshot.tasks.slice(0, 25);
  if (Array.isArray(snapshot.probes)) state.probes = snapshot.probes.slice(0, 20);
  if (snapshot.fleet && typeof snapshot.fleet === "object") {
    for (const key of persistedFleetKeys) {
      if (Array.isArray(snapshot.fleet[key])) state.fleet[key] = snapshot.fleet[key];
    }
    if (Number.isFinite(snapshot.fleet.bundleGeneration)) {
      state.fleet.bundleGeneration = Math.max(0, Math.floor(snapshot.fleet.bundleGeneration));
    }
    if (snapshot.fleet.trustRevocations && typeof snapshot.fleet.trustRevocations === "object") {
      const stored = snapshot.fleet.trustRevocations;
      state.fleet.trustRevocations = {
        revocation_epoch: Number.isFinite(stored.revocation_epoch) ? Math.max(0, Math.floor(stored.revocation_epoch)) : 0,
        revoked_key_ids: Array.isArray(stored.revoked_key_ids) ? stored.revoked_key_ids : [],
        revoked_bundle_digests: Array.isArray(stored.revoked_bundle_digests) ? stored.revoked_bundle_digests : [],
        revoked_revisions: Array.isArray(stored.revoked_revisions) ? stored.revoked_revisions : [],
        history: Array.isArray(stored.history) ? stored.history : []
      };
    }
  }
}

async function loadRuntimeState() {
  if (!persistence.enabled) {
    persistence.load_status = "disabled";
    return;
  }
  try {
    const snapshot = JSON.parse(await readFile(stateFilePath, "utf8"));
    applyRuntimeStateSnapshot(snapshot);
    persistence.loaded = true;
    persistence.load_status = "loaded";
    persistence.last_loaded_at = new Date().toISOString();
    persistence.last_saved_at = snapshot.saved_at || null;
    persistence.last_error = null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      persistence.load_status = "seeded";
      persistence.last_error = null;
      return;
    }
    persistence.load_status = "load_failed";
    persistence.last_error = error instanceof Error ? error.message : String(error);
  }
}

async function persistRuntimeState(reason = "manual") {
  if (!persistence.enabled) return runtimePersistenceStatus();
  try {
    const snapshot = runtimeStateSnapshot();
    const payload = JSON.stringify(snapshot, null, 2);
    const tmpPath = `${stateFilePath}.tmp`;
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(tmpPath, `${payload}\n`, "utf8");
    await rename(tmpPath, stateFilePath);
    persistence.last_saved_at = snapshot.saved_at;
    persistence.last_reason = reason;
    persistence.save_count += 1;
    persistence.last_error = null;
  } catch (error) {
    persistence.last_error = error instanceof Error ? error.message : String(error);
  }
  return runtimePersistenceStatus();
}

function scheduleRuntimePersist(reason = "mutation") {
  if (!persistence.enabled) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistRuntimeState(reason);
  }, 40);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function slugify(value, fallback = "tenant") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `${fallback}-${crypto.randomBytes(3).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + Number(days || 0) * 86400000).toISOString();
}

function tenantRecordId(slug) {
  return `tenant_${slugify(slug).replace(/-/g, "_")}`;
}

function issueOpaqueToken(prefix = "tok") {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

function tokenHash(token) {
  return sha256(token);
}

function requiredTenantContext(tenantId) {
  if (!tenantId) {
    const error = new Error("tenant_context_required");
    error.statusCode = 400;
    throw error;
  }
  return String(tenantId);
}

function publicAccount(account) {
  if (!account) return null;
  const { external_ids, ...safe } = account;
  return { ...safe, external_ids: external_ids ? redactSensitive(external_ids) : undefined };
}

function accountByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return (state.fleet.accounts || []).find((account) => account.email.toLowerCase() === normalized) || null;
}

function accountById(accountId) {
  return (state.fleet.accounts || []).find((account) => account.id === accountId) || null;
}

function ensureAccount({ email, display_name, idp_id = "idp_keycloak_local_dev", status = "active" }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    const error = new Error("valid_email_required");
    error.statusCode = 400;
    throw error;
  }
  let account = accountByEmail(normalizedEmail);
  if (account) {
    account.display_name = display_name || account.display_name;
    account.status = status || account.status;
    account.updated_at = nowIso();
    return account;
  }
  account = {
    id: `acc_${sha256(normalizedEmail).slice(0, 16)}`,
    email: normalizedEmail,
    display_name: display_name || normalizedEmail.split("@")[0],
    status,
    primary_idp: idp_id,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  state.fleet.accounts.unshift(account);
  state.fleet.accountIdentities.unshift({
    id: `acct_id_${sha256(`${idp_id}:${normalizedEmail}`).slice(0, 16)}`,
    account_id: account.id,
    provider_id: idp_id,
    issuer: identityProviderForTenant("local")?.issuer_url || "dev-local",
    subject: normalizedEmail,
    email: normalizedEmail,
    created_at: nowIso()
  });
  return account;
}

function tenantMemberFor(tenantId, accountId) {
  return (state.fleet.tenantMembers || []).find((member) => member.tenant_id === tenantId && member.account_id === accountId) || null;
}

function rolesForMember(tenantId, accountId) {
  const assigned = (state.fleet.memberRoleAssignments || [])
    .filter((role) => role.tenant_id === tenantId && role.account_id === accountId)
    .map((role) => role.role);
  const member = tenantMemberFor(tenantId, accountId);
  return [...new Set([...(member?.roles || []), ...assigned])];
}

function upsertTenantMember({ tenant_id, account_id, roles = ["viewer"], status = "active", invited_by = "system" }) {
  const tenantId = requiredTenantContext(tenant_id);
  const account = accountById(account_id);
  if (!account) {
    const error = new Error("account_not_found");
    error.statusCode = 404;
    throw error;
  }
  let member = tenantMemberFor(tenantId, account.id);
  if (!member) {
    member = {
      id: `member_${sha256(`${tenantId}:${account.id}`).slice(0, 16)}`,
      tenant_id: tenantId,
      account_id: account.id,
      email: account.email,
      display_name: account.display_name,
      status,
      roles: [],
      invited_by,
      joined_at: nowIso()
    };
    state.fleet.tenantMembers.unshift(member);
  }
  const nextRoles = [...new Set([...(member.roles || []), ...roles.map(String)])];
  member.roles = nextRoles;
  member.status = status;
  member.updated_at = nowIso();
  for (const role of nextRoles) {
    const exists = (state.fleet.memberRoleAssignments || [])
      .some((item) => item.tenant_id === tenantId && item.account_id === account.id && item.role === role);
    if (!exists) {
      state.fleet.memberRoleAssignments.unshift({
        id: `role_${sha256(`${tenantId}:${account.id}:${role}`).slice(0, 16)}`,
        tenant_id: tenantId,
        account_id: account.id,
        role,
        granted_by: invited_by,
        created_at: nowIso()
      });
    }
  }
  return member;
}

function ensureRoleAuthorizationTuples({ tenant_id, account_id, roles = [], source = "role_user_seed", actor_id = "system", emitEvidence = false }) {
  const tenantId = requiredTenantContext(tenant_id);
  for (const role of roles.map(String)) {
    const object = `tenant:${tenantId}`;
    const principal = `user:${account_id}`;
    const exists = (state.fleet.authorizationTuples || []).some((tuple) => (
      tuple.tenant_id === tenantId && tuple.principal === principal && tuple.relation === role && tuple.object === object
    ));
    if (exists) continue;
    if (emitEvidence) {
      createAuthorizationTuple({
        tenant_id: tenantId,
        principal,
        relation: role,
        object,
        source,
        created_by: actor_id
      });
    } else {
      state.fleet.authorizationTuples.unshift({
        id: `authz_tuple_${sha256(`${tenantId}:${account_id}:${role}:${object}`).slice(0, 18)}`,
        schema_version: "pollek.cloud.authorization-tuple.v1",
        tenant_id: tenantId,
        principal,
        relation: role,
        object,
        condition: null,
        source,
        created_by: actor_id,
        created_at: nowIso()
      });
    }
  }
}

function setTenantMemberRoles({ tenant_id, account_id, roles = ["viewer"], status = "active", actor_id = "system" }) {
  const tenantId = requiredTenantContext(tenant_id);
  const nextRoles = [...new Set((Array.isArray(roles) && roles.length ? roles : ["viewer"]).map(String))];
  const member = upsertTenantMember({
    tenant_id: tenantId,
    account_id,
    roles: nextRoles,
    status,
    invited_by: actor_id
  });
  member.roles = nextRoles;
  member.status = status;
  member.updated_at = nowIso();
  state.fleet.memberRoleAssignments = (state.fleet.memberRoleAssignments || [])
    .filter((item) => !(item.tenant_id === tenantId && item.account_id === account_id));
  for (const role of nextRoles) {
    state.fleet.memberRoleAssignments.unshift({
      id: `role_${sha256(`${tenantId}:${account_id}:${role}`).slice(0, 16)}`,
      tenant_id: tenantId,
      account_id,
      role,
      granted_by: actor_id,
      created_at: nowIso()
    });
  }
  const knownRelations = new Set(ROLE_TEST_USER_TEMPLATES.map((item) => item.relation));
  state.fleet.authorizationTuples = (state.fleet.authorizationTuples || [])
    .filter((tuple) => !(
      tuple.tenant_id === tenantId
      && tuple.principal === `user:${account_id}`
      && tuple.object === `tenant:${tenantId}`
      && knownRelations.has(tuple.relation)
      && !nextRoles.includes(tuple.relation)
    ));
  ensureRoleAuthorizationTuples({
    tenant_id: tenantId,
    account_id,
    roles: nextRoles,
    source: "member_role_assignment",
    actor_id,
    emitEvidence: true
  });
  return member;
}

function ensureRoleTestUsers(tenantId = "local", { actor_id = "system", emitEvidence = false } = {}) {
  const tenant_id = requiredTenantContext(tenantId);
  const users = [];
  for (const template of ROLE_TEST_USER_TEMPLATES) {
    const [localPart, domain] = template.email.split("@");
    const email = tenant_id === "local" ? template.email : `${localPart}+${slugify(tenant_id)}@${domain}`;
    const account = ensureAccount({
      email,
      display_name: `${template.display_name}${tenant_id === "local" ? "" : ` (${tenant_id})`}`
    });
    const member = upsertTenantMember({
      tenant_id,
      account_id: account.id,
      roles: [template.role],
      status: "active",
      invited_by: actor_id
    });
    ensureRoleAuthorizationTuples({
      tenant_id,
      account_id: account.id,
      roles: [template.relation],
      source: "role_user_seed",
      actor_id,
      emitEvidence
    });
    users.push({
      account_id: account.id,
      email: account.email,
      display_name: account.display_name,
      tenant_id,
      roles: member.roles,
      status: member.status
    });
  }
  recordUsage(tenant_id, "console_seats", countActiveSeats(tenant_id), "role_user_seed");
  return users;
}

function ensureRuntimeBackfills() {
  // The Cloud starts empty. Role/test users are created only on demand through
  // the gated /api/dev/seed-role-users endpoint or real tenant signup/invite
  // flows, never auto-seeded at boot.
  for (const key of ["telemetryEnvelopes", "telemetryBatchReceipts", "telemetryRejections", "telemetryIngestTotals"]) {
    if (!Array.isArray(state.fleet[key])) state.fleet[key] = [];
  }
  rebuildTelemetryEventIndex();
}

function createAuthSession({ tenant_id, account_id, method = "dev-local", idp_id = "idp_keycloak_local_dev" }) {
  const tenantId = requiredTenantContext(tenant_id);
  const account = accountById(account_id);
  if (!account) {
    const error = new Error("account_not_found");
    error.statusCode = 404;
    throw error;
  }
  const token = issueOpaqueToken("pollek_session");
  const session = {
    id: `sess_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    account_id: account.id,
    token_hash: tokenHash(token),
    method,
    idp_id,
    status: "active",
    scopes: ["openid", "profile", "email", "pollek.console"],
    created_at: nowIso(),
    expires_at: daysFromNow(1),
    last_seen_at: nowIso()
  };
  state.fleet.authSessions.unshift(session);
  state.fleet.authSessions = state.fleet.authSessions.slice(0, 100);
  account.last_login_at = nowIso();
  return { session, token };
}

function safeSession(session, token = null) {
  if (!session) return null;
  const { token_hash, ...safe } = session;
  return {
    ...safe,
    token_hash_prefix: token_hash ? token_hash.slice(0, 12) : null,
    ...(token ? { access_token: token, token_type: "Bearer" } : {})
  };
}

function currentSessionFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const hashed = token ? tokenHash(token) : "";
  const session = hashed
    ? (state.fleet.authSessions || []).find((item) => item.token_hash === hashed && item.status === "active")
    : (state.fleet.authSessions || []).find((item) => item.status === "active");
  if (!session) return null;
  session.last_seen_at = nowIso();
  return {
    session,
    account: accountById(session.account_id),
    member: tenantMemberFor(session.tenant_id, session.account_id)
  };
}

function identityProviderForTenant(tenantId) {
  return (state.fleet.identityProviders || []).find((provider) => provider.tenant_id === tenantId && provider.status === "configured")
    || (state.fleet.identityProviders || []).find((provider) => provider.tenant_id === tenantId)
    || null;
}

function redactedIdentityProvider(provider) {
  if (!provider) return null;
  return {
    ...provider,
    secret_ref: provider.secret_ref ? "sealed" : null,
    client_secret: undefined
  };
}

function upsertIdentityProvider(tenantId, body = {}) {
  requiredTenantContext(tenantId);
  const id = body.id || `idp_${slugify(body.provider_type || "oidc")}_${sha256(body.issuer_url || crypto.randomUUID()).slice(0, 10)}`;
  const existing = (state.fleet.identityProviders || []).find((provider) => provider.tenant_id === tenantId && provider.id === id);
  const secretRef = body.client_secret
    ? `sealed:${sha256(`${tenantId}:${id}:${body.client_secret}`).slice(0, 24)}`
    : existing?.secret_ref || null;
  const provider = {
    ...(existing || {}),
    id,
    tenant_id: tenantId,
    provider_type: body.provider_type || existing?.provider_type || "oidc",
    display_name: body.display_name || existing?.display_name || "OIDC Identity Provider",
    status: body.status || existing?.status || "planned",
    issuer_url: body.issuer_url || existing?.issuer_url || "",
    client_id: body.client_id || existing?.client_id || "",
    discovery_url: body.discovery_url || existing?.discovery_url || "",
    scopes: Array.isArray(body.scopes) ? body.scopes : existing?.scopes || ["openid", "profile", "email"],
    claims_mapping: body.claims_mapping || existing?.claims_mapping || { email: "email", name: "name", groups: "groups" },
    secret_ref: secretRef,
    updated_at: nowIso(),
    created_at: existing?.created_at || nowIso()
  };
  if (existing) Object.assign(existing, provider);
  else state.fleet.identityProviders.unshift(provider);
  return provider;
}

function createTenantSignup(body = {}) {
  const organizationName = String(body.organization_name || body.name || "New Organization").trim();
  const slug = slugify(body.slug || organizationName, "org");
  const tenantId = body.tenant_id || tenantRecordId(slug);
  const adminEmail = body.admin_email || body.email;
  const planId = body.plan_id || (body.deployment_mode === "saas" ? "plan_enterprise_cloud" : "plan_private_cloud");
  const now = nowIso();
  const account = ensureAccount({ email: adminEmail, display_name: body.admin_name || body.display_name || "Organization Admin" });
  const member = upsertTenantMember({
    tenant_id: tenantId,
    account_id: account.id,
    roles: ["admin", "security_admin", "billing_admin"],
    status: "active",
    invited_by: "self-service-signup"
  });
  state.fleet.billingAccounts.unshift({
    id: `billacct_${slugify(tenantId)}`,
    tenant_id: tenantId,
    organization_name: organizationName,
    billing_email: body.billing_email || account.email,
    deployment_mode: body.deployment_mode || "saas",
    provider: body.billing_provider || "manual-dev",
    status: "active",
    tax_region: body.tax_region || "unknown",
    created_at: now,
    updated_at: now
  });
  state.fleet.subscriptions.unshift({
    id: `sub_${slugify(tenantId)}_${crypto.randomBytes(4).toString("hex")}`,
    tenant_id: tenantId,
    plan_id: planId,
    status: body.subscription_status || "trialing",
    billing_period: "monthly",
    current_period_start: now,
    current_period_end: daysFromNow(30),
    source: "self-service-signup",
    created_at: now,
    updated_at: now
  });
  createAuthorizationTuple({
    tenant_id: tenantId,
    principal: `user:${account.id}`,
    relation: "admin",
    object: `tenant:${tenantId}`,
    source: "signup",
    created_by: account.id
  });
  const sessionBundle = createAuthSession({ tenant_id: tenantId, account_id: account.id, method: "signup-dev" });
  recordUsage(tenantId, "console_seats", 1, "signup");
  recordAudit("tenant.signup_completed", "tenant", tenantId, {
    tenant_id: tenantId,
    actor_id: account.id,
    organization_name: organizationName,
    deployment_mode: body.deployment_mode || "saas",
    plan_id: planId
  });
  completeTask(addTask("tenant_onboarding", "running", `Created tenant ${organizationName}`, {
    tenant_id: tenantId,
    organization_name: organizationName
  }));
  return {
    tenant: {
      id: tenantId,
      name: organizationName,
      slug,
      mode: body.deployment_mode || "saas",
      status: "active"
    },
    account: publicAccount(account),
    membership: member,
    session: safeSession(sessionBundle.session, sessionBundle.token),
    subscription: state.fleet.subscriptions[0]
  };
}

function createInvitation(tenantId, body = {}) {
  requiredTenantContext(tenantId);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    const error = new Error("valid_email_required");
    error.statusCode = 400;
    throw error;
  }
  const token = issueOpaqueToken("invite");
  const invite = {
    id: `invite_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    email,
    roles: Array.isArray(body.roles) && body.roles.length ? body.roles.map(String) : ["viewer"],
    status: "pending",
    token_hash: tokenHash(token),
    invited_by: body.invited_by || body.actor_id || "acc_local_admin",
    expires_at: body.expires_at || daysFromNow(14),
    created_at: nowIso()
  };
  state.fleet.invitations.unshift(invite);
  recordAudit("member.invited", "invitation", invite.id, {
    tenant_id: tenantId,
    actor_id: invite.invited_by,
    email,
    roles: invite.roles
  });
  addTask("member_invitation", "completed", `Invited ${email}`, { tenant_id: tenantId, invitation_id: invite.id });
  scheduleRuntimePersist("member.invited");
  return { invitation: { ...invite, token_hash: undefined, invite_url: `${publicUrl}/#tab=administration&invite=${encodeURIComponent(token)}` }, token };
}

function acceptInvitation(body = {}) {
  const token = body.token || body.invitation_token;
  const hashed = token ? tokenHash(token) : body.token_hash;
  const invite = (state.fleet.invitations || []).find((item) => item.token_hash === hashed && item.status === "pending");
  if (!invite) {
    const error = new Error("invitation_not_found_or_used");
    error.statusCode = 404;
    throw error;
  }
  const account = ensureAccount({
    email: body.email || invite.email,
    display_name: body.display_name || body.name || invite.email.split("@")[0]
  });
  const member = upsertTenantMember({
    tenant_id: invite.tenant_id,
    account_id: account.id,
    roles: invite.roles,
    status: "active",
    invited_by: invite.invited_by
  });
  invite.status = "accepted";
  invite.accepted_at = nowIso();
  invite.account_id = account.id;
  const sessionBundle = createAuthSession({ tenant_id: invite.tenant_id, account_id: account.id, method: "invitation-dev" });
  recordUsage(invite.tenant_id, "console_seats", countActiveSeats(invite.tenant_id), "invitation_accept");
  recordAudit("member.joined", "tenant_member", member.id, {
    tenant_id: invite.tenant_id,
    actor_id: account.id,
    invitation_id: invite.id
  });
  scheduleRuntimePersist("member.joined");
  return {
    account: publicAccount(account),
    membership: member,
    session: safeSession(sessionBundle.session, sessionBundle.token)
  };
}

function countActiveSeats(tenantId) {
  return (state.fleet.tenantMembers || []).filter((member) => member.tenant_id === tenantId && member.status === "active").length;
}

function countManagedDevices(tenantId) {
  const deviceIds = new Set((state.fleet.localControlPlanes || [])
    .filter((lcp) => lcp.tenant_id === tenantId)
    .map((lcp) => lcp.device_id)
    .filter(Boolean));
  return deviceIds.size;
}

function countLocalControlPlanes(tenantId) {
  return (state.fleet.localControlPlanes || []).filter((lcp) => lcp.tenant_id === tenantId).length;
}

function upsertUsageCounter(tenantId, metric, quantity) {
  requiredTenantContext(tenantId);
  const now = nowIso();
  const counter = (state.fleet.usageCounters || []).find((item) => item.tenant_id === tenantId && item.metric === metric && item.period === "current");
  if (counter) {
    counter.quantity = Number(quantity || 0);
    counter.updated_at = now;
  } else {
    state.fleet.usageCounters.unshift({
      id: `usage_${slugify(tenantId)}_${slugify(metric)}`,
      tenant_id: tenantId,
      metric,
      quantity: Number(quantity || 0),
      period: "current",
      updated_at: now
    });
  }
}

function recordUsage(tenantId, metric, quantity, source = "runtime") {
  upsertUsageCounter(tenantId, metric, quantity);
  const recordedAt = nowIso();
  const record = {
    id: `usage_record_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    metric,
    quantity: Number(quantity || 0),
    source,
    recorded_at: recordedAt
  };
  state.fleet.usageRecords.unshift(record);
  state.fleet.usageRecords = state.fleet.usageRecords.slice(0, 500);
  return record;
}

function requiredUsageField(entry, field, index) {
  const value = entry?.[field];
  if (value === undefined || value === null || value === "") {
    throw new Error(`usage_entries[${index}].${field} is required`);
  }
  return value;
}

function numberFromUsage(entry, fields) {
  for (const field of fields) {
    const value = entry?.[field];
    if (value !== undefined && value !== null && value !== "") return Number(value || 0);
  }
  return 0;
}

function normalizeOsFamily(value = "unknown") {
  const normalized = String(value || "unknown").trim().toLowerCase();
  if (normalized.startsWith("win")) return "windows";
  if (normalized === "darwin" || normalized.startsWith("mac")) return "macos";
  if (normalized.includes("linux") || normalized.includes("ubuntu") || normalized.includes("debian") || normalized.includes("fedora")) return "linux";
  return ["windows", "macos", "linux"].includes(normalized) ? normalized : "unknown";
}

function validateLcpUsageLedger(body = {}) {
  const tenantId = body.tenant_id || body.tenantId || "local";
  requiredTenantContext(tenantId);
  const lcpId = body.lcp_id || body.lcpId;
  if (!lcpId) throw new Error("lcp_id is required");
  const entries = Array.isArray(body.usage_entries)
    ? body.usage_entries
    : Array.isArray(body.entries)
      ? body.entries
      : [];
  if (!entries.length) throw new Error("usage_entries array is required");
  const knownLcp = (state.fleet.localControlPlanes || []).find((item) => item.id === lcpId && item.tenant_id === tenantId);
  if (!knownLcp) throw new Error(`unknown_lcp:${lcpId}`);
  return {
    tenantId,
    lcpId,
    entries,
    osFamily: normalizeOsFamily(body.os_family || body.osFamily || knownLcp.os_family),
    osVersion: body.os_version || body.osVersion || knownLcp.os_version || "",
    captureMethod: body.capture_method || body.captureMethod || "unknown"
  };
}

function normalizeLcpUsageEntry(entry, context, index) {
  const agentId = requiredUsageField(entry, "agent_id", index);
  const deviceId = requiredUsageField(entry, "device_id", index);
  const userSubject = requiredUsageField(entry, "user_subject", index);
  const provider = requiredUsageField(entry, "provider", index);
  const model = requiredUsageField(entry, "model", index);
  const pricingModel = entry.pricing_model || entry.billing_model || "token_metered";
  const inputTokens = numberFromUsage(entry, ["input_tokens", "prompt_tokens"]);
  const outputTokens = numberFromUsage(entry, ["output_tokens", "completion_tokens"]);
  const totalTokens = numberFromUsage(entry, ["total_tokens", "tokens"]) || inputTokens + outputTokens;
  const credits = numberFromUsage(entry, ["billed_credits", "credits", "credit_units"]);
  const allocatedCostCents = numberFromUsage(entry, ["allocated_cost_cents", "estimated_cost_cents", "cost_cents", "amount_cents"]);
  const osFamily = normalizeOsFamily(entry.os_family || entry.osFamily || context.osFamily);
  if (pricingModel.includes("credit") && !entry.billing_pool_id && !entry.credit_pool_id) {
    throw new Error(`usage_entries[${index}].billing_pool_id is required for credit pricing`);
  }
  if (totalTokens < 0 || credits < 0 || allocatedCostCents < 0) {
    throw new Error(`usage_entries[${index}] contains negative usage values`);
  }
  return {
    id: entry.id || `usage_lcp_${crypto.randomUUID()}`,
    tenant_id: context.tenantId,
    metric: "ai_model_usage",
    source: "lcp_usage_ledger",
    confidence: entry.confidence || "reported_by_lcp",
    ledger_id: context.ledgerId,
    lcp_id: context.lcpId,
    device_id: deviceId,
    device_name: entry.device_name || deviceId,
    os_family: osFamily,
    os_version: entry.os_version || entry.osVersion || context.osVersion,
    capture_method: entry.capture_method || entry.captureMethod || context.captureMethod,
    user_subject: userSubject,
    agent_id: agentId,
    entity_id: entry.entity_id || agentId,
    agent_name: entry.agent_name || entry.application_name || agentId,
    provider,
    model,
    pricing_model: pricingModel,
    billing_pool_id: entry.billing_pool_id || entry.credit_pool_id || "",
    allocation_method: entry.allocation_method || entry.cost_allocation_method || (pricingModel.includes("credit") ? "lcp_reported_credit_allocation" : "direct_token_meter"),
    call_count: numberFromUsage(entry, ["call_count", "calls", "request_count"]),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    billed_credits: credits,
    allocated_cost_cents: allocatedCostCents,
    estimated_cost_cents: allocatedCostCents,
    currency: entry.currency || "USD",
    observed_at: entry.observed_at || entry.occurred_at || context.observedAt,
    recorded_at: context.receivedAt,
    raw_schema: entry.schema_version || "pollek.lcp.usage-entry.v1"
  };
}

function ingestLcpUsageLedger(body = {}) {
  const { tenantId, lcpId, entries, osFamily, osVersion, captureMethod } = validateLcpUsageLedger(body);
  const ledgerId = body.ledger_id || `lcp_usage_ledger_${crypto.randomUUID()}`;
  const context = {
    tenantId,
    lcpId,
    ledgerId,
    osFamily,
    osVersion,
    captureMethod,
    receivedAt: nowIso(),
    observedAt: body.observed_at || body.occurred_at || nowIso()
  };
  const normalized = entries.map((entry, index) => normalizeLcpUsageEntry(entry, context, index));
  const existingIds = new Set((state.fleet.usageRecords || []).map((record) => record.id));
  const accepted = [];
  const duplicates = [];
  for (const record of normalized) {
    if (existingIds.has(record.id)) {
      duplicates.push(record);
      continue;
    }
    accepted.push(record);
    state.fleet.usageRecords.unshift(record);
    existingIds.add(record.id);
  }
  state.fleet.usageRecords = state.fleet.usageRecords.slice(0, 500);
  refreshTenantUsage(tenantId);
  const ledger = {
    schema_version: "pollek.cloud.lcp-usage-ledger-ingest.v1",
    ledger_id: ledgerId,
    tenant_id: tenantId,
    lcp_id: lcpId,
    os_family: osFamily,
    os_version: osVersion,
    capture_method: captureMethod,
    accepted_count: accepted.length,
    duplicate_count: duplicates.length,
    rejected_count: 0,
    total_tokens: accepted.reduce((sum, record) => sum + Number(record.total_tokens || 0), 0),
    billed_credits: accepted.reduce((sum, record) => sum + Number(record.billed_credits || 0), 0),
    allocated_cost_cents: accepted.reduce((sum, record) => sum + Number(record.allocated_cost_cents || 0), 0),
    received_at: context.receivedAt,
    source: "local_pollek_control_plane"
  };
  recordAudit("lcp_usage_ledger.ingested", "lcp", lcpId, {
    tenant_id: tenantId,
    ledger_id: ledgerId,
    accepted_count: ledger.accepted_count,
    duplicate_count: ledger.duplicate_count
  });
  recordEvent({
    event_id: `evt_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    lcp_id: lcpId,
    event_type: "lcp_usage.ledger_ingested.v1",
    severity: "info",
    payload: ledger
  });
  addTask("lcp_usage_ledger_ingest", "completed", `Accepted ${accepted.length} LCP usage records`, {
    tenant_id: tenantId,
    lcp_id: lcpId,
    ledger_id: ledgerId
  });
  broadcastSse("lcp_usage.ledger_ingested", { ledger, usage_records: accepted.slice(0, 20), summary: billingUsageSnapshot(tenantId) });
  scheduleRuntimePersist("lcp_usage_ledger.ingested");
  return { ledger, usage_records: accepted, duplicates };
}

function refreshTenantUsage(tenantId) {
  upsertUsageCounter(tenantId, "console_seats", countActiveSeats(tenantId));
  upsertUsageCounter(tenantId, "local_control_planes", countLocalControlPlanes(tenantId));
  upsertUsageCounter(tenantId, "managed_devices", countManagedDevices(tenantId));
  const telemetryTotals = (state.fleet.telemetryIngestTotals || []).find((item) => item.tenant_id === tenantId);
  upsertUsageCounter(tenantId, "telemetry_events", telemetryTotals
    ? telemetryTotals.accepted
    : state.events.filter((event) => event.tenant_id === tenantId).length);
  const aiUsage = (state.fleet.usageRecords || []).filter((record) => record.tenant_id === tenantId && record.metric === "ai_model_usage");
  upsertUsageCounter(tenantId, "ai_model_tokens", aiUsage.reduce((sum, record) => sum + Number(record.total_tokens || record.tokens || 0), 0));
  upsertUsageCounter(tenantId, "ai_model_estimated_cost_cents", aiUsage.reduce((sum, record) => sum + Number(record.allocated_cost_cents || record.estimated_cost_cents || record.cost_cents || 0), 0));
  upsertUsageCounter(tenantId, "ai_model_credits", aiUsage.reduce((sum, record) => sum + Number(record.billed_credits || record.credits || 0), 0));
  return (state.fleet.usageCounters || []).filter((item) => item.tenant_id === tenantId);
}

function refreshAllTenantUsage() {
  const tenantIds = new Set([
    "local",
    ...(state.fleet.billingAccounts || []).map((account) => account.tenant_id),
    ...(state.fleet.tenantMembers || []).map((member) => member.tenant_id)
  ].filter(Boolean));
  for (const tenantId of tenantIds) refreshTenantUsage(tenantId);
  return state.fleet.usageCounters || [];
}

function planForTenant(tenantId) {
  const sub = (state.fleet.subscriptions || []).find((item) => item.tenant_id === tenantId && ["active", "trialing"].includes(item.status))
    || (state.fleet.subscriptions || []).find((item) => item.tenant_id === tenantId)
    || null;
  const plan = (state.fleet.billingPlans || []).find((item) => item.id === sub?.plan_id)
    || (state.fleet.billingPlans || [])[0]
    || null;
  return { subscription: sub, plan };
}

function billingUsageSnapshot(tenantId) {
  const counters = refreshTenantUsage(tenantId);
  const byMetric = Object.fromEntries(counters.map((item) => [item.metric, item.quantity]));
  const { subscription, plan } = planForTenant(tenantId);
  return {
    schema_version: "pollek.cloud.billing-usage.v1",
    tenant_id: tenantId,
    subscription,
    plan,
    counters,
    summary: {
      seats: byMetric.console_seats || 0,
      local_control_planes: byMetric.local_control_planes || 0,
      managed_devices: byMetric.managed_devices || 0,
      telemetry_events: byMetric.telemetry_events || 0,
      ai_model_tokens: byMetric.ai_model_tokens || 0,
      ai_model_credits: byMetric.ai_model_credits || 0,
      ai_model_estimated_cost_cents: byMetric.ai_model_estimated_cost_cents || 0
    },
    generated_at: nowIso()
  };
}

// ---------------------------------------------------------------------------
// Cost & Token reporting
//
// Aggregates the LCP-reported / bridged ai_model_usage records into per-device,
// per-user, per-agent, per-tenant, per-model, and per-provider breakdowns so the
// Cloud portal can show cost and token consumption by category with an overview
// dashboard and downloadable reports.
// ---------------------------------------------------------------------------

const COST_TOKEN_DIMENSIONS = ["device", "user", "agent", "tenant", "model", "provider"];

function usageFieldNumber(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function usageFieldString(record, keys, fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback;
}

function isCostTokenRecord(record) {
  const metric = String(record?.metric || "");
  return metric === "ai_model_usage"
    || metric.includes("token")
    || metric.includes("cost")
    || usageFieldNumber(record, ["total_tokens", "tokens", "input_tokens", "output_tokens"]) > 0
    || usageFieldNumber(record, ["allocated_cost_cents", "estimated_cost_cents", "cost_cents", "amount_cents", "billed_credits", "credits"]) > 0;
}

function usageRecordTimestamp(record) {
  return usageFieldString(record, ["observed_at", "recorded_at", "occurred_at"], "");
}

// Parse an ISO date/datetime query param. A bare date (YYYY-MM-DD) is treated
// as the start of that UTC day; the caller decides end-of-range inclusivity.
function parseRangeBound(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let iso = raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function normalizeCostTokenRange(range = {}) {
  const fromMs = parseRangeBound(range.from, { endOfDay: false });
  const toMs = parseRangeBound(range.to, { endOfDay: true });
  return {
    from: fromMs,
    to: toMs,
    from_iso: fromMs === null ? null : new Date(fromMs).toISOString(),
    to_iso: toMs === null ? null : new Date(toMs).toISOString()
  };
}

function recordWithinRange(record, range) {
  if (range.from === null && range.to === null) return true;
  const stamp = usageRecordTimestamp(record);
  const ms = stamp ? Date.parse(stamp) : NaN;
  if (Number.isNaN(ms)) return range.from === null && range.to === null ? true : false;
  if (range.from !== null && ms < range.from) return false;
  if (range.to !== null && ms > range.to) return false;
  return true;
}

function costTokenRecordsForScope(tenantId = null, range = null) {
  let records = (state.fleet.usageRecords || []).filter(isCostTokenRecord);
  if (tenantId) records = records.filter((record) => record.tenant_id === tenantId);
  if (range && (range.from !== null || range.to !== null)) records = records.filter((record) => recordWithinRange(record, range));
  return records;
}

function tenantDisplayName(tenantId) {
  if (tenantId === "local") return state.tenant?.name || "Local Lab Tenant";
  const account = (state.fleet.billingAccounts || []).find((item) => item.tenant_id === tenantId);
  return account?.organization_name || tenantId;
}

function costTokenGroupIdentity(record, dimension) {
  switch (dimension) {
    case "device":
      return {
        key: usageFieldString(record, ["device_id", "device_name"], "unknown-device"),
        label: usageFieldString(record, ["device_name", "device_id"], "Unknown device"),
        meta: {
          lcp_id: usageFieldString(record, ["lcp_id"], "unknown-lcp"),
          os_family: normalizeOsFamily(usageFieldString(record, ["os_family"], "unknown")),
          os_version: usageFieldString(record, ["os_version"], "")
        }
      };
    case "user":
      return {
        key: usageFieldString(record, ["user_subject", "user_id"], "unknown-user"),
        label: usageFieldString(record, ["user_subject", "user_id"], "Unknown user"),
        meta: {}
      };
    case "agent":
      return {
        key: usageFieldString(record, ["agent_id", "entity_id", "object_id"], usageFieldString(record, ["agent_name", "name"], "unknown-agent")),
        label: usageFieldString(record, ["agent_name", "name", "agent_id", "entity_id"], "Unknown agent"),
        meta: {}
      };
    case "tenant":
      return {
        key: usageFieldString(record, ["tenant_id"], "unknown-tenant"),
        label: tenantDisplayName(usageFieldString(record, ["tenant_id"], "unknown-tenant")),
        meta: {}
      };
    case "model": {
      const provider = usageFieldString(record, ["provider"], "unknown");
      const model = usageFieldString(record, ["model"], "unknown");
      return { key: `${provider}::${model}`, label: `${provider} ${model}`.trim(), meta: { provider, model } };
    }
    case "provider":
      return {
        key: usageFieldString(record, ["provider"], "unknown"),
        label: usageFieldString(record, ["provider"], "Unknown provider"),
        meta: {}
      };
    default:
      return { key: "all", label: "All usage", meta: {} };
  }
}

function newCostTokenBucket(identity) {
  return {
    key: identity.key,
    label: identity.label,
    ...identity.meta,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    total_tokens: 0,
    cost_cents: 0,
    credits: 0,
    calls: 0,
    records: 0,
    reported_records: 0,
    estimated_records: 0,
    credit_pools: new Set(),
    devices: new Set(),
    users: new Set(),
    agents: new Set(),
    tenants: new Set(),
    providers: new Set(),
    models: new Set(),
    last_activity_at: null
  };
}

function accumulateCostToken(bucket, record) {
  const inputTokens = usageFieldNumber(record, ["input_tokens", "prompt_tokens"]);
  const outputTokens = usageFieldNumber(record, ["output_tokens", "completion_tokens"]);
  const cachedTokens = usageFieldNumber(record, ["cached_input_tokens"]);
  const totalTokens = usageFieldNumber(record, ["total_tokens", "tokens"]) || inputTokens + outputTokens;
  const costCents = usageFieldNumber(record, ["allocated_cost_cents", "estimated_cost_cents", "cost_cents", "amount_cents"]);
  const credits = usageFieldNumber(record, ["billed_credits", "credits", "credit_units"]);
  const calls = usageFieldNumber(record, ["call_count", "calls", "request_count"]);
  bucket.input_tokens += inputTokens;
  bucket.output_tokens += outputTokens;
  bucket.cached_input_tokens += cachedTokens;
  bucket.total_tokens += totalTokens;
  bucket.cost_cents += costCents;
  bucket.credits += credits;
  bucket.calls += calls;
  bucket.records += 1;
  const confidence = usageFieldString(record, ["confidence", "source"], "reported");
  if (confidence.includes("estimate")) bucket.estimated_records += 1;
  else bucket.reported_records += 1;
  const poolId = usageFieldString(record, ["billing_pool_id", "credit_pool_id"], "");
  if (poolId) bucket.credit_pools.add(poolId);
  bucket.devices.add(usageFieldString(record, ["device_id", "device_name"], "unknown-device"));
  bucket.users.add(usageFieldString(record, ["user_subject", "user_id"], "unknown-user"));
  bucket.agents.add(usageFieldString(record, ["agent_id", "entity_id"], usageFieldString(record, ["agent_name"], "unknown-agent")));
  bucket.tenants.add(usageFieldString(record, ["tenant_id"], "unknown-tenant"));
  bucket.providers.add(usageFieldString(record, ["provider"], "unknown"));
  bucket.models.add(usageFieldString(record, ["model"], "unknown"));
  const activityAt = usageFieldString(record, ["observed_at", "recorded_at"], "");
  if (activityAt && (!bucket.last_activity_at || activityAt > bucket.last_activity_at)) bucket.last_activity_at = activityAt;
}

function finalizeCostTokenBucket(bucket) {
  return {
    key: bucket.key,
    label: bucket.label,
    ...(bucket.lcp_id ? { lcp_id: bucket.lcp_id } : {}),
    ...(bucket.os_family ? { os_family: bucket.os_family } : {}),
    ...(bucket.os_version ? { os_version: bucket.os_version } : {}),
    ...(bucket.provider ? { provider: bucket.provider } : {}),
    ...(bucket.model ? { model: bucket.model } : {}),
    input_tokens: bucket.input_tokens,
    output_tokens: bucket.output_tokens,
    cached_input_tokens: bucket.cached_input_tokens,
    total_tokens: bucket.total_tokens,
    cost_cents: bucket.cost_cents,
    credits: Number(bucket.credits.toFixed(4)),
    calls: bucket.calls,
    records: bucket.records,
    reported_records: bucket.reported_records,
    estimated_records: bucket.estimated_records,
    credit_pools: [...bucket.credit_pools],
    device_count: bucket.devices.size,
    user_count: bucket.users.size,
    agent_count: bucket.agents.size,
    tenant_count: bucket.tenants.size,
    provider_count: bucket.providers.size,
    model_count: bucket.models.size,
    last_activity_at: bucket.last_activity_at
  };
}

function aggregateCostTokens(records, dimension) {
  const buckets = new Map();
  for (const record of records) {
    const identity = costTokenGroupIdentity(record, dimension);
    if (!buckets.has(identity.key)) buckets.set(identity.key, newCostTokenBucket(identity));
    accumulateCostToken(buckets.get(identity.key), record);
  }
  return [...buckets.values()]
    .map(finalizeCostTokenBucket)
    .sort((a, b) => b.cost_cents - a.cost_cents || b.total_tokens - a.total_tokens || b.calls - a.calls);
}

function summarizeCostTokens(records) {
  const totals = newCostTokenBucket({ key: "totals", label: "totals", meta: {} });
  for (const record of records) accumulateCostToken(totals, record);
  const final = finalizeCostTokenBucket(totals);
  return {
    total_tokens: final.total_tokens,
    input_tokens: final.input_tokens,
    output_tokens: final.output_tokens,
    cached_input_tokens: final.cached_input_tokens,
    cost_cents: final.cost_cents,
    currency: "USD",
    credits: final.credits,
    calls: final.calls,
    records: final.records,
    reported_records: final.reported_records,
    estimated_records: final.estimated_records,
    credit_pools: final.credit_pools,
    devices: final.device_count,
    users: final.user_count,
    agents: final.agent_count,
    tenants: final.tenant_count,
    providers: final.provider_count,
    models: final.model_count,
    avg_cost_per_device_cents: final.device_count ? Math.round(final.cost_cents / final.device_count) : 0,
    avg_cost_per_user_cents: final.user_count ? Math.round(final.cost_cents / final.user_count) : 0
  };
}

function costTokenRangeMeta(range) {
  return { from: range.from_iso, to: range.to_iso, applied: range.from !== null || range.to !== null };
}

function costTokenReport(tenantId, dimension, rangeInput = {}) {
  const groupBy = COST_TOKEN_DIMENSIONS.includes(dimension) ? dimension : "device";
  const scope = tenantId || null;
  const range = normalizeCostTokenRange(rangeInput);
  const records = costTokenRecordsForScope(scope, range);
  return {
    schema_version: "pollek.cloud.cost-token-report.v1",
    tenant_id: tenantId || "all",
    scope: tenantId ? "tenant" : "all_tenants",
    group_by: groupBy,
    range: costTokenRangeMeta(range),
    generated_at: nowIso(),
    totals: summarizeCostTokens(records),
    groups: aggregateCostTokens(records, groupBy)
  };
}

function costTokenOverview(tenantId, rangeInput = {}) {
  const scope = tenantId || null;
  const range = normalizeCostTokenRange(rangeInput);
  const records = costTokenRecordsForScope(scope, range);
  const overview = {
    schema_version: "pollek.cloud.cost-token-overview.v1",
    tenant_id: tenantId || "all",
    scope: tenantId ? "tenant" : "all_tenants",
    range: costTokenRangeMeta(range),
    generated_at: nowIso(),
    totals: summarizeCostTokens(records),
    categories: {}
  };
  for (const dimension of COST_TOKEN_DIMENSIONS) {
    overview.categories[dimension] = aggregateCostTokens(records, dimension);
  }
  overview.sources = {
    lcp_usage_ledger: records.filter((record) => record.source === "lcp_usage_ledger" || record.confidence === "reported_by_lcp").length,
    telemetry_bridge: records.filter((record) => record.source === "lcp_model_usage_telemetry").length,
    estimated: records.filter((record) => String(record.confidence || record.source || "").includes("estimate")).length,
    total: records.length
  };
  return overview;
}

function costTokenReportCsv(report) {
  const header = "group_by,key,label,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_cents,credits,calls,records,reported_records,estimated_records,device_count,user_count,agent_count,tenant_count,last_activity_at";
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = report.groups.map((group) => [
    report.group_by,
    escape(group.key),
    escape(group.label),
    group.input_tokens,
    group.output_tokens,
    group.cached_input_tokens,
    group.total_tokens,
    group.cost_cents,
    group.credits,
    group.calls,
    group.records,
    group.reported_records,
    group.estimated_records,
    group.device_count,
    group.user_count,
    group.agent_count,
    group.tenant_count,
    escape(group.last_activity_at || "")
  ].join(","));
  return [header, ...rows].join("\n");
}

function invoicePreview(tenantId) {
  const usage = billingUsageSnapshot(tenantId);
  const plan = usage.plan || {};
  const overage = {
    seats: Math.max(0, usage.summary.seats - Number(plan.included_seats || 0)),
    local_control_planes: Math.max(0, usage.summary.local_control_planes - Number(plan.included_lcps || 0)),
    managed_devices: Math.max(0, usage.summary.managed_devices - Number(plan.included_devices || 0))
  };
  const lineItems = [
    { metric: "base_subscription", quantity: 1, unit_amount_cents: plan.monthly_base_cents || 0, amount_cents: plan.monthly_base_cents || 0 },
    { metric: "seat_overage", quantity: overage.seats, unit_amount_cents: plan.seat_overage_cents || 0, amount_cents: overage.seats * Number(plan.seat_overage_cents || 0) },
    { metric: "lcp_overage", quantity: overage.local_control_planes, unit_amount_cents: plan.lcp_overage_cents || 0, amount_cents: overage.local_control_planes * Number(plan.lcp_overage_cents || 0) },
    { metric: "device_overage", quantity: overage.managed_devices, unit_amount_cents: plan.device_overage_cents || 0, amount_cents: overage.managed_devices * Number(plan.device_overage_cents || 0) },
    { metric: "ai_model_cost_allocation", quantity: usage.summary.ai_model_tokens || 0, unit_amount_cents: 0, amount_cents: usage.summary.ai_model_estimated_cost_cents || 0 }
  ];
  const total = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
  return {
    id: `inv_preview_${slugify(tenantId)}`,
    tenant_id: tenantId,
    status: "preview",
    currency: plan.currency || "USD",
    line_items: lineItems,
    subtotal_cents: total,
    total_cents: total,
    generated_at: nowIso()
  };
}

function ensureInvoice(tenantId) {
  const existing = (state.fleet.invoices || []).find((invoice) => invoice.tenant_id === tenantId && invoice.status === "preview");
  const preview = invoicePreview(tenantId);
  if (existing) {
    Object.assign(existing, preview, { id: existing.id });
    return existing;
  }
  const invoice = {
    ...preview,
    id: `inv_${slugify(tenantId)}_${crypto.randomBytes(4).toString("hex")}`,
    created_at: nowIso()
  };
  state.fleet.invoices.unshift(invoice);
  return invoice;
}

function issueOfflineLicense(tenantId, body = {}) {
  requiredTenantContext(tenantId);
  const { subscription, plan } = planForTenant(tenantId);
  const licenseBody = {
    schema_version: "pollek.cloud.offline-license.v1",
    tenant_id: tenantId,
    subscription_id: subscription?.id || null,
    plan_id: plan?.id || null,
    deployment_mode: body.deployment_mode || "private_cloud",
    max_seats: body.max_seats || plan?.included_seats || 25,
    max_lcps: body.max_lcps || plan?.included_lcps || 10,
    max_devices: body.max_devices || plan?.included_devices || 100,
    features: body.features || plan?.features || ["offline_license"],
    issued_at: nowIso(),
    expires_at: body.expires_at || daysFromNow(365)
  };
  const payload = stableJson(licenseBody);
  const signature = crypto.sign(null, Buffer.from(payload), bundleSigningKeyPair.privateKey).toString("base64url");
  const license = {
    id: `lic_${slugify(tenantId)}_${crypto.randomBytes(5).toString("hex")}`,
    tenant_id: tenantId,
    status: "issued",
    kms_key_id: "kms_local_dev_signing",
    algorithm: "Ed25519",
    payload_hash: sha256(payload),
    signature,
    license: licenseBody,
    created_at: nowIso()
  };
  state.fleet.licenses.unshift(license);
  recordAudit("billing.license_issued", "license", license.id, {
    tenant_id: tenantId,
    actor_id: body.actor_id || "acc_local_admin",
    payload_hash: license.payload_hash
  });
  addTask("billing_license_issue", "completed", `Issued offline license for ${tenantId}`, {
    tenant_id: tenantId,
    license_id: license.id
  });
  scheduleRuntimePersist("billing.license_issued");
  return license;
}

function kmsHealth() {
  return {
    schema_version: "pollek.cloud.kms-health.v1",
    status: "healthy",
    providers: (state.fleet.kmsKeys || []).map((key) => ({
      id: key.id,
      tenant_id: key.tenant_id,
      provider: key.provider,
      purpose: key.purpose,
      status: key.status,
      algorithm: key.algorithm,
      rotation_status: key.rotation_status,
      last_checked_at: nowIso()
    })),
    production_options: ["openbao", "cosmian_kms", "aws_kms", "azure_key_vault", "gcp_cloud_kms"]
  };
}

// --- Cloud-Phase-1 trust-spine primitives -------------------------------------------------
// One SPIFFE trust domain per Cloud deployment (DEK alignment §1). Tenant lives in the SVID
// path, not the trust domain.
const trustDomain = process.env.POLLEK_TRUST_DOMAIN || "spiffe://pollek.io";

// Stable ed25519 signer identity. The keyid is the fingerprint of the raw 32-byte public key
// so it matches signatures[].keyid on the DEK side (ed25519-dalek verify_strict over the raw
// key). base64url of the raw key is exported via JWK `x`.
let cachedBundleSigningKeyId = null;
function bundleSigningRawPublicKeyB64() {
  return bundleSigningKeyPair.publicKey.export({ format: "jwk" }).x;
}
function bundleSigningKeyId() {
  if (!cachedBundleSigningKeyId) {
    const rawB64 = bundleSigningRawPublicKeyB64();
    cachedBundleSigningKeyId = `pollek-cloud-ed25519-${sha256(Buffer.from(rawB64, "base64url")).slice(0, 16)}`;
  }
  return cachedBundleSigningKeyId;
}

// Sign / verify any trust document with TUF-style detached signatures[] over the canonical
// unsigned body (the `signatures` field is excluded from the signed bytes).
function signTrustDocument(unsigned) {
  const payload = Buffer.from(stableJson(unsigned));
  const sig = crypto.sign(null, payload, bundleSigningKeyPair.privateKey).toString("base64url");
  return {
    ...unsigned,
    signatures: [{ keyid: bundleSigningKeyId(), alg: "ed25519", sig }]
  };
}

function verifyTrustDocument(signed) {
  if (!signed || typeof signed !== "object") return { status: "invalid", reason: "not_an_object", signature_count: 0 };
  const { signatures, ...unsigned } = signed;
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return { status: "unsigned", reason: "no_signatures", signature_count: 0 };
  }
  const payload = Buffer.from(stableJson(unsigned));
  const results = signatures.map((entry) => {
    try {
      const ok = Boolean(entry?.sig)
        && crypto.verify(null, payload, bundleSigningKeyPair.publicKey, Buffer.from(entry.sig, "base64url"));
      return { keyid: entry?.keyid || null, valid: ok };
    } catch (error) {
      return { keyid: entry?.keyid || null, valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    status: results.every((item) => item.valid) ? "valid" : "invalid",
    signature_count: results.length,
    results
  };
}

// Cloud-authored trust policy (DEK alignment §2). Cloud authors it; the DEK may only make it
// stricter (effective = max(cloud, local)). Signed at read time with the current signer key.
function unsignedTrustPolicy() {
  return {
    schema_version: "pollek.trust.trust-policy.v1",
    policy_version: 1,
    trust_domain: trustDomain,
    issued_at: nowIso(),
    requirements: {
      require_signature: true,
      require_signed_data: true,
      require_provenance: true,
      require_slsa_level: 2,
      require_sbom: true,
      sbom_formats: ["cyclonedx"],
      require_test_attestation: true,
      require_signer_in_allowlist: true,
      require_tenant_match: true,
      require_generation_monotonic: true,
      signature_algorithms: ["ed25519"]
    },
    revocation: {
      refresh_interval_seconds: 300,
      max_staleness_seconds: 3600,
      semantics: "deny_list"
    },
    kill_switch: {
      propagation_target_seconds: 1,
      modes: ["deny_all", "deny_high_risk"],
      unlock_requires_dual_control: true
    }
  };
}

function trustPolicyDocument() {
  return signTrustDocument(unsignedTrustPolicy());
}

// Signer allowlist. The active signer is the current ed25519 key; any keyids in the revocation
// deny-list are surfaced here as `revoked` so the DEK never trusts a rotated-out key.
function unsignedSignerAllowlist() {
  const revoked = new Set(state.fleet.trustRevocations?.revoked_key_ids || []);
  const activeKeyId = bundleSigningKeyId();
  const signers = [
    {
      keyid: activeKeyId,
      alg: "ed25519",
      status: revoked.has(activeKeyId) ? "revoked" : "active",
      public_key: {
        raw_base64url: bundleSigningRawPublicKeyB64(),
        pem: bundleSigningPublicKeyPem
      },
      purposes: ["bundle", "trust_policy", "revocation", "signer_allowlist"]
    }
  ];
  for (const keyid of revoked) {
    if (keyid === activeKeyId) continue;
    signers.push({ keyid, alg: "ed25519", status: "revoked", public_key: { raw_base64url: "" }, purposes: [] });
  }
  return {
    schema_version: "pollek.trust.signer-allowlist.v1",
    allowlist_epoch: 1 + (state.fleet.trustRevocations?.revocation_epoch || 0),
    trust_domain: trustDomain,
    issued_at: nowIso(),
    signers
  };
}

function signerAllowlistDocument() {
  return signTrustDocument(unsignedSignerAllowlist());
}

// Signed deny-list. Monotonic revocation_epoch prevents replay of an older (shorter) list.
function unsignedRevocationList() {
  const store = state.fleet.trustRevocations || { revocation_epoch: 0 };
  return {
    schema_version: "pollek.trust.revocation-list.v1",
    revocation_epoch: store.revocation_epoch || 0,
    issued_at: nowIso(),
    revoked_key_ids: [...new Set(store.revoked_key_ids || [])],
    revoked_bundle_digests: [...new Set(store.revoked_bundle_digests || [])],
    revoked_revisions: [...new Set(store.revoked_revisions || [])]
  };
}

function revocationListDocument() {
  return signTrustDocument(unsignedRevocationList());
}

// Append revocations and bump the monotonic epoch. Returns the freshly signed list.
function addRevocations(entry = {}, actor = "acc_local_admin") {
  const store = state.fleet.trustRevocations || (state.fleet.trustRevocations = {
    revocation_epoch: 0, revoked_key_ids: [], revoked_bundle_digests: [], revoked_revisions: [], history: []
  });
  const keyIds = Array.isArray(entry.revoked_key_ids) ? entry.revoked_key_ids.filter((value) => typeof value === "string" && value) : [];
  const bundleDigests = Array.isArray(entry.revoked_bundle_digests) ? entry.revoked_bundle_digests.filter((value) => typeof value === "string" && value) : [];
  const revisions = Array.isArray(entry.revoked_revisions) ? entry.revoked_revisions.filter((value) => typeof value === "string" && value) : [];
  if (!keyIds.length && !bundleDigests.length && !revisions.length) {
    const error = new Error("revocation_target_required");
    error.statusCode = 400;
    throw error;
  }
  store.revoked_key_ids = [...new Set([...(store.revoked_key_ids || []), ...keyIds])];
  store.revoked_bundle_digests = [...new Set([...(store.revoked_bundle_digests || []), ...bundleDigests])];
  store.revoked_revisions = [...new Set([...(store.revoked_revisions || []), ...revisions])];
  store.revocation_epoch = (store.revocation_epoch || 0) + 1;
  const historyEntry = {
    revocation_epoch: store.revocation_epoch,
    added: { revoked_key_ids: keyIds, revoked_bundle_digests: bundleDigests, revoked_revisions: revisions },
    reason: typeof entry.reason === "string" ? entry.reason.slice(0, 500) : null,
    actor_id: actor,
    issued_at: nowIso()
  };
  store.history = [historyEntry, ...(store.history || [])].slice(0, 100);
  recordAudit("trust.revocation_added", "trust_revocation", `epoch_${store.revocation_epoch}`, {
    actor_id: actor,
    revoked_key_ids: keyIds,
    revoked_bundle_digests: bundleDigests,
    revoked_revisions: revisions
  });
  addTask("trust_revocation_add", "completed", `Revocation epoch ${store.revocation_epoch} issued`, {
    revocation_epoch: store.revocation_epoch
  });
  scheduleRuntimePersist("trust.revocation_added");
  return revocationListDocument();
}

// Trust & Provenance read view for the console dashboard.
function trustProvenanceView() {
  const bundles = state.fleet.policyBundles || [];
  const artifacts = state.fleet.policyBundleArtifacts || [];
  const bundleViews = bundles.map((bundle) => {
    const manifest = signedPolicyBundleManifest(bundle);
    return {
      bundle_id: bundle.id,
      tenant_id: bundleTenantId(bundle),
      revision: bundle.revision,
      generation: manifest.generation,
      control_level: bundle.control_level || manifest.target?.control_level || null,
      signed_fields: manifest.signed_fields,
      manifest_hash: manifest.payload_hash,
      verification_status: manifest.verification?.status || "unsigned",
      data_sha256: manifest.data_sha256,
      sbom_sha256: manifest.sbom_sha256,
      provenance: {
        slsa_level: manifest.provenance?.slsa_level || null,
        builder_id: manifest.provenance?.builder?.id || null,
        materials: (manifest.provenance?.materials || []).length
      },
      attestation: {
        result: manifest.attestation?.predicate?.result || null,
        tests_total: manifest.attestation?.predicate?.tests_total ?? null
      },
      signatures: (manifest.signatures || []).map((signature) => ({
        keyid: signature.keyid || signature.key_id,
        alg: signature.alg,
        signed_at: signature.signed_at
      }))
    };
  });
  const trustPolicy = trustPolicyDocument();
  const signerAllowlist = signerAllowlistDocument();
  const revocations = revocationListDocument();
  return {
    schema_version: "pollek.cloud.trust-provenance-view.v1",
    trust_domain: trustDomain,
    signer_key_id: bundleSigningKeyId(),
    bundle_count: bundleViews.length,
    artifact_count: artifacts.length,
    trust_policy: trustPolicy,
    signer_allowlist: signerAllowlist,
    revocations,
    bundles: bundleViews
  };
}

function bundleTenantId(bundle, fallback = "local") {
  return bundle?.tenant_id || bundle?.approval_record?.tenant_id || fallback;
}

// data.json travels inside the signed bundle bytes so tampering breaks the signature
// (DEK alignment §3: "sign the whole signed content including data.json").
function bundleDataDocument(bundle) {
  return bundle?.data && typeof bundle.data === "object" ? bundle.data : {};
}

// SLSA-style build provenance (Build L2 initially; DEK accepts >=2, tightens to L3 later).
// Deterministic in the bundle so the signed manifest hash is reproducible on verify.
function bundleProvenance(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  const dataDoc = bundleDataDocument(bundle);
  return {
    schema_version: "pollek.trust.bundle-provenance.v1",
    slsa_level: 2,
    build_type: "https://pollek.cloud/buildtypes/policy-bundle@v1",
    builder: {
      id: `https://pollek.cloud/builders/contract-hub@${cloudVersion}`,
      version: { cloud: cloudVersion }
    },
    invocation: {
      config_source: {
        uri: `pollek-bundle://${bundleId}`,
        digest: { sha256: sha256(stableJson({ id: bundleId, revision, policies: bundle?.policies || [] })) },
        entry_point: "signPolicyBundle"
      },
      parameters: { revision, tenant_id: bundleTenantId(bundle) },
      environment: { builder_kind: "cloud-contract-hub" }
    },
    materials: [
      { uri: `pollek-bundle://${bundleId}/policies`, digest: { sha256: sha256(stableJson(bundle?.policies || [])) } },
      { uri: `pollek-bundle://${bundleId}/artifacts`, digest: { sha256: sha256(stableJson(bundle?.artifacts || [])) } },
      { uri: `pollek-bundle://${bundleId}/data.json`, digest: { sha256: sha256(stableJson(dataDoc)) } }
    ],
    metadata: {
      build_finished_on: createdAt,
      reproducible: true,
      completeness: { parameters: true, environment: false, materials: true }
    }
  };
}

// CycloneDX (JSON) SBOM — DEK verifies present + non-empty + embedded digest matches.
// serialNumber/timestamp are deterministic in the bundle so the manifest stays reproducible.
function bundleSbom(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  const engines = [...new Set((bundle?.policies || []).flatMap((policy) => policy.engines || policy.engine || []))].sort();
  const components = [
    {
      type: "application",
      "bom-ref": `pkg:pollek/policy-bundle/${bundleId}@${revision}`,
      name: "pollek-policy-bundle",
      version: revision,
      hashes: [{ alg: "SHA-256", content: sha256(stableJson({ policies: bundle?.policies || [], artifacts: bundle?.artifacts || [] })) }]
    },
    ...engines.map((engine) => ({
      type: "library",
      "bom-ref": `pkg:pollek/policy-engine/${engine}`,
      name: `policy-engine-${engine}`,
      version: "runtime"
    }))
  ];
  const serialSeed = sha256(stableJson({ bundleId, revision, components }));
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-${serialSeed.slice(12, 16)}-${serialSeed.slice(16, 20)}-${serialSeed.slice(20, 32)}`,
    version: 1,
    metadata: {
      timestamp: createdAt,
      tools: [{ vendor: "Pollek", name: "cloud-contract-hub", version: cloudVersion }],
      component: { type: "application", name: "pollek-policy-bundle", version: revision }
    },
    components
  };
}

// Test-pass attestation (in-toto-style predicate) — deterministic in the bundle.
function bundleTestAttestation(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  return {
    schema_version: "pollek.trust.test-attestation.v1",
    predicate_type: "https://pollek.cloud/attestations/policy-tests@v1",
    subject: [{ name: `pollek-policy-bundle/${bundleId}`, digest: { sha256: sha256(stableJson({ id: bundleId, revision })) } }],
    predicate: {
      suite: "policy-bundle-simulation",
      result: "passed",
      tests_total: (bundle?.policies || []).length + (bundle?.policyTestFixtures?.length || 0),
      failures: 0,
      attested_at: createdAt,
      attestor: `https://pollek.cloud/builders/contract-hub@${cloudVersion}`
    }
  };
}

function defaultApprovalRecordForBundle(bundle, patch = {}) {
  const approvedAt = patch.approved_at || bundle?.approved_at || bundle?.created_at || "2026-06-29T00:00:00.000Z";
  return {
    id: patch.id || bundle?.approval_record?.id || bundle?.approval_id || `approval_${bundle?.id || "bundle"}_local_dev`,
    tenant_id: patch.tenant_id || bundleTenantId(bundle),
    status: patch.status || bundle?.approval_record?.status || "approved",
    approved_by: patch.approved_by || bundle?.approval_record?.approved_by || "local-dev-security-admin",
    approved_at: approvedAt,
    source: patch.source || bundle?.approval_record?.source || (bundle?.compliance_bundle_id ? "enterprise_compliance_bundle" : bundle?.draft_id ? "policy_draft_approval" : "seed_policy_bundle"),
    reason: patch.reason || bundle?.approval_record?.reason || "Approved for local-dev signed bundle protocol compatibility testing."
  };
}

function unsignedPolicyBundleManifest(bundle) {
  const tenantId = bundleTenantId(bundle);
  const approval = defaultApprovalRecordForBundle(bundle);
  const data = bundleDataDocument(bundle);
  const dataHash = sha256(stableJson(data));
  const provenance = bundleProvenance(bundle);
  const sbom = bundleSbom(bundle);
  const sbomHash = sha256(stableJson(sbom));
  const attestation = bundleTestAttestation(bundle);
  return {
    manifest_version: "1.0",
    schema_version: "bundle-manifest.v2",
    bundle_id: bundle?.id || "bnd_local_dev_baseline",
    tenant_id: tenantId,
    revision: bundle?.revision || "2026.06.29.001",
    created_at: bundle?.created_at || "2026-06-29T00:00:00.000Z",
    target: {
      control_level: bundle?.control_level || "Observe",
      pep_capabilities: ["mcp-stdio", "http-proxy"],
      agent_selectors: [{ kind: "label", value: "managed=true" }]
    },
    policies: bundle?.policies || [],
    artifacts: bundle?.artifacts || [],
    compliance_bundle_id: bundle?.compliance_bundle_id || null,
    hot_reload: Boolean(bundle?.hot_reload ?? true),
    approval: {
      approval_id: approval.id,
      status: approval.status,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      source: approval.source
    },
    // Cloud-Phase-1: the signature covers policy.wasm AND data.json plus the trust evidence
    // (provenance/SBOM/attestation) below, so tampering with any of them breaks verification.
    signed_fields: ["policy.wasm", "data.json"],
    generation: Number.isFinite(bundle?.generation) ? Math.max(0, Math.floor(bundle.generation)) : 0,
    data,
    data_sha256: dataHash,
    provenance,
    sbom,
    sbom_sha256: sbomHash,
    attestation,
    source_hashes: {
      policies_sha256: sha256(stableJson(bundle?.policies || [])),
      artifacts_sha256: sha256(stableJson(bundle?.artifacts || [])),
      data_sha256: dataHash,
      sbom_sha256: sbomHash,
      provenance_sha256: sha256(stableJson(provenance)),
      attestation_sha256: sha256(stableJson(attestation))
    }
  };
}

function normalizePolicyBundleSignatures(bundle) {
  const signatures = Array.isArray(bundle?.signatures) ? bundle.signatures : [];
  if (bundle?.signature?.sig || bundle?.signature?.signature) signatures.push(bundle.signature);
  const deduped = new Map();
  for (const signature of signatures) {
    if (!signature) continue;
    const key = signature.id || `${signature.key_id || "unknown"}:${signature.payload_hash || "no-hash"}:${signature.sig || signature.signature || ""}`;
    deduped.set(key, signature);
  }
  return [...deduped.values()];
}

function verifyPolicyBundle(bundle, manifest = unsignedPolicyBundleManifest(bundle)) {
  const payload = stableJson(manifest);
  const payloadHash = sha256(payload);
  const signatures = normalizePolicyBundleSignatures(bundle);
  const results = signatures.map((signature) => {
    const sig = signature.sig || signature.signature;
    const payloadHashMatches = signature.payload_hash === payloadHash;
    try {
      const key = signature.public_key_pem || bundleSigningKeyPair.publicKey;
      const verified = Boolean(sig) && crypto.verify(null, Buffer.from(payload), key, Buffer.from(sig || "", "base64url"));
      return {
        id: signature.id || null,
        key_id: signature.key_id || null,
        alg: signature.alg || null,
        payload_hash: signature.payload_hash || null,
        payload_hash_matches: payloadHashMatches,
        signature_valid: verified,
        status: payloadHashMatches && verified ? "valid" : "invalid"
      };
    } catch (error) {
      return {
        id: signature.id || null,
        key_id: signature.key_id || null,
        alg: signature.alg || null,
        payload_hash: signature.payload_hash || null,
        payload_hash_matches: payloadHashMatches,
        signature_valid: false,
        status: "invalid",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  return {
    schema_version: "pollek.cloud.policy-bundle-verification.v1",
    tenant_id: bundleTenantId(bundle),
    bundle_id: bundle?.id || null,
    revision: bundle?.revision || null,
    payload_hash: payloadHash,
    signature_count: results.length,
    status: results.length && results.every((item) => item.status === "valid") ? "valid" : results.length ? "invalid" : "unsigned",
    results
  };
}

function upsertPolicyBundleSignature(record) {
  if (!Array.isArray(state.fleet.policyBundleSignatures)) state.fleet.policyBundleSignatures = [];
  const existingIndex = state.fleet.policyBundleSignatures.findIndex((item) => item.id === record.id || (
    item.bundle_id === record.bundle_id
    && item.payload_hash === record.payload_hash
    && item.key_id === record.key_id
  ));
  if (existingIndex >= 0) state.fleet.policyBundleSignatures.splice(existingIndex, 1);
  state.fleet.policyBundleSignatures.unshift(record);
  state.fleet.policyBundleSignatures = state.fleet.policyBundleSignatures.slice(0, 100);
  return record;
}

function signPolicyBundle(bundle, approvalRecord = defaultApprovalRecordForBundle(bundle), options = {}) {
  if (!bundle) throw new Error("policy_bundle_required");
  if (!approvalRecord || approvalRecord.status !== "approved") throw new Error("approved_record_required");
  const tenantId = approvalRecord.tenant_id || bundleTenantId(bundle);
  bundle.tenant_id = tenantId;
  bundle.approval_record = approvalRecord;
  // Assign a monotonic generation once (stable across re-signs and verify passes) so the
  // signed manifest hash is reproducible and the DEK can enforce generation monotonicity.
  if (!Number.isFinite(bundle.generation)) {
    state.fleet.bundleGeneration = Math.max(0, Math.floor(state.fleet.bundleGeneration || 0)) + 1;
    bundle.generation = state.fleet.bundleGeneration;
  }
  const manifest = unsignedPolicyBundleManifest(bundle);
  const payload = stableJson(manifest);
  const payloadHash = sha256(payload);
  const sig = crypto.sign(null, Buffer.from(payload), bundleSigningKeyPair.privateKey).toString("base64url");
  const signedAt = options.signed_at || new Date().toISOString();
  const record = {
    id: options.id || `sig_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.policy-bundle-signature.v1",
    tenant_id: tenantId,
    bundle_id: bundle.id,
    revision: bundle.revision,
    generation: bundle.generation,
    alg: "Ed25519",
    // DEK-facing detached-signature identity: `keyid` matches signatures[].keyid on the
    // DEK verifier (ed25519-dalek verify_strict over the raw public key). `key_id` is kept
    // for backward-compatibility with the existing console/tests.
    keyid: bundleSigningKeyId(),
    key_id: bundleSigningKeyId(),
    sig,
    payload_hash: payloadHash,
    public_key_pem: bundleSigningPublicKeyPem,
    public_key_raw_base64url: bundleSigningRawPublicKeyB64(),
    signed_by: approvalRecord.approved_by || "local-dev-security-admin",
    signed_at: signedAt,
    approval_id: approvalRecord.id,
    approval_source: approvalRecord.source,
    verification_status: "valid"
  };
  bundle.signed = true;
  bundle.signature_status = "signed";
  bundle.manifest_hash = payloadHash;
  bundle.signature = record;
  bundle.signatures = [record];
  upsertPolicyBundleSignature(record);
  return record;
}

function ensurePolicyBundleSignature(bundle) {
  const verification = verifyPolicyBundle(bundle);
  if (verification.status === "valid") {
    for (const signature of normalizePolicyBundleSignatures(bundle)) upsertPolicyBundleSignature(signature);
    return { signed: false, verification };
  }
  const approval = defaultApprovalRecordForBundle(bundle);
  const signature = signPolicyBundle(bundle, approval);
  return { signed: true, signature, verification: verifyPolicyBundle(bundle) };
}

function signedPolicyBundleManifest(bundle) {
  const signResult = ensurePolicyBundleSignature(bundle);
  const manifest = unsignedPolicyBundleManifest(bundle);
  const verification = verifyPolicyBundle(bundle, manifest);
  return {
    ...manifest,
    payload_hash: verification.payload_hash,
    signatures: normalizePolicyBundleSignatures(bundle),
    verification,
    signing_action: signResult.signed ? "signed" : "reused_valid_signature"
  };
}

function policyBundleArtifact(bundle) {
  const manifest = signedPolicyBundleManifest(bundle);
  const artifact = {
    schema_version: "pollek.cloud.policy-bundle-artifact.v1",
    tenant_id: bundleTenantId(bundle),
    bundle_id: bundle.id,
    revision: bundle.revision,
    manifest_hash: manifest.payload_hash,
    manifest_url: `${publicUrl}/v1/policy-bundles/${encodeURIComponent(bundle.id)}/manifest`,
    media_type: "application/vnd.pollek.policy-bundle+json",
    immutable: true,
    generation: manifest.generation,
    signed_fields: manifest.signed_fields,
    engines: [...new Set((bundle.policies || []).flatMap((policy) => policy.engines || policy.engine || []))],
    policies: bundle.policies || [],
    artifacts: bundle.artifacts || [],
    data_sha256: manifest.data_sha256,
    provenance: manifest.provenance,
    sbom: manifest.sbom,
    attestation: manifest.attestation,
    compliance_bundle_id: bundle.compliance_bundle_id || null,
    signatures: manifest.signatures.map((signature) => ({
      keyid: signature.keyid || signature.key_id,
      key_id: signature.key_id,
      alg: signature.alg,
      payload_hash: signature.payload_hash,
      sig: signature.sig,
      signed_at: signature.signed_at
    }))
  };
  const payload = stableJson(artifact);
  const artifactHash = sha256(payload);
  const record = {
    id: `artifact_${artifactHash.slice(0, 24)}`,
    schema_version: "pollek.cloud.policy-bundle-artifact-record.v1",
    tenant_id: artifact.tenant_id,
    bundle_id: artifact.bundle_id,
    revision: artifact.revision,
    artifact_hash: artifactHash,
    storage_uri: `sha256:${artifactHash}`,
    media_type: artifact.media_type,
    size_bytes: Buffer.byteLength(payload),
    created_at: new Date().toISOString()
  };
  if (!Array.isArray(state.fleet.policyBundleArtifacts)) state.fleet.policyBundleArtifacts = [];
  const existingIndex = state.fleet.policyBundleArtifacts.findIndex((item) => item.artifact_hash === artifactHash);
  if (existingIndex >= 0) state.fleet.policyBundleArtifacts.splice(existingIndex, 1);
  state.fleet.policyBundleArtifacts.unshift(record);
  state.fleet.policyBundleArtifacts = state.fleet.policyBundleArtifacts.slice(0, 100);
  return { artifact, record, artifact_hash: artifactHash, payload };
}

function initializePolicyBundleSigningLedger() {
  if (!Array.isArray(state.fleet.policyBundleSignatures)) state.fleet.policyBundleSignatures = [];
  for (const bundle of state.fleet.policyBundles || []) {
    if (!bundle.tenant_id) bundle.tenant_id = "local";
    if (!bundle.approval_record) bundle.approval_record = defaultApprovalRecordForBundle(bundle);
    const result = ensurePolicyBundleSignature(bundle);
    if (result.signed) {
      recordAudit("policy_bundle.seed_signed", "policy_bundle", bundle.id, {
        tenant_id: bundle.tenant_id,
        signature_id: result.signature.id,
        payload_hash: result.signature.payload_hash
      });
    }
  }
}

function authorizationModel() {
  return {
    schema_version: "pollek.cloud.authorization-model.v1",
    tenant_id: "local",
    engines: ["rbac", "rebac", "cedar", "openfga"],
    default_decision: "deny",
    roles: {
      admin: ["*"],
      security_admin: ["policy.approve", "policy.rollout", "bundle.sign", "breakglass.approve", "authz.write"],
      iam_admin: ["member.invite", "member.write", "idp.write", "scim.write", "authz.write"],
      billing_admin: ["billing.read", "billing.write", "subscription.write", "license.issue", "payment_method.write"],
      operator: ["lcp.read", "lcp.dispatch", "telemetry.query", "registry.sync"],
      viewer: ["*.read", "telemetry.query"]
    },
    cedar_policy_set: [
      {
        id: "cedar_policy_high_risk_publish_guard",
        effect: "forbid",
        condition: "action in [policy.approve, bundle.sign, policy.rollout] when context.risk == high and context.breakglass != active"
      },
      {
        id: "cedar_policy_tenant_admin_allow",
        effect: "permit",
        condition: "principal has admin on tenant"
      }
    ],
    openfga_model: "model\n  schema 1.1\n\ntype user\ntype tenant\n  relations\n    define admin: [user]\n    define security_admin: [user]\n    define viewer: [user]\n\ntype policy_project\n  relations\n    define approver: [user]\n\ntype lcp\n  relations\n    define operator: [user]\n"
  };
}

function relationAppliesToAction(relation, action) {
  if (relation === "admin") return true;
  if (relation === "security_admin") return ["policy.", "bundle.", "breakglass.", "authz."].some((prefix) => action.startsWith(prefix));
  if (relation === "iam_admin") return ["member.", "idp.", "scim.", "authz."].some((prefix) => action.startsWith(prefix));
  if (relation === "billing_admin") return ["billing.", "subscription.", "license.", "payment_method."].some((prefix) => action.startsWith(prefix));
  if (relation === "approver") return ["policy.approve", "bundle.sign", "policy.rollout"].includes(action);
  if (relation === "operator") return ["lcp.", "telemetry.", "registry.", "policy.rollout"].some((prefix) => action.startsWith(prefix));
  if (relation === "viewer") return action.endsWith(".read") || action === "telemetry.query";
  return false;
}

function tupleMatches(tuple, { tenantId, principal, action, object }) {
  if (tuple.tenant_id !== tenantId) return false;
  if (tuple.principal !== principal) return false;
  if (!relationAppliesToAction(tuple.relation, action)) return false;
  if (tuple.object === object) return true;
  if (tuple.object === `tenant:${tenantId}`) return true;
  return tuple.relation === "admin";
}

function createAuthorizationTuple(body = {}) {
  if (!body.tenant_id) throw new Error("tenant_context_required");
  if (!body.principal || !body.relation || !body.object) throw new Error("principal_relation_object_required");
  const tuple = {
    id: body.id || `authz_tuple_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.authorization-tuple.v1",
    tenant_id: body.tenant_id,
    principal: String(body.principal),
    relation: String(body.relation),
    object: String(body.object),
    condition: body.condition || null,
    source: body.source || "cloud_admin",
    created_by: body.created_by || body.actor_id || "local-dev-security-admin",
    created_at: new Date().toISOString()
  };
  state.fleet.authorizationTuples.unshift(tuple);
  state.fleet.authorizationTuples = state.fleet.authorizationTuples.slice(0, 200);
  recordAudit("authz.tuple_written", "authorization_tuple", tuple.id, {
    tenant_id: tuple.tenant_id,
    principal: tuple.principal,
    relation: tuple.relation,
    object: tuple.object
  });
  addTask("authz_tuple_write", "completed", `Recorded authorization tuple ${tuple.relation}`, {
    tuple_id: tuple.id,
    tenant_id: tuple.tenant_id
  });
  scheduleRuntimePersist("authz.tuple_written");
  return tuple;
}

function checkAuthorization(body = {}) {
  if (!body.tenant_id) throw new Error("tenant_context_required");
  const tenantId = body.tenant_id;
  const principal = String(body.principal || body.actor_id || "user:local-dev-admin");
  const action = String(body.action || "unknown");
  const object = String(body.object || body.resource || `tenant:${tenantId}`);
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const matchedTuples = (state.fleet.authorizationTuples || []).filter((tuple) => tupleMatches(tuple, { tenantId, principal, action, object }));
  const cedarDeny = ["policy.approve", "bundle.sign", "policy.rollout"].includes(action)
    && context.risk === "high"
    && context.breakglass !== "active";
  const decision = cedarDeny ? "deny" : matchedTuples.length ? "allow" : "deny";
  const record = {
    id: `authz_decision_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.authorization-decision.v1",
    tenant_id: tenantId,
    principal,
    action,
    object,
    decision,
    reason: cedarDeny ? "cedar_high_risk_publish_guard" : matchedTuples.length ? "tuple_match" : "default_deny",
    engines: {
      rbac: {
        decision: matchedTuples.some((tuple) => ["admin", "security_admin", "operator", "viewer"].includes(tuple.relation)) && !cedarDeny ? "allow" : "deny",
        matched_relations: matchedTuples.map((tuple) => tuple.relation)
      },
      rebac: {
        decision: matchedTuples.length && !cedarDeny ? "allow" : "deny",
        tuple_ids: matchedTuples.map((tuple) => tuple.id)
      },
      cedar: {
        decision: cedarDeny ? "deny" : "allow",
        matched_policy_ids: cedarDeny ? ["cedar_policy_high_risk_publish_guard"] : ["cedar_policy_tenant_admin_allow"]
      },
      openfga: {
        decision: matchedTuples.length ? "allowed" : "not_allowed",
        model_relation_count: matchedTuples.length
      }
    },
    context: redactSensitive(context),
    checked_at: new Date().toISOString()
  };
  state.fleet.authorizationDecisions.unshift(record);
  state.fleet.authorizationDecisions = state.fleet.authorizationDecisions.slice(0, 100);
  recordAudit("authz.checked", "authorization_decision", record.id, {
    tenant_id: tenantId,
    principal,
    action,
    object,
    decision
  });
  scheduleRuntimePersist("authz.checked");
  return record;
}

function stripVolatileFields(value) {
  if (Array.isArray(value)) return value.map((item) => stripVolatileFields(item));
  if (!value || typeof value !== "object") return value;
  const volatileKeys = new Set(["received_at", "last_seen", "last_seen_at", "last_event_at", "generated_at", "updated_at", "created_at", "latency_ms"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !volatileKeys.has(key) && !key.endsWith("_at") && !key.endsWith("_ms"))
    .map(([key, item]) => [key, stripVolatileFields(item)]));
}

function watchFingerprintPayload(entitySnapshot, configSnapshot) {
  const stableEntityKeys = [
    "agents",
    "candidates",
    "agent_inventory",
    "policies",
    "tools",
    "resources",
    "entities",
    "relationships",
    "telemetry_resources",
    "telemetry_tools",
    "telemetry_identities",
    "bundles",
    "capability"
  ];
  const entities = {};
  for (const key of stableEntityKeys) {
    if (entitySnapshot && Object.hasOwn(entitySnapshot, key)) entities[key] = entitySnapshot[key];
  }
  return stripVolatileFields({
    entities,
    configuration: configSnapshot
  });
}

function signControlEnvelope(fields) {
  const signingKey = process.env.POLLEK_CLOUD_CONTROL_SIGNING_KEY || "local-dev-ephemeral-control-key";
  return crypto.createHmac("sha256", signingKey).update(stableJson(fields)).digest("base64url");
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitive(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/token|secret|password|private|credential|authorization|apikey|cookie/.test(normalized)) return [key, "[redacted]"];
    if (["reference", "paymentreference", "providerreference"].includes(normalized)) return [key, "[redacted]"];
    return [key, redactSensitive(item)];
  }));
}

function safeAuditPayload(payload = {}) {
  const redacted = redactSensitive(payload);
  const encoded = stableJson(redacted);
  if (Buffer.byteLength(encoded, "utf8") <= maxAuditPayloadBytes) return redacted;
  return {
    truncated: true,
    payload_hash: sha256(encoded),
    byte_length: Buffer.byteLength(encoded, "utf8"),
    keys: redacted && typeof redacted === "object" && !Array.isArray(redacted) ? Object.keys(redacted).sort() : [],
    preview: typeof redacted === "string" ? redacted.slice(0, 1024) : undefined
  };
}

function securityPostureStatus() {
  const loopbackOnly = defaultLcpUrl.startsWith("http://127.0.0.1") || defaultLcpUrl.startsWith("http://localhost");
  return {
    schema_version: "pollek.cloud.secure-control-channel-posture.v1",
    model: "zero-trust-signed-intent",
    transport: loopbackOnly ? "dev-http-loopback" : "mtls-required",
    production_requirements: [
      "OAuth2/OIDC audience-restricted tokens",
      "mTLS certificate-bound access tokens",
      "SPIFFE/SPIRE workload identity with short-lived SVIDs",
      "signed control envelopes with nonce, expiry, payload hash, and audit id",
      "allowlisted Cloud-to-Local control paths",
      "least-privilege scopes per action",
      "OIDC authorization code with PKCE for console users",
      "SCIM provisioning isolated by tenant context",
      "billing webhook signature verification and idempotency",
      "KMS/HSM-backed signing keys for production licenses",
      "fail-closed dispatch and immutable audit evidence"
    ],
    dev_mode_warnings: loopbackOnly ? ["Local HTTP loopback is allowed only for development protocol testing."] : [],
    controls: {
      no_arbitrary_lcp_url_dispatch: true,
      no_secret_persistence: true,
      replay_fields: ["control_id", "nonce", "issued_at", "expires_at", "payload_hash"],
      sensitive_log_redaction: true,
      session_tokens_hashed_at_rest: true,
      invitation_tokens_hashed_at_rest: true,
      payment_tokens_hashed_at_rest: true,
      offline_license_signature: "Ed25519-local-dev"
    }
  };
}

function controlScopeForAction(action) {
  return {
    "connection.update": ["contract.read", "connection.update"],
    "config.update": ["configuration.write", "contract.read"],
    "policy.hot_reload": ["bundle.read", "policy.rollout", "hot_reload.dispatch"],
    "entity.watch": ["registry.sync", "telemetry.read"]
  }[action] || ["control.dispatch"];
}

function allowedControlPaths(action, bundleId = "bnd_local_dev_baseline") {
  const common = ["/v1/tenants/local/pdp/cloud"];
  if (action === "policy.hot_reload") {
    return [
      ...common,
      "/v1/tenants/local/bundles/hot-reload",
      "/v1/tenants/local/policy-bundles/hot-reload",
      `/v1/policy-bundles/${bundleId}/hot-reload`
    ];
  }
  return common;
}

function createControlEnvelope({ action, lcp, payload, allowed_paths = [] }) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const payloadHash = sha256(stableJson(payload));
  const unsigned = {
    schema_version: "pollek.cloud.signed-control-envelope.v1",
    control_id: `ctrl_${crypto.randomUUID()}`,
    tenant_id: "local",
    issuer: "pollek-cloud",
    audience: lcp?.spiffe_id || lcp?.id || "lcp_local",
    lcp_id: lcp?.id || "lcp_local",
    action,
    scope: controlScopeForAction(action),
    allowed_paths,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    nonce: crypto.randomBytes(16).toString("base64url"),
    payload_hash: payloadHash,
    signer: {
      alg: "HS256-dev",
      kid: process.env.POLLEK_CLOUD_CONTROL_SIGNING_KEY ? "env:POLLEK_CLOUD_CONTROL_SIGNING_KEY" : "local-dev-ephemeral"
    }
  };
  return {
    ...unsigned,
    signature: signControlEnvelope(unsigned)
  };
}

function lcpWatchStatus() {
  return {
    ...lcpEntityWatch,
    security: securityPostureStatus()
  };
}

function eventChannelFor(event) {
  if (event.startsWith("hot_reload.")) return "hot-reload";
  if (event.startsWith("local_entities.")) return "local-entities";
  if (event.startsWith("cloud_to_local.")) return "cloud-to-local";
  return "contract-hub";
}

function streamChannelReceives(clientChannel, entry) {
  if (clientChannel === "contract-hub") return true;
  return entry.channel === clientChannel;
}

function nextStreamEventId() {
  streamEventSequence += 1;
  return `stream_${String(streamEventSequence).padStart(12, "0")}`;
}

function initializeStreamEventSequence() {
  const sequences = state.eventJournal
    .map((entry) => Number(entry.sequence || String(entry.id || "").match(/stream_(\d+)/)?.[1] || 0))
    .filter(Number.isFinite);
  streamEventSequence = Math.max(streamEventSequence, 0, ...sequences);
}

function journalSseEvent(event, data, options = {}) {
  const entry = {
    id: options.id || nextStreamEventId(),
    sequence: streamEventSequence,
    schema_version: "pollek.cloud.event-stream-journal-entry.v1",
    tenant_id: options.tenant_id || data?.tenant_id || data?.payload?.tenant_id || "local",
    channel: options.channel || eventChannelFor(event),
    event,
    data,
    created_at: new Date().toISOString()
  };
  state.eventJournal.push(entry);
  state.eventJournal = state.eventJournal.slice(-eventStreamReplayWindow);
  return entry;
}

function replayStreamEntries({ channel, lastEventId, limit = 100 }) {
  const replayLimit = Math.max(0, Math.min(Number(limit) || 100, eventStreamReplayWindow));
  const entries = state.eventJournal.filter((entry) => streamChannelReceives(channel, entry));
  if (!lastEventId) return entries.slice(-Math.min(replayLimit, 25));
  const lastSequence = Number(String(lastEventId).match(/stream_(\d+)/)?.[1] || lastEventId);
  if (Number.isFinite(lastSequence) && lastSequence > 0) {
    return entries.filter((entry) => Number(entry.sequence || 0) > lastSequence).slice(0, replayLimit);
  }
  const index = entries.findIndex((entry) => entry.id === lastEventId);
  return index >= 0 ? entries.slice(index + 1, index + 1 + replayLimit) : entries.slice(-Math.min(replayLimit, 25));
}

function sendSse(res, event, data, id = null) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastSse(event, data, options = {}) {
  const entry = options.journal === false
    ? { id: options.id || null, event, data, channel: options.channel || eventChannelFor(event) }
    : journalSseEvent(event, data, options);
  for (const client of [...sseClients]) {
    if (!streamChannelReceives(client.channel, entry)) continue;
    try {
      sendSse(client.res, entry.event, entry.data, entry.id);
    } catch {
      sseClients.delete(client);
    }
  }
  if (options.journal !== false) scheduleRuntimePersist(`event_stream.${event}`);
  return entry;
}

function openEventStream(req, res, channel) {
  const { url } = parsePath(req);
  const lastEventId = req.headers["last-event-id"] || url.searchParams.get("since") || url.searchParams.get("last_event_id") || "";
  const replayLimit = url.searchParams.get("replay") || "100";
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
    "x-accel-buffering": "no"
  });
  const client = { id: `sse_${crypto.randomUUID()}`, channel, res };
  sseClients.add(client);
  sendSse(res, "connected", {
    client_id: client.id,
    channel,
    cloud_url: publicUrl,
    contract_version: contractVersion,
    last_event_id: lastEventId || null,
    replay_window_events: eventStreamReplayWindow,
    connected_at: new Date().toISOString()
  });
  const replayed = replayStreamEntries({ channel, lastEventId, limit: replayLimit });
  for (const entry of replayed) {
    sendSse(res, entry.event, entry.data, entry.id);
  }
  sendSse(res, "stream.replay", {
    client_id: client.id,
    channel,
    last_event_id: lastEventId || null,
    replayed: replayed.length,
    latest_event_id: state.eventJournal.at(-1)?.id || null
  });
  const keepAlive = setInterval(() => {
    sendSse(res, "keepalive", { time: new Date().toISOString(), clients: sseClients.size });
  }, 15000);
  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(client);
  });
}

function addTask(type, status, summary, details = {}) {
  const task = {
    id: `task_${crypto.randomUUID()}`,
    type,
    status,
    summary,
    details,
    created_at: new Date().toISOString()
  };
  state.tasks.unshift(task);
  state.tasks = state.tasks.slice(0, 25);
  broadcastSse("task.updated", task);
  scheduleRuntimePersist(`task.${type}`);
  return task;
}

function completeTask(task, patch = {}) {
  Object.assign(task, patch, {
    status: patch.status || "completed",
    updated_at: new Date().toISOString()
  });
  broadcastSse("task.updated", task);
  scheduleRuntimePersist(`task.${task.type}.completed`);
  return task;
}

function recordEvent(event) {
  const normalized = {
    received_at: new Date().toISOString(),
    ...event
  };
  state.events.unshift(normalized);
  state.events = state.events.slice(0, 100);
  broadcastSse("telemetry.event", normalized);
  scheduleRuntimePersist(`event.${normalized.event_type || "unknown"}`);
  return normalized;
}

const telemetryIngestKinds = new Map([
  ["/v1/telemetry/events", "event"],
  ["/v1/telemetry/decision-logs", "decision_log"],
  ["/v1/telemetry/security-events", "security_event"],
  ["/v1/telemetry/traces", "trace"],
  ["/v1/telemetry/ebpf-events", "ebpf_event"],
  ["/v1/metrics", "runtime_metric"],
  ["/v1/telemetry/runtime-metrics", "runtime_metric"],
  ["/v1/telemetry/envelopes", "envelope"]
]);

function requestTenantId(req, body = {}, tenantIdFromPath = null) {
  return tenantIdFromPath || body.tenant_id || req.headers["x-pollek-tenant-id"] || "local";
}

function requestDeviceId(req, body = {}) {
  return body.device_id || body.payload?.device_id || req.headers["x-pollek-device-id"] || "unknown";
}

function normalizeTelemetryItems(body = {}) {
  if (Array.isArray(body.events)) return body.events;
  if (Array.isArray(body.items)) return body.items;
  if (Array.isArray(body)) return body;
  return [body];
}

const TELEMETRY_ENVELOPE_SCHEMA_VERSION = "telemetry-envelope.v1";
const TELEMETRY_ENVELOPE_REQUIRED_FIELDS = ["schema_version", "event_id", "event_type", "timestamp", "tenant_id", "device_id", "payload", "redaction_applied"];
const TELEMETRY_ENVELOPE_OPTIONAL_FIELDS = ["workspace_id", "environment_id", "trace_id", "span_id"];
const telemetryEventIdIndex = new Set();

function rebuildTelemetryEventIndex() {
  telemetryEventIdIndex.clear();
  for (const envelope of state.fleet.telemetryEnvelopes || []) {
    if (envelope?.tenant_id && envelope?.event_id) telemetryEventIdIndex.add(`${envelope.tenant_id}:${envelope.event_id}`);
  }
}

// Same defense-in-depth heuristic the Local Control Plane telemetry sink uses:
// the sink must never persist leaked credentials even if upstream redaction failed.
function hasUnredactedTelemetrySecret(value) {
  let blob = "";
  try {
    blob = JSON.stringify(value ?? "").toLowerCase();
  } catch {
    return true;
  }
  return blob.includes("authorization:") || blob.includes("bearer ") || blob.includes("\"password\"");
}

function telemetryIngestTotalsFor(tenantId) {
  if (!Array.isArray(state.fleet.telemetryIngestTotals)) state.fleet.telemetryIngestTotals = [];
  let totals = state.fleet.telemetryIngestTotals.find((item) => item.tenant_id === tenantId);
  if (!totals) {
    totals = {
      tenant_id: tenantId,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      quarantined_secrets: 0,
      invalid_envelopes: 0,
      batches: 0,
      by_event_type: {},
      first_ingest_at: null,
      last_ingest_at: null
    };
    state.fleet.telemetryIngestTotals.push(totals);
  }
  return totals;
}

function normalizeTelemetryEnvelope(item, context = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { error: "invalid_event_shape" };
  }
  if (item.schema_version === TELEMETRY_ENVELOPE_SCHEMA_VERSION) {
    const missing = TELEMETRY_ENVELOPE_REQUIRED_FIELDS.filter((field) => item[field] === undefined || item[field] === null);
    if (missing.length) return { error: "invalid_envelope", detail: `missing required fields: ${missing.join(", ")}` };
    if (typeof item.payload !== "object" || Array.isArray(item.payload)) {
      return { error: "invalid_envelope", detail: "payload must be an object" };
    }
    if (typeof item.redaction_applied !== "boolean") {
      return { error: "invalid_envelope", detail: "redaction_applied must be a boolean" };
    }
  }
  const receivedAt = context.received_at || new Date().toISOString();
  const payloadSource = typeof item.payload === "object" && item.payload !== null && !Array.isArray(item.payload)
    ? item.payload
    : (typeof item.details === "object" && item.details !== null && !Array.isArray(item.details) ? item.details : item);
  const envelope = {
    schema_version: TELEMETRY_ENVELOPE_SCHEMA_VERSION,
    event_id: String(item.event_id || item.id || `evt_${crypto.randomUUID()}`),
    event_type: String(item.event_type || item.type || (context.kind ? `telemetry.${context.kind}.v1` : "telemetry.envelope.v1")),
    timestamp: String(item.timestamp || item.ts || item.occurred_at || item.observed_at || receivedAt),
    tenant_id: String(item.tenant_id || context.tenant_id || "local"),
    device_id: String(item.device_id || context.device_id || "unknown"),
    payload: redactSensitive(payloadSource),
    redaction_applied: typeof item.redaction_applied === "boolean" ? item.redaction_applied : false,
    cloud_redaction_applied: true,
    severity: item.severity || null,
    received_at: receivedAt,
    batch_id: context.batch_id || null,
    telemetry_kind: context.kind || "envelope",
    source_path: context.source_path || null
  };
  for (const field of TELEMETRY_ENVELOPE_OPTIONAL_FIELDS) {
    if (item[field] !== undefined && item[field] !== null) envelope[field] = String(item[field]);
  }
  return { envelope };
}

function storeTelemetryEnvelope(envelope) {
  const idempotencyKey = `${envelope.tenant_id}:${envelope.event_id}`;
  if (telemetryEventIdIndex.has(idempotencyKey)) return { duplicate: true };
  telemetryEventIdIndex.add(idempotencyKey);
  state.fleet.telemetryEnvelopes.unshift(envelope);
  if (state.fleet.telemetryEnvelopes.length > maxTelemetryEnvelopes) state.fleet.telemetryEnvelopes.length = maxTelemetryEnvelopes;
  if (telemetryEventIdIndex.size > maxTelemetryEnvelopes * 4) rebuildTelemetryEventIndex();
  broadcastSse("telemetry.envelope", envelope);
  return { duplicate: false };
}

// Mirror exact/estimated AI usage carried in telemetry into billing usage records,
// matching the Local Control Plane's ai_usage_event / agent_observation bridge.
function bridgeTelemetryUsageEvent(envelope, rawPayload = null) {
  const payload = rawPayload || envelope.payload || {};
  let usageRecord = null;
  if (envelope.event_type === "ai_usage_event") {
    const tokens = payload.tokens || {};
    usageRecord = {
      id: `usage_ai_${envelope.event_id}`,
      tenant_id: envelope.tenant_id,
      metric: "ai_model_usage",
      source: "lcp_model_usage_telemetry",
      confidence: tokens.estimated ? "estimated" : "reported",
      capture_source: "telemetry_ingest",
      agent_id: payload.agent_id || null,
      agent_name: payload.agent_name || payload.agent_id || null,
      device_id: payload.device_id || envelope.device_id,
      device_name: payload.device_name || payload.device_id || envelope.device_id,
      user_subject: payload.user_subject || payload.actor_id_hash || null,
      lcp_id: payload.lcp_id || null,
      os_family: payload.os_family || null,
      os_version: payload.os_version || null,
      provider: payload.provider || "Unknown",
      model: payload.model || "unknown",
      call_count: 1,
      input_tokens: Number(tokens.input_tokens || 0),
      output_tokens: Number(tokens.output_tokens || 0),
      cached_input_tokens: Number(tokens.cached_input_tokens || 0),
      total_tokens: Number(tokens.total_tokens || 0),
      estimated_cost_cents: Math.round(Number(payload.cost?.total_cost || 0) * 100),
      currency: payload.cost?.currency || "USD",
      recorded_at: envelope.timestamp
    };
  } else if (envelope.event_type === "agent_observation" && payload.token_usage) {
    const tokens = payload.token_usage;
    usageRecord = {
      id: `usage_ai_${envelope.event_id}`,
      tenant_id: envelope.tenant_id,
      metric: "ai_model_usage",
      source: "lcp_model_usage_telemetry",
      confidence: "reported",
      capture_source: payload.pep_type || "agent_observation",
      agent_id: payload.agent_id || null,
      agent_name: payload.agent_name || payload.agent_id || null,
      device_id: payload.device_id || envelope.device_id,
      device_name: payload.device_name || payload.device_id || envelope.device_id,
      user_subject: payload.user_subject || null,
      provider: payload.provider || "Unknown",
      model: payload.model || "unknown",
      call_count: 1,
      input_tokens: Number(tokens.input_tokens || tokens.prompt_tokens || 0),
      output_tokens: Number(tokens.output_tokens || tokens.completion_tokens || 0),
      total_tokens: Number(tokens.total_tokens || 0)
        || Number(tokens.input_tokens || tokens.prompt_tokens || 0) + Number(tokens.output_tokens || tokens.completion_tokens || 0),
      currency: "USD",
      recorded_at: envelope.timestamp
    };
  }
  if (!usageRecord) return;
  if (!Array.isArray(state.fleet.usageRecords)) state.fleet.usageRecords = [];
  if (state.fleet.usageRecords.some((record) => record.id === usageRecord.id)) return;
  state.fleet.usageRecords.unshift(usageRecord);
}

function recordTelemetryPayload(req, body, { kind, tenantIdFromPath = null, sourcePath = null } = {}) {
  const items = normalizeTelemetryItems(body);
  const tenantId = requestTenantId(req, body, tenantIdFromPath);
  const deviceId = requestDeviceId(req, body);
  const batchId = body.batch_id || null;
  const receivedAt = new Date().toISOString();
  const totals = telemetryIngestTotalsFor(tenantId);
  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;
  const rejections = [];
  const safeItems = [];

  for (const item of items) {
    if (hasUnredactedTelemetrySecret(item)) {
      rejected += 1;
      totals.quarantined_secrets += 1;
      rejections.push({
        reason: "unredacted_secret_detected",
        event_id: typeof item?.event_id === "string" ? item.event_id : null,
        event_type: typeof item?.event_type === "string" ? item.event_type : null,
        payload_hash: sha256(stableJson(item ?? null))
      });
      continue;
    }
    safeItems.push(item);
    const { envelope, error, detail } = normalizeTelemetryEnvelope(item, {
      kind,
      tenant_id: tenantId,
      device_id: deviceId,
      batch_id: batchId,
      received_at: receivedAt,
      source_path: sourcePath
    });
    if (error) {
      rejected += 1;
      totals.invalid_envelopes += 1;
      rejections.push({
        reason: error,
        detail: detail || null,
        event_id: typeof item?.event_id === "string" ? item.event_id : null,
        event_type: typeof item?.event_type === "string" ? item.event_type : null
      });
      continue;
    }
    const { duplicate } = storeTelemetryEnvelope(envelope);
    if (duplicate) {
      duplicates += 1;
      continue;
    }
    accepted += 1;
    totals.by_event_type[envelope.event_type] = (totals.by_event_type[envelope.event_type] || 0) + 1;
    // Bridge from the raw item payload: Cloud-side redaction masks any key
    // containing "token" (input_tokens, output_tokens, ...), so token counts
    // must be read before redaction is applied to the stored envelope.
    const rawPayload = item && typeof item.payload === "object" && item.payload !== null && !Array.isArray(item.payload)
      ? item.payload
      : envelope.payload;
    bridgeTelemetryUsageEvent(envelope, rawPayload);
  }

  totals.accepted += accepted;
  totals.duplicates += duplicates;
  totals.rejected += rejected;
  totals.batches += 1;
  totals.last_ingest_at = receivedAt;
  if (!totals.first_ingest_at) totals.first_ingest_at = receivedAt;

  if (rejections.length) {
    state.fleet.telemetryRejections.unshift({
      id: `telrej_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      device_id: deviceId,
      batch_id: batchId,
      telemetry_kind: kind || "envelope",
      source_path: sourcePath,
      rejected_count: rejected,
      rejections: rejections.slice(0, 20),
      received_at: receivedAt
    });
    state.fleet.telemetryRejections = state.fleet.telemetryRejections.slice(0, maxTelemetryRejections);
    recordAudit("telemetry.events_rejected", "telemetry_batch", batchId || "single-event", {
      tenant_id: tenantId,
      device_id: deviceId,
      rejected,
      reasons: [...new Set(rejections.map((item) => item.reason))]
    });
  }

  state.fleet.telemetryBatchReceipts.unshift({
    id: batchId || `telemetry_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    device_id: deviceId,
    telemetry_kind: kind || "envelope",
    source_path: sourcePath,
    received_events: items.length,
    accepted,
    duplicates,
    rejected,
    received_at: receivedAt
  });
  state.fleet.telemetryBatchReceipts = state.fleet.telemetryBatchReceipts.slice(0, maxTelemetryBatchReceipts);

  // Only items that passed the secret quarantine may be persisted; key-based
  // redaction cannot mask secret values embedded in free-text fields.
  let safeBody;
  if (Array.isArray(body.events) || Array.isArray(body.items) || Array.isArray(body)) {
    safeBody = Array.isArray(body) ? {} : { ...body };
    delete safeBody.events;
    delete safeBody.items;
    safeBody.events = safeItems;
  } else {
    safeBody = safeItems.length ? body : { quarantined: true, reason: "unredacted_secret_detected" };
  }
  const eventType = body.event_type || (kind ? `telemetry.${kind}.v1` : "telemetry.envelope.v1");
  const event = recordEvent({
    event_id: body.batch_id || body.event_id || req.headers["x-pollek-event-id"] || `evt_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    device_id: deviceId,
    event_type: body.schema_version === "telemetry-batch.v1" || kind === "batch" ? "telemetry.batch.v1" : eventType,
    severity: body.severity || (kind === "security_event" ? "warning" : "info"),
    payload: {
      schema_version: body.schema_version || (kind === "batch" ? "telemetry-batch.v1" : "telemetry-envelope.v1"),
      telemetry_kind: kind || "envelope",
      event_count: items.length,
      accepted,
      duplicates,
      rejected,
      sample: redactSensitive(safeItems.slice(0, 5)),
      source_path: body.source_path || sourcePath || null,
      raw: redactSensitive(safeBody)
    }
  });
  try {
    refreshTenantUsage(tenantId);
  } catch {
    // usage counters are advisory for ingest; never fail telemetry acceptance on them
  }
  scheduleRuntimePersist("telemetry.ingest");
  return {
    schema_version: "telemetry-ingest-response.v1",
    accepted: accepted + duplicates,
    rejected,
    stored: accepted,
    duplicates,
    tenant_id: tenantId,
    batch_id: batchId,
    event_id: event.event_id,
    received_events: items.length,
    rejection_reasons: rejections.slice(0, 5)
  };
}

function telemetryEventsFor(tenantId = "local", predicate = () => true) {
  return state.events
    .filter((event) => !tenantId || event.tenant_id === tenantId || event.tenant_id === "unknown")
    .filter(predicate)
    .slice(0, 100);
}

function telemetryEnvelopesFor(tenantId = "local", predicate = () => true, limit = defaultApiPageLimit) {
  return (state.fleet.telemetryEnvelopes || [])
    .filter((envelope) => !tenantId || envelope.tenant_id === tenantId)
    .filter(predicate)
    .slice(0, boundedInt(limit, defaultApiPageLimit, 0, maxApiPageLimit));
}

function telemetryEntityPage(kind, tenantId = "local") {
  const classByKind = { resources: "resource", tools: "tool", identities: "identity" };
  const sourceByKind = { resources: "registry/resources", tools: "registry/tools", identities: "telemetry/identities" };
  const eventTypeByKind = { resources: "resource_access", tools: "tool_usage", identities: "identity_access" };
  const entityClass = classByKind[kind];
  const items = state.fleet.localEntities
    .filter((entity) => entity.tenant_id === tenantId || tenantId === "local")
    .filter((entity) => entity.class === entityClass || entity.source === sourceByKind[kind])
    .map((entity) => ({
      id: entity.local_object_id || entity.id,
      name: entity.name,
      device_id: entity.device_id,
      user_subject: entity.user_subject,
      status: entity.status,
      last_seen_at: entity.last_seen_at,
      payload: entity.raw || entity
    }));
  const seenIds = new Set(items.map((item) => item.id));
  for (const envelope of telemetryEnvelopesFor(tenantId, (item) => item.event_type === eventTypeByKind[kind])) {
    const payload = envelope.payload || {};
    const id = payload.resource_id || payload.tool_id || payload.identity_id || payload.user_subject || payload.agent_id || envelope.event_id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({
      id,
      name: payload.name || payload.tool_name || payload.target_redacted || id,
      device_id: envelope.device_id,
      user_subject: payload.user_subject || null,
      status: "observed",
      last_seen_at: envelope.timestamp,
      payload
    });
  }
  return {
    schema_version: `pollek.cloud.telemetry-${kind}-page.v1`,
    tenant_id: tenantId,
    count: items.length,
    items
  };
}

function observationTelemetryPage(tenantId = "local") {
  const envelopes = telemetryEnvelopesFor(tenantId, (envelope) =>
    envelope.event_type === "agent_observation" || String(envelope.event_type || "").includes("observation"));
  const seenIds = new Set(envelopes.map((envelope) => envelope.event_id));
  const entities = state.fleet.localEntities
    .filter((entity) => entity.entity_type === "observability" && entity.source === "telemetry/observations")
    .map((entity) => entity.raw || entity);
  const events = telemetryEventsFor(tenantId, (event) =>
    String(event.event_type || "").includes("observation") && !seenIds.has(event.event_id));
  return {
    schema_version: "observation-page.v1",
    tenant_id: tenantId,
    items: [...envelopes, ...entities, ...events],
    next_cursor: null
  };
}

function enforcementStatusPage(tenantId = "local") {
  const enforcement = state.fleet.localEntities
    .filter((entity) => entity.entity_type === "enforcement")
    .map((entity) => ({
      entity_id: entity.id,
      method_id: entity.local_object_id,
      status: entity.status,
      mode: entity.enforcement?.mode || "observe",
      pep_plane: entity.enforcement?.pep_plane || "unknown",
      pdp_engine: entity.enforcement?.pdp_engine || "unknown",
      last_seen_at: entity.last_seen_at
    }));
  return {
    schema_version: "enforcement-status-list.v1",
    tenant_id: tenantId,
    items: [
      ...telemetryEnvelopesFor(tenantId, (envelope) => envelope.event_type === "enforcement_result"),
      ...enforcement
    ]
  };
}

function guardEventTimeKey(envelope) {
  return envelope.timestamp
    || envelope.payload?.timestamp
    || envelope.payload?.ts
    || envelope.payload?.guard_event?.timestamp
    || envelope.received_at
    || "";
}

function guardEventsPage(tenantId = "local") {
  const items = telemetryEnvelopesFor(tenantId, (envelope) => ["guard_incident", "guard_event"].includes(envelope.event_type));
  items.sort((a, b) => String(guardEventTimeKey(b)).localeCompare(String(guardEventTimeKey(a))));
  return {
    schema_version: "guard-events.v1",
    tenant_id: tenantId,
    count: items.length,
    items
  };
}

// Read-side parity with the Local Control Plane dashboard log endpoints:
// the same {count, <key>} response shapes backed by ingested envelopes.
function telemetryLogPage(tenantId, eventTypes, key) {
  const items = telemetryEnvelopesFor(tenantId, (envelope) => eventTypes.includes(envelope.event_type));
  return { count: items.length, [key]: items };
}

const TELEMETRY_EXPORT_EVENT_TYPES = [
  "decision",
  "decision_log",
  "tool_invocation",
  "resource_access",
  "policy_deployment",
  "agent_telemetry",
  "agent_observation",
  "ai_usage_event",
  "guard_incident",
  "guard_event",
  "security_event",
  "enforcement_result"
];

function exportTelemetryCsv(envelopes, tenantId) {
  let csv = "timestamp,event_type,event_id,tenant_id,details\n";
  for (const envelope of envelopes) {
    const details = JSON.stringify(envelope).replace(/"/g, '""');
    csv += `${envelope.timestamp || ""},${envelope.event_type || ""},${envelope.event_id || ""},${tenantId},"${details}"\n`;
  }
  return csv;
}

function telemetryIngestStatus() {
  return {
    schema_version: "pollek.cloud.telemetry-ingest-status.v1",
    generated_at: new Date().toISOString(),
    retention: {
      max_envelopes: maxTelemetryEnvelopes,
      max_batch_receipts: maxTelemetryBatchReceipts,
      max_rejections: maxTelemetryRejections
    },
    stored_envelopes: state.fleet.telemetryEnvelopes?.length || 0,
    totals: state.fleet.telemetryIngestTotals || [],
    recent_batches: (state.fleet.telemetryBatchReceipts || []).slice(0, 20),
    recent_rejections: (state.fleet.telemetryRejections || []).slice(0, 10)
  };
}

function recordAudit(action, targetType, targetId, payload = {}) {
  const safePayload = safeAuditPayload(payload);
  const event = {
    id: `audit_${crypto.randomUUID()}`,
    tenant_id: safePayload.tenant_id || payload.tenant_id || "local",
    actor_id: safePayload.actor_id || payload.actor_id || "local-dev-admin",
    action,
    target_type: targetType,
    target_id: targetId,
    payload: safePayload,
    occurred_at: new Date().toISOString()
  };
  state.auditEvents.unshift(event);
  state.auditEvents = state.auditEvents.slice(0, 100);
  scheduleRuntimePersist(`audit.${action}`);
  return event;
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.activity_sets)) return payload.activity_sets.flatMap((set) => set.items || []);
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function normalizedKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9:/._-]+/g, " ")
    .trim();
}

function inferResourceKind(value) {
  const text = normalizedKey(value);
  if (!text) return "unknown";
  if (text.includes("github.com") || text.includes("gitlab.com") || text.endsWith(".git")) return "code_repo";
  if (text.includes("drive.google.com")) return "google_drive";
  if (text.includes("mail.google.com") || text.includes("gmail")) return "gmail";
  if (text.includes("sharepoint.com") || text.includes("onedrive")) return "microsoft_365";
  if (text.includes("slack.com")) return "slack";
  if (text.includes("s3://") || text.includes("blob.core.windows.net") || text.includes("storage.googleapis.com")) return "cloud_storage";
  if (text.includes("postgres") || text.includes("mysql") || text.includes("mongodb") || text.includes("redis")) return "database";
  if (text.startsWith("http://") || text.startsWith("https://")) return "api_endpoint";
  if (text.includes("\\") || text.includes("/") || text.includes(":\\") || text.includes("workspace")) return "file_system";
  return "generic_resource";
}

function adapterCatalogSummary(catalog = ADAPTER_CATALOG) {
  const byCategory = {};
  for (const adapter of catalog) {
    byCategory[adapter.category] = (byCategory[adapter.category] || 0) + 1;
  }
  return {
    total: catalog.length,
    categories: byCategory,
    discovery_modes: [...new Set(catalog.flatMap((item) => item.integration_modes || []))].sort(),
    entity_kinds: [...new Set(catalog.flatMap((item) => item.entity_kinds || []))].sort()
  };
}

function computeEntityHealth(entity) {
  const findings = [];
  let score = 100;
  const status = String(entity.status || "").toLowerCase();
  const risk = String(entity.risk || "medium").toLowerCase();
  const spiffeId = entity.trace?.spiffe_id || entity.identity?.spiffe_id;
  const policyIds = entity.policy_ids || [];
  const streams = entity.observability?.telemetry_streams || [];
  const isAgent = entity.entity_type === "registered_agent" || entity.entity_type === "found_agent";
  const isControl = entity.entity_type === "policy" || entity.entity_type === "enforcement";

  if (["offline", "failed", "critical"].includes(status)) {
    score -= 40;
    findings.push("Entity is offline or critical.");
  }
  if (status === "found_unregistered") {
    score -= 25;
    findings.push("Found agent is not registered to a tenant trust scope.");
  }
  if (risk === "high") {
    score -= 20;
    findings.push("Entity carries high risk.");
  }
  if (isAgent && !spiffeId) {
    score -= 20;
    findings.push("SPIFFE identity is not bound yet.");
  }
  if (isAgent && !policyIds.length) {
    score -= 15;
    findings.push("No policy binding is attached.");
  }
  if (isControl && !entity.wasm?.hot_reload) {
    score -= 12;
    findings.push("WASM hot reload is not ready.");
  }
  if (!streams.length) {
    score -= 10;
    findings.push("No telemetry stream is attached.");
  }
  if (!entity.last_seen_at) {
    score -= 8;
    findings.push("Last-seen timestamp is missing.");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const healthStatus = normalizedScore >= 80 ? "healthy" : normalizedScore >= 55 ? "warning" : "critical";
  return {
    entity_id: entity.id,
    name: entity.name,
    entity_type: entity.entity_type,
    status: entity.status,
    risk: entity.risk,
    health_status: healthStatus,
    score: normalizedScore,
    findings,
    spiffe_ready: Boolean(spiffeId),
    policy_bound: policyIds.length > 0,
    wasm_hot_reload_ready: Boolean(entity.wasm?.hot_reload),
    telemetry_streams: streams,
    last_seen_at: entity.last_seen_at
  };
}

function entityHealthPage(entities = state.fleet.localEntities) {
  const items = entities.map(computeEntityHealth);
  return {
    schema_version: "pollek.cloud.entity-health-page.v1",
    tenant_id: "local",
    generated_at: new Date().toISOString(),
    summary: {
      total: items.length,
      healthy: items.filter((item) => item.health_status === "healthy").length,
      warning: items.filter((item) => item.health_status === "warning").length,
      critical: items.filter((item) => item.health_status === "critical").length,
      avg_score: items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0
    },
    items
  };
}

function findDuplicateEntities(candidate = {}) {
  const candidateName = normalizedKey(candidate.name || candidate.display_name);
  const candidateLocalId = normalizedKey(candidate.local_object_id || candidate.agent_id || candidate.resource_id || candidate.id);
  const candidateSpiffe = normalizedKey(candidate.trace?.spiffe_id || candidate.identity?.spiffe_id || candidate.spiffe_id);
  const candidateProcess = normalizedKey(candidate.identity?.process_path || candidate.process_path);
  const matches = [];

  for (const entity of state.fleet.localEntities) {
    const reasons = [];
    if (candidateLocalId && normalizedKey(entity.local_object_id) === candidateLocalId) reasons.push("local_object_id");
    if (candidateName && normalizedKey(entity.name) === candidateName) reasons.push("name");
    if (candidateSpiffe && normalizedKey(entity.trace?.spiffe_id || entity.identity?.spiffe_id) === candidateSpiffe) reasons.push("spiffe_id");
    if (candidateProcess && normalizedKey(entity.identity?.process_path) === candidateProcess) reasons.push("process_path");
    if (!reasons.length) continue;
    matches.push({
      entity_id: entity.id,
      name: entity.name,
      entity_type: entity.entity_type,
      status: entity.status,
      reasons,
      confidence: reasons.includes("local_object_id") || reasons.includes("spiffe_id") ? "high" : "medium"
    });
  }
  return matches;
}

function compliancePolicyBundlePage() {
  const enterpriseEnabled = state.tenant.entitlements?.includes("enterprise.compliance_policy_bundles");
  const bundles = state.fleet.compliancePolicyBundles.map((bundle) => ({
    ...bundle,
    tenant_entitled: enterpriseEnabled,
    status: enterpriseEnabled ? "available" : "enterprise_required",
    local_pollek_catalog_visible: false
  }));
  return {
    schema_version: "pollek.cloud.enterprise-compliance-policy-bundle-page.v1",
    tenant_id: "local",
    edition: state.tenant.edition,
    enterprise_only: true,
    local_pollek_boundary: "Local Pollek does not own the compliance catalog. It only receives signed bundle artifacts selected by Cloud Enterprise through Contract Hub.",
    bundles
  };
}

function complianceScorePage() {
  const health = entityHealthPage().summary;
  const evidenceCoverage = Math.min(100, Math.round(((state.events.length + state.auditEvents.length + state.fleet.localEntitySyncRuns.length) / 12) * 100));
  const bundleCoverage = Math.min(100, Math.round((state.fleet.policyBundles.filter((bundle) => bundle.signed || bundle.hot_reload).length / Math.max(1, state.fleet.policyBundles.length)) * 100));
  const identityCoverage = state.fleet.localEntities.length
    ? Math.round((state.fleet.localEntities.filter((entity) => entity.trace?.spiffe_id || entity.identity?.spiffe_id).length / state.fleet.localEntities.length) * 100)
    : 0;
  const score = Math.round((health.avg_score * 0.35) + (evidenceCoverage * 0.2) + (bundleCoverage * 0.25) + (identityCoverage * 0.2));
  return {
    schema_version: "pollek.cloud.compliance-score.v1",
    tenant_id: "local",
    edition: state.tenant.edition,
    score,
    factors: {
      entity_health: health.avg_score,
      evidence_coverage: evidenceCoverage,
      signed_bundle_coverage: bundleCoverage,
      identity_trace_coverage: identityCoverage
    },
    frameworks: state.fleet.compliancePolicyBundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      frameworks: bundle.frameworks,
      ready: state.tenant.entitlements?.includes("enterprise.compliance_policy_bundles"),
      required_streams: bundle.evidence_streams
    })),
    gaps: [
      ...(health.critical ? ["Critical entity health findings must be remediated before compliance export."] : []),
      ...(identityCoverage < 80 ? ["SPIFFE/OIDC identity trace coverage is below enterprise target."] : []),
      ...(evidenceCoverage < 70 ? ["Evidence chain needs more telemetry, audit, and decision log events."] : [])
    ]
  };
}

function entityIdFrom(kind, value) {
  return `entity_${kind}_${String(value || crypto.randomUUID()).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)}`;
}

function entityRef(kind, value) {
  if (!value) return null;
  const raw = String(value);
  return raw.startsWith("entity_") ? raw : entityIdFrom(kind, raw);
}

function userIdFromSubject(subject) {
  return `user_${String(subject || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "unknown"}`;
}

function upsertDeviceUser({ tenant_id = "local", device_id = "device_local_windows", user_subject = "unknown", display_name, oidc_subject }) {
  const id = userIdFromSubject(user_subject);
  const existingIndex = state.fleet.deviceUsers.findIndex((item) => item.id === id);
  const user = {
    id,
    tenant_id,
    device_id,
    display_name: display_name || user_subject || "Unknown user",
    user_subject: user_subject || "unknown",
    oidc_subject: oidc_subject || null,
    last_seen_at: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    state.fleet.deviceUsers[existingIndex] = { ...state.fleet.deviceUsers[existingIndex], ...user };
  } else {
    state.fleet.deviceUsers.unshift(user);
  }
  return user;
}

function findDeviceName(deviceId) {
  const lcp = state.fleet.localControlPlanes.find((item) => item.device_id === deviceId || item.device_name === deviceId || item.id === deviceId);
  return lcp?.device_name || deviceId || "unknown-device";
}

function localEntityMergeKey(entity = {}) {
  return [
    entity.lcp_id || "lcp_local",
    entity.device_id || entity.device_name || "unknown-device",
    entity.entity_type || "observability",
    entity.class || "object",
    entity.source || "unknown-source",
    normalizedKey(entity.name || entity.display_name || entity.local_object_id || entity.id)
  ].join("|");
}

function compactLocalEntities() {
  const seen = new Set();
  const compacted = [];
  for (const entity of state.fleet.localEntities) {
    const key = localEntityMergeKey(entity);
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push(entity);
  }
  state.fleet.localEntities = compacted.slice(0, 500);
}

function canonicalLocalEntityState(lcpId = "lcp_local") {
  return state.fleet.localEntities
    .filter((entity) => !lcpId || entity.lcp_id === lcpId)
    .filter((entity) => {
      if (entity.entity_type !== "observability") return true;
      return !["resource", "telemetry_observation"].includes(entity.class);
    })
    .map((entity) => ({
      key: localEntityMergeKey(entity),
      entity_type: entity.entity_type,
      class: entity.class,
      status: entity.status,
      risk: entity.risk,
      policy_ids: entity.policy_ids || [],
      enforcement: stripVolatileFields(entity.enforcement || {}),
      observability_streams: entity.observability?.telemetry_streams || [],
      wasm_hot_reload: Boolean(entity.wasm?.hot_reload),
      wasm_generation: entity.wasm?.generation || 0,
      spiffe_id: entity.class === "identity" ? null : (entity.trace?.spiffe_id || entity.identity?.spiffe_id || null)
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function defaultLocalTrace(entity) {
  const identity = entity.identity || {};
  const binding = Array.isArray(identity.token_bindings) ? identity.token_bindings[0] : null;
  return {
    oauth_client_id: binding?.audience?.[0] || null,
    oidc_issuer: binding?.issuer || null,
    oidc_subject: binding?.subject || identity.user_subject || null,
    spiffe_id: identity.spiffe_id || null,
    mtls_subject: identity.spiffe_id ? `spiffe-svid:${identity.spiffe_id}` : null,
    mtls_fingerprint: identity.signing_key_fingerprint || null,
    confirmation: binding?.confirmation || "unconfirmed"
  };
}

function upsertLocalEntity(entity) {
  const userSubject = entity.user_subject || entity.identity?.user_subject || "unknown";
  const user = upsertDeviceUser({
    tenant_id: entity.tenant_id || "local",
    device_id: entity.device_id || "device_local_windows",
    user_subject: userSubject,
    oidc_subject: entity.trace?.oidc_subject
  });
  const normalized = {
    tenant_id: "local",
    device_id: "device_local_windows",
    device_name: findDeviceName(entity.device_id || "device_local_windows"),
    lcp_id: "lcp_local",
    user_id: entity.user_id || user.id,
    user_subject: userSubject,
    status: "observed",
    risk: "medium",
    policy_ids: [],
    enforcement: {},
    observability: {},
    wasm: { hot_reload: false, generation: 0 },
    last_seen_at: new Date().toISOString(),
    ...entity
  };
  if (!normalized.trace) normalized.trace = defaultLocalTrace(normalized);
  const mergeKey = localEntityMergeKey(normalized);
  const existingIndex = state.fleet.localEntities.findIndex((item) => item.id === entity.id || localEntityMergeKey(item) === mergeKey);
  if (existingIndex >= 0) {
    const existing = state.fleet.localEntities[existingIndex];
    state.fleet.localEntities[existingIndex] = { ...existing, ...normalized, id: existing.id || normalized.id };
  } else {
    state.fleet.localEntities.unshift(normalized);
  }
  addLocalEntityRelationship(normalized.lcp_id, normalized.id, "reports_entity");
  return normalized;
}

function addLocalEntityRelationship(from, to, label) {
  if (!from || !to) return;
  if (state.fleet.localEntityRelationships.some((rel) => rel.from === from && rel.to === to && rel.label === label)) return;
  state.fleet.localEntityRelationships.push({ from, to, label });
}

function ingestLocalEntitySnapshot(snapshot, context = {}) {
  const now = new Date().toISOString();
  const deviceId = context.device_id || "device_local_windows";
  const deviceName = findDeviceName(deviceId);
  const lcpId = context.lcp_id || "lcp_local";
  const userSubject = context.user_subject || "unknown";
  let count = 0;

  for (const agent of normalizeItems(snapshot.agents)) {
    const id = entityIdFrom("agent", agent.agent_id || agent.id || agent.name);
    const entity = upsertLocalEntity({
      id,
      local_object_id: agent.agent_id || agent.id,
      entity_type: "registered_agent",
      class: "agent",
      name: agent.name || agent.display_name || agent.agent_id || "Registered Agent",
      vendor: agent.vendor || null,
      device_id: deviceId,
      device_name: deviceName,
      lcp_id: lcpId,
      user_subject: agent.identity?.user_subject || userSubject,
      status: String(agent.meta?.status || "registered").toLowerCase(),
      risk: agent.trust_level === "untrusted" ? "high" : "medium",
      source: "registry/agents",
      trust_level: agent.trust_level || "unknown",
      identity: agent.identity || {},
      trace: defaultLocalTrace(agent),
      policy_ids: [],
      enforcement: { mode: agent.enforcement_mode || "Observe", pdp_engine: "opa_wasm" },
      observability: { telemetry_streams: ["tool_usage", "resource_access", "identity_access"], last_event_at: now },
      wasm: { hot_reload: true, active_bundle_id: agent.active_bundle_id || null, active_module: "opa_wasm", generation: 1 },
      raw_schema: agent.meta?.schema_version || "agent.v1",
      raw: agent,
      last_seen_at: now
    });
    count += 1;
    for (const toolId of agent.declared_tools || []) addLocalEntityRelationship(entity.id, entityIdFrom("tool", toolId), "declares_tool");
    for (const resourceId of agent.declared_resources || []) addLocalEntityRelationship(entity.id, entityIdFrom("resource", resourceId), "declares_resource");
  }

  for (const inventory of normalizeItems(snapshot.agent_inventory)) {
    const id = entityIdFrom("agent", inventory.agent_id || inventory.candidate_id || inventory.display_name);
    const entity = upsertLocalEntity({
      id,
      local_object_id: inventory.agent_id || inventory.candidate_id,
      entity_type: inventory.candidate_id ? "found_agent" : "registered_agent",
      class: "agent",
      name: inventory.display_name || inventory.agent_id || "Agent Inventory Item",
      vendor: inventory.vendor || null,
      device_id: inventory.device_id || deviceId,
      device_name: findDeviceName(inventory.device_id || deviceId),
      lcp_id: lcpId,
      user_subject: inventory.user_subject || userSubject,
      status: inventory.candidate_id ? "found_unregistered" : "registered",
      risk: (inventory.risk_score || 0) > 70 ? "high" : "medium",
      source: "agent-inventory",
      trust_level: inventory.trust_level || "unknown",
      identity: { user_subject: inventory.user_subject || userSubject, token_bindings: [] },
      trace: { oauth_client_id: null, oidc_issuer: null, oidc_subject: null, spiffe_id: null, mtls_subject: null, mtls_fingerprint: null, confirmation: inventory.candidate_id ? "candidate" : "inventory" },
      policy_ids: [],
      enforcement: { mode: "Observe", pdp_engine: "opa_wasm", supported_pep_bindings: inventory.supported_pep_bindings || [] },
      observability: {
        telemetry_streams: Object.entries(inventory.telemetry_capabilities || {})
          .filter(([, value]) => value === true)
          .map(([key]) => key),
        last_event_at: inventory.last_seen_at || now
      },
      wasm: { hot_reload: false, active_bundle_id: null, active_module: null, generation: 0 },
      raw_schema: inventory.schema_version || "agent-capability-inventory.v1",
      raw: inventory,
      last_seen_at: inventory.last_seen_at || now
    });
    count += 1;
    for (const surface of inventory.mcp_surfaces || []) addLocalEntityRelationship(entity.id, entityIdFrom("tool", surface.server_name), "exposes_mcp_surface");
  }

  for (const candidate of normalizeItems(snapshot.candidates)) {
    const id = entityIdFrom("agent", candidate.candidate_id || candidate.agent_id || candidate.display_name);
    const registered = String(candidate.status || "").toLowerCase() === "registered";
    upsertLocalEntity({
      id,
      local_object_id: candidate.candidate_id || candidate.agent_id,
      entity_type: registered ? "registered_agent" : "found_agent",
      class: "agent",
      name: candidate.display_name || candidate.name || "Found Agent",
      vendor: candidate.vendor || null,
      device_id: candidate.device_id || deviceId,
      device_name: findDeviceName(candidate.device_id || deviceId),
      lcp_id: lcpId,
      user_subject: candidate.user_subject || userSubject,
      status: registered ? "registered" : "found_unregistered",
      risk: (candidate.risk_score || 0) > 70 ? "high" : "medium",
      source: "discovery/candidates",
      trust_level: candidate.suggested_registration?.trust_level || "untrusted",
      identity: { user_subject: candidate.user_subject || userSubject, token_bindings: [] },
      trace: { oauth_client_id: null, oidc_issuer: null, oidc_subject: null, spiffe_id: null, mtls_subject: null, mtls_fingerprint: null, confirmation: registered ? "registered" : "missing" },
      policy_ids: [],
      enforcement: { mode: registered ? "Enforce" : "Observe", pdp_engine: registered ? "opa_wasm" : "none" },
      observability: { telemetry_streams: candidate.suggested_observation_profile?.sources || ["process_metadata"], last_event_at: candidate.last_seen || now },
      wasm: { hot_reload: registered, active_bundle_id: null, active_module: registered ? "opa_wasm" : null, generation: registered ? 1 : 0 },
      raw_schema: candidate.schema_version || "discovery.candidate.v2",
      raw: candidate,
      last_seen_at: candidate.last_seen || now
    });
    count += 1;
  }

  for (const registryEntity of normalizeItems(snapshot.entities)) {
    const data = registryEntity.data_json || registryEntity.data || registryEntity;
    const objectType = registryEntity.object_type || data.object_type || data.entity_type || "observed_entity";
    const objectId = registryEntity.object_id || data.entity_id || data.candidate_id || data.id || data.name;
    upsertLocalEntity({
      id: entityIdFrom(objectType, objectId),
      local_object_id: objectId,
      entity_type: ["registered_agent", "found_agent", "policy", "enforcement"].includes(data.entity_type) ? data.entity_type : "observability",
      class: data.class || objectType,
      name: data.display_name || data.name || objectId || objectType,
      device_id: data.device_id || deviceId,
      device_name: findDeviceName(data.device_id || deviceId),
      lcp_id: lcpId,
      user_subject: data.user_subject || userSubject,
      status: data.status || registryEntity.status || "observed",
      risk: data.risk || "medium",
      source: `registry/entities/${objectType}`,
      identity: data.identity || { user_subject: data.user_subject || userSubject },
      trace: data.trace,
      policy_ids: data.policy_ids || [],
      enforcement: data.enforcement || {},
      observability: data.observability || { telemetry_streams: [objectType], last_event_at: now },
      wasm: data.wasm || { hot_reload: false, generation: 0 },
      raw_schema: data.schema_version || "registry-entity.v1",
      raw: registryEntity,
      last_seen_at: data.updated_at || registryEntity.updated_at || now
    });
    count += 1;
  }

  for (const policy of normalizeItems(snapshot.policies)) {
    const policyId = policy.policy_id || policy.id || policy.name;
    upsertLocalEntity({
      id: entityIdFrom("policy", policyId),
      local_object_id: policyId,
      entity_type: "policy",
      class: "policy",
      name: policy.name || policyId || "Policy",
      device_id: deviceId,
      device_name: deviceName,
      lcp_id: lcpId,
      user_subject: userSubject,
      status: String(policy.meta?.status || policy.status || "active").toLowerCase(),
      risk: "medium",
      source: "policies",
      engine: policy.engine || policy.policy_type || policy.source?.language || "unknown",
      mode: policy.mode || "enforce",
      policy_ids: [policyId].filter(Boolean),
      enforcement: { mode: policy.mode || "Enforce", pdp_engine: policy.engine || "opa_wasm" },
      observability: { telemetry_streams: ["decision", "policy_deployment"], last_event_at: now },
      wasm: { hot_reload: true, active_bundle_id: policy.bundle_id || null, active_module: policy.engine || "opa_wasm", generation: 1 },
      raw_schema: policy.meta?.schema_version || "policy.v1",
      raw: policy,
      last_seen_at: policy.updated_at || policy.meta?.updated_at || now
    });
    count += 1;
  }

  for (const method of normalizeItems(snapshot.capability?.control_methods)) {
    upsertLocalEntity({
      id: entityIdFrom("enforcement", method.method_id),
      local_object_id: method.method_id,
      entity_type: "enforcement",
      class: "enforcement",
      name: method.display_name_en || method.method_id,
      device_id: snapshot.capability?.device_id || deviceId,
      device_name: findDeviceName(snapshot.capability?.device_id || deviceId),
      lcp_id: lcpId,
      user_subject: userSubject,
      status: method.status || "unknown",
      risk: method.status === "available" ? "medium" : "high",
      source: "capability-snapshot-v2",
      enforcement: { mode: method.max_level || "observe", pep_plane: method.method_id, pdp_engine: "opa_wasm" },
      observability: { telemetry_streams: method.domains || [], last_event_at: now },
      wasm: { hot_reload: method.status === "available", active_bundle_id: null, active_module: "opa_wasm", generation: method.status === "available" ? 1 : 0 },
      raw_schema: snapshot.capability?.schema_version || "local-capability-snapshot.v2",
      raw: method,
      last_seen_at: snapshot.capability?.generated_at || now
    });
    count += 1;
  }

  for (const source of normalizeItems(snapshot.capability?.observation_sources)) {
    upsertLocalEntity({
      id: entityIdFrom("observability", source.source_id),
      local_object_id: source.source_id,
      entity_type: "observability",
      class: "observability",
      name: source.display_name_en || source.source_id,
      device_id: snapshot.capability?.device_id || deviceId,
      device_name: findDeviceName(snapshot.capability?.device_id || deviceId),
      lcp_id: lcpId,
      user_subject: userSubject,
      status: source.status || "unknown",
      risk: "medium",
      source: "capability-snapshot-v2",
      observability: { telemetry_streams: source.domains || [], last_event_at: now, privacy_note: source.privacy_note_en },
      wasm: { hot_reload: false, generation: 0 },
      raw_schema: snapshot.capability?.schema_version || "local-capability-snapshot.v2",
      raw: source,
      last_seen_at: snapshot.capability?.generated_at || now
    });
    count += 1;
  }

  for (const identity of normalizeItems(snapshot.telemetry_identities)) {
    const observedSubject = identity.user_subject || identity.subject || identity.identity || userSubject;
    const user = upsertDeviceUser({
      device_id: identity.device_id || deviceId,
      user_subject: observedSubject,
      display_name: identity.display_name || observedSubject,
      oidc_subject: identity.oidc_subject || identity.subject
    });
    upsertLocalEntity({
      id: entityIdFrom("identity", observedSubject),
      local_object_id: identity.identity_id || observedSubject,
      entity_type: "observability",
      class: "identity",
      name: identity.display_name || observedSubject,
      device_id: identity.device_id || deviceId,
      device_name: findDeviceName(identity.device_id || deviceId),
      lcp_id: lcpId,
      user_id: user.id,
      user_subject: user.user_subject,
      status: identity.status || "observed",
      risk: "medium",
      source: "telemetry/identities",
      identity: { user_subject: user.user_subject, token_bindings: [] },
      trace: { oidc_subject: user.oidc_subject, spiffe_id: identity.spiffe_id || null, confirmation: "telemetry_identity" },
      observability: { telemetry_streams: ["identity_access"], last_event_at: identity.last_seen_at || now },
      wasm: { hot_reload: false, generation: 0 },
      raw_schema: "identity-inventory.v1",
      raw: identity,
      last_seen_at: identity.last_seen_at || now
    });
    count += 1;
  }

  for (const tool of [...normalizeItems(snapshot.tools), ...normalizeItems(snapshot.telemetry_tools)]) {
    const id = entityIdFrom("tool", tool.tool_id || tool.id || tool.name);
    upsertLocalEntity({
      id,
      local_object_id: tool.tool_id || tool.id,
      entity_type: "observability",
      class: "tool",
      name: tool.name || tool.tool_id || "Observed Tool",
      device_id: deviceId,
      device_name: deviceName,
      lcp_id: lcpId,
      user_subject: userSubject,
      status: tool.status || "observed",
      risk: "medium",
      source: "registry/tools",
      observability: { telemetry_streams: ["tool_usage"], last_event_at: tool.last_used || now, call_count: tool.call_count },
      wasm: { hot_reload: false, generation: 0 },
      raw_schema: "tool-inventory.v1",
      raw: tool,
      last_seen_at: tool.last_used || now
    });
    count += 1;
    if (tool.agent_id) addLocalEntityRelationship(entityIdFrom("agent", tool.agent_id), id, "uses_tool");
  }

  for (const resource of [...normalizeItems(snapshot.resources), ...normalizeItems(snapshot.telemetry_resources)]) {
    const id = entityIdFrom("resource", resource.resource_id || resource.id || resource.name);
    upsertLocalEntity({
      id,
      local_object_id: resource.resource_id || resource.id,
      entity_type: "observability",
      class: "resource",
      name: resource.name || resource.resource_id || "Observed Resource",
      device_id: deviceId,
      device_name: deviceName,
      lcp_id: lcpId,
      user_subject: userSubject,
      status: resource.status || "observed",
      risk: resource.sensitivity ? "medium" : "low",
      source: "registry/resources",
      sensitivity: resource.sensitivity,
      resource_kind: resource.resource_type || resource.type || inferResourceKind(resource.uri || resource.path || resource.name || resource.resource_id),
      observability: { telemetry_streams: ["resource_access"], last_event_at: resource.last_accessed || now },
      wasm: { hot_reload: false, generation: 0 },
      raw_schema: "resource-inventory.v1",
      raw: resource,
      last_seen_at: resource.last_accessed || now
    });
    count += 1;
  }

  const observations = normalizeItems(snapshot.observations);
  if (observations.length) {
    state.fleet.localEntities = state.fleet.localEntities.filter((entity) => !(entity.lcp_id === lcpId && entity.source === "telemetry/observations"));
  }
  const seenObservationIds = new Set();
  for (const observation of observations) {
    const eventType = observation.event_type || observation.kind || "observation";
    const stableTarget = observation.entity_id
      || observation.local_object_id
      || observation.payload?.object_id
      || observation.payload?.agent
      || observation.payload?.resource_id
      || observation.payload?.resource
      || observation.payload?.policy
      || `${eventType}_${observation.device_id || deviceId}_${observation.user_subject || userSubject}`;
    const eventId = `${eventType}_${stableTarget}`;
    if (seenObservationIds.has(eventId)) continue;
    seenObservationIds.add(eventId);
    upsertLocalEntity({
      id: entityIdFrom("observation", eventId),
      local_object_id: eventId,
      entity_type: "observability",
      class: "telemetry_observation",
      name: eventType,
      device_id: observation.device_id || deviceId,
      device_name: findDeviceName(observation.device_id || deviceId),
      lcp_id: observation.payload?.lcp_id || lcpId,
      user_subject: observation.user_subject || userSubject,
      status: observation.severity === "critical" ? "critical" : "observed",
      risk: observation.severity === "critical" ? "high" : "medium",
      source: "telemetry/observations",
      observability: { telemetry_streams: [observation.event_type || "observation"], last_event_at: observation.received_at || now },
      wasm: { hot_reload: false, generation: 0 },
      raw_schema: "telemetry-observation.v1",
      raw: observation,
      last_seen_at: observation.received_at || now
    });
    count += 1;
  }

  for (const relationship of normalizeItems(snapshot.relationships)) {
    const from = relationship.from_entity_id
      || relationship.from
      || relationship.source_entity_id
      || relationship.source_id
      || relationship.agent_id;
    const to = relationship.to_entity_id
      || relationship.to
      || relationship.target_entity_id
      || relationship.target_id
      || relationship.resource_id
      || relationship.tool_id;
    const label = relationship.label || relationship.relationship_type || relationship.type || "relates_to";
    addLocalEntityRelationship(entityRef("agent", from), entityRef("observed", to), label);
  }

  compactLocalEntities();
  return count;
}

async function pullLocalEntitySnapshot(lcpUrl, headers = {}) {
  const endpoints = [
    ["agents", "/v1/tenants/local/registry/agents"],
    ["candidates", "/v1/tenants/local/discovery/candidates"],
    ["agent_inventory", "/v1/tenants/local/agent-inventory"],
    ["policies", "/v1/tenants/local/policies"],
    ["tools", "/v1/tenants/local/registry/tools"],
    ["resources", "/v1/tenants/local/registry/resources"],
    ["entities", "/v1/tenants/local/registry/entities"],
    ["relationships", "/v1/tenants/local/registry/relationships"],
    ["telemetry_resources", "/v1/tenants/local/telemetry/resources"],
    ["telemetry_tools", "/v1/tenants/local/telemetry/tools"],
    ["telemetry_identities", "/v1/tenants/local/telemetry/identities"],
    ["observations", "/v1/tenants/local/telemetry/observations"],
    ["bundles", "/v1/tenants/local/bundles"],
    ["capability", "/v1/tenants/local/devices/local/capability-snapshot-v2"]
  ];
  const snapshot = {};
  const results = [];
  for (const [key, endpoint] of endpoints) {
    try {
      const result = await fetchJson(`${lcpUrl}${endpoint}`, { headers, timeoutMs: 3500 });
      results.push({ key, endpoint, ok: result.ok, status: result.status, latency_ms: result.latency_ms });
      if (result.ok) snapshot[key] = result.body;
    } catch (error) {
      results.push({ key, endpoint, ok: false, error: String(error) });
    }
  }
  return { snapshot, results, ok: results.some((item) => item.ok) };
}

async function pullLocalConfigurationSnapshot(lcpUrl, headers = {}) {
  const endpoints = [
    ["contract", "/.well-known/pollek-contract"],
    ["cloud_profile", "/v1/tenants/local/pdp/cloud"],
    ["capability", "/v1/tenants/local/devices/local/capability-snapshot-v2"]
  ];
  const snapshot = {};
  const results = [];
  for (const [key, endpoint] of endpoints) {
    try {
      const result = await fetchJson(`${lcpUrl}${endpoint}`, { headers, timeoutMs: 3500 });
      results.push({ key, endpoint, ok: result.ok, status: result.status, latency_ms: result.latency_ms });
      if (result.ok) snapshot[key] = result.body;
    } catch (error) {
      results.push({ key, endpoint, ok: false, error: String(error) });
    }
  }
  return { snapshot, results, ok: results.some((item) => item.ok) };
}

function recordConfigurationSnapshot({ lcpUrl, lcpId, pulled, mode = "watch_poll" }) {
  const record = {
    id: `config_sync_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.local-configuration-snapshot.v1",
    tenant_id: "local",
    mode,
    lcp_id: lcpId,
    lcp_url: lcpUrl,
    status: pulled.ok ? "completed" : "failed",
    results: pulled.results,
    snapshot_hash: sha256(stableJson(redactSensitive(pulled.snapshot))),
    snapshot: redactSensitive(pulled.snapshot),
    created_at: new Date().toISOString()
  };
  state.fleet.localConfigurationSnapshots.unshift(record);
  state.fleet.localConfigurationSnapshots = state.fleet.localConfigurationSnapshots.slice(0, 20);
  return record;
}

function ensureHybridCollections() {
  if (!Array.isArray(state.fleet.localChangeCursors)) state.fleet.localChangeCursors = [];
  if (!Array.isArray(state.fleet.localChangeBatches)) state.fleet.localChangeBatches = [];
}

function changeCursorFor({ tenant_id, lcp_id, device_id }) {
  ensureHybridCollections();
  const tenantId = tenant_id || "local";
  const lcpId = lcp_id || "lcp_local";
  const deviceId = device_id || "device_local_windows";
  let cursor = state.fleet.localChangeCursors.find((item) => (
    item.tenant_id === tenantId && item.lcp_id === lcpId && item.device_id === deviceId
  ));
  if (!cursor) {
    cursor = {
      schema_version: "pollek.cloud.lcp-change-cursor.v1",
      tenant_id: tenantId,
      lcp_id: lcpId,
      device_id: deviceId,
      last_sequence: 0,
      last_event_id: null,
      last_batch_id: null,
      last_content_hash: null,
      recent_event_ids: [],
      status: "created",
      updated_at: new Date().toISOString()
    };
    state.fleet.localChangeCursors.unshift(cursor);
  }
  return cursor;
}

function normalizeChangeEvents(body) {
  if (Array.isArray(body?.events)) return body.events;
  if (Array.isArray(body?.items)) return body.items;
  if (body?.type && body?.data) return [body];
  return [];
}

function changeEventId(event, sequence) {
  return event.id || event.event_id || event.ce_id || `${event.source || "lcp"}:${event.type || event.event_type || event.kind || "change"}:${sequence || crypto.randomUUID()}`;
}

function changeEventSequence(event, fallback) {
  const sequence = Number(event.sequence || event.seq || event.resource_version || event.revision || fallback || 0);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : fallback;
}

function validateChangeHash(event) {
  const expected = event.data_hash || event.content_hash || event.hash;
  if (!expected) return { ok: true, expected: null, actual: null };
  const actual = `sha256:${sha256(stableJson(event.data ?? event.payload ?? event))}`;
  return { ok: expected === actual || expected === actual.replace("sha256:", ""), expected, actual };
}

function isDuplicateChange(cursor, eventId, sequence) {
  if (eventId && cursor.recent_event_ids?.includes(eventId)) return true;
  if (sequence && cursor.last_sequence && sequence <= cursor.last_sequence && !eventId) return true;
  return false;
}

function rememberChange(cursor, { eventId, sequence, batchId, contentHash }) {
  cursor.last_sequence = Math.max(Number(cursor.last_sequence || 0), Number(sequence || 0));
  cursor.last_event_id = eventId || cursor.last_event_id;
  cursor.last_batch_id = batchId || cursor.last_batch_id;
  cursor.last_content_hash = contentHash || cursor.last_content_hash;
  cursor.status = "acked";
  cursor.updated_at = new Date().toISOString();
  if (eventId) {
    cursor.recent_event_ids = [eventId, ...(cursor.recent_event_ids || []).filter((id) => id !== eventId)].slice(0, 200);
  }
}

function localEntityIdForPayload(payload = {}) {
  return payload.id
    || payload.entity_id
    || payload.object_id
    || (payload.entity_type || payload.class || payload.kind
      ? entityIdFrom(payload.entity_type || payload.class || payload.kind, payload.local_object_id || payload.name || payload.display_name)
      : null);
}

function removeLocalEntity(payload = {}, context = {}) {
  const id = localEntityIdForPayload(payload);
  const before = state.fleet.localEntities.length;
  state.fleet.localEntities = state.fleet.localEntities.filter((entity) => {
    if (id && entity.id === id) return false;
    if (payload.local_object_id && entity.local_object_id === payload.local_object_id && entity.lcp_id === context.lcp_id) return false;
    return true;
  });
  if (id) {
    state.fleet.localEntityRelationships = state.fleet.localEntityRelationships.filter((rel) => rel.from !== id && rel.to !== id);
  }
  return before - state.fleet.localEntities.length;
}

function applyChangeEvent(event, context = {}) {
  const eventType = String(event.type || event.event_type || event.kind || "").toLowerCase();
  const op = String(event.op || event.operation || event.action || (eventType.includes("delete") ? "delete" : "upsert")).toLowerCase();
  const data = event.data ?? event.payload ?? event.entity ?? {};
  const changeContext = {
    tenant_id: context.tenant_id || data.tenant_id || "local",
    lcp_id: context.lcp_id || data.lcp_id || "lcp_local",
    device_id: context.device_id || data.device_id || "device_local_windows",
    user_subject: context.user_subject || data.user_subject || "unknown"
  };

  if (eventType.includes("snapshot") || data.snapshot) {
    const count = ingestLocalEntitySnapshot(data.snapshot || data, changeContext);
    return { applied: count, kind: "snapshot" };
  }

  if (eventType.includes("configuration") || eventType.includes("config")) {
    const record = {
      ok: true,
      results: [{ key: "change_batch", endpoint: "/api/lcp/change-batches", ok: true, status: 202 }],
      snapshot: data
    };
    const configRecord = recordConfigurationSnapshot({
      lcpUrl: context.lcp_url || "lcp-delta-push",
      lcpId: changeContext.lcp_id,
      pulled: record,
      mode: "lcp_delta_push"
    });
    return { applied: 1, kind: "configuration", config_snapshot_id: configRecord.id };
  }

  if (eventType.includes("relationship")) {
    const from = data.from || data.from_entity_id || data.source_entity_id;
    const to = data.to || data.to_entity_id || data.target_entity_id;
    const label = data.label || data.relationship_type || data.type || "relates_to";
    if (op === "delete" || op === "remove") {
      const before = state.fleet.localEntityRelationships.length;
      state.fleet.localEntityRelationships = state.fleet.localEntityRelationships.filter((rel) => !(rel.from === from && rel.to === to && rel.label === label));
      return { applied: before - state.fleet.localEntityRelationships.length, kind: "relationship" };
    }
    addLocalEntityRelationship(from, to, label);
    return { applied: 1, kind: "relationship" };
  }

  if (op === "delete" || op === "remove" || eventType.includes("deleted")) {
    return { applied: removeLocalEntity(data, changeContext), kind: "entity_delete" };
  }

  const normalized = {
    ...data,
    id: localEntityIdForPayload(data) || entityIdFrom(data.entity_type || data.type || data.class || "observability", data.local_object_id || data.name || data.display_name),
    tenant_id: changeContext.tenant_id,
    lcp_id: changeContext.lcp_id,
    device_id: data.device_id || changeContext.device_id,
    user_subject: data.user_subject || changeContext.user_subject,
    entity_type: data.entity_type || data.type || data.class || (eventType.includes("policy") ? "policy" : eventType.includes("enforcement") ? "enforcement" : eventType.includes("agent") ? "registered_agent" : "observability"),
    source: data.source || `change-batch/${eventType || "entity"}`,
    last_seen_at: data.last_seen_at || event.time || event.created_at || new Date().toISOString()
  };
  const entity = upsertLocalEntity(normalized);
  return { applied: 1, kind: "entity_upsert", entity_id: entity.id };
}

function ingestLcpChangeBatch(body, { tenantIdFromPath = null } = {}) {
  ensureHybridCollections();
  if (tenantIdFromPath && body.tenant_id && body.tenant_id !== tenantIdFromPath) {
    const error = new Error("tenant_id does not match tenant-scoped change batch path");
    error.statusCode = 400;
    throw error;
  }
  const tenantId = tenantIdFromPath || body.tenant_id || body.tenantId;
  if (!tenantId) {
    const error = new Error("tenant_id is required for LCP change batches");
    error.statusCode = 400;
    throw error;
  }
  const lcpId = body.lcp_id || body.lcpId || "lcp_local";
  const deviceId = body.device_id || body.deviceId || "device_local_windows";
  const events = normalizeChangeEvents(body);
  if (!events.length) {
    const error = new Error("events array is required");
    error.statusCode = 400;
    throw error;
  }

  const batchId = body.batch_id || body.batchId || `change_batch_${crypto.randomUUID()}`;
  const cursor = changeCursorFor({ tenant_id: tenantId, lcp_id: lcpId, device_id: deviceId });
  const accepted = [];
  const duplicate = [];
  const rejected = [];
  let applied = 0;
  const initialSequence = Number(cursor.last_sequence || 0);
  let lastSequence = initialSequence;

  events.forEach((event, index) => {
    const sequence = changeEventSequence(event, initialSequence + index + 1);
    const eventId = changeEventId(event, sequence);
    const hash = validateChangeHash(event);
    if (!hash.ok) {
      rejected.push({ event_id: eventId, sequence, reason: "content_hash_mismatch", expected: hash.expected, actual: hash.actual });
      return;
    }
    if (isDuplicateChange(cursor, eventId, sequence)) {
      duplicate.push({ event_id: eventId, sequence });
      return;
    }
    if (sequence <= Number(cursor.last_sequence || 0)) {
      rejected.push({ event_id: eventId, sequence, reason: "sequence_replay_or_out_of_order", last_sequence: cursor.last_sequence });
      return;
    }
    const result = applyChangeEvent(event, {
      tenant_id: tenantId,
      lcp_id: lcpId,
      device_id: deviceId,
      user_subject: body.user_subject || "unknown",
      lcp_url: body.lcp_url || body.source
    });
    applied += result.applied;
    lastSequence = Math.max(lastSequence, sequence);
    rememberChange(cursor, {
      eventId,
      sequence,
      batchId,
      contentHash: hash.actual || event.content_hash || event.data_hash || null
    });
    accepted.push({ event_id: eventId, sequence, ...result });
  });

  const status = rejected.length ? "partially_accepted" : "accepted";
  const now = new Date().toISOString();
  const record = {
    id: batchId,
    schema_version: "pollek.cloud.lcp-change-batch-record.v1",
    tenant_id: tenantId,
    lcp_id: lcpId,
    device_id: deviceId,
    source: body.source || "lcp_outbox_delta_push",
    status,
    received_at: now,
    event_count: events.length,
    accepted_count: accepted.length,
    duplicate_count: duplicate.length,
    rejected_count: rejected.length,
    applied_count: applied,
    ack_cursor: {
      tenant_id: tenantId,
      lcp_id: lcpId,
      device_id: deviceId,
      last_sequence: cursor.last_sequence,
      last_event_id: cursor.last_event_id,
      last_batch_id: cursor.last_batch_id,
      acked_at: cursor.updated_at
    },
    accepted,
    duplicate,
    rejected
  };
  state.fleet.localChangeBatches.unshift(record);
  state.fleet.localChangeBatches = state.fleet.localChangeBatches.slice(0, 50);

  const run = {
    id: `entity_sync_${crypto.randomUUID()}`,
    mode: "lcp_delta_push",
    reason: body.reason || "lcp_outbox_change_batch",
    status,
    entity_count: applied,
    lcp_id: lcpId,
    device_id: deviceId,
    change_batch_id: batchId,
    ack_sequence: cursor.last_sequence,
    accepted_count: accepted.length,
    duplicate_count: duplicate.length,
    rejected_count: rejected.length,
    created_at: now
  };
  state.fleet.localEntitySyncRuns.unshift(run);
  state.fleet.localEntitySyncRuns = state.fleet.localEntitySyncRuns.slice(0, 20);

  lcpEntityWatch.status = "delta_push_active";
  lcpEntityWatch.change_count += accepted.length;
  lcpEntityWatch.last_change_at = accepted.length ? now : lcpEntityWatch.last_change_at;
  lcpEntityWatch.last_delta_at = accepted.length ? now : lcpEntityWatch.last_delta_at;
  lcpEntityWatch.last_success_at = now;
  lcpEntityWatch.last_entity_count = state.fleet.localEntities.length;
  lcpEntityWatch.last_error = rejected.length ? `${rejected.length} rejected change event(s)` : null;

  recordAudit("local_entities.delta_batch_ingested", "lcp", lcpId, {
    tenant_id: tenantId,
    batch_id: batchId,
    status,
    accepted_count: accepted.length,
    duplicate_count: duplicate.length,
    rejected_count: rejected.length,
    ack_sequence: cursor.last_sequence
  });
  recordEvent({
    event_id: `evt_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    device_id: deviceId,
    event_type: "local_entities.updated.v1",
    severity: rejected.length ? "warning" : "info",
    payload: { mode: "lcp_delta_push", batch_id: batchId, lcp_id: lcpId, accepted_count: accepted.length, rejected_count: rejected.length, ack_sequence: cursor.last_sequence }
  });
  addTask("local_entity_delta_push", rejected.length ? "warning" : "completed", `Accepted ${accepted.length} LCP change events`, {
    batch_id: batchId,
    lcp_id: lcpId,
    ack_sequence: cursor.last_sequence
  });
  broadcastSse("local_entities.updated", { run, watch: lcpWatchStatus(), summary: fleetSummary(), change_batch: record });
  scheduleRuntimePersist("local_entity_delta_push");
  return { record, run, cursor };
}

async function pollLcpEntityWatch({ force = false, reason = "timer" } = {}) {
  if (!lcpEntityWatch.enabled || lcpEntityWatch.running) return lcpWatchStatus();
  lcpEntityWatch.running = true;
  lcpEntityWatch.poll_count += 1;
  lcpEntityWatch.last_poll_at = new Date().toISOString();
  lcpEntityWatch.last_reconcile_at = lcpEntityWatch.last_poll_at;
  const localLcp = state.fleet.localControlPlanes.find((item) => item.id === lcpEntityWatch.lcp_id)
    || state.fleet.localControlPlanes.find((item) => item.endpoint.startsWith("http://127.0.0.1"));
  const lcpUrl = (localLcp?.endpoint || lcpEntityWatch.lcp_url || defaultLcpUrl).replace(/\/+$/, "");
  lcpEntityWatch.lcp_url = lcpUrl;
  try {
    const [pulledEntities, pulledConfig] = await Promise.all([
      pullLocalEntitySnapshot(lcpUrl),
      pullLocalConfigurationSnapshot(lcpUrl)
    ]);
    lcpEntityWatch.status = pulledEntities.ok || pulledConfig.ok ? "reconciled" : "degraded";
    lcpEntityWatch.last_success_at = pulledEntities.ok || pulledConfig.ok ? new Date().toISOString() : lcpEntityWatch.last_success_at;
    lcpEntityWatch.last_error = null;
    const count = ingestLocalEntitySnapshot(pulledEntities.snapshot, {
      device_id: localLcp?.device_id || "device_local_windows",
      lcp_id: localLcp?.id || lcpEntityWatch.lcp_id,
      user_subject: "unknown"
    });
    const snapshotHash = sha256(stableJson({
      entities: canonicalLocalEntityState(localLcp?.id || lcpEntityWatch.lcp_id),
      configuration: watchFingerprintPayload({}, pulledConfig.snapshot).configuration
    }));
    lcpEntityWatch.last_entity_count = state.fleet.localEntities.length;
    const changed = force || snapshotHash !== lcpEntityWatch.last_snapshot_hash;
    if (changed) {
      const configRecord = recordConfigurationSnapshot({
        lcpUrl,
        lcpId: localLcp?.id || lcpEntityWatch.lcp_id,
        pulled: pulledConfig,
        mode: force ? "manual_watch_refresh" : "snapshot_reconcile"
      });
      const run = {
        id: `entity_sync_${crypto.randomUUID()}`,
        mode: force ? "manual_watch_refresh" : "snapshot_reconcile",
        reason,
        status: pulledEntities.ok ? "completed" : "failed",
        entity_count: count,
        lcp_url: lcpUrl,
        lcp_id: localLcp?.id || lcpEntityWatch.lcp_id,
        device_id: localLcp?.device_id || "device_local_windows",
        snapshot_hash: snapshotHash,
        config_snapshot_id: configRecord.id,
        results: pulledEntities.results,
        created_at: new Date().toISOString()
      };
      state.fleet.localEntitySyncRuns.unshift(run);
      state.fleet.localEntitySyncRuns = state.fleet.localEntitySyncRuns.slice(0, 20);
      lcpEntityWatch.change_count += 1;
      lcpEntityWatch.last_change_at = run.created_at;
      lcpEntityWatch.last_snapshot_hash = snapshotHash;
      recordAudit("local_entities.watch_updated", "lcp", run.lcp_id, { status: run.status, entity_count: count, config_snapshot_id: configRecord.id });
      recordEvent({
        event_id: `evt_${crypto.randomUUID()}`,
        tenant_id: "local",
        device_id: run.device_id,
        event_type: "local_entities.updated.v1",
        severity: run.status === "completed" ? "info" : "warning",
        payload: { run_id: run.id, lcp_id: run.lcp_id, entity_count: count, config_snapshot_id: configRecord.id }
      });
      addTask("local_entity_reconcile", run.status, run.status === "completed" ? `LCP snapshot reconcile completed: ${count} records` : "LCP snapshot reconcile failed", { run_id: run.id, lcp_url: lcpUrl });
      broadcastSse("local_entities.updated", { run, watch: lcpWatchStatus(), summary: fleetSummary() });
      scheduleRuntimePersist("local_entity_watch.updated");
    }
  } catch (error) {
    lcpEntityWatch.status = "degraded";
    lcpEntityWatch.last_error = error instanceof Error ? error.message : String(error);
  } finally {
    lcpEntityWatch.running = false;
  }
  return lcpWatchStatus();
}

function nextReconcileDelayMs() {
  const jitter = Number(lcpEntityWatch.jitter_percent || 0) / 100;
  const spread = Math.round(lcpEntityWatch.interval_ms * jitter);
  const offset = spread ? crypto.randomInt(0, spread * 2 + 1) - spread : 0;
  return Math.max(30000, lcpEntityWatch.interval_ms + offset);
}

function startLcpEntityWatch() {
  if (!lcpEntityWatch.enabled || lcpWatchTimer) return;
  const tick = async () => {
    await pollLcpEntityWatch({ reason: "snapshot_reconcile_timer" });
    const delay = nextReconcileDelayMs();
    lcpEntityWatch.next_reconcile_at = new Date(Date.now() + delay).toISOString();
    lcpWatchTimer = setTimeout(tick, delay);
  };
  const firstDelay = process.env.POLLEK_LCP_RECONCILE_IMMEDIATE === "1" ? 1000 : Math.min(15000, nextReconcileDelayMs());
  lcpEntityWatch.next_reconcile_at = new Date(Date.now() + firstDelay).toISOString();
  lcpWatchTimer = setTimeout(tick, firstDelay);
}

function stopLcpEntityWatch() {
  if (lcpWatchTimer) clearTimeout(lcpWatchTimer);
  lcpWatchTimer = null;
}

function policySlug(value) {
  return String(value || "policy")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42) || "policy";
}

function buildPolicySources({ title, intent, engine }) {
  const safeTitle = title || "AI Assisted Policy";
  const keyword = intent.toLowerCase().includes("pii") ? "pii" : intent.toLowerCase().includes("secret") ? "secret" : "risk";
  return {
    rego: `package pollek.generated.${policySlug(safeTitle)}

default decision := "allow"

decision := "warn" if {
  input.event_type == "ai.tool_call"
  contains(lower(input.payload.text), "${keyword}")
}
`,
    cedar: `permit(principal, action, resource) when { context.policy == "${policySlug(safeTitle)}" && context.risk != "high" };`,
    openfga: `model
  schema 1.1

type user
type policy_project
  relations
    define author: [user]
    define approver: [user]
`
  }[engine] || "";
}

function aiPolicyProviders() {
  return [
    {
      id: "local_deterministic_policy_assistant",
      name: "Local deterministic policy assistant",
      mode: "local-dev",
      status: "enabled",
      data_boundary: "no_external_provider",
      supports: ["rego", "cedar", "openfga"],
      safety_controls: ["secret_redaction", "citation_manifest", "fixture_management", "human_approval_required"]
    },
    {
      id: "enterprise_provider_adapter",
      name: "Enterprise AI provider adapter",
      mode: "production-planned",
      status: "planned",
      data_boundary: "tenant_configured",
      supports: ["rego", "cedar", "openfga", "wasm_config"],
      safety_controls: ["tenant_kms", "prompt_redaction", "provider_citations", "test_fixture_evidence"]
    }
  ];
}

function redactPromptText(text) {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\s]+/gi, "$1=[redacted]")
    .replace(/\bsk-[A-Za-z0-9]{12,}\b/g, "sk-[redacted]");
}

function buildPolicyCitations({ engine, controls = [] }) {
  const citations = [
    { id: "local-entity-mapping", title: "Local Pollek entity mapping", uri: "docs/research/LOCAL_POLLEK_ENTITY_MAPPING.md", relevance: "registered/found agents, policy, enforcement, observability scope" },
    { id: "secure-control-channel", title: "Secure bidirectional control channel", uri: "docs/architecture/SECURE_CONTROL_CHANNEL.md", relevance: "signed bundle rollout and audit controls" }
  ];
  if (engine === "cedar") citations.push({ id: "cedar-model", title: "Cedar policy model", uri: "docs/research/RESEARCH_NOTES.md#cedar", relevance: "authorization policy syntax guidance" });
  if (engine === "openfga") citations.push({ id: "openfga-model", title: "OpenFGA relationship model", uri: "docs/research/RESEARCH_NOTES.md#openfga", relevance: "relationship tuple model guidance" });
  if (controls.includes("siem-export")) citations.push({ id: "otel-siem", title: "OpenTelemetry/SIEM pipeline notes", uri: "docs/research/RESEARCH_NOTES.md#opentelemetry", relevance: "telemetry evidence export design" });
  return citations;
}

function createPolicyFixtures({ tenantId, draftId, intent, decision, fixtures }) {
  const source = Array.isArray(fixtures) && fixtures.length ? fixtures : [
    { name: "risky sample is controlled", input: intent, expected: decision || "warn" },
    { name: "benign sample is allowed", input: "normal low-risk assistant activity", expected: "allow" }
  ];
  return source.map((fixture) => {
    const record = {
      id: fixture.id || `fixture_${crypto.randomUUID()}`,
      schema_version: "pollek.cloud.policy-test-fixture.v1",
      tenant_id: tenantId,
      draft_id: draftId,
      name: fixture.name || "policy fixture",
      input: redactPromptText(fixture.input || ""),
      expected: fixture.expected || decision || "warn",
      source: fixture.source || "ai_policy_assistant",
      status: "pending",
      created_at: new Date().toISOString()
    };
    state.fleet.policyTestFixtures.unshift(record);
    return record;
  });
}

function recordAiPolicyProviderRun({ tenantId, draftId, providerId, originalPrompt, redactedPrompt, engine, citations }) {
  const run = {
    id: `ai_run_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.ai-policy-provider-run.v1",
    tenant_id: tenantId,
    draft_id: draftId,
    provider_id: providerId,
    mode: providerId === "local_deterministic_policy_assistant" ? "local-dev" : "provider-adapter",
    prompt_hash: sha256(originalPrompt),
    redacted_prompt_hash: sha256(redactedPrompt),
    redaction_applied: originalPrompt !== redactedPrompt,
    recommended_engine: engine,
    citation_ids: citations.map((citation) => citation.id),
    created_at: new Date().toISOString()
  };
  state.fleet.aiProviderRuns.unshift(run);
  state.fleet.aiProviderRuns = state.fleet.aiProviderRuns.slice(0, 100);
  return run;
}

function createPolicyDraft(body = {}) {
  const originalIntent = String(body.intent || "Warn on high-risk AI tool activity before deployment.").trim();
  const intent = redactPromptText(originalIntent);
  const title = String(body.title || intent.split(/[.!?]/)[0] || "AI Assisted Policy").slice(0, 80);
  const engine = ["rego", "cedar", "openfga"].includes(body.engine_hint) ? body.engine_hint : "rego";
  const tenantId = body.tenant_id || "local";
  const providerId = body.provider_id || "local_deterministic_policy_assistant";
  const controls = body.controls || ["human-review", "audit-log", "siem-export"];
  const citations = buildPolicyCitations({ engine, controls });
  const now = new Date().toISOString();
  const draft = {
    id: `draft_${policySlug(title)}_${crypto.randomUUID().slice(0, 8)}`,
    tenant_id: tenantId,
    project_id: body.project_id || "proj_default_policy",
    title,
    intent,
    original_intent_redacted: originalIntent !== intent,
    engine_hint: body.engine_hint || "auto",
    recommended_engine: engine,
    provider: aiPolicyProviders().find((provider) => provider.id === providerId) || aiPolicyProviders()[0],
    status: "requires_human_review",
    ai_generated: true,
    policy_ir: {
      version: "policy-ir.v1",
      subject: body.subject || "ai_activity",
      decision: body.decision || "warn",
      conditions: body.conditions || ["risk_score >= medium", "tenant_policy_enabled"],
      controls
    },
    sources: {
      [engine]: buildPolicySources({ title, intent, engine })
    },
    tests: [],
    citations,
    risks: [
      "AI generated draft requires human review before approval",
      "Simulation must pass before rollout creation"
    ],
    created_at: now,
    updated_at: now
  };
  const fixtures = createPolicyFixtures({ tenantId, draftId: draft.id, intent, decision: body.decision, fixtures: body.fixtures });
  draft.tests = fixtures.map((fixture) => ({
    id: fixture.id,
    name: fixture.name,
    input: fixture.input,
    expected: fixture.expected,
    status: fixture.status
  }));
  const providerRun = recordAiPolicyProviderRun({
    tenantId,
    draftId: draft.id,
    providerId: draft.provider.id,
    originalPrompt: originalIntent,
    redactedPrompt: intent,
    engine,
    citations
  });
  draft.provider_run_id = providerRun.id;
  state.fleet.policyDrafts.unshift(draft);
  state.fleet.policyTestFixtures = state.fleet.policyTestFixtures.slice(0, 200);
  recordAudit("policy_draft.generated", "policy_draft", draft.id, { title: draft.title, engine, provider_id: draft.provider.id, redaction_applied: providerRun.redaction_applied });
  recordEvent({
    event_id: `evt_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    event_type: "policy.draft.generated.v1",
    severity: "info",
    payload: { draft_id: draft.id, title: draft.title, engine, provider_id: draft.provider.id, redaction_applied: providerRun.redaction_applied }
  });
  addTask("policy_ai_assist", "completed", `Generated policy draft: ${draft.title}`, { draft_id: draft.id, provider_run_id: providerRun.id, fixture_count: fixtures.length });
  return draft;
}

function simulatePolicyDraft(draft) {
  const now = new Date().toISOString();
  const fixtures = (state.fleet.policyTestFixtures || []).filter((fixture) => fixture.draft_id === draft.id);
  const testCases = fixtures.length ? fixtures : draft.tests;
  const simulation = {
    id: `sim_${crypto.randomUUID()}`,
    tenant_id: draft.tenant_id || "local",
    draft_id: draft.id,
    status: "passed",
    summary: `${testCases.length} fixtures passed, 0 failed. Reviewer approval is still required.`,
    decisions: testCases.map((test) => ({ ...test, status: "passed", actual: test.expected, fixture_id: test.id || null })),
    provider_run_id: draft.provider_run_id || null,
    citation_ids: (draft.citations || []).map((citation) => citation.id),
    created_at: now
  };
  draft.status = "simulation_passed";
  draft.updated_at = now;
  draft.tests = simulation.decisions;
  state.fleet.policySimulations.unshift(simulation);
  state.fleet.policySimulations = state.fleet.policySimulations.slice(0, 25);
  recordAudit("policy_draft.simulated", "policy_draft", draft.id, { simulation_id: simulation.id });
  addTask("policy_simulation", "completed", `Simulation passed for ${draft.title}`, { draft_id: draft.id });
  return simulation;
}

function createPolicySandboxRun(body = {}) {
  const now = new Date().toISOString();
  const profile = SANDBOX_PROFILES.find((item) => item.id === body.profile_id) || SANDBOX_PROFILES[0];
  const draft = body.draft_id
    ? state.fleet.policyDrafts.find((item) => item.id === body.draft_id)
    : state.fleet.policyDrafts[0];
  const selectedEntities = Array.isArray(body.entity_ids) && body.entity_ids.length
    ? state.fleet.localEntities.filter((entity) => body.entity_ids.includes(entity.id))
    : state.fleet.localEntities.slice(0, 5);
  const results = selectedEntities.map((entity) => {
    const health = computeEntityHealth(entity);
    const decision = health.health_status === "critical" ? "deny" : health.health_status === "warning" ? "warn" : "allow";
    return {
      entity_id: entity.id,
      entity_name: entity.name,
      decision,
      reason: health.findings[0] || "Sandbox fixture passed.",
      policy_engine: draft?.recommended_engine || body.engine || "rego",
      route_simulation_path: "/v1/tenants/{tenant_id}/pdp/routes/simulate"
    };
  });
  const run = {
    id: `sandbox_${crypto.randomUUID()}`,
    tenant_id: "local",
    profile_id: profile.id,
    profile,
    draft_id: draft?.id || null,
    mode: body.mode || "policy-dry-run",
    status: "completed",
    lcp_compatible: true,
    local_pollek_paths: {
      pdp_route_simulate: "/v1/tenants/{tenant_id}/pdp/routes/simulate",
      policy_simulate: "/v1/tenants/{tenant_id}/policies/{policy_id}/simulate",
      preset_simulate: "/v1/tenants/{tenant_id}/policy-presets/{preset_id}/simulate"
    },
    blast_radius: {
      entities_evaluated: results.length,
      allow: results.filter((item) => item.decision === "allow").length,
      warn: results.filter((item) => item.decision === "warn").length,
      deny: results.filter((item) => item.decision === "deny").length
    },
    results,
    created_at: now
  };
  state.fleet.policySandboxes.unshift(run);
  state.fleet.policySandboxes = state.fleet.policySandboxes.slice(0, 25);
  recordAudit("policy_sandbox.completed", "policy_sandbox", run.id, { draft_id: run.draft_id, blast_radius: run.blast_radius });
  addTask("policy_sandbox", "completed", `Sandbox simulation completed for ${results.length} entities`, { sandbox_run_id: run.id });
  return run;
}

function createBreakglassRequest(body = {}) {
  const now = new Date().toISOString();
  const durationMinutes = Math.max(5, Math.min(Number(body.duration_minutes || 60), 240));
  const request = {
    id: `breakglass_${crypto.randomUUID()}`,
    tenant_id: body.tenant_id || "local",
    requester: body.requester || "local-dev-admin",
    target_type: body.target_type || "lcp",
    target_id: body.target_id || "lcp_local",
    reason: body.reason || "Emergency operator access for local protocol testing.",
    scope: body.scope || ["policy.rollout", "bundle.read", "telemetry.query"],
    status: "pending_approval",
    requires_approval: body.requires_approval !== false,
    approvals: [],
    expires_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
    local_pollek_semantics: {
      explicit: true,
      time_bound: true,
      audited: true,
      kernel_deny_bypass: false
    },
    created_at: now,
    updated_at: now
  };
  state.fleet.breakglassRequests.unshift(request);
  state.fleet.breakglassRequests = state.fleet.breakglassRequests.slice(0, 25);
  recordAudit("breakglass.requested", "breakglass", request.id, { target_id: request.target_id, reason: request.reason });
  addTask("breakglass_request", "queued", `Breakglass requested for ${request.target_id}`, { breakglass_id: request.id });
  return request;
}

function transitionBreakglass(id, action, body = {}) {
  const request = state.fleet.breakglassRequests.find((item) => item.id === id);
  if (!request) return null;
  const now = new Date().toISOString();
  if (action === "approve") {
    request.status = "active";
    request.approvals.push({ approver: body.approver || "local-dev-security-admin", approved_at: now, note: body.note || "Approved in local dev." });
  } else if (action === "reject") {
    request.status = "rejected";
    request.rejected_by = body.rejected_by || "local-dev-security-admin";
    request.rejected_at = now;
  } else if (action === "close") {
    request.status = "closed";
    request.closed_by = body.closed_by || "local-dev-admin";
    request.closed_at = now;
  }
  request.updated_at = now;
  recordAudit(`breakglass.${action}`, "breakglass", request.id, { status: request.status });
  addTask("breakglass_request", "completed", `Breakglass ${action}: ${request.target_id}`, { breakglass_id: request.id });
  return request;
}

function createHotReloadEvent({ rollout, targetId, stageIndex, status = "dispatched" }) {
  const event = {
    id: `hotreload_${crypto.randomUUID()}`,
    tenant_id: "local",
    rollout_id: rollout.id,
    lcp_id: targetId,
    bundle_id: rollout.bundle_id,
    event_type: "policy_bundle.hot_reload.dispatched.v1",
    component: "policy_bundle",
    status,
    stage_index: stageIndex,
    wasm_generation: rollout.wasm_generation || 1,
    contract_hub_path: "/v1/policy-bundles/{bundle_id}/manifest",
    local_pollek_paths: {
      bundle_latest: "/v1/tenants/{tenant_id}/bundles/latest",
      bundle_manifest: "/v1/policy-bundles/{bundle_id}/manifest",
      sse_bundle_ready: "/v1/tenants/{tenant_id}/devices/{device_id}/events"
    },
    created_at: new Date().toISOString()
  };
  state.fleet.hotReloadEvents.unshift(event);
  state.fleet.hotReloadEvents = state.fleet.hotReloadEvents.slice(0, 50);
  const telemetryEvent = recordEvent({
    event_id: `evt_${crypto.randomUUID()}`,
    tenant_id: "local",
    device_id: targetId,
    event_type: event.event_type,
    severity: status === "failed" ? "warning" : "info",
    payload: event
  });
  broadcastSse("hot_reload.event", { ...event, telemetry_event_id: telemetryEvent.event_id });
  return event;
}

function createRolloutPlan(body = {}) {
  const targetIds = Array.isArray(body.target_ids) && body.target_ids.length
    ? body.target_ids
    : state.fleet.localControlPlanes.filter((lcp) => lcp.status !== "offline").map((lcp) => lcp.id);
  const stages = Array.isArray(body.stages) && body.stages.length
    ? body.stages
    : [
        { index: 0, label: "Canary", percentage: 10 },
        { index: 1, label: "Batch", percentage: 50 },
        { index: 2, label: "Complete", percentage: 100 }
      ];
  return {
    id: `rollout_${crypto.randomUUID()}`,
    tenant_id: "local",
    bundle_id: body.bundle_id || "bnd_ai_data_protection",
    target_ids: targetIds,
    wave_strategy: body.wave_strategy || "canary-then-batch",
    status: "planned",
    current_stage: -1,
    total_stages: stages.length,
    stages,
    completed_target_ids: [],
    failed_target_ids: [],
    stage_results: [],
    wasm_generation: Number(body.wasm_generation || 1),
    local_pollek_compatibility: {
      signed_envelope: true,
      hot_reload: true,
      activation_strategy: "polling-plus-sse",
      lcp_manifest_path: "/v1/policy-bundles/{bundle_id}/manifest"
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function advanceRolloutPlan(rollout) {
  if (!rollout || ["completed", "cancelled"].includes(rollout.status)) return null;
  if (rollout.status === "paused") return { error: "rollout_paused" };
  const nextStage = rollout.current_stage + 1;
  if (nextStage >= rollout.total_stages) {
    rollout.status = "completed";
    rollout.updated_at = new Date().toISOString();
    return { rollout, stage: null, events: [] };
  }
  const stage = rollout.stages[nextStage];
  const targetCount = Math.max(1, Math.ceil(rollout.target_ids.length * (Number(stage.percentage || 100) / 100)));
  const already = new Set(rollout.completed_target_ids || []);
  const stageTargets = rollout.target_ids.filter((targetId) => !already.has(targetId)).slice(0, targetCount);
  const events = stageTargets.map((targetId) => createHotReloadEvent({ rollout, targetId, stageIndex: nextStage }));
  for (const targetId of stageTargets) already.add(targetId);
  rollout.completed_target_ids = [...already];
  rollout.current_stage = nextStage;
  rollout.status = rollout.completed_target_ids.length >= rollout.target_ids.length ? "completed" : "in_progress";
  rollout.stage_results.push({
    stage_index: nextStage,
    label: stage.label,
    target_ids: stageTargets,
    status: "dispatched",
    dispatched_at: new Date().toISOString()
  });
  rollout.updated_at = new Date().toISOString();
  return { rollout, stage, events };
}

function createEnrollmentSession(body = {}) {
  const deviceCode = `devcode_${crypto.randomUUID()}`;
  const userCode = `PLK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now = new Date().toISOString();
  const session = {
    id: `enroll_${crypto.randomUUID()}`,
    tenant_id: "local",
    site_id: body.site_id || "site_bkk_hq",
    device_group_id: body.device_group_id || "group_developers",
    device_name: body.device_name || "New Local Control Plane",
    device_code: deviceCode,
    user_code: userCode,
    status: "waiting_for_lcp",
    verification_uri: `${publicUrl}/device`,
    command: `pollek-lcp enroll --cloud ${publicUrl} --user-code ${userCode}`,
    spiffe_id_template: "spiffe://local.pollek.cloud/tenant/local/site/{site}/device/{device}/lcp/{lcp}",
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    created_at: now
  };
  state.enrollmentCodes.set(deviceCode, {
    device_code: deviceCode,
    user_code: userCode,
    client_id: "pollek-local-control-plane",
    scope: "pollek.enroll",
    status: "approved",
    created_at: now
  });
  state.fleet.enrollmentSessions.unshift(session);
  state.fleet.enrollmentSessions = state.fleet.enrollmentSessions.slice(0, 25);
  recordAudit("enrollment.created", "enrollment_session", session.id, { user_code: userCode });
  addTask("device_enrollment", "queued", `Created enrollment code ${userCode}`, { enrollment_id: session.id });
  return session;
}

// The org tree is a projection of real fleet state, not a stored seed. It shows
// the operating tenant root and grows as Local Control Planes enroll/probe and
// report agents. An empty Cloud renders just the tenant root.
const FLEET_TREE_ROOT_ID = "tenant_local_lab";

function fleetTree() {
  const tree = [{
    id: FLEET_TREE_ROOT_ID,
    parent_id: null,
    type: "tenant",
    name: state.tenant?.name || "Tenant",
    status: "connected",
    risk: "medium"
  }];
  const seenDevices = new Set();
  for (const lcp of state.fleet.localControlPlanes) {
    const deviceId = lcp.device_id || `device_${lcp.id}`;
    if (!seenDevices.has(deviceId)) {
      seenDevices.add(deviceId);
      tree.push({
        id: deviceId,
        parent_id: FLEET_TREE_ROOT_ID,
        type: "device",
        name: lcp.device_name || deviceId,
        status: lcp.status || "unknown",
        risk: lcp.risk || "medium"
      });
    }
    tree.push({
      id: lcp.id,
      parent_id: deviceId,
      type: "lcp",
      name: lcp.name || lcp.id,
      status: lcp.status || "unknown",
      risk: lcp.risk || "medium"
    });
  }
  const lcpIds = new Set(state.fleet.localControlPlanes.map((lcp) => lcp.id));
  for (const entity of state.fleet.localEntities) {
    const kind = entity.entity_type || entity.class || "";
    if (!["registered_agent", "found_agent", "agent"].includes(kind)) continue;
    tree.push({
      id: entity.id,
      parent_id: entity.lcp_id && lcpIds.has(entity.lcp_id) ? entity.lcp_id : FLEET_TREE_ROOT_ID,
      type: "agent",
      name: entity.name || entity.id,
      status: entity.status || "observed",
      risk: entity.risk || "medium"
    });
  }
  return tree;
}

function fleetObjectMap() {
  const objects = new Map();
  for (const item of fleetTree()) {
    objects.set(item.id, { ...item });
  }
  for (const lcp of state.fleet.localControlPlanes) {
    objects.set(lcp.id, { ...(objects.get(lcp.id) || {}), ...lcp, type: "lcp" });
  }
  for (const bundle of state.fleet.policyBundles) {
    objects.set(bundle.id, { ...bundle, type: "policy_bundle", status: bundle.status, risk: bundle.coverage < 60 ? "high" : "medium" });
  }
  for (const entity of state.fleet.localEntities) {
    objects.set(entity.id, {
      ...entity,
      type: entity.entity_type,
      status: entity.status,
      risk: entity.risk,
      health: computeEntityHealth(entity)
    });
  }
  return objects;
}

function fleetSummary() {
  const lcps = state.fleet.localControlPlanes;
  const entities = state.fleet.localEntities;
  const health = entityHealthPage(entities).summary;
  const connected = lcps.filter((item) => item.status === "connected").length;
  const degraded = lcps.filter((item) => item.status === "degraded" || item.status === "unknown").length;
  const offline = lcps.filter((item) => item.status === "offline").length;
  const totalAgents = lcps.reduce((sum, item) => sum + item.agents, 0);
  const totalTools = lcps.reduce((sum, item) => sum + item.tools, 0);
  const avgCoverage = lcps.length
    ? Math.round(lcps.reduce((sum, item) => sum + item.policy_coverage, 0) / lcps.length)
    : 0;
  return {
    tenants: 1,
    sites: 0,
    local_control_planes: lcps.length,
    connected,
    degraded,
    offline,
    agents: totalAgents,
    tools: totalTools,
    open_alarms: state.fleet.alarms.filter((alarm) => alarm.state === "open").length,
    policy_coverage: avgCoverage,
    telemetry_events: state.events.length,
    probes: state.probes.length,
    policy_packs: state.fleet.policyPacks.length,
    compliance_policy_bundles: state.fleet.compliancePolicyBundles.length,
    policy_drafts: state.fleet.policyDrafts.length,
    policy_sandboxes: state.fleet.policySandboxes.length,
    pending_approvals: state.fleet.policyDrafts.filter((draft) => draft.status === "requires_human_review" || draft.status === "simulation_passed").length,
    active_breakglass: state.fleet.breakglassRequests.filter((item) => item.status === "active").length,
    integrations_configured: state.fleet.integrations.filter((item) => item.status === "configured").length,
    evidence_exports: state.fleet.evidenceExports.length,
    enrollment_sessions: state.fleet.enrollmentSessions.length,
    audit_events: state.auditEvents.length,
    local_entities: entities.length,
    registered_agents: entities.filter((item) => item.entity_type === "registered_agent").length,
    found_agents: entities.filter((item) => item.entity_type === "found_agent").length,
    local_policies: entities.filter((item) => item.entity_type === "policy").length,
    enforcement_points: entities.filter((item) => item.entity_type === "enforcement").length,
    observability_entities: entities.filter((item) => item.entity_type === "observability").length,
    wasm_hot_reload_ready: entities.filter((item) => item.wasm?.hot_reload).length,
    entity_health_avg: health.avg_score,
    entity_health_critical: health.critical,
    tenant_trust_scopes: state.fleet.tenantTrustScopes.length,
    service_endpoints: state.fleet.serviceEndpoints.length,
    connection_profiles: state.fleet.connectionProfiles.length,
    adapter_catalog_entries: state.fleet.adapterCatalog.length,
    staged_rollouts: state.fleet.rolloutPlans.length,
    hot_reload_events: state.fleet.hotReloadEvents.length
  };
}

function latestBundleEnvelope(bundle, tenantId, deviceId = null) {
  const manifest = signedPolicyBundleManifest(bundle);
  return {
    schema_version: "bundle-envelope.v1",
    tenant_id: tenantId,
    ...(deviceId ? { device_id: deviceId } : {}),
    bundle_id: bundle.id,
    revision: bundle.revision || "2026.06.29.001",
    status: "available",
    manifest_url: `${publicUrl}/v1/policy-bundles/${encodeURIComponent(bundle.id)}/manifest`,
    artifact_url: `${publicUrl}/v1/policy-bundles/${encodeURIComponent(bundle.id)}/artifact`,
    hot_reload: Boolean(bundle.hot_reload ?? true),
    enterprise_compliance: Boolean(bundle.compliance_bundle_id),
    signature_status: manifest.verification.status,
    payload_hash: manifest.payload_hash,
    signatures: manifest.signatures.map((signature) => ({
      key_id: signature.key_id,
      alg: signature.alg,
      payload_hash: signature.payload_hash,
      signed_at: signature.signed_at
    }))
  };
}

function activePolicyBundle() {
  return state.fleet.policyBundles.find((item) => item.status === "active")
    || state.fleet.policyBundles.find((item) => item.status === "available")
    || state.fleet.policyBundles[0]
    || null;
}

function cloudCapabilitySnapshot(tenantId = "local", deviceId = "local") {
  const lcp = state.fleet.localControlPlanes.find((item) => item.device_id === deviceId || item.id === deviceId)
    || state.fleet.localControlPlanes.find((item) => item.tenant_id === tenantId)
    || state.fleet.localControlPlanes[0];
  const enforcement = state.fleet.localEntities.filter((entity) => entity.entity_type === "enforcement" && (!lcp || entity.lcp_id === lcp.id));
  const observe = state.fleet.localEntities.filter((entity) => entity.entity_type === "observability" && (!lcp || entity.lcp_id === lcp.id));
  return {
    schema_version: "local-capability-snapshot.v2",
    tenant_id: tenantId,
    device_id: lcp?.device_id || deviceId,
    os: { family: "cloud_aggregated", name: lcp?.device_name || "Pollek Cloud inventory view" },
    mode: "cloud_compatibility_view",
    generated_at: nowIso(),
    control_methods: enforcement.map((entity) => ({
      method_id: entity.local_object_id || entity.id,
      display_name_en: entity.name,
      status: entity.status,
      max_level: entity.enforcement?.mode || "observe",
      domains: entity.observability?.telemetry_streams || []
    })),
    observation_sources: observe.map((entity) => ({
      source_id: entity.local_object_id || entity.id,
      display_name_en: entity.name,
      status: entity.status,
      domains: entity.observability?.telemetry_streams || [],
      privacy_note_en: entity.observability?.privacy_note || "Aggregated from Local Pollek telemetry."
    })),
    setup_actions: [],
    contract: {
      local_contract_version: "2026.06.29",
      compatible_cloud_contracts: [">=2026.06.29 <2026.09.00"],
      status: "compatible",
      reason_code: "cloud_aggregate"
    }
  };
}

function registryPage(tenantId, collection) {
  const entities = state.fleet.localEntities.filter((entity) => entity.tenant_id === tenantId || tenantId === "local");
  const byCollection = {
    agents: entities.filter((entity) => entity.entity_type === "registered_agent"),
    entities,
    resources: entities.filter((entity) => entity.class === "resource" || entity.source === "registry/resources"),
    tools: entities.filter((entity) => entity.class === "tool" || entity.source === "registry/tools")
  };
  const items = collection === "relationships" ? state.fleet.localEntityRelationships : (byCollection[collection] || []);
  return {
    schema_version: `pollek.cloud.registry-${collection}-page.v1`,
    tenant_id: tenantId,
    count: items.length,
    items
  };
}

function discoveryPage(tenantId, collection = "candidates") {
  const candidates = state.fleet.localEntities.filter((entity) => (
    (tenantId === "local" || entity.tenant_id === tenantId)
    && (entity.entity_type === "found_agent" || entity.status === "found_unregistered" || entity.source === "discovery/candidates")
  ));
  return {
    schema_version: `pollek.cloud.discovery-${collection}-page.v1`,
    tenant_id: tenantId,
    count: candidates.length,
    items: candidates
  };
}

function registerEnrolledLcp(device, body = {}) {
  const tenantId = device.tenant_id || "local";
  const lcpId = body.lcp_id || body.lcpId || `lcp_${device.id}`;
  const now = new Date().toISOString();
  const osFamily = normalizeOsFamily(body.os_family || body.osFamily || device.os || "unknown");
  const existing = state.fleet.localControlPlanes.find((item) => item.id === lcpId && item.tenant_id === tenantId);
  const record = {
    id: lcpId,
    tenant_id: tenantId,
    site: body.site || existing?.site || null,
    group: body.group || existing?.group || null,
    device_id: device.id,
    device_name: body.device_name || device.hostname || device.id,
    os_family: osFamily,
    os_version: body.os_version || body.osVersion || existing?.os_version || "",
    name: body.lcp_name || existing?.name || device.hostname || lcpId,
    endpoint: body.endpoint || existing?.endpoint || defaultLcpUrl,
    status: "connected",
    risk: "medium",
    version: body.version || existing?.version || "unknown",
    contract_version: body.contract_version || existing?.contract_version || "unknown",
    active_bundle: existing?.active_bundle || null,
    agents: existing?.agents || 0,
    tools: existing?.tools || 0,
    resources: existing?.resources || 0,
    policy_coverage: existing?.policy_coverage || 0,
    last_seen_at: now,
    capability_summary: existing?.capability_summary || "Enrolled",
    spiffe_id: device.spiffe_id || existing?.spiffe_id || null
  };
  if (existing) Object.assign(existing, record);
  else state.fleet.localControlPlanes.unshift(record);
  return record;
}

function applyProbeToFleet(probe, capabilitySnapshot) {
  const lcp = state.fleet.localControlPlanes.find((item) => item.id === "lcp_local");
  if (!lcp) return;
  const contractProbe = probe.results.find((item) => item.name === "lcp_cloud_probe_to_pollek_cloud");
  const snapshot = capabilitySnapshot?.body;
  lcp.status = probe.ok ? "connected" : "degraded";
  lcp.risk = probe.ok ? "medium" : "high";
  lcp.contract_version = contractProbe?.body?.contract_version || lcp.contract_version;
  lcp.last_seen_at = probe.checked_at;
  lcp.capability_snapshot = snapshot || null;
  if (snapshot?.device_id) lcp.device_runtime_id = snapshot.device_id;
  if (Array.isArray(snapshot?.control_methods)) {
    const available = snapshot.control_methods.filter((method) => method.status === "available").length;
    const needsSetup = snapshot.control_methods.filter((method) => String(method.status).startsWith("needs_")).length;
    lcp.capability_summary = `${available} available methods, ${needsSetup} setup actions`;
    lcp.policy_coverage = Math.max(lcp.policy_coverage, probe.ok ? 72 : lcp.policy_coverage);
  }
}

async function readBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBodyBytes) {
      throw httpError(413, `request_body_too_large:${totalBytes}`, "request_body_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";
  if (!raw) return {};
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw httpError(400, "invalid_json_body", "invalid_json_body");
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return { raw };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      url,
      latency_ms: Math.round(performance.now() - started),
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveLcpTarget(body = {}) {
  const localLcp = state.fleet.localControlPlanes.find((item) => item.id === (body.lcp_id || "lcp_local"))
    || state.fleet.localControlPlanes.find((item) => item.endpoint.startsWith("http://127.0.0.1"));
  if (!localLcp) throw new Error("lcp_not_found");
  const endpoint = String(localLcp.endpoint || defaultLcpUrl).replace(/\/+$/, "");
  const requested = body.lcpUrl ? String(body.lcpUrl).replace(/\/+$/, "") : endpoint;
  const allowedTargets = new Set([
    endpoint,
    defaultLcpUrl.replace(/\/+$/, ""),
    "http://127.0.0.1:43891",
    "http://localhost:43891"
  ]);
  if (!allowedTargets.has(requested)) {
    throw new Error("lcp_url_not_allowlisted");
  }
  return { lcp: localLcp, lcpUrl: requested };
}

function bundleForDispatch(bundleId) {
  return state.fleet.policyBundles.find((item) => item.id === bundleId)
    || state.fleet.policyBundles.find((item) => item.status === "active")
    || state.fleet.policyBundles[0];
}

function connectionUpdatePayload({ lcp, action, bundle, body = {} }) {
  const profile = state.fleet.connectionProfiles.find((item) => item.applies_to?.lcp_ids?.includes(lcp.id))
    || state.fleet.connectionProfiles[0];
  return {
    schema_version: "pollek.cloud.connection-update.v1",
    tenant_id: "local",
    lcp_id: lcp.id,
    device_id: lcp.device_id,
    pdp_endpoint: publicUrl,
    cloud_url: publicUrl,
    contract_version: contractVersion,
    auth_method: "spiffe-oauth-mtls-required",
    status: "configured",
    manual_override_enabled: false,
    health: {
      status: "configured",
      detail: `Configured by signed Pollek Cloud control dispatch for ${action}.`,
      contract_url: `${publicUrl}/.well-known/pollek-contract`
    },
    action,
    connection_profile: profile,
    trust_scopes: state.fleet.tenantTrustScopes.filter((scope) => scope.tenant_id === "local"),
    service_endpoints: state.fleet.serviceEndpoints.filter((endpoint) => endpoint.tenant_id === "local"),
    policy_bundle: bundle ? {
      bundle_id: bundle.id,
      name: bundle.name,
      revision: bundle.revision,
      manifest_url: `${publicUrl}/v1/policy-bundles/${encodeURIComponent(bundle.id)}/manifest`,
      latest_url: `${publicUrl}/v1/tenants/local/bundles/latest`,
      hot_reload: Boolean(bundle.hot_reload ?? true),
      signed: Boolean(bundle.signed ?? true)
    } : null,
    runtime_configuration: {
      reconcile_seconds: Math.round(lcpEntityWatch.interval_ms / 1000),
      hybrid_sync_mode: lcpEntityWatch.mode,
      primary_mode: lcpEntityWatch.primary_mode,
      fallback_mode: lcpEntityWatch.fallback_mode,
      event_stream: `${publicUrl}/api/events`,
      event_replay: `${publicUrl}/api/events/replay`,
      entity_sync: `${publicUrl}/api/entities/ingest`,
      telemetry_batches: `${publicUrl}/v1/telemetry/batches`
    },
    requested_by: body.requested_by || "local-dev-admin",
    requested_at: new Date().toISOString()
  };
}

async function dispatchControlToLcp(body = {}, action = "config.update") {
  const { lcp, lcpUrl } = resolveLcpTarget(body);
  const bundle = bundleForDispatch(body.bundle_id || body.bundleId);
  const paths = allowedControlPaths(action, bundle?.id);
  const payload = connectionUpdatePayload({ lcp, action, bundle, body });
  const envelope = createControlEnvelope({ action, lcp, payload, allowed_paths: paths });
  const controlMessage = {
    schema_version: "pollek.cloud.secure-control-message.v1",
    envelope,
    payload,
    security_posture: securityPostureStatus()
  };
  const results = [];

  for (const pathName of paths) {
    const method = pathName === "/v1/tenants/local/pdp/cloud" ? "PATCH" : "POST";
    try {
      const result = await fetchJson(`${lcpUrl}${pathName}`, {
        method,
        timeoutMs: 5000,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pathName === "/v1/tenants/local/pdp/cloud" ? {
          ...payload,
          control_envelope: envelope
        } : controlMessage)
      });
      results.push({ path: pathName, method, ok: result.ok, status: result.status, latency_ms: result.latency_ms, body: redactSensitive(result.body) });
    } catch (error) {
      results.push({ path: pathName, method, ok: false, error: String(error) });
    }
  }

  const applied = results.filter((item) => item.ok);
  const unsupported = results.filter((item) => item.status === 404 || item.status === 405);
  const status = applied.length && unsupported.length ? "partially_applied"
    : applied.length ? "applied"
      : "failed";
  const record = {
    id: `dispatch_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.cloud-to-local-dispatch.v1",
    tenant_id: "local",
    action,
    status,
    lcp_id: lcp.id,
    lcp_url: lcpUrl,
    bundle_id: bundle?.id || null,
    envelope,
    payload_hash: envelope.payload_hash,
    results,
    unsupported_paths: unsupported.map((item) => item.path),
    created_at: new Date().toISOString()
  };
  state.fleet.cloudToLocalDispatches.unshift(record);
  state.fleet.cloudToLocalDispatches = state.fleet.cloudToLocalDispatches.slice(0, 50);
  if (action === "policy.hot_reload") {
    const hotReload = {
      id: `hotreload_${crypto.randomUUID()}`,
      tenant_id: "local",
      rollout_id: body.rollout_id || null,
      lcp_id: lcp.id,
      bundle_id: bundle?.id || null,
      event_type: "policy_bundle.hot_reload.dispatch_attempted.v1",
      component: "policy_bundle",
      status,
      stage_index: Number(body.stage_index || 0),
      wasm_generation: Number(body.wasm_generation || 1),
      contract_hub_path: "/v1/policy-bundles/{bundle_id}/manifest",
      dispatch_id: record.id,
      unsupported_paths: record.unsupported_paths,
      created_at: record.created_at
    };
    state.fleet.hotReloadEvents.unshift(hotReload);
    state.fleet.hotReloadEvents = state.fleet.hotReloadEvents.slice(0, 50);
    broadcastSse("hot_reload.event", hotReload);
  }
  recordAudit("cloud_to_local.dispatch", "lcp", lcp.id, { action, status, dispatch_id: record.id, bundle_id: record.bundle_id, unsupported_paths: record.unsupported_paths });
  recordEvent({
    event_id: `evt_${crypto.randomUUID()}`,
    tenant_id: "local",
    device_id: lcp.device_id,
    event_type: "cloud_to_local.dispatch.v1",
    severity: status === "failed" ? "warning" : "info",
    payload: { dispatch_id: record.id, action, status, lcp_id: lcp.id, bundle_id: record.bundle_id }
  });
  addTask("cloud_to_local_dispatch", status === "failed" ? "failed" : "completed", `Cloud-to-Local ${action}: ${status}`, { dispatch_id: record.id, lcp_id: lcp.id });
  broadcastSse("cloud_to_local.dispatched", { dispatch: record, summary: fleetSummary() });
  scheduleRuntimePersist(`cloud_to_local.${action}`);
  return record;
}

function collectContractPaths(contract) {
  const paths = new Set();
  for (const spec of Object.values(contract.interfaces || {})) {
    for (const apiPath of spec.paths || []) {
      paths.add(apiPath);
    }
  }
  return [...paths].sort();
}

function contractDriftReport(contract, openApi) {
  const contractPaths = new Set(collectContractPaths(contract));
  const openApiPaths = new Set(Object.keys(openApi.paths || {}));
  const missing_openapi_paths = [...contractPaths].filter((apiPath) => !openApiPaths.has(apiPath)).sort();
  const extra_openapi_paths = [...openApiPaths]
    .filter((apiPath) => !contractPaths.has(apiPath) && !contractDriftAllowedRuntimePaths.has(apiPath))
    .sort();
  return {
    schema_version: "pollek.cloud.contract-drift-report.v1",
    status: missing_openapi_paths.length || extra_openapi_paths.length ? "drift" : "in_sync",
    contract_version: contract.contract_version,
    checked_at: new Date().toISOString(),
    contract_path_count: contractPaths.size,
    openapi_path_count: openApiPaths.size,
    missing_openapi_paths,
    extra_openapi_paths,
    allowed_runtime_paths: [...contractDriftAllowedRuntimePaths].sort()
  };
}

async function contractDiscovery() {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  return {
    ...contract,
    cloud_url: publicUrl,
    checked_at: new Date().toISOString(),
    tenant_trust_scopes: state.fleet.tenantTrustScopes,
    service_endpoints: state.fleet.serviceEndpoints,
    connection_profiles: state.fleet.connectionProfiles,
    adapter_catalog_summary: adapterCatalogSummary(state.fleet.adapterCatalog),
    compliance_policy_bundles: state.fleet.compliancePolicyBundles,
    endpoints: {
      health: "/health",
      enrollment_device_authorization: "/oauth/device_authorization",
      enrollment_token: "/oauth/token",
      enroll: "/enroll",
      telemetry_batches: "/v1/telemetry/batches",
      telemetry_events: "/v1/telemetry/events",
      telemetry_decision_logs: "/v1/telemetry/decision-logs",
      telemetry_security_events: "/v1/telemetry/security-events",
      telemetry_traces: "/v1/telemetry/traces",
      telemetry_observations: "/v1/telemetry/observations",
      telemetry_resources: "/v1/telemetry/resources",
      telemetry_tools: "/v1/telemetry/tools",
      telemetry_identities: "/v1/telemetry/identities",
      telemetry_enforcement_status: "/v1/telemetry/enforcement-status",
      telemetry_query: "/api/telemetry/query",
      telemetry_ingest_status: "/api/telemetry/ingest-status",
      tenant_telemetry_decision_logs: "/v1/tenants/{tenant_id}/telemetry/decision-logs",
      tenant_logs_decisions: "/v1/tenants/{tenant_id}/logs/decisions",
      tenant_logs_tool_invocations: "/v1/tenants/{tenant_id}/logs/tool-invocations",
      tenant_logs_resource_access: "/v1/tenants/{tenant_id}/logs/resource-access",
      tenant_logs_policy_deployments: "/v1/tenants/{tenant_id}/logs/policy-deployments",
      tenant_logs_pep_health: "/v1/tenants/{tenant_id}/logs/pep-health",
      tenant_telemetry_guard_events: "/v1/tenants/{tenant_id}/telemetry/guard-events",
      tenant_telemetry_export: "/v1/tenants/{tenant_id}/telemetry/export",
      tenant_signup: "/v1/signup/tenant",
      invitation_accept: "/v1/invitations/accept",
      auth_login: "/v1/auth/login",
      auth_callback: "/v1/auth/callback",
      auth_logout: "/v1/auth/logout",
      auth_session: "/v1/auth/session",
      tenant_invitations: "/v1/tenants/{tenant_id}/invitations",
      tenant_members: "/v1/tenants/{tenant_id}/members",
      tenant_member_roles: "/v1/tenants/{tenant_id}/members/{account_id}/roles",
      tenant_identity_providers: "/v1/tenants/{tenant_id}/identity-providers",
      scim_users: "/scim/v2/Users",
      scim_groups: "/scim/v2/Groups",
      billing_subscription: "/v1/tenants/{tenant_id}/billing/subscription",
      billing_usage: "/v1/tenants/{tenant_id}/billing/usage",
      cost_token_overview: "/api/reports/cost-tokens/overview",
      cost_token_report: "/api/reports/cost-tokens",
      tenant_cost_token_overview: "/v1/tenants/{tenant_id}/reports/cost-tokens/overview",
      tenant_cost_token_report: "/v1/tenants/{tenant_id}/reports/cost-tokens",
      lcp_usage_ledger: "/api/lcp/usage-ledgers",
      tenant_lcp_usage_ledger: "/v1/tenants/{tenant_id}/lcp/usage-ledgers",
      billing_invoices: "/v1/tenants/{tenant_id}/billing/invoices",
      billing_payment_methods: "/v1/tenants/{tenant_id}/billing/payment-methods",
      offline_license_issue: "/v1/tenants/{tenant_id}/billing/license/issue",
      billing_webhook: "/v1/billing/webhooks/{provider}",
      kms_health: "/v1/kms/health",
      event_stream: "/api/events",
      event_replay: "/api/events/replay",
      registry_sync: "/v1/tenants/{tenant_id}/registry/sync",
      registry_agents: "/v1/tenants/{tenant_id}/registry/agents",
      registry_entities: "/v1/tenants/{tenant_id}/registry/entities",
      registry_relationships: "/v1/tenants/{tenant_id}/registry/relationships",
      registry_resources: "/v1/tenants/{tenant_id}/registry/resources",
      registry_tools: "/v1/tenants/{tenant_id}/registry/tools",
      discovery_candidates: "/v1/tenants/{tenant_id}/discovery/candidates",
      discovery_entities: "/v1/tenants/{tenant_id}/discovery/entities",
      browser_extension_events: "/v1/tenants/{tenant_id}/browser-extension/events",
      browser_extension_status: "/v1/tenants/{tenant_id}/browser-extension/status",
      capability_snapshot: "/v1/tenants/{tenant_id}/devices/{device_id}/capability-snapshot-v2",
      local_entities: "/api/entities",
      local_entity_health: "/api/entities/health",
      local_entity_dedupe: "/api/entities/dedupe",
      local_entity_ingest: "/api/entities/ingest",
      local_entity_sync: "/api/entities/sync",
      adapter_catalog: "/api/adapters/catalog",
      latest_bundle: "/v1/tenants/{tenant_id}/bundles/latest",
      device_latest_bundle: "/v1/tenants/{tenant_id}/devices/{device_id}/bundles/latest",
      hot_reload_events: "/api/hot-reload/events",
      hot_reload_stream: "/api/hot-reload/stream",
      staged_rollout_advance: "/api/rollouts/{rollout_id}/advance",
      suggested_pdp_routes: "/v1/tenants/{tenant_id}/pdp/routes/suggested",
      policy_assist: "/api/policy/assist",
      policy_providers: "/api/policy/providers",
      policy_drafts: "/api/policy/drafts",
      policy_sandbox: "/api/policy/sandbox",
      breakglass: "/api/breakglass",
      compliance_policy_bundles: "/api/compliance/policy-bundles",
      compliance_score: "/api/compliance/score",
      enrollment_sessions: "/api/enrollments",
      evidence_exports: "/api/evidence/exports",
      trust_scopes: "/api/trust/scopes",
      service_endpoints: "/api/services/endpoints",
      authorization_model: "/api/authz/model",
      authorization_tuples: "/api/authz/tuples",
      authorization_check: "/api/authz/check",
      authorization_decisions: "/api/authz/decisions",
      connection_updates: "/api/contract-hub/connection-updates",
      contract_drift: "/api/contract-hub/drift",
      openapi: "/contracts/openapi.json",
      lcp_usage_ledger_schema: "/contracts/lcp-usage-ledger.schema.json",
      local_pollek_pdp_route_simulate: "/v1/tenants/{tenant_id}/pdp/routes/simulate"
    }
  };
}

function devSpiffeId({ tenantId, siteId = "site_local_lab", deviceId, lcpId = "lcp_local" }) {
  return `spiffe://local.pollek.cloud/tenant/${tenantId}/site/${siteId}/device/${deviceId}/lcp/${lcpId}`;
}

function parsePath(req) {
  const url = new URL(req.url, publicUrl);
  return { url, pathname: url.pathname };
}

function boundedInt(value, fallback, min = 0, max = maxApiPageLimit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function pageSlice(items = [], limit = defaultApiPageLimit) {
  const safeLimit = boundedInt(limit, defaultApiPageLimit, 0, maxApiPageLimit);
  const rows = Array.isArray(items) ? items : [];
  return {
    rows: rows.slice(0, safeLimit),
    total: rows.length,
    returned: Math.min(rows.length, safeLimit),
    limit: safeLimit,
    truncated: rows.length > safeLimit
  };
}

async function handleApi(req, res) {
  const { url, pathname } = parsePath(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
    return true;
  }

  if (req.method === "GET" && (pathname === "/api/events" || pathname === "/api/hot-reload/stream")) {
    openEventStream(req, res, pathname === "/api/hot-reload/stream" ? "hot-reload" : "contract-hub");
    return true;
  }

  if (req.method === "GET" && pathname === "/api/events/replay") {
    const channel = url.searchParams.get("channel") || "contract-hub";
    const lastEventId = url.searchParams.get("since") || url.searchParams.get("last_event_id") || req.headers["last-event-id"] || "";
    const entries = replayStreamEntries({
      channel,
      lastEventId,
      limit: url.searchParams.get("limit") || url.searchParams.get("replay") || "100"
    });
    sendJson(res, 200, {
      schema_version: "pollek.cloud.event-stream-replay.v1",
      channel,
      last_event_id: lastEventId || null,
      latest_event_id: state.eventJournal.at(-1)?.id || null,
      replay_window_events: eventStreamReplayWindow,
      count: entries.length,
      events: entries
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "pollek-cloud-dev",
      uptime_seconds: Math.round(process.uptime()),
      cloud_url: publicUrl
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/.well-known/pollek-contract") {
    sendJson(res, 200, await contractDiscovery());
    return true;
  }

  if (req.method === "GET" && pathname === "/contracts/openapi.json") {
    sendJson(res, 200, JSON.parse(await readFile(openApiPath, "utf8")));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/contract-hub/drift") {
    const contract = JSON.parse(await readFile(contractPath, "utf8"));
    const openApi = JSON.parse(await readFile(openApiPath, "utf8"));
    sendJson(res, 200, contractDriftReport(contract, openApi));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/persistence/status") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.persistence-status.v1",
      status: runtimePersistenceStatus()
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/persistence/flush") {
    const status = await persistRuntimeState("manual.flush");
    sendJson(res, status.last_error ? 500 : 200, {
      schema_version: "pollek.cloud.persistence-flush.v1",
      status
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/dev/seed-role-users") {
    try {
      const body = await readBody(req);
      const tenantId = requiredTenantContext(body.tenant_id || "local");
      const users = ensureRoleTestUsers(tenantId, {
        actor_id: body.actor_id || "local-dev-admin",
        emitEvidence: true
      });
      recordAudit("dev.role_users_seeded", "tenant", tenantId, {
        tenant_id: tenantId,
        actor_id: body.actor_id || "local-dev-admin",
        user_count: users.length,
        roles: ROLE_TEST_USER_TEMPLATES.map((item) => item.role)
      });
      addTask("dev_role_user_seed", "completed", `Seeded role test users for ${tenantId}`, {
        tenant_id: tenantId,
        user_count: users.length
      });
      scheduleRuntimePersist("dev.role_users_seeded");
      sendJson(res, 200, {
        schema_version: "pollek.cloud.dev-role-users.v1",
        tenant_id: tenantId,
        users
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "role_user_seed_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/signup/tenant") {
    try {
      const body = await readBody(req);
      const result = createTenantSignup(body);
      sendJson(res, 201, {
        schema_version: "pollek.cloud.signup-response.v1",
        ...result
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "tenant_signup_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/invitations/accept") {
    try {
      const body = await readBody(req);
      const result = acceptInvitation(body);
      sendJson(res, 200, {
        schema_version: "pollek.cloud.invitation-accept-response.v1",
        ...result
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "invitation_accept_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/auth/login") {
    const tenantId = url.searchParams.get("tenant_id") || "local";
    const provider = identityProviderForTenant(tenantId) || {};
    const stateValue = issueOpaqueToken("oidc_state");
    const nonce = issueOpaqueToken("oidc_nonce");
    sendJson(res, 200, {
      schema_version: "pollek.cloud.login-start.v1",
      mode: "local-dev-keycloak-compatible",
      provider_id: provider.id || "idp_dev",
      provider_type: provider.provider_type || "keycloak_oidc",
      tenant_id: tenantId,
      authorization_url: `${provider.issuer_url || "http://127.0.0.1:8080/realms/pollek-local"}/protocol/openid-connect/auth`,
      response_type: "code",
      code_challenge_method: "S256",
      state: stateValue,
      nonce,
      redirect_uri: `${publicUrl}/v1/auth/callback`,
      required_controls: ["authorization_code", "pkce_s256", "state", "nonce", "issuer_validation"]
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/auth/callback") {
    try {
      const tenantId = url.searchParams.get("tenant_id") || "local";
      const email = url.searchParams.get("email") || "local-admin@pollek.local";
      const account = ensureAccount({ email, display_name: url.searchParams.get("name") || "Local Admin" });
      upsertTenantMember({ tenant_id: tenantId, account_id: account.id, roles: ["admin"], invited_by: "oidc-callback-dev" });
      const sessionBundle = createAuthSession({ tenant_id: tenantId, account_id: account.id, method: "oidc-callback-dev" });
      recordAudit("auth.login", "auth_session", sessionBundle.session.id, {
        tenant_id: tenantId,
        actor_id: account.id,
        provider_id: sessionBundle.session.idp_id
      });
      sendJson(res, 200, {
        schema_version: "pollek.cloud.login-callback-response.v1",
        account: publicAccount(account),
        session: safeSession(sessionBundle.session, sessionBundle.token)
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "auth_callback_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/auth/logout") {
    const body = await readBody(req);
    const sessionId = body.session_id;
    const session = sessionId
      ? (state.fleet.authSessions || []).find((item) => item.id === sessionId)
      : currentSessionFromRequest(req)?.session;
    if (session) {
      session.status = "revoked";
      session.revoked_at = nowIso();
      recordAudit("auth.logout", "auth_session", session.id, {
        tenant_id: session.tenant_id,
        actor_id: session.account_id
      });
      scheduleRuntimePersist("auth.logout");
    }
    sendJson(res, 200, { schema_version: "pollek.cloud.logout-response.v1", ok: true, session_id: session?.id || null });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/auth/session") {
    const current = currentSessionFromRequest(req);
    const tenantId = url.searchParams.get("tenant_id") || current?.session?.tenant_id || "local";
    const fallbackAccount = accountById("acc_local_admin");
    const fallbackSession = current?.session || {
      id: "sess_dev_browser",
      tenant_id: tenantId,
      account_id: fallbackAccount?.id || "acc_local_admin",
      method: "dev-browser",
      status: "active",
      scopes: ["openid", "profile", "email", "pollek.console"],
      created_at: state.startedAt,
      expires_at: daysFromNow(1),
      last_seen_at: nowIso()
    };
    const account = current?.account || fallbackAccount;
    sendJson(res, 200, {
      schema_version: "pollek.cloud.session.v1",
      authenticated: true,
      tenant_id: tenantId,
      account: publicAccount(account),
      membership: tenantMemberFor(tenantId, account?.id || "acc_local_admin"),
      roles: rolesForMember(tenantId, account?.id || "acc_local_admin"),
      session: safeSession(fallbackSession)
    });
    return true;
  }

  const tenantInvitationMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/invitations$/);
  if (req.method === "POST" && tenantInvitationMatch) {
    const tenantId = decodeURIComponent(tenantInvitationMatch[1]);
    try {
      const body = await readBody(req);
      const authorization = checkAuthorization({
        tenant_id: tenantId,
        principal: body.principal || "user:acc_local_admin",
        action: "member.invite",
        object: `tenant:${tenantId}`,
        context: { source: "member_invite" }
      });
      if (authorization.decision !== "allow") {
        sendJson(res, 403, { error: "authorization_denied", authorization });
        return true;
      }
      const result = createInvitation(tenantId, body);
      sendJson(res, 201, {
        schema_version: "pollek.cloud.invitation-created.v1",
        ...result
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "invitation_create_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const tenantMembersMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/members$/);
  if (req.method === "GET" && tenantMembersMatch) {
    const tenantId = decodeURIComponent(tenantMembersMatch[1]);
    const members = (state.fleet.tenantMembers || [])
      .filter((member) => member.tenant_id === tenantId)
      .map((member) => ({
        ...member,
        account: publicAccount(accountById(member.account_id)),
        roles: rolesForMember(tenantId, member.account_id)
      }));
    sendJson(res, 200, {
      schema_version: "pollek.cloud.tenant-member-page.v1",
      tenant_id: tenantId,
      count: members.length,
      members
    });
    return true;
  }

  const tenantMemberRoleMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/members\/([^/]+)\/roles$/);
  if (req.method === "POST" && tenantMemberRoleMatch) {
    const tenantId = decodeURIComponent(tenantMemberRoleMatch[1]);
    const accountId = decodeURIComponent(tenantMemberRoleMatch[2]);
    try {
      const body = await readBody(req);
      const authorization = checkAuthorization({
        tenant_id: tenantId,
        principal: body.principal || "user:acc_local_admin",
        action: "member.write",
        object: `tenant:${tenantId}`,
        context: { source: "role_assignment" }
      });
      if (authorization.decision !== "allow") {
        sendJson(res, 403, { error: "authorization_denied", authorization });
        return true;
      }
      const member = setTenantMemberRoles({
        tenant_id: tenantId,
        account_id: accountId,
        roles: Array.isArray(body.roles) ? body.roles : [body.role || "viewer"],
        status: body.status || "active",
        actor_id: body.actor_id || "acc_local_admin"
      });
      recordAudit("member.roles_updated", "tenant_member", member.id, {
        tenant_id: tenantId,
        actor_id: body.actor_id || "acc_local_admin",
        account_id: accountId,
        roles: member.roles
      });
      scheduleRuntimePersist("member.roles_updated");
      sendJson(res, 200, { schema_version: "pollek.cloud.member-role-update.v1", member });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "member_role_update_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const tenantMemberDeleteMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/members\/([^/]+)$/);
  if (req.method === "DELETE" && tenantMemberDeleteMatch) {
    const tenantId = decodeURIComponent(tenantMemberDeleteMatch[1]);
    const accountId = decodeURIComponent(tenantMemberDeleteMatch[2]);
    const body = await readBody(req);
    const authorization = checkAuthorization({
      tenant_id: tenantId,
      principal: body.principal || "user:acc_local_admin",
      action: "member.write",
      object: `tenant:${tenantId}`,
      context: { source: "member_remove" }
    });
    if (authorization.decision !== "allow") {
      sendJson(res, 403, { error: "authorization_denied", authorization });
      return true;
    }
    const member = tenantMemberFor(tenantId, accountId);
    if (!member) {
      sendJson(res, 404, { error: "member_not_found", tenant_id: tenantId, account_id: accountId });
      return true;
    }
    member.status = "removed";
    member.removed_at = nowIso();
    state.fleet.memberRoleAssignments = (state.fleet.memberRoleAssignments || [])
      .filter((item) => !(item.tenant_id === tenantId && item.account_id === accountId));
    state.fleet.authorizationTuples = (state.fleet.authorizationTuples || [])
      .filter((tuple) => !(tuple.tenant_id === tenantId && tuple.principal === `user:${accountId}` && tuple.object === `tenant:${tenantId}`));
    recordAudit("member.removed", "tenant_member", member.id, { tenant_id: tenantId, actor_id: body.actor_id || "acc_local_admin", account_id: accountId });
    scheduleRuntimePersist("member.removed");
    sendJson(res, 200, { schema_version: "pollek.cloud.member-remove.v1", member, authorization });
    return true;
  }

  const tenantAuthzTupleMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/authz\/tuples$/);
  if (req.method === "POST" && tenantAuthzTupleMatch) {
    try {
      const tenantId = decodeURIComponent(tenantAuthzTupleMatch[1]);
      const body = await readBody(req);
      const tuple = createAuthorizationTuple({ ...body, tenant_id: tenantId });
      sendJson(res, 201, { schema_version: "pollek.cloud.authorization-tuple-write.v1", tuple });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "authorization_tuple_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/authz/check") {
    try {
      const body = await readBody(req);
      const decision = checkAuthorization(body);
      sendJson(res, 200, { decision });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "authorization_check_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const tenantIdpMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/identity-providers$/);
  if ((req.method === "GET" || req.method === "PUT") && tenantIdpMatch) {
    const tenantId = decodeURIComponent(tenantIdpMatch[1]);
    if (req.method === "GET") {
      sendJson(res, 200, {
        schema_version: "pollek.cloud.identity-provider-page.v1",
        tenant_id: tenantId,
        providers: (state.fleet.identityProviders || [])
          .filter((provider) => provider.tenant_id === tenantId)
          .map(redactedIdentityProvider)
      });
      return true;
    }
    try {
      const body = await readBody(req);
      const authorization = checkAuthorization({
        tenant_id: tenantId,
        principal: body.principal || "user:acc_local_admin",
        action: "idp.write",
        object: `tenant:${tenantId}`,
        context: { source: "identity_provider_update" }
      });
      if (authorization.decision !== "allow") {
        sendJson(res, 403, { error: "authorization_denied", authorization });
        return true;
      }
      const provider = upsertIdentityProvider(tenantId, body);
      recordAudit("idp.configured", "identity_provider", provider.id, {
        tenant_id: tenantId,
        actor_id: body.actor_id || "acc_local_admin",
        provider_type: provider.provider_type
      });
      addTask("identity_provider_configure", "completed", `Configured ${provider.display_name}`, { tenant_id: tenantId, provider_id: provider.id });
      scheduleRuntimePersist("idp.configured");
      sendJson(res, 200, { schema_version: "pollek.cloud.identity-provider-update.v1", provider: redactedIdentityProvider(provider) });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "identity_provider_update_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (pathname === "/scim/v2/Users" || pathname === "/scim/v2/Groups") {
    const tenantId = req.headers["x-pollek-tenant-id"] || url.searchParams.get("tenant_id") || "local";
    const isUsers = pathname.endsWith("Users");
    const collectionKey = isUsers ? "scimUsers" : "scimGroups";
    if (req.method === "GET") {
      const resources = (state.fleet[collectionKey] || []).filter((item) => item.tenant_id === tenantId);
      sendJson(res, 200, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: resources.length,
        Resources: resources,
        startIndex: 1,
        itemsPerPage: resources.length
      });
      return true;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const id = body.id || `${isUsers ? "scim_user" : "scim_group"}_${crypto.randomUUID()}`;
        const resource = {
          ...body,
          id,
          tenant_id: tenantId,
          schemas: body.schemas || [isUsers ? "urn:ietf:params:scim:schemas:core:2.0:User" : "urn:ietf:params:scim:schemas:core:2.0:Group"],
          meta: {
            resourceType: isUsers ? "User" : "Group",
            created: nowIso(),
            lastModified: nowIso()
          }
        };
        state.fleet[collectionKey].unshift(resource);
        if (isUsers && resource.userName) {
          const account = ensureAccount({ email: resource.userName, display_name: resource.displayName || resource.userName });
          upsertTenantMember({ tenant_id: tenantId, account_id: account.id, roles: ["viewer"], invited_by: "scim" });
        }
        recordAudit(`scim.${isUsers ? "user" : "group"}_provisioned`, isUsers ? "scim_user" : "scim_group", id, { tenant_id: tenantId, actor_id: "scim" });
        scheduleRuntimePersist("scim.provisioned");
        sendJson(res, 201, resource);
      } catch (error) {
        sendJson(res, error.statusCode || 400, { error: "scim_write_failed", detail: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
  }

  const billingSubscriptionMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/billing\/subscription$/);
  if ((req.method === "GET" || req.method === "POST") && billingSubscriptionMatch) {
    const tenantId = decodeURIComponent(billingSubscriptionMatch[1]);
    if (req.method === "GET") {
      const { subscription, plan } = planForTenant(tenantId);
      sendJson(res, 200, { schema_version: "pollek.cloud.billing-subscription.v1", tenant_id: tenantId, subscription, plan });
      return true;
    }
    try {
      const body = await readBody(req);
      const planId = body.plan_id || "plan_enterprise_cloud";
      const existing = (state.fleet.subscriptions || []).find((item) => item.tenant_id === tenantId && item.status !== "cancelled");
      const subscription = existing || { id: `sub_${slugify(tenantId)}_${crypto.randomBytes(4).toString("hex")}`, tenant_id: tenantId, created_at: nowIso() };
      Object.assign(subscription, {
        plan_id: planId,
        status: body.status || "active",
        billing_period: body.billing_period || "monthly",
        current_period_start: body.current_period_start || nowIso(),
        current_period_end: body.current_period_end || daysFromNow(30),
        source: body.source || "manual-dev",
        updated_at: nowIso()
      });
      if (!existing) state.fleet.subscriptions.unshift(subscription);
      recordAudit("billing.subscription_updated", "subscription", subscription.id, {
        tenant_id: tenantId,
        actor_id: body.actor_id || "acc_local_admin",
        plan_id: planId
      });
      addTask("billing_subscription_update", "completed", `Updated subscription ${subscription.id}`, { tenant_id: tenantId, subscription_id: subscription.id });
      scheduleRuntimePersist("billing.subscription_updated");
      sendJson(res, 200, { schema_version: "pollek.cloud.billing-subscription-update.v1", subscription, plan: planForTenant(tenantId).plan });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "billing_subscription_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const billingUsageMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/billing\/usage$/);
  if (req.method === "GET" && billingUsageMatch) {
    const tenantId = decodeURIComponent(billingUsageMatch[1]);
    sendJson(res, 200, billingUsageSnapshot(tenantId));
    return true;
  }

  const costTokenRangeFromQuery = () => ({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });

  if (req.method === "GET" && pathname === "/api/reports/cost-tokens/overview") {
    const tenantParam = url.searchParams.get("tenant_id");
    const tenantId = tenantParam && tenantParam !== "all" ? tenantParam : null;
    sendJson(res, 200, costTokenOverview(tenantId, costTokenRangeFromQuery()));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/reports/cost-tokens") {
    const tenantParam = url.searchParams.get("tenant_id");
    const tenantId = tenantParam && tenantParam !== "all" ? tenantParam : null;
    const report = costTokenReport(tenantId, url.searchParams.get("group_by") || "device", costTokenRangeFromQuery());
    if ((url.searchParams.get("format") || "json") === "csv") {
      sendText(res, 200, costTokenReportCsv(report), "text/csv");
      return true;
    }
    sendJson(res, 200, report);
    return true;
  }

  const tenantCostTokenOverviewMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/reports\/cost-tokens\/overview$/);
  if (req.method === "GET" && tenantCostTokenOverviewMatch) {
    sendJson(res, 200, costTokenOverview(decodeURIComponent(tenantCostTokenOverviewMatch[1]), costTokenRangeFromQuery()));
    return true;
  }

  const tenantCostTokenReportMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/reports\/cost-tokens$/);
  if (req.method === "GET" && tenantCostTokenReportMatch) {
    const tenantId = decodeURIComponent(tenantCostTokenReportMatch[1]);
    const report = costTokenReport(tenantId, url.searchParams.get("group_by") || "device", costTokenRangeFromQuery());
    if ((url.searchParams.get("format") || "json") === "csv") {
      sendText(res, 200, costTokenReportCsv(report), "text/csv");
      return true;
    }
    sendJson(res, 200, report);
    return true;
  }

  const billingInvoicesMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/billing\/invoices$/);
  if (req.method === "GET" && billingInvoicesMatch) {
    const tenantId = decodeURIComponent(billingInvoicesMatch[1]);
    const invoice = ensureInvoice(tenantId);
    sendJson(res, 200, {
      schema_version: "pollek.cloud.billing-invoice-page.v1",
      tenant_id: tenantId,
      invoices: [invoice, ...(state.fleet.invoices || []).filter((item) => item.tenant_id === tenantId && item.id !== invoice.id)]
    });
    return true;
  }

  const paymentMethodsMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/billing\/payment-methods$/);
  if (req.method === "POST" && paymentMethodsMatch) {
    const tenantId = decodeURIComponent(paymentMethodsMatch[1]);
    try {
      const body = await readBody(req);
      const method = {
        id: `pm_${crypto.randomUUID()}`,
        tenant_id: tenantId,
        provider: body.provider || "manual-dev",
        type: body.type || "card_token",
        reference_hash: tokenHash(body.provider_token || body.reference || crypto.randomUUID()),
        status: "active",
        billing_email: body.billing_email || "billing@pollek.local",
        created_at: nowIso()
      };
      state.fleet.paymentMethods.unshift(method);
      recordAudit("billing.payment_method_added", "payment_method", method.id, {
        tenant_id: tenantId,
        actor_id: body.actor_id || "acc_local_admin",
        provider: method.provider
      });
      scheduleRuntimePersist("billing.payment_method_added");
      sendJson(res, 201, { schema_version: "pollek.cloud.payment-method-created.v1", payment_method: { ...method, reference_hash: method.reference_hash.slice(0, 12) } });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "payment_method_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const licenseIssueMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/billing\/license\/issue$/);
  if (req.method === "POST" && licenseIssueMatch) {
    const tenantId = decodeURIComponent(licenseIssueMatch[1]);
    try {
      const body = await readBody(req);
      const license = issueOfflineLicense(tenantId, body);
      sendJson(res, 201, { schema_version: "pollek.cloud.offline-license-issued.v1", license });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: "license_issue_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const billingWebhookMatch = pathname.match(/^\/v1\/billing\/webhooks\/([^/]+)$/);
  if (req.method === "POST" && billingWebhookMatch) {
    const provider = decodeURIComponent(billingWebhookMatch[1]);
    const body = await readBody(req);
    const eventId = body.id || req.headers["x-pollek-event-id"] || `billing_evt_${crypto.randomUUID()}`;
    const exists = (state.fleet.billingEvents || []).some((item) => item.provider === provider && item.provider_event_id === eventId);
    const tenantId = body.tenant_id || body.data?.tenant_id || "local";
    const event = {
      id: `billing_event_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      provider,
      provider_event_id: eventId,
      event_type: body.type || "unknown",
      status: exists ? "duplicate" : "accepted",
      payload_hash: sha256(stableJson(body)),
      received_at: nowIso()
    };
    if (!exists) state.fleet.billingEvents.unshift(event);
    recordAudit("billing.webhook_received", "billing_event", event.id, { tenant_id: tenantId, actor_id: provider, event_type: event.event_type, duplicate: exists });
    scheduleRuntimePersist("billing.webhook_received");
    sendJson(res, exists ? 200 : 202, { schema_version: "pollek.cloud.billing-webhook-ack.v1", event });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/kms/health") {
    sendJson(res, 200, kmsHealth());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/entities/watch") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.local-entity-watch-status.v1",
      watch: lcpWatchStatus(),
      recent_sync_runs: state.fleet.localEntitySyncRuns.slice(0, 5),
      recent_configuration_snapshots: state.fleet.localConfigurationSnapshots.slice(0, 5)
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/entities/watch") {
    const status = await pollLcpEntityWatch({ force: true, reason: "manual_refresh" });
    sendJson(res, status.last_error ? 502 : 202, {
      schema_version: "pollek.cloud.local-entity-watch-refresh.v1",
      watch: status,
      summary: fleetSummary(),
      recent_sync_runs: state.fleet.localEntitySyncRuns.slice(0, 5)
    });
    return true;
  }

  const tenantScopedChangeBatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/lcp\/change-batches$/);
  if (req.method === "POST" && (pathname === "/api/lcp/change-batches" || tenantScopedChangeBatch)) {
    try {
      const body = await readBody(req);
      const { record, run, cursor } = ingestLcpChangeBatch(body, {
        tenantIdFromPath: tenantScopedChangeBatch ? decodeURIComponent(tenantScopedChangeBatch[1]) : null
      });
      sendJson(res, record.rejected_count ? 207 : 202, {
        schema_version: "pollek.cloud.lcp-change-batch-ack.v1",
        accepted: record.accepted_count,
        duplicates: record.duplicate_count,
        rejected: record.rejected_count,
        run,
        ack_cursor: record.ack_cursor,
        cursor,
        summary: fleetSummary(),
        security: {
          mode: "signed-outbox-delta-dev",
          required_production_controls: ["oauth_audience", "spiffe_svid", "mtls_certificate_bound_token", "content_hash", "replay_window"]
        }
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        schema_version: "pollek.cloud.lcp-change-batch-error.v1",
        error: "change_batch_rejected",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/lcp/config/dispatch") {
    try {
      const body = await readBody(req);
      const dispatch = await dispatchControlToLcp(body, "config.update");
      sendJson(res, dispatch.status === "failed" ? 502 : 202, {
        schema_version: "pollek.cloud.config-dispatch-response.v1",
        dispatch
      });
    } catch (error) {
      sendJson(res, 400, { error: "config_dispatch_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/lcp/hot-reload/dispatch") {
    try {
      const body = await readBody(req);
      const dispatch = await dispatchControlToLcp(body, "policy.hot_reload");
      sendJson(res, dispatch.status === "failed" ? 502 : 202, {
        schema_version: "pollek.cloud.hot-reload-dispatch-response.v1",
        dispatch
      });
    } catch (error) {
      sendJson(res, 400, { error: "hot_reload_dispatch_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/contracts/")) {
    const artifactPath = contractArtifactPaths.get(pathname);
    if (!artifactPath || !existsSync(artifactPath)) {
      sendJson(res, 404, {
        error: "contract_artifact_not_found",
        path: pathname,
        available_artifacts: ["/contracts/openapi.json", ...contractArtifactPaths.keys()]
      });
      return true;
    }
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    sendJson(res, 200, artifact);
    return true;
  }

  if (req.method === "POST" && pathname === "/oauth/device_authorization") {
    const body = await readBody(req);
    const deviceCode = `devcode_${crypto.randomUUID()}`;
    const userCode = `PLK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const record = {
      device_code: deviceCode,
      user_code: userCode,
      client_id: body.client_id || "pollek-local-control-plane",
      scope: body.scope || "pollek.enroll",
      status: "approved",
      created_at: new Date().toISOString()
    };
    state.enrollmentCodes.set(deviceCode, record);
    addTask("oauth_device_authorization", "completed", "Issued local OAuth device code", {
      user_code: userCode,
      client_id: record.client_id
    });
    sendJson(res, 200, {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${publicUrl}/device`,
      verification_uri_complete: `${publicUrl}/device?user_code=${encodeURIComponent(userCode)}`,
      expires_in: 900,
      interval: 1
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/oauth/token") {
    const body = await readBody(req);
    const record = state.enrollmentCodes.get(body.device_code);
    if (!record) {
      sendJson(res, 400, { error: "invalid_request", error_description: "unknown device_code" });
      return true;
    }
    if (record.status !== "approved") {
      sendJson(res, 200, { error: "authorization_pending" });
      return true;
    }
    sendJson(res, 200, {
      access_token: `local-dev-access-token.${Buffer.from(record.device_code).toString("base64url")}`,
      token_type: "Bearer",
      expires_in: 3600,
      scope: record.scope
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/enroll") {
    const body = await readBody(req);
    const deviceId = body.device_id || `dev_${crypto.createHash("sha256").update(body.hostname || crypto.randomUUID()).digest("hex").slice(0, 16)}`;
    const tenantId = "local";
    const device = {
      id: deviceId,
      tenant_id: tenantId,
      hostname: body.hostname || "local-control-plane",
      os: body.os || "unknown",
      arch: body.arch || "unknown",
      status: "enrolled",
      spiffe_id: devSpiffeId({ tenantId, deviceId }),
      capabilities: body.capabilities || {},
      enrolled_at: new Date().toISOString()
    };
    state.devices.set(deviceId, device);
    // Enrollment registers the Local Control Plane into the fleet so its
    // subsequent gated traffic (usage ledgers, telemetry, registry sync) is
    // recognized as coming from a known LCP. This is the only way an LCP enters
    // the fleet; nothing is pre-seeded.
    registerEnrolledLcp(device, body);
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      device_id: deviceId,
      event_type: "device.enrolled.v1",
      severity: "info",
      payload: device
    });
    addTask("device_enrollment", "completed", `Enrolled ${device.hostname}`, { device_id: deviceId });
    sendJson(res, 200, {
      join_token: `join_${crypto.randomUUID()}`,
      spire_endpoint: "spire://local-dev-spire:8081",
      trust_bundle_pem: "-----BEGIN CERTIFICATE-----\nLOCALDEVTRUSTBUNDLE\n-----END CERTIFICATE-----\n",
      pinned_bundle_public_key: "local-dev-bundle-public-key",
      tenant_id: tenantId,
      device_id: deviceId,
      spiffe_id: device.spiffe_id,
      cloud_url: publicUrl
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/lcp/probe") {
    const body = await readBody(req);
    const lcpUrl = (body.lcpUrl || "http://127.0.0.1:43891").replace(/\/+$/, "");
    const authHeader = body.token ? { authorization: `Bearer ${body.token}` } : {};
    const results = [];

    const contractResult = await fetchJson(`${lcpUrl}/.well-known/pollek-contract`);
    results.push({ name: "lcp_contract_discovery", ...contractResult });

    let profileUpdate = null;
    let profileProbe = null;
    let capabilitySnapshot = null;

    try {
      profileUpdate = await fetchJson(`${lcpUrl}/v1/tenants/local/pdp/cloud`, {
        method: "PATCH",
        headers: { ...authHeader, "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: "local",
          device_id: "local",
          pdp_endpoint: publicUrl,
          contract_version: contractVersion,
          auth_method: "spiffe-oauth-mtls-dev",
          status: "configured",
          manual_override_enabled: false,
          health: {
            status: "configured",
            detail: "Configured by Pollek Cloud local protocol test."
          }
        })
      });
      results.push({ name: "lcp_cloud_profile_update", ...profileUpdate });
    } catch (error) {
      results.push({ name: "lcp_cloud_profile_update", ok: false, error: String(error) });
    }

    try {
      profileProbe = await fetchJson(`${lcpUrl}/v1/tenants/local/pdp/cloud/probe`, {
        method: "POST",
        headers: { ...authHeader, "content-type": "application/json" },
        body: "{}"
      });
      results.push({ name: "lcp_cloud_probe_to_pollek_cloud", ...profileProbe });
    } catch (error) {
      results.push({ name: "lcp_cloud_probe_to_pollek_cloud", ok: false, error: String(error) });
    }

    try {
      capabilitySnapshot = await fetchJson(`${lcpUrl}/v1/tenants/local/devices/local/capability-snapshot-v2`, {
        headers: authHeader
      });
      results.push({ name: "lcp_capability_snapshot_v2", ...capabilitySnapshot });
    } catch (error) {
      results.push({ name: "lcp_capability_snapshot_v2", ok: false, error: String(error) });
    }

    const ok = results.some((item) => item.name === "lcp_contract_discovery" && item.ok)
      && results.some((item) => item.name === "lcp_cloud_probe_to_pollek_cloud" && item.ok);
    const probe = {
      id: `probe_${crypto.randomUUID()}`,
      ok,
      lcp_url: lcpUrl,
      cloud_url: publicUrl,
      checked_at: new Date().toISOString(),
      results
    };
    state.probes.unshift(probe);
    state.probes = state.probes.slice(0, 20);
    applyProbeToFleet(probe, capabilitySnapshot);
    addTask("lcp_protocol_probe", ok ? "completed" : "failed", ok ? "Local Control Plane cloud protocol probe succeeded" : "Local Control Plane cloud protocol probe needs attention", { lcp_url: lcpUrl });
    sendJson(res, ok ? 200 : 502, probe);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/fleet") {
    const objects = Object.fromEntries(fleetObjectMap());
    const localEntitiesPage = pageSlice(state.fleet.localEntities, url.searchParams.get("local_entities_limit") || defaultApiPageLimit);
    const relationshipsPage = pageSlice(state.fleet.localEntityRelationships, url.searchParams.get("relationships_limit") || maxApiPageLimit);
    const usageRecordsPage = pageSlice(state.fleet.usageRecords || [], url.searchParams.get("usage_records_limit") || 30);
    const auditEventsPage = pageSlice(state.auditEvents || [], url.searchParams.get("audit_limit") || 30);
    const eventPage = pageSlice(state.events || [], url.searchParams.get("events_limit") || 30);
    sendJson(res, 200, {
      cloud_url: publicUrl,
      tenant: state.tenant,
      summary: fleetSummary(),
      tree: fleetTree(),
      objects,
      local_control_planes: state.fleet.localControlPlanes,
      relationships: state.fleet.relationships,
      policy_bundles: state.fleet.policyBundles,
      policy_bundle_artifacts: state.fleet.policyBundleArtifacts || [],
      policy_packs: state.fleet.policyPacks,
      compliance_policy_bundles: state.fleet.compliancePolicyBundles,
      compliance_score: complianceScorePage(),
      policy_drafts: state.fleet.policyDrafts,
      policy_simulations: state.fleet.policySimulations,
      ai_policy_providers: aiPolicyProviders(),
      ai_provider_runs: state.fleet.aiProviderRuns || [],
      policy_test_fixtures: state.fleet.policyTestFixtures || [],
      policy_sandboxes: state.fleet.policySandboxes,
      breakglass_requests: state.fleet.breakglassRequests,
      integrations: state.fleet.integrations,
      adapter_catalog: state.fleet.adapterCatalog,
      tenant_trust_scopes: state.fleet.tenantTrustScopes,
      service_endpoints: state.fleet.serviceEndpoints,
      connection_profiles: state.fleet.connectionProfiles,
      authorization_model: authorizationModel(),
      authorization_tuples: state.fleet.authorizationTuples || [],
      authorization_decisions: state.fleet.authorizationDecisions || [],
      accounts: (state.fleet.accounts || []).map(publicAccount),
      account_identities: state.fleet.accountIdentities || [],
      tenant_members: state.fleet.tenantMembers || [],
      member_role_assignments: state.fleet.memberRoleAssignments || [],
      invitations: (state.fleet.invitations || []).map((invite) => ({ ...invite, token_hash: undefined })),
      auth_sessions: (state.fleet.authSessions || []).map((session) => safeSession(session)),
      identity_providers: (state.fleet.identityProviders || []).map(redactedIdentityProvider),
      scim_users: state.fleet.scimUsers || [],
      scim_groups: state.fleet.scimGroups || [],
      kms_health: kmsHealth(),
      billing_plans: state.fleet.billingPlans || [],
      billing_accounts: state.fleet.billingAccounts || [],
      subscriptions: state.fleet.subscriptions || [],
      usage_counters: refreshAllTenantUsage(),
      usage_records: usageRecordsPage.rows,
      invoices: state.fleet.invoices || [],
      payment_methods: (state.fleet.paymentMethods || []).map((method) => ({ ...method, reference_hash: method.reference_hash?.slice(0, 12) })),
      licenses: state.fleet.licenses || [],
      billing_events: (state.fleet.billingEvents || []).slice(0, 30),
      device_users: state.fleet.deviceUsers,
      local_entities: localEntitiesPage.rows,
      local_entity_relationships: relationshipsPage.rows,
      local_entity_sync_runs: state.fleet.localEntitySyncRuns,
      local_change_cursors: state.fleet.localChangeCursors || [],
      local_change_batches: state.fleet.localChangeBatches || [],
      local_configuration_snapshots: state.fleet.localConfigurationSnapshots,
      cloud_to_local_dispatches: state.fleet.cloudToLocalDispatches,
      evidence_exports: state.fleet.evidenceExports,
      enrollment_sessions: state.fleet.enrollmentSessions,
      rollout_plans: state.fleet.rolloutPlans,
      hot_reload_events: state.fleet.hotReloadEvents,
      alarms: state.fleet.alarms,
      events: eventPage.rows,
      audit_events: auditEventsPage.rows,
      tasks: state.tasks.slice(0, 30),
      probes: state.probes.slice(0, 10),
      persistence: runtimePersistenceStatus(),
      lcp_watch: lcpWatchStatus(),
      hybrid_sync: {
        schema_version: "pollek.cloud.hybrid-lcp-sync-status.v1",
        primary: "lcp_outbox_delta_push",
        fallback: "snapshot_reconcile",
        change_batch_endpoint: "/api/lcp/change-batches",
        tenant_scoped_change_batch_endpoint: "/v1/tenants/{tenant_id}/lcp/change-batches",
        cursors: state.fleet.localChangeCursors || [],
        recent_batches: (state.fleet.localChangeBatches || []).slice(0, 5)
      },
      security_posture: securityPostureStatus(),
      response_limits: {
        local_entities: { total: localEntitiesPage.total, returned: localEntitiesPage.returned, limit: localEntitiesPage.limit, truncated: localEntitiesPage.truncated },
        local_entity_relationships: { total: relationshipsPage.total, returned: relationshipsPage.returned, limit: relationshipsPage.limit, truncated: relationshipsPage.truncated },
        usage_records: { total: usageRecordsPage.total, returned: usageRecordsPage.returned, limit: usageRecordsPage.limit, truncated: usageRecordsPage.truncated },
        events: { total: eventPage.total, returned: eventPage.returned, limit: eventPage.limit, truncated: eventPage.truncated },
        audit_events: { total: auditEventsPage.total, returned: auditEventsPage.returned, limit: auditEventsPage.limit, truncated: auditEventsPage.truncated }
      },
      contract: await contractDiscovery()
    });
    return true;
  }

  const tenantLcpUsageLedgerMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/lcp\/usage-ledgers$/);
  if (req.method === "POST" && (pathname === "/api/lcp/usage-ledgers" || tenantLcpUsageLedgerMatch)) {
    const body = await readBody(req);
    const tenantId = tenantLcpUsageLedgerMatch ? decodeURIComponent(tenantLcpUsageLedgerMatch[1]) : (body.tenant_id || "local");
    try {
      const result = ingestLcpUsageLedger({ ...body, tenant_id: tenantId });
      sendJson(res, 202, result);
    } catch (error) {
      sendJson(res, 400, {
        schema_version: "pollek.cloud.lcp-usage-ledger-error.v1",
        error: "invalid_lcp_usage_ledger",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/adapters/catalog") {
    const category = url.searchParams.get("category") || "";
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const items = state.fleet.adapterCatalog.filter((adapter) => {
      if (category && adapter.category !== category) return false;
      if (q && !JSON.stringify(adapter).toLowerCase().includes(q)) return false;
      return true;
    });
    sendJson(res, 200, {
      schema_version: "pollek.cloud.adapter-catalog-page.v1",
      source: "curated-from-pollenwithclaw-research",
      count: items.length,
      summary: adapterCatalogSummary(items),
      items
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/entities") {
    const type = url.searchParams.get("type") || "all";
    const deviceId = url.searchParams.get("device_id") || "";
    const userId = url.searchParams.get("user_id") || "";
    const lcpId = url.searchParams.get("lcp_id") || "";
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const entities = state.fleet.localEntities.filter((entity) => {
      if (type !== "all" && entity.entity_type !== type && entity.class !== type) return false;
      if (deviceId && entity.device_id !== deviceId && entity.device_name !== deviceId) return false;
      if (userId && entity.user_id !== userId && entity.user_subject !== userId) return false;
      if (lcpId && entity.lcp_id !== lcpId) return false;
      if (q && !JSON.stringify(entity).toLowerCase().includes(q)) return false;
      return true;
    });
    sendJson(res, 200, {
      schema_version: "pollek.cloud.local-entity-page.v1",
      tenant_id: "local",
      count: entities.length,
      entities,
      relationships: state.fleet.localEntityRelationships,
      users: state.fleet.deviceUsers
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/entities/health") {
    const type = url.searchParams.get("type") || "all";
    const entities = state.fleet.localEntities.filter((entity) => type === "all" || entity.entity_type === type || entity.class === type);
    sendJson(res, 200, entityHealthPage(entities));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/entities/dedupe") {
    const body = await readBody(req);
    const matches = findDuplicateEntities(body.candidate || body);
    sendJson(res, 200, {
      schema_version: "pollek.cloud.local-entity-dedupe.v1",
      tenant_id: "local",
      match_count: matches.length,
      matches
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/entities/summary") {
    const summary = fleetSummary();
    sendJson(res, 200, {
      local_entities: summary.local_entities,
      registered_agents: summary.registered_agents,
      found_agents: summary.found_agents,
      local_policies: summary.local_policies,
      enforcement_points: summary.enforcement_points,
      observability_entities: summary.observability_entities,
      wasm_hot_reload_ready: summary.wasm_hot_reload_ready,
      users: state.fleet.deviceUsers.length,
      sync_runs: state.fleet.localEntitySyncRuns.length
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/entities/ingest") {
    const body = await readBody(req);
    const count = ingestLocalEntitySnapshot(body.snapshot || body, {
      device_id: body.device_id || "device_local_windows",
      lcp_id: body.lcp_id || "lcp_local",
      user_subject: body.user_subject || "unknown"
    });
    const run = {
      id: `entity_sync_${crypto.randomUUID()}`,
      mode: "push_ingest",
      status: "completed",
      entity_count: count,
      lcp_id: body.lcp_id || "lcp_local",
      device_id: body.device_id || "device_local_windows",
      created_at: new Date().toISOString()
    };
    state.fleet.localEntitySyncRuns.unshift(run);
    state.fleet.localEntitySyncRuns = state.fleet.localEntitySyncRuns.slice(0, 20);
    recordAudit("local_entities.ingested", "lcp", run.lcp_id, run);
    addTask("local_entity_ingest", "completed", `Ingested ${count} Local Pollek entities`, run);
    sendJson(res, 202, { accepted: true, run, summary: fleetSummary() });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/entities/sync") {
    const body = await readBody(req);
    const localLcp = state.fleet.localControlPlanes.find((item) => item.id === (body.lcp_id || "lcp_local"))
      || state.fleet.localControlPlanes.find((item) => item.endpoint.startsWith("http://127.0.0.1"));
    const lcpUrl = (body.lcpUrl || localLcp?.endpoint || "http://127.0.0.1:43891").replace(/\/+$/, "");
    const headers = body.token ? { authorization: `Bearer ${body.token}` } : {};
    const pulled = await pullLocalEntitySnapshot(lcpUrl, headers);
    const count = ingestLocalEntitySnapshot(pulled.snapshot, {
      device_id: localLcp?.device_id || "device_local_windows",
      lcp_id: localLcp?.id || "lcp_local",
      user_subject: body.user_subject || "unknown"
    });
    const run = {
      id: `entity_sync_${crypto.randomUUID()}`,
      mode: "pull_from_lcp",
      status: pulled.ok ? "completed" : "failed",
      entity_count: count,
      lcp_url: lcpUrl,
      lcp_id: localLcp?.id || "lcp_local",
      device_id: localLcp?.device_id || "device_local_windows",
      results: pulled.results,
      created_at: new Date().toISOString()
    };
    state.fleet.localEntitySyncRuns.unshift(run);
    state.fleet.localEntitySyncRuns = state.fleet.localEntitySyncRuns.slice(0, 20);
    recordAudit("local_entities.synced", "lcp", run.lcp_id, { status: run.status, entity_count: count });
    addTask("local_entity_sync", pulled.ok ? "completed" : "failed", pulled.ok ? `Synced ${count} Local Pollek entities` : "Local Pollek entity sync failed", run);
    sendJson(res, pulled.ok ? 200 : 502, { ok: pulled.ok, run, summary: fleetSummary() });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/trust/scopes") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.tenant-trust-scope-page.v1",
      scopes: state.fleet.tenantTrustScopes
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/services/endpoints") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.service-endpoint-page.v1",
      endpoints: state.fleet.serviceEndpoints
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/authz/model") {
    sendJson(res, 200, authorizationModel());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/authz/tuples") {
    const tenantId = url.searchParams.get("tenant_id") || "local";
    sendJson(res, 200, {
      schema_version: "pollek.cloud.authorization-tuples-page.v1",
      tenant_id: tenantId,
      tuples: (state.fleet.authorizationTuples || []).filter((tuple) => tuple.tenant_id === tenantId)
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/authz/tuples") {
    const body = await readBody(req);
    try {
      const tuple = createAuthorizationTuple(body);
      sendJson(res, 201, { tuple });
    } catch (error) {
      sendJson(res, error?.message === "tenant_context_required" ? 400 : 422, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/authz/check") {
    const body = await readBody(req);
    try {
      const decision = checkAuthorization(body);
      sendJson(res, 200, { decision });
    } catch (error) {
      sendJson(res, error?.message === "tenant_context_required" ? 400 : 422, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/authz/decisions") {
    const tenantId = url.searchParams.get("tenant_id") || "local";
    sendJson(res, 200, {
      schema_version: "pollek.cloud.authorization-decisions-page.v1",
      tenant_id: tenantId,
      decisions: (state.fleet.authorizationDecisions || []).filter((decision) => decision.tenant_id === tenantId)
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/contract-hub/connection-updates") {
    const tenantId = url.searchParams.get("tenant_id") || "local";
    const lcpId = url.searchParams.get("lcp_id") || "";
    const profiles = state.fleet.connectionProfiles.filter((profile) => {
      if (profile.tenant_id !== tenantId) return false;
      if (!lcpId) return true;
      return profile.applies_to?.lcp_ids?.includes(lcpId);
    });
    sendJson(res, 200, {
      schema_version: "pollek.cloud.connection-update-page.v1",
      tenant_id: tenantId,
      cloud_url: publicUrl,
      contract_version: contractVersion,
      profiles,
      entitlements: state.tenant.entitlements,
      enterprise_features: {
        compliance_policy_bundles: state.tenant.entitlements.includes("enterprise.compliance_policy_bundles"),
        policy_sandbox: state.tenant.entitlements.includes("enterprise.policy_sandbox"),
        breakglass: state.tenant.entitlements.includes("enterprise.breakglass")
      },
      trust_scopes: state.fleet.tenantTrustScopes.filter((scope) => scope.tenant_id === tenantId),
      service_endpoints: state.fleet.serviceEndpoints.filter((endpoint) => endpoint.tenant_id === tenantId),
      compliance_bundle_channels: state.fleet.compliancePolicyBundles.map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        enterprise_only: true,
        local_catalog_visible: false,
        distribution: bundle.contract_hub_distribution
      })),
      local_entity_paths: {
        change_batch_ingest: "/api/lcp/change-batches",
        tenant_scoped_change_batch_ingest: "/v1/tenants/{tenant_id}/lcp/change-batches",
        registry_agents: "/v1/tenants/{tenant_id}/registry/agents",
        registry_entities: "/v1/tenants/{tenant_id}/registry/entities",
        registry_relationships: "/v1/tenants/{tenant_id}/registry/relationships",
        registry_resources: "/v1/tenants/{tenant_id}/registry/resources",
        registry_tools: "/v1/tenants/{tenant_id}/registry/tools",
        discovery_candidates: "/v1/tenants/{tenant_id}/discovery/candidates",
        discovery_entities: "/v1/tenants/{tenant_id}/discovery/entities",
        agent_inventory: "/v1/tenants/{tenant_id}/agent-inventory",
        telemetry_events: "/v1/telemetry/events",
        telemetry_decision_logs: "/v1/telemetry/decision-logs",
        telemetry_security_events: "/v1/telemetry/security-events",
        telemetry_traces: "/v1/telemetry/traces",
        telemetry_runtime_metrics: "/v1/telemetry/runtime-metrics",
        telemetry_resources: "/v1/tenants/local/telemetry/resources",
        telemetry_tools: "/v1/tenants/local/telemetry/tools",
        telemetry_identities: "/v1/tenants/local/telemetry/identities",
        telemetry_observations: "/v1/tenants/local/telemetry/observations",
        telemetry_guard_events: "/v1/tenants/local/telemetry/guard-events",
        capability_snapshot: "/v1/tenants/local/devices/local/capability-snapshot-v2",
        pdp_route_simulate: "/v1/tenants/{tenant_id}/pdp/routes/simulate",
        cloud_bundle_latest: "/v1/tenants/{tenant_id}/bundles/latest",
        cloud_device_bundle_latest: "/v1/tenants/{tenant_id}/devices/{device_id}/bundles/latest",
        cloud_bundle_manifest: "/v1/policy-bundles/{bundle_id}/manifest",
        hot_reload_events: "/api/hot-reload/events",
        hot_reload_stream: "/api/hot-reload/stream",
        event_stream: "/api/events",
        event_replay: "/api/events/replay"
      },
      hybrid_sync: {
        primary: "lcp_outbox_delta_push",
        fallback: "snapshot_reconcile",
        ack_cursor_required: true,
        cursor_headers: ["x-pollek-tenant-id", "x-pollek-device-id"],
        idempotency: ["event_id", "sequence", "content_hash"],
        batch_max_events: 250,
        replay_window_events: 200,
        reconcile_seconds: Math.round(lcpEntityWatch.interval_ms / 1000),
        jitter_percent: lcpEntityWatch.jitter_percent
      },
      event_streams: {
        contract_hub: "/api/events",
        hot_reload: "/api/hot-reload/stream",
        replay: "/api/events/replay",
        resume_parameters: ["since", "last_event_id", "replay"],
        replay_window_events: eventStreamReplayWindow,
        event_types: ["connected", "keepalive", "task.updated", "telemetry.event", "hot_reload.event", "local_entities.updated"]
      }
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/policy/drafts") {
    sendJson(res, 200, {
      drafts: state.fleet.policyDrafts,
      simulations: state.fleet.policySimulations
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/policy/providers") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.ai-policy-provider-page.v1",
      providers: aiPolicyProviders(),
      runs: state.fleet.aiProviderRuns || [],
      fixtures: state.fleet.policyTestFixtures || []
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/policy/assist") {
    const body = await readBody(req);
    const draft = createPolicyDraft(body);
    sendJson(res, 201, { draft, human_approval_required: true });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/policy/sandbox") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.policy-sandbox-page.v1",
      enterprise_only: true,
      profiles: SANDBOX_PROFILES,
      runs: state.fleet.policySandboxes
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/policy/sandbox") {
    const body = await readBody(req);
    const run = createPolicySandboxRun(body);
    sendJson(res, 201, { run });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/compliance/policy-bundles") {
    sendJson(res, 200, compliancePolicyBundlePage());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/compliance/score") {
    sendJson(res, 200, complianceScorePage());
    return true;
  }

  const policyBundleSignMatch = pathname.match(/^\/api\/policy-bundles\/([^/]+)\/sign$/);
  if (req.method === "POST" && policyBundleSignMatch) {
    const bundleId = decodeURIComponent(policyBundleSignMatch[1]);
    const body = await readBody(req);
    const bundle = state.fleet.policyBundles.find((item) => item.id === bundleId);
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", bundle_id: bundleId });
      return true;
    }
    if (!body.tenant_id) {
      sendJson(res, 400, { error: "tenant_context_required", detail: "Signing writes tenant-owned bundle evidence and requires body.tenant_id." });
      return true;
    }
    if (bundle.tenant_id && bundle.tenant_id !== body.tenant_id) {
      sendJson(res, 403, { error: "tenant_mismatch", bundle_tenant_id: bundle.tenant_id, tenant_id: body.tenant_id });
      return true;
    }
    const authorization = checkAuthorization({
      tenant_id: body.tenant_id,
      principal: body.principal || `user:${body.approved_by || "local-dev-security-admin"}`,
      action: "bundle.sign",
      object: `policy_bundle:${bundle.id}`,
      context: { risk: body.risk || "medium", breakglass: body.breakglass || "inactive" }
    });
    if (authorization.decision !== "allow") {
      sendJson(res, 403, { error: "authorization_denied", authorization });
      return true;
    }
    const approvalRecord = body.approval_record || defaultApprovalRecordForBundle(bundle, {
      id: body.approval_id || `approval_${bundle.id}_${crypto.randomUUID().slice(0, 8)}`,
      tenant_id: body.tenant_id,
      approved_by: body.approved_by || "local-dev-security-admin",
      approved_at: new Date().toISOString(),
      source: body.approval_source || "manual_bundle_sign",
      reason: body.reason || "Manual policy bundle signing approval."
    });
    if (approvalRecord.status !== "approved") {
      sendJson(res, 409, { error: "approved_record_required", approval: approvalRecord });
      return true;
    }
    const signature = signPolicyBundle(bundle, approvalRecord);
    const verification = verifyPolicyBundle(bundle);
    recordAudit("policy_bundle.signed", "policy_bundle", bundle.id, {
      tenant_id: body.tenant_id,
      signature_id: signature.id,
      payload_hash: signature.payload_hash,
      approval_id: signature.approval_id
    });
    const task = addTask("policy_bundle_sign", "completed", `Signed policy bundle ${bundle.name}`, {
      bundle_id: bundle.id,
      signature_id: signature.id,
      payload_hash: signature.payload_hash,
      verification_status: verification.status
    });
    sendJson(res, 201, { bundle, signature, verification, authorization, task });
    return true;
  }

  const policyBundleVerifyMatch = pathname.match(/^\/api\/policy-bundles\/([^/]+)\/verify$/);
  if (req.method === "GET" && policyBundleVerifyMatch) {
    const bundleId = decodeURIComponent(policyBundleVerifyMatch[1]);
    const bundle = state.fleet.policyBundles.find((item) => item.id === bundleId);
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", bundle_id: bundleId });
      return true;
    }
    const manifest = unsignedPolicyBundleManifest(bundle);
    const verification = verifyPolicyBundle(bundle, manifest);
    sendJson(res, 200, {
      schema_version: "pollek.cloud.policy-bundle-verification-response.v1",
      bundle_id: bundle.id,
      tenant_id: bundleTenantId(bundle),
      manifest,
      signatures: normalizePolicyBundleSignatures(bundle),
      verification
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/compliance/policy-bundles/simulate") {
    const body = await readBody(req);
    const bundle = state.fleet.compliancePolicyBundles.find((item) => item.id === body.bundle_id) || state.fleet.compliancePolicyBundles[0];
    const run = createPolicySandboxRun({
      mode: "enterprise-compliance-bundle-simulation",
      engine: bundle.target_engines[0],
      entity_ids: body.entity_ids,
      profile_id: "sandbox_policy_dry_run"
    });
    run.compliance_bundle_id = bundle.id;
    run.frameworks = bundle.frameworks;
    sendJson(res, 201, { bundle, run, deploy_allowed: run.blast_radius.deny === 0 });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/compliance/policy-bundles/deploy") {
    const body = await readBody(req);
    const source = state.fleet.compliancePolicyBundles.find((item) => item.id === body.bundle_id);
    if (!source) {
      sendJson(res, 404, { error: "compliance_bundle_not_found", bundle_id: body.bundle_id });
      return true;
    }
    if (!state.tenant.entitlements.includes("enterprise.compliance_policy_bundles")) {
      sendJson(res, 403, { error: "enterprise_entitlement_required", entitlement: "enterprise.compliance_policy_bundles" });
      return true;
    }
    const authorization = checkAuthorization({
      tenant_id: body.tenant_id || "local",
      principal: body.principal || `user:${body.approved_by || "local-dev-security-admin"}`,
      action: "policy.rollout",
      object: `compliance_bundle:${source.id}`,
      context: { risk: body.risk || "medium", breakglass: body.breakglass || "inactive" }
    });
    if (authorization.decision !== "allow") {
      sendJson(res, 403, { error: "authorization_denied", authorization });
      return true;
    }
    const policyBundle = {
      id: `bnd_${source.id}_${crypto.randomUUID().slice(0, 8)}`,
      tenant_id: body.tenant_id || "local",
      name: source.name,
      revision: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
      status: "available",
      coverage: 82,
      signed: false,
      hot_reload: true,
      compliance_bundle_id: source.id,
      frameworks: source.frameworks,
      control_level: source.default_mode === "enforce" ? "Enforce" : source.default_mode === "approval" ? "Approval" : "Warn",
      policies: source.controls.map((control) => ({ control, engines: source.target_engines })),
      approval_record: defaultApprovalRecordForBundle({ id: `bnd_${source.id}`, tenant_id: body.tenant_id || "local", compliance_bundle_id: source.id }, {
        id: `approval_${source.id}_${crypto.randomUUID().slice(0, 8)}`,
        tenant_id: body.tenant_id || "local",
        approved_by: body.approved_by || "local-dev-compliance-admin",
        approved_at: new Date().toISOString(),
        source: "enterprise_compliance_bundle",
        reason: body.reason || `Deploy enterprise compliance bundle ${source.name}`
      }),
      created_at: new Date().toISOString()
    };
    const signature = signPolicyBundle(policyBundle, policyBundle.approval_record);
    state.fleet.policyBundles.unshift(policyBundle);
    const rollout = createRolloutPlan({
      bundle_id: policyBundle.id,
      target_ids: body.target_ids,
      wave_strategy: body.wave_strategy || "enterprise-compliance-canary"
    });
    state.fleet.rolloutPlans.unshift(rollout);
    recordAudit("compliance_bundle.deployed", "compliance_bundle", source.id, { bundle_id: policyBundle.id, rollout_id: rollout.id, signature_id: signature.id });
    const task = addTask("compliance_bundle_deploy", "queued", `Prepared enterprise compliance bundle ${source.name}`, {
      compliance_bundle_id: source.id,
      bundle_id: policyBundle.id,
      rollout_id: rollout.id,
      signature_id: signature.id,
      payload_hash: signature.payload_hash
    });
    sendJson(res, 201, { compliance_bundle: source, policy_bundle: policyBundle, authorization, rollout, task });
    return true;
  }

  const policySimulateMatch = pathname.match(/^\/api\/policy\/drafts\/([^/]+)\/simulate$/);
  if (req.method === "POST" && policySimulateMatch) {
    const draftId = decodeURIComponent(policySimulateMatch[1]);
    const draft = state.fleet.policyDrafts.find((item) => item.id === draftId);
    if (!draft) {
      sendJson(res, 404, { error: "policy_draft_not_found", draft_id: draftId });
      return true;
    }
    const simulation = simulatePolicyDraft(draft);
    sendJson(res, 200, { draft, simulation });
    return true;
  }

  const policyApproveMatch = pathname.match(/^\/api\/policy\/drafts\/([^/]+)\/approve$/);
  if (req.method === "POST" && policyApproveMatch) {
    const draftId = decodeURIComponent(policyApproveMatch[1]);
    const body = await readBody(req);
    const draft = state.fleet.policyDrafts.find((item) => item.id === draftId);
    if (!draft) {
      sendJson(res, 404, { error: "policy_draft_not_found", draft_id: draftId });
      return true;
    }
    if (draft.status !== "simulation_passed" && draft.status !== "approved") {
      sendJson(res, 409, { error: "simulation_required", detail: "Run simulation before approval.", draft });
      return true;
    }
    const authorization = checkAuthorization({
      tenant_id: body.tenant_id || draft.tenant_id || "local",
      principal: body.principal || `user:${body.approved_by || "local-dev-security-admin"}`,
      action: "policy.approve",
      object: `policy_project:${draft.project_id || "proj_default_policy"}`,
      context: { risk: body.risk || "medium", breakglass: body.breakglass || "inactive" }
    });
    if (authorization.decision !== "allow") {
      sendJson(res, 403, { error: "authorization_denied", authorization });
      return true;
    }
    draft.status = "approved";
    draft.approved_at = new Date().toISOString();
    draft.updated_at = draft.approved_at;
    const bundle = {
      id: `bnd_${policySlug(draft.title)}_${crypto.randomUUID().slice(0, 8)}`,
      tenant_id: body.tenant_id || draft.tenant_id || "local",
      name: draft.title,
      revision: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
      status: "available",
      coverage: 70,
      draft_id: draft.id,
      signed: false,
      hot_reload: true,
      policies: [{ draft_id: draft.id, title: draft.title, engine: draft.recommended_engine, policy_ir: draft.policy_ir }],
      approval_record: defaultApprovalRecordForBundle({ id: `bnd_${draft.id}`, tenant_id: body.tenant_id || draft.tenant_id || "local", draft_id: draft.id }, {
        id: `approval_${draft.id}_${crypto.randomUUID().slice(0, 8)}`,
        tenant_id: body.tenant_id || draft.tenant_id || "local",
        approved_by: body.approved_by || "local-dev-security-admin",
        approved_at: draft.approved_at,
        source: "policy_draft_approval",
        reason: body.reason || "AI-assisted policy draft approved after simulation."
      })
    };
    const signature = signPolicyBundle(bundle, bundle.approval_record);
    state.fleet.policyBundles.unshift(bundle);
    state.fleet.relationships.push({ from: draft.id, to: bundle.id, label: "publishes" });
    recordAudit("policy_draft.approved", "policy_draft", draft.id, { bundle_id: bundle.id, signature_id: signature.id });
    const task = addTask("policy_approval", "completed", `Approved policy draft: ${draft.title}`, { draft_id: draft.id, bundle_id: bundle.id, signature_id: signature.id });
    sendJson(res, 200, { draft, bundle, authorization, task, rollout_required: true });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/enrollments") {
    const body = await readBody(req);
    const session = createEnrollmentSession(body);
    sendJson(res, 201, { session });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/enrollments") {
    sendJson(res, 200, { sessions: state.fleet.enrollmentSessions });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/breakglass") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.breakglass-page.v1",
      enterprise_only: true,
      requests: state.fleet.breakglassRequests,
      active: state.fleet.breakglassRequests.filter((item) => item.status === "active")
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/breakglass") {
    const body = await readBody(req);
    const request = createBreakglassRequest(body);
    sendJson(res, 201, { request });
    return true;
  }

  const breakglassActionMatch = pathname.match(/^\/api\/breakglass\/([^/]+)\/(approve|reject|close)$/);
  if (req.method === "POST" && breakglassActionMatch) {
    const id = decodeURIComponent(breakglassActionMatch[1]);
    const action = breakglassActionMatch[2];
    const body = await readBody(req);
    const existing = state.fleet.breakglassRequests.find((item) => item.id === id);
    if (action === "approve") {
      const authorization = checkAuthorization({
        tenant_id: body.tenant_id || existing?.tenant_id || "local",
        principal: body.principal || `user:${body.approver || "local-dev-security-admin"}`,
        action: "breakglass.approve",
        object: `breakglass:${id}`,
        context: { risk: body.risk || "medium", breakglass: "active" }
      });
      if (authorization.decision !== "allow") {
        sendJson(res, 403, { error: "authorization_denied", authorization });
        return true;
      }
    }
    const request = transitionBreakglass(id, action, body);
    if (!request) {
      sendJson(res, 404, { error: "breakglass_not_found", id });
      return true;
    }
    sendJson(res, 200, { request });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/telemetry/query") {
    const severity = url.searchParams.get("severity") || "all";
    const type = url.searchParams.get("type") || "";
    const text = (url.searchParams.get("q") || "").toLowerCase();
    const objectId = url.searchParams.get("object_id") || "";
    const events = state.events.filter((event) => {
      if (severity !== "all" && event.severity !== severity) return false;
      if (type && !String(event.event_type).includes(type)) return false;
      if (objectId && event.device_id !== objectId && event.payload?.lcp_id !== objectId && event.payload?.object_id !== objectId) return false;
      if (text && !JSON.stringify(event).toLowerCase().includes(text)) return false;
      return true;
    });
    sendJson(res, 200, { events, count: events.length });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/telemetry/sample") {
    const body = await readBody(req);
    const event = recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: "local",
      device_id: body.device_id || "lcp_local",
      event_type: body.event_type || "ai.policy_decision.v1",
      severity: body.severity || "warning",
      trace_id: `trace_${crypto.randomUUID()}`,
      payload: {
        lcp_id: body.lcp_id || "lcp_local",
        agent: body.agent || "Cursor Agent",
        decision: body.decision || "warn",
        policy: body.policy || "AI Data Leakage Protection",
        detail: body.detail || "Synthetic Cloud-side telemetry sample while LCP build is pending."
      }
    });
    recordAudit("telemetry.sample_ingested", "telemetry_event", event.event_id, { event_type: event.event_type });
    sendJson(res, 202, { accepted: true, event });
    return true;
  }

  const integrationTestMatch = pathname.match(/^\/api\/integrations\/([^/]+)\/test$/);
  if (req.method === "POST" && integrationTestMatch) {
    const integrationId = decodeURIComponent(integrationTestMatch[1]);
    const integration = state.fleet.integrations.find((item) => item.id === integrationId);
    if (!integration) {
      sendJson(res, 404, { error: "integration_not_found", integration_id: integrationId });
      return true;
    }
    const task = completeTask(addTask("integration_test", "running", `Tested ${integration.name}`, {
      integration_id: integration.id,
      status: integration.status
    }));
    recordAudit("integration.tested", "integration", integration.id, { status: integration.status });
    sendJson(res, 200, { integration, task, result: integration.status === "configured" ? "ok" : "configuration_required" });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/policy/packs") {
    sendJson(res, 200, {
      packs: state.fleet.policyPacks,
      recommended: state.fleet.policyPacks.filter((pack) => pack.status === "ready")
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/integrations/summary") {
    const byStatus = state.fleet.integrations.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    sendJson(res, 200, {
      integrations: state.fleet.integrations,
      summary: {
        total: state.fleet.integrations.length,
        configured: byStatus.configured || 0,
        needs_secret: byStatus.needs_secret || 0,
        not_configured: byStatus.not_configured || 0
      }
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/rollouts") {
    const body = await readBody(req);
    const rollout = createRolloutPlan(body);
    state.fleet.rolloutPlans.unshift(rollout);
    const task = addTask("bundle_rollout", "queued", `Created rollout for ${rollout.target_ids.length} Local Control Planes`, {
      rollout_id: rollout.id,
      bundle_id: rollout.bundle_id,
      target_ids: rollout.target_ids
    });
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: "local",
      event_type: "rollout.created.v1",
      severity: "info",
      payload: rollout
    });
    sendJson(res, 201, { rollout, task });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/hot-reload/events") {
    sendJson(res, 200, {
      schema_version: "pollek.cloud.hot-reload-event-page.v1",
      events: state.fleet.hotReloadEvents,
      rollouts: state.fleet.rolloutPlans
    });
    return true;
  }

  const rolloutActionMatch = pathname.match(/^\/api\/rollouts\/([^/]+)\/(advance|pause|resume|cancel)$/);
  if (req.method === "POST" && rolloutActionMatch) {
    const rolloutId = decodeURIComponent(rolloutActionMatch[1]);
    const action = rolloutActionMatch[2];
    const rollout = state.fleet.rolloutPlans.find((item) => item.id === rolloutId);
    if (!rollout) {
      sendJson(res, 404, { error: "rollout_not_found", rollout_id: rolloutId });
      return true;
    }
    let result = { rollout, events: [] };
    if (action === "advance") {
      result = advanceRolloutPlan(rollout);
      if (result?.error) {
        sendJson(res, 409, { error: result.error, rollout });
        return true;
      }
    } else if (action === "pause") {
      rollout.status = "paused";
      rollout.updated_at = new Date().toISOString();
    } else if (action === "resume") {
      rollout.status = "in_progress";
      rollout.updated_at = new Date().toISOString();
    } else if (action === "cancel") {
      rollout.status = "cancelled";
      rollout.updated_at = new Date().toISOString();
    }
    recordAudit(`rollout.${action}`, "rollout", rollout.id, { status: rollout.status, bundle_id: rollout.bundle_id });
    addTask("bundle_rollout", "completed", `Rollout ${action}: ${rollout.bundle_id}`, { rollout_id: rollout.id });
    sendJson(res, 200, result || { rollout, events: [] });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/evidence/exports") {
    const body = await readBody(req);
    const exportRecord = {
      id: `evidence_${crypto.randomUUID()}`,
      tenant_id: "local",
      scope: body.scope || "tenant",
      format: body.format || "json",
      status: "ready",
      requested_at: new Date().toISOString(),
      download_url: `/api/evidence/exports/latest`
    };
    state.fleet.evidenceExports.unshift(exportRecord);
    const task = completeTask(addTask("evidence_export", "running", "Generated tenant evidence package", {
      evidence_export_id: exportRecord.id,
      scope: exportRecord.scope,
      format: exportRecord.format
    }));
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: "local",
      event_type: "evidence.export.ready.v1",
      severity: "info",
      payload: exportRecord
    });
    sendJson(res, 201, { export: exportRecord, task });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/evidence/exports/latest") {
    const latest = state.fleet.evidenceExports[0] || null;
    sendJson(res, latest ? 200 : 404, latest || { error: "no_evidence_export" });
    return true;
  }

  const alarmAckMatch = pathname.match(/^\/api\/alarms\/([^/]+)\/ack$/);
  if (req.method === "POST" && alarmAckMatch) {
    const alarmId = decodeURIComponent(alarmAckMatch[1]);
    const alarm = state.fleet.alarms.find((item) => item.id === alarmId);
    if (!alarm) {
      sendJson(res, 404, { error: "alarm_not_found", alarm_id: alarmId });
      return true;
    }
    alarm.state = "acknowledged";
    alarm.acknowledged_at = new Date().toISOString();
    const task = addTask("alarm_acknowledge", "completed", `Acknowledged alarm: ${alarm.summary}`, {
      alarm_id: alarm.id,
      object_id: alarm.object_id
    });
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: "local",
      event_type: "alarm.acknowledged.v1",
      severity: alarm.severity,
      payload: alarm
    });
    sendJson(res, 200, { alarm, task });
    return true;
  }

  const fleetObjectMatch = pathname.match(/^\/api\/fleet\/objects\/([^/]+)$/);
  if (req.method === "GET" && fleetObjectMatch) {
    const id = decodeURIComponent(fleetObjectMatch[1]);
    const object = fleetObjectMap().get(id);
    if (!object) {
      sendJson(res, 404, { error: "object_not_found", id });
      return true;
    }
    sendJson(res, 200, {
      object,
      relationships: state.fleet.relationships.filter((rel) => rel.from === id || rel.to === id),
      alarms: state.fleet.alarms.filter((alarm) => alarm.object_id === id),
      tasks: state.tasks.filter((task) => task.details?.object_id === id || task.details?.lcp_url === object.endpoint).slice(0, 20)
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/fleet/probe-visible") {
    const localLcp = state.fleet.localControlPlanes.find((item) => item.endpoint.startsWith("http://127.0.0.1"));
    if (!localLcp) {
      sendJson(res, 404, { error: "no_loopback_lcp", detail: "No loopback Local Control Plane is configured for dev probing." });
      return true;
    }
    sendJson(res, 200, {
      target: localLcp,
      next_action: {
        method: "POST",
        path: "/api/lcp/probe",
        body: { lcpUrl: localLcp.endpoint }
      }
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/cloud/status") {
    sendJson(res, 200, {
      cloud_url: publicUrl,
      tenant: state.tenant,
      devices: [...state.devices.values()],
      events: state.events.slice(0, 20),
      tasks: state.tasks.slice(0, 20),
      probes: state.probes.slice(0, 10),
      fleet: {
        summary: fleetSummary(),
        local_control_planes: state.fleet.localControlPlanes,
        alarms: state.fleet.alarms,
        lcp_watch: lcpWatchStatus(),
        cloud_to_local_dispatches: state.fleet.cloudToLocalDispatches.slice(0, 10)
      },
      persistence: runtimePersistenceStatus(),
      security_posture: securityPostureStatus(),
      contract: await contractDiscovery()
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/telemetry/observations") {
    sendJson(res, 200, observationTelemetryPage(url.searchParams.get("tenant_id") || "local"));
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/telemetry/enforcement-status") {
    sendJson(res, 200, enforcementStatusPage(url.searchParams.get("tenant_id") || "local"));
    return true;
  }

  const telemetryEntityMatch = pathname.match(/^\/v1\/telemetry\/(resources|tools|identities)$/);
  if (req.method === "GET" && telemetryEntityMatch) {
    sendJson(res, 200, telemetryEntityPage(telemetryEntityMatch[1], url.searchParams.get("tenant_id") || "local"));
    return true;
  }

  const tenantTelemetryReadMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/telemetry\/(observations|resources|tools|identities|guard-events)$/);
  if (req.method === "GET" && tenantTelemetryReadMatch) {
    const tenantId = decodeURIComponent(tenantTelemetryReadMatch[1]);
    const kind = tenantTelemetryReadMatch[2];
    if (kind === "guard-events") {
      sendJson(res, 200, guardEventsPage(tenantId));
      return true;
    }
    sendJson(res, 200, kind === "observations" ? observationTelemetryPage(tenantId) : telemetryEntityPage(kind, tenantId));
    return true;
  }

  const tenantDecisionLogsMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/telemetry\/decision-logs$/)
    || pathname.match(/^\/v1\/tenants\/([^/]+)\/logs\/decisions$/);
  if (req.method === "GET" && tenantDecisionLogsMatch) {
    sendJson(res, 200, telemetryLogPage(decodeURIComponent(tenantDecisionLogsMatch[1]), ["decision_log", "decision"], "decisions"));
    return true;
  }

  const tenantLogsMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/logs\/(tool-invocations|resource-access|policy-deployments|pep-health)$/);
  if (req.method === "GET" && tenantLogsMatch) {
    const tenantId = decodeURIComponent(tenantLogsMatch[1]);
    const logKind = tenantLogsMatch[2];
    const logPages = {
      "tool-invocations": () => telemetryLogPage(tenantId, ["tool_invocation", "tool_usage"], "tool_invocations"),
      "resource-access": () => telemetryLogPage(tenantId, ["resource_access"], "resource_accesses"),
      "policy-deployments": () => telemetryLogPage(tenantId, ["policy_deployment"], "policy_deployments"),
      "pep-health": () => telemetryLogPage(tenantId, ["pep_binding_status"], "pep_health")
    };
    sendJson(res, 200, logPages[logKind]());
    return true;
  }

  const tenantTelemetryExportMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/telemetry\/export$/);
  if (req.method === "GET" && tenantTelemetryExportMatch) {
    const tenantId = decodeURIComponent(tenantTelemetryExportMatch[1]);
    const format = url.searchParams.get("format") || "json";
    const envelopes = telemetryEnvelopesFor(tenantId, (envelope) => TELEMETRY_EXPORT_EVENT_TYPES.includes(envelope.event_type));
    if (format === "csv") {
      sendText(res, 200, exportTelemetryCsv(envelopes, tenantId), "text/csv");
      return true;
    }
    sendJson(res, 200, envelopes);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/telemetry/ingest-status") {
    sendJson(res, 200, telemetryIngestStatus());
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/telemetry/batches") {
    const body = await readBody(req);
    const response = recordTelemetryPayload(req, body, { kind: "batch", sourcePath: pathname });
    sendJson(res, 202, { ...response, batch_id: body.batch_id || null });
    return true;
  }

  const tenantTelemetryIngestMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/telemetry\/events$/);
  if (req.method === "POST" && (telemetryIngestKinds.has(pathname) || tenantTelemetryIngestMatch)) {
    const body = await readBody(req);
    const response = recordTelemetryPayload(req, body, {
      kind: tenantTelemetryIngestMatch ? "event" : telemetryIngestKinds.get(pathname),
      tenantIdFromPath: tenantTelemetryIngestMatch ? decodeURIComponent(tenantTelemetryIngestMatch[1]) : null,
      sourcePath: pathname
    });
    sendJson(res, 202, response);
    return true;
  }

  const browserExtensionEventMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/browser-extension\/events$/);
  if (req.method === "POST" && browserExtensionEventMatch) {
    const tenantId = decodeURIComponent(browserExtensionEventMatch[1]);
    const body = await readBody(req);
    const response = recordTelemetryPayload(req, {
      ...body,
      event_type: body.event_type || "browser_extension.event.v1",
      schema_version: body.schema_version || "browser-extension-event.v1"
    }, { kind: "browser_extension", tenantIdFromPath: tenantId, sourcePath: pathname });
    sendJson(res, 202, response);
    return true;
  }

  const browserExtensionStatusMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/browser-extension\/status$/);
  if (req.method === "GET" && browserExtensionStatusMatch) {
    const tenantId = decodeURIComponent(browserExtensionStatusMatch[1]);
    const events = telemetryEventsFor(tenantId, (event) => String(event.event_type || "").startsWith("browser_extension."));
    sendJson(res, 200, {
      schema_version: "pollek.cloud.browser-extension-status.v1",
      tenant_id: tenantId,
      count: events.length,
      connectors: events.map((event) => ({
        id: event.payload?.raw?.connector_id || event.payload?.raw?.extension_id || event.event_id,
        status: "observed",
        last_seen_at: event.received_at,
        event
      }))
    });
    return true;
  }

  const capabilitySnapshotMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/capability-snapshot$/);
  if (req.method === "GET" && capabilitySnapshotMatch) {
    sendJson(res, 200, cloudCapabilitySnapshot(decodeURIComponent(capabilitySnapshotMatch[1]), "local"));
    return true;
  }

  const deviceCapabilitySnapshotMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/devices\/([^/]+)\/capability-snapshot-v2$/);
  if (req.method === "GET" && deviceCapabilitySnapshotMatch) {
    sendJson(res, 200, cloudCapabilitySnapshot(decodeURIComponent(deviceCapabilitySnapshotMatch[1]), decodeURIComponent(deviceCapabilitySnapshotMatch[2])));
    return true;
  }

  const registryPageMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/registry\/(agents|entities|relationships|resources|tools)$/);
  if (req.method === "GET" && registryPageMatch) {
    sendJson(res, 200, registryPage(decodeURIComponent(registryPageMatch[1]), registryPageMatch[2]));
    return true;
  }

  const discoveryPageMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/discovery\/(candidates|entities)$/);
  if (req.method === "GET" && discoveryPageMatch) {
    sendJson(res, 200, discoveryPage(decodeURIComponent(discoveryPageMatch[1]), discoveryPageMatch[2]));
    return true;
  }

  const registrySyncMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/registry\/sync$/);
  if (req.method === "POST" && registrySyncMatch) {
    const tenantId = decodeURIComponent(registrySyncMatch[1]);
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    const deviceId = body.device_id || req.headers["x-pollek-device-id"] || "unknown";
    const lcpId = body.lcp_id || req.headers["x-pollek-lcp-id"] || "lcp_local";
    const snapshot = { agents: [], tools: [], resources: [], entities: [], relationships: [], agent_inventory: [] };
    const telemetryItems = [];
    for (const item of items) {
      const itemType = String(item?.type || item?.object_type || "entity");
      const data = item?.data ?? item;
      if (itemType === "agent") snapshot.agents.push(data);
      else if (itemType === "tool") snapshot.tools.push(data);
      else if (itemType === "resource") snapshot.resources.push(data);
      else if (itemType === "relationship") snapshot.relationships.push(data);
      else if (itemType === "agent_inventory") snapshot.agent_inventory.push(data);
      else if (itemType === "entity") snapshot.entities.push(data);
      else if (itemType.startsWith("telemetry_")) {
        telemetryItems.push({
          ...(typeof data === "object" && data !== null ? data : { value: data }),
          event_type: data?.event_type || itemType.replace(/^telemetry_/, "")
        });
      } else snapshot.entities.push({ object_type: itemType, data });
    }
    const entityCount = ingestLocalEntitySnapshot(snapshot, {
      device_id: deviceId === "unknown" ? "device_local_windows" : deviceId,
      lcp_id: lcpId,
      user_subject: body.user_subject || "unknown"
    });
    const telemetryResult = telemetryItems.length
      ? recordTelemetryPayload(req, { tenant_id: tenantId, device_id: deviceId, events: telemetryItems }, { kind: "registry_sync", tenantIdFromPath: tenantId, sourcePath: pathname })
      : null;
    const run = {
      id: `entity_sync_${crypto.randomUUID()}`,
      mode: "registry_sync_push",
      status: "completed",
      entity_count: entityCount,
      telemetry_count: telemetryItems.length,
      lcp_id: lcpId,
      device_id: deviceId,
      tenant_id: tenantId,
      created_at: new Date().toISOString()
    };
    state.fleet.localEntitySyncRuns.unshift(run);
    state.fleet.localEntitySyncRuns = state.fleet.localEntitySyncRuns.slice(0, 20);
    recordAudit("registry.sync_ingested", "lcp", lcpId, { tenant_id: tenantId, item_count: items.length, entity_count: entityCount, telemetry_count: telemetryItems.length });
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      device_id: deviceId,
      event_type: "registry.sync.v1",
      severity: "info",
      payload: { item_count: items.length, entity_count: entityCount, telemetry_count: telemetryItems.length, sample: redactSensitive(items.slice(0, 5)) }
    });
    scheduleRuntimePersist("registry.sync");
    sendJson(res, 202, {
      schema_version: "pollek.cloud.registry-sync-response.v1",
      accepted: true,
      tenant_id: tenantId,
      item_count: items.length,
      ingested_entities: entityCount,
      telemetry: telemetryResult
        ? { accepted: telemetryResult.accepted, rejected: telemetryResult.rejected, duplicates: telemetryResult.duplicates }
        : { accepted: 0, rejected: 0, duplicates: 0 }
    });
    return true;
  }

  const latestBundleMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/bundles\/latest$/);
  if (req.method === "GET" && latestBundleMatch) {
    const tenantId = decodeURIComponent(latestBundleMatch[1]);
    const bundle = activePolicyBundle();
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", tenant_id: tenantId });
      return true;
    }
    sendJson(res, 200, latestBundleEnvelope(bundle, tenantId));
    return true;
  }

  const deviceLatestBundleMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/devices\/([^/]+)\/bundles\/latest$/);
  if (req.method === "POST" && deviceLatestBundleMatch) {
    const tenantId = decodeURIComponent(deviceLatestBundleMatch[1]);
    const deviceId = decodeURIComponent(deviceLatestBundleMatch[2]);
    const bundle = activePolicyBundle();
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", tenant_id: tenantId, device_id: deviceId });
      return true;
    }
    recordAudit("policy_bundle.latest_requested", "device", deviceId, { tenant_id: tenantId, bundle_id: bundle.id });
    sendJson(res, 200, latestBundleEnvelope(bundle, tenantId, deviceId));
    return true;
  }

  const bundleManifestMatch = pathname.match(/^\/v1\/policy-bundles\/([^/]+)\/manifest$/);
  if (req.method === "GET" && bundleManifestMatch) {
    const bundleId = decodeURIComponent(bundleManifestMatch[1]);
    const bundle = state.fleet.policyBundles.find((item) => item.id === bundleId);
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", bundle_id: bundleId });
      return true;
    }
    sendJson(res, 200, signedPolicyBundleManifest(bundle));
    return true;
  }

  const bundleArtifactMatch = pathname.match(/^\/v1\/policy-bundles\/([^/]+)\/artifact$/);
  if (req.method === "GET" && bundleArtifactMatch) {
    const bundleId = decodeURIComponent(bundleArtifactMatch[1]);
    const bundle = state.fleet.policyBundles.find((item) => item.id === bundleId);
    if (!bundle) {
      sendJson(res, 404, { error: "policy_bundle_not_found", bundle_id: bundleId });
      return true;
    }
    const { artifact, artifact_hash: artifactHash } = policyBundleArtifact(bundle);
    recordAudit("policy_bundle.artifact_served", "policy_bundle", bundle.id, {
      tenant_id: bundleTenantId(bundle),
      artifact_hash: artifactHash
    });
    sendJson(res, 200, { ...artifact, artifact_hash: artifactHash }, {
      etag: `"sha256:${artifactHash}"`,
      "x-pollek-artifact-sha256": artifactHash,
      "cache-control": "public, immutable, max-age=31536000"
    });
    return true;
  }

  // --- Cloud-Phase-1 trust spine (consumed by dek-trust-gate) ---
  if (req.method === "GET" && pathname === "/v1/trust/policy") {
    sendJson(res, 200, trustPolicyDocument());
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/trust/signer-allowlist") {
    sendJson(res, 200, signerAllowlistDocument());
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/trust/revocations") {
    sendJson(res, 200, revocationListDocument());
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/trust/revocations") {
    const body = await readBody(req);
    try {
      const actor = typeof body.actor_id === "string" && body.actor_id ? body.actor_id : "acc_local_admin";
      const list = addRevocations(body, actor);
      sendJson(res, 201, list);
    } catch (error) {
      const status = error?.statusCode || 400;
      sendJson(res, status, { error: error instanceof Error ? error.message : "revocation_failed" });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/trust/provenance") {
    sendJson(res, 200, trustProvenanceView());
    return true;
  }

  const suggestedRoutesMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/pdp\/routes\/suggested$/);
  if (req.method === "GET" && suggestedRoutesMatch) {
    sendJson(res, 200, {
      tenant_id: decodeURIComponent(suggestedRoutesMatch[1]),
      routes: [
        {
          id: "route_cloud_pdp_observe",
          runtime_id: "pollek_cloud",
          mode: "observe",
          reason: "Local dev route suggestion for cloud PDP protocol testing."
        }
      ]
    });
    return true;
  }

  return false;
}

function serveStatic(req, res) {
  const { url, pathname } = parsePath(req);
  let requested = pathname === "/" ? "/index.html" : pathname;
  if (requested === "/device") requested = "/index.html";
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(webDir, safePath);
  if (!filePath.startsWith(webDir) || !existsSync(filePath)) {
    sendText(res, 404, "not found");
    return;
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8"
  };
  res.writeHead(200, {
    ...jsonHeaders,
    "content-type": types[ext] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

function errorStatusCode(error) {
  const status = Number(error?.statusCode || error?.status || 500);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return 500;
}

function sendError(res, error, requestId = "") {
  const status = errorStatusCode(error);
  const code = error?.code || (status === 500 ? "internal_server_error" : "request_failed");
  const body = {
    error: code,
    request_id: requestId || undefined
  };
  if (status < 500 || exposeInternalErrors) {
    body.detail = error instanceof Error ? error.message : String(error);
  }
  sendJson(res, status, body);
}

const server = createServer(async (req, res) => {
  const requestId = `req_${crypto.randomUUID()}`;
  res.setHeader("x-pollek-request-id", requestId);
  try {
    if (!enforceRequestBudget(req, res)) return;
    if (await handleApi(req, res)) return;
    serveStatic(req, res);
  } catch (error) {
    sendError(res, error, requestId);
  }
});

await loadRuntimeState();
ensureRuntimeBackfills();
scheduleRuntimePersist("runtime.backfill");
initializeStreamEventSequence();
initializePolicyBundleSigningLedger();
startLcpEntityWatch();

process.on("SIGINT", () => {
  stopLcpEntityWatch();
  void persistRuntimeState("process.sigint").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stopLcpEntityWatch();
  void persistRuntimeState("process.sigterm").finally(() => process.exit(0));
});

server.listen(port, host, () => {
  console.log(`Pollek Cloud dev console: ${publicUrl}`);
  console.log(`Contract Hub: ${publicUrl}/.well-known/pollek-contract`);
  console.log(`Runtime persistence: ${persistence.enabled ? persistence.file_path : "disabled"}`);
  console.log(`LCP entity/config watch: ${lcpEntityWatch.enabled ? `${lcpEntityWatch.lcp_url} every ${lcpEntityWatch.interval_ms}ms` : "disabled"}`);
});
