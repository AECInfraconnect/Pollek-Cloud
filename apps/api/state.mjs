// Runtime state singleton and the static product catalogs that seed it.
//
// The Cloud boots empty of operational/tenant data; `state` holds everything the running
// process accumulates through the real gated flows, and `createFleetState` builds the initial
// per-tenant fleet shape. This module is imported for its side-effect-free singletons: other
// modules mutate `state.*` in place (it is never reassigned), so they share one object graph.
// The only pre-populated values are static product catalogs (the offering itself), not tenant
// data. See docs/MODULARIZATION_PLAN.md.

export const persistedFleetKeys = [
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

export const ROLE_TEST_USER_TEMPLATES = [
  { role: "admin", email: "admin@pollek.test", display_name: "Test Admin", relation: "admin" },
  {
    role: "security_admin",
    email: "security-admin@pollek.test",
    display_name: "Test Security Admin",
    relation: "security_admin"
  },
  {
    role: "iam_admin",
    email: "iam-admin@pollek.test",
    display_name: "Test IAM Admin",
    relation: "iam_admin"
  },
  {
    role: "billing_admin",
    email: "billing-admin@pollek.test",
    display_name: "Test Billing Admin",
    relation: "billing_admin"
  },
  {
    role: "operator",
    email: "operator@pollek.test",
    display_name: "Test Operator",
    relation: "operator"
  },
  { role: "viewer", email: "viewer@pollek.test", display_name: "Test Viewer", relation: "viewer" }
];

export const ADAPTER_CATALOG = [
  {
    id: "openai_chatgpt",
    display_name: "OpenAI ChatGPT and API",
    short_name: "OpenAI",
    category: "llm_provider",
    description:
      "Hosted model and assistant traffic discovered from API, browser, or desktop activity.",
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
    description:
      "Claude API and desktop usage mapped to agent identity, tool calls, and resource access.",
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
    description:
      "Google AI traffic with project, model, and workspace context for enterprise tenants.",
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
    description:
      "Developer assistant activity from IDE, repository, and enterprise audit channels.",
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
    description:
      "Local IDE agent activity correlated with process, workspace, file, and network evidence.",
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

export const SANDBOX_PROFILES = [
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
    controls: [
      "risk-management",
      "human-oversight",
      "record-keeping",
      "transparency",
      "cybersecurity"
    ],
    target_engines: ["rego", "cedar", "openfga"],
    recommended_pep_types: ["McpProxy", "HttpGateway", "BrowserExtension"],
    default_mode: "approval",
    deployable: true,
    simulation_required: true,
    evidence_streams: ["policy_decision", "tool_usage", "identity_access", "audit_event"],
    cloud_artifacts: [
      "policy_ir",
      "rego",
      "cedar",
      "openfga_model",
      "bundle_manifest",
      "evidence_mapping"
    ],
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
    controls: [
      "access-enforcement",
      "pii-minimization",
      "audit-logging",
      "retention",
      "egress-control"
    ],
    target_engines: ["rego", "wasm_plugin"],
    recommended_pep_types: ["McpProxy", "FileSystemPep", "HttpGateway"],
    default_mode: "enforce",
    deployable: true,
    simulation_required: true,
    evidence_streams: ["resource_access", "content_scan", "policy_decision", "audit_event"],
    cloud_artifacts: [
      "policy_ir",
      "rego",
      "wasm_plugin_config",
      "bundle_manifest",
      "evidence_mapping"
    ],
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
      {
        id: "int_otlp",
        name: "OpenTelemetry Collector",
        type: "otlp",
        status: "not_configured",
        direction: "inbound-outbound"
      },
      {
        id: "int_splunk_hec",
        name: "Splunk HEC",
        type: "siem",
        status: "not_configured",
        direction: "outbound"
      },
      {
        id: "int_syslog_cef",
        name: "Syslog CEF",
        type: "siem",
        status: "not_configured",
        direction: "outbound"
      },
      {
        id: "int_keycloak",
        name: "Keycloak OIDC",
        type: "identity",
        status: "not_configured",
        direction: "inbound"
      }
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
        features: [
          "keycloak_oidc",
          "scim_provisioning",
          "compliance_policy_bundles",
          "breakglass",
          "policy_sandbox"
        ]
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
        features: [
          "offline_license",
          "kms_abstraction",
          "keycloak_oidc",
          "byo_idp_federation",
          "scim_provisioning"
        ]
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

export const state = {
  startedAt: new Date().toISOString(),
  tenant: {
    id: "tnt_local_lab",
    name: "Local Lab Tenant",
    mode: "private-cloud-dev",
    edition: "enterprise-dev",
    entitlements: [
      "enterprise.compliance_policy_bundles",
      "enterprise.policy_sandbox",
      "enterprise.breakglass"
    ],
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
