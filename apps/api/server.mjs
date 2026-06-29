import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const webDir = path.join(rootDir, "apps/web/static");
const contractPath = path.join(rootDir, "packages/contracts/pollek-contract.json");

const host = process.env.POLLEK_CLOUD_DEV_HOST || "127.0.0.1";
const port = Number(process.env.POLLEK_CLOUD_DEV_PORT || 8790);
const publicUrl = process.env.POLLEK_CLOUD_PUBLIC_URL || `http://${host}:${port}`;

function createFleetState() {
  const now = new Date().toISOString();
  const localEndpoint = process.env.POLLEK_LCP_URL || "http://127.0.0.1:43891";
  return {
    tree: [
      { id: "tenant_local_lab", parent_id: null, type: "tenant", name: "Local Lab Tenant", status: "connected", risk: "medium" },
      { id: "site_bkk_hq", parent_id: "tenant_local_lab", type: "site", name: "Bangkok HQ", status: "connected", risk: "medium" },
      { id: "group_developers", parent_id: "site_bkk_hq", type: "device_group", name: "Developers", status: "connected", risk: "medium" },
      { id: "device_local_windows", parent_id: "group_developers", type: "device", name: "DELL-WINDOWS", status: "unknown", risk: "medium" },
      { id: "lcp_local", parent_id: "device_local_windows", type: "lcp", name: "Local Control Plane", status: "unknown", risk: "medium" },
      { id: "agent_cursor", parent_id: "lcp_local", type: "agent", name: "Cursor Agent", status: "observed", risk: "medium" },
      { id: "agent_claude", parent_id: "lcp_local", type: "agent", name: "Claude Desktop", status: "observed", risk: "medium" },
      { id: "site_private_dc", parent_id: "tenant_local_lab", type: "site", name: "Private DC", status: "degraded", risk: "high" },
      { id: "group_gpu_nodes", parent_id: "site_private_dc", type: "device_group", name: "GPU Nodes", status: "connected", risk: "medium" },
      { id: "device_dc_gpu_01", parent_id: "group_gpu_nodes", type: "device", name: "DC-GPU-01", status: "connected", risk: "medium" },
      { id: "lcp_dc_gpu_01", parent_id: "device_dc_gpu_01", type: "lcp", name: "LCP DC GPU 01", status: "connected", risk: "medium" },
      { id: "site_sgx_lab", parent_id: "tenant_local_lab", type: "site", name: "Singapore Lab", status: "offline", risk: "high" },
      { id: "group_research", parent_id: "site_sgx_lab", type: "device_group", name: "Research", status: "offline", risk: "high" },
      { id: "device_sgx_07", parent_id: "group_research", type: "device", name: "SGX-LAB-07", status: "offline", risk: "high" },
      { id: "lcp_sgx_07", parent_id: "device_sgx_07", type: "lcp", name: "LCP SGX 07", status: "offline", risk: "high" }
    ],
    localControlPlanes: [
      {
        id: "lcp_local",
        tenant_id: "local",
        site: "Bangkok HQ",
        group: "Developers",
        device_id: "device_local_windows",
        device_name: "DELL-WINDOWS",
        name: "Local Control Plane",
        endpoint: localEndpoint,
        status: "unknown",
        risk: "medium",
        version: "1.0.0-beta.10",
        contract_version: "unknown",
        active_bundle: "bnd_local_dev_baseline",
        agents: 2,
        tools: 8,
        resources: 14,
        policy_coverage: 62,
        last_seen_at: null,
        capability_summary: "Probe pending",
        spiffe_id: "spiffe://local.pollek.cloud/tenant/local/site/site_bkk_hq/device/device_local_windows/lcp/lcp_local"
      },
      {
        id: "lcp_dc_gpu_01",
        tenant_id: "local",
        site: "Private DC",
        group: "GPU Nodes",
        device_id: "device_dc_gpu_01",
        device_name: "DC-GPU-01",
        name: "LCP DC GPU 01",
        endpoint: "https://lcp-dc-gpu-01.private.example",
        status: "connected",
        risk: "medium",
        version: "1.0.0-beta.10",
        contract_version: "2026.06.26",
        active_bundle: "bnd_ai_data_protection",
        agents: 18,
        tools: 47,
        resources: 122,
        policy_coverage: 88,
        last_seen_at: now,
        capability_summary: "WASM policy, MCP proxy, telemetry batch",
        spiffe_id: "spiffe://local.pollek.cloud/tenant/local/site/site_private_dc/device/device_dc_gpu_01/lcp/lcp_dc_gpu_01"
      },
      {
        id: "lcp_sgx_07",
        tenant_id: "local",
        site: "Singapore Lab",
        group: "Research",
        device_id: "device_sgx_07",
        device_name: "SGX-LAB-07",
        name: "LCP SGX 07",
        endpoint: "https://lcp-sgx-07.private.example",
        status: "offline",
        risk: "high",
        version: "1.0.0-beta.6",
        contract_version: "2026.06.26",
        active_bundle: "bnd_shadow_ai_observe",
        agents: 9,
        tools: 21,
        resources: 64,
        policy_coverage: 41,
        last_seen_at: "2026-06-29T02:14:00.000Z",
        capability_summary: "Last heartbeat stale",
        spiffe_id: "spiffe://local.pollek.cloud/tenant/local/site/site_sgx_lab/device/device_sgx_07/lcp/lcp_sgx_07"
      }
    ],
    relationships: [
      { from: "tenant_local_lab", to: "site_bkk_hq", label: "contains" },
      { from: "site_bkk_hq", to: "lcp_local", label: "manages" },
      { from: "lcp_local", to: "agent_cursor", label: "observes" },
      { from: "lcp_local", to: "agent_claude", label: "observes" },
      { from: "lcp_local", to: "bnd_local_dev_baseline", label: "desired bundle" },
      { from: "lcp_dc_gpu_01", to: "bnd_ai_data_protection", label: "active bundle" },
      { from: "lcp_sgx_07", to: "alarm_lcp_offline", label: "raises" }
    ],
    policyBundles: [
      { id: "bnd_local_dev_baseline", name: "Local Dev Baseline", revision: "2026.06.29.001", status: "available", coverage: 62 },
      { id: "bnd_ai_data_protection", name: "AI Data Protection", revision: "2026.06.29.004", status: "active", coverage: 88 },
      { id: "bnd_shadow_ai_observe", name: "Shadow AI Observe", revision: "2026.06.28.011", status: "stale", coverage: 41 }
    ],
    alarms: [
      {
        id: "alarm_lcp_offline",
        severity: "critical",
        object_id: "lcp_sgx_07",
        object_name: "LCP SGX 07",
        summary: "Heartbeat stale for more than 3 hours",
        state: "open",
        created_at: "2026-06-29T02:20:00.000Z"
      },
      {
        id: "alarm_policy_coverage",
        severity: "warning",
        object_id: "lcp_local",
        object_name: "Local Control Plane",
        summary: "Policy coverage below tenant target",
        state: "open",
        created_at: now
      }
    ],
    policyPacks: [
      {
        id: "pack_ai_data_protection",
        name: "AI Data Leakage Protection",
        status: "ready",
        default_mode: "enforce",
        engines: ["rego", "wasm-redactor"],
        coverage: 88,
        controls: ["pii", "secrets", "document-egress"]
      },
      {
        id: "pack_prompt_injection",
        name: "Prompt Injection Defense",
        status: "ready",
        default_mode: "warn",
        engines: ["rego", "content-guard"],
        coverage: 76,
        controls: ["tool-output-injection", "instruction-hijack"]
      },
      {
        id: "pack_shadow_ai",
        name: "Shadow AI Discovery and Control",
        status: "observe",
        default_mode: "observe",
        engines: ["cedar", "rego"],
        coverage: 64,
        controls: ["unmanaged-agents", "provider-egress"]
      }
    ],
    integrations: [
      { id: "int_otlp", name: "OpenTelemetry Collector", type: "otlp", status: "configured", direction: "inbound-outbound" },
      { id: "int_splunk_hec", name: "Splunk HEC", type: "siem", status: "needs_secret", direction: "outbound" },
      { id: "int_syslog_cef", name: "Syslog CEF", type: "siem", status: "not_configured", direction: "outbound" },
      { id: "int_keycloak", name: "Keycloak OIDC", type: "identity", status: "configured", direction: "inbound" }
    ],
    evidenceExports: [],
    rolloutPlans: []
  };
}

const state = {
  startedAt: new Date().toISOString(),
  tenant: {
    id: "tnt_local_lab",
    name: "Local Lab Tenant",
    mode: "private-cloud-dev",
    trustDomain: "local.pollek.cloud"
  },
  devices: new Map(),
  events: [],
  tasks: [],
  enrollmentCodes: new Map(),
  probes: [],
  fleet: createFleetState()
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-pollek-device-id,x-pollek-tenant-id"
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { ...jsonHeaders, ...extraHeaders });
  res.end(payload);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
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
  return task;
}

function completeTask(task, patch = {}) {
  Object.assign(task, patch, {
    status: patch.status || "completed",
    updated_at: new Date().toISOString()
  });
  return task;
}

function recordEvent(event) {
  const normalized = {
    received_at: new Date().toISOString(),
    ...event
  };
  state.events.unshift(normalized);
  state.events = state.events.slice(0, 100);
  return normalized;
}

function fleetObjectMap() {
  const objects = new Map();
  for (const item of state.fleet.tree) {
    objects.set(item.id, { ...item });
  }
  for (const lcp of state.fleet.localControlPlanes) {
    objects.set(lcp.id, { ...(objects.get(lcp.id) || {}), ...lcp, type: "lcp" });
  }
  for (const bundle of state.fleet.policyBundles) {
    objects.set(bundle.id, { ...bundle, type: "policy_bundle", status: bundle.status, risk: bundle.coverage < 60 ? "high" : "medium" });
  }
  return objects;
}

function fleetSummary() {
  const lcps = state.fleet.localControlPlanes;
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
    sites: state.fleet.tree.filter((item) => item.type === "site").length,
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
    integrations_configured: state.fleet.integrations.filter((item) => item.status === "configured").length,
    evidence_exports: state.fleet.evidenceExports.length
  };
}

function updateTreeObject(id, patch) {
  const item = state.fleet.tree.find((entry) => entry.id === id);
  if (item) Object.assign(item, patch);
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
  updateTreeObject("lcp_local", { status: lcp.status, risk: lcp.risk });
  updateTreeObject("device_local_windows", { status: lcp.status, risk: lcp.risk });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";
  if (!raw) return {};
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
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

async function contractDiscovery() {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  return {
    ...contract,
    cloud_url: publicUrl,
    checked_at: new Date().toISOString(),
    endpoints: {
      health: "/health",
      enrollment_device_authorization: "/oauth/device_authorization",
      enrollment_token: "/oauth/token",
      enroll: "/enroll",
      telemetry_batches: "/v1/telemetry/batches",
      registry_sync: "/v1/tenants/{tenant_id}/registry/sync",
      latest_bundle: "/v1/tenants/{tenant_id}/bundles/latest",
      suggested_pdp_routes: "/v1/tenants/{tenant_id}/pdp/routes/suggested"
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

async function handleApi(req, res) {
  const { url, pathname } = parsePath(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
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

  if (req.method === "GET" && pathname.startsWith("/contracts/")) {
    const contract = await contractDiscovery();
    sendJson(res, 200, {
      schema_version: "dev-contract-artifact.v1",
      path: pathname,
      generated: false,
      note: "Placeholder artifact served by the local Contract Hub. TypeSpec/OpenAPI generation lands in the next phase.",
      contract
    });
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
          contract_version: "2026.06.29",
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
    sendJson(res, 200, {
      cloud_url: publicUrl,
      tenant: state.tenant,
      summary: fleetSummary(),
      tree: state.fleet.tree,
      objects,
      local_control_planes: state.fleet.localControlPlanes,
      relationships: state.fleet.relationships,
      policy_bundles: state.fleet.policyBundles,
      policy_packs: state.fleet.policyPacks,
      integrations: state.fleet.integrations,
      evidence_exports: state.fleet.evidenceExports,
      rollout_plans: state.fleet.rolloutPlans,
      alarms: state.fleet.alarms,
      events: state.events.slice(0, 30),
      tasks: state.tasks.slice(0, 30),
      probes: state.probes.slice(0, 10),
      contract: await contractDiscovery()
    });
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
    const targetIds = Array.isArray(body.target_ids) && body.target_ids.length
      ? body.target_ids
      : state.fleet.localControlPlanes.filter((lcp) => lcp.status !== "offline").map((lcp) => lcp.id);
    const bundleId = body.bundle_id || "bnd_ai_data_protection";
    const rollout = {
      id: `rollout_${crypto.randomUUID()}`,
      tenant_id: "local",
      bundle_id: bundleId,
      target_ids: targetIds,
      wave_strategy: body.wave_strategy || "canary-then-batch",
      status: "planned",
      created_at: new Date().toISOString()
    };
    state.fleet.rolloutPlans.unshift(rollout);
    const task = addTask("bundle_rollout", "queued", `Created rollout for ${targetIds.length} Local Control Planes`, {
      rollout_id: rollout.id,
      bundle_id: bundleId,
      target_ids: targetIds
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
        alarms: state.fleet.alarms
      },
      contract: await contractDiscovery()
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/telemetry/batches") {
    const body = await readBody(req);
    const events = Array.isArray(body.events) ? body.events : [];
    recordEvent({
      event_id: body.batch_id || `batch_${crypto.randomUUID()}`,
      tenant_id: body.tenant_id || req.headers["x-pollek-tenant-id"] || "unknown",
      device_id: body.device_id || req.headers["x-pollek-device-id"] || "unknown",
      event_type: "telemetry.batch.v1",
      severity: "info",
      payload: {
        schema_version: body.schema_version || "telemetry-batch.v1",
        event_count: events.length,
        sample: events.slice(0, 3)
      }
    });
    sendJson(res, 202, {
      accepted: true,
      batch_id: body.batch_id || null,
      received_events: events.length
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/v1/telemetry/envelopes") {
    const body = await readBody(req);
    const event = recordEvent({
      event_id: body.event_id || `evt_${crypto.randomUUID()}`,
      tenant_id: body.tenant_id || req.headers["x-pollek-tenant-id"] || "unknown",
      device_id: body.device_id || req.headers["x-pollek-device-id"] || "unknown",
      event_type: body.event_type || "telemetry.envelope.v1",
      severity: body.severity || "info",
      payload: body
    });
    sendJson(res, 202, { accepted: true, event_id: event.event_id });
    return true;
  }

  const registrySyncMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/registry\/sync$/);
  if (req.method === "POST" && registrySyncMatch) {
    const tenantId = decodeURIComponent(registrySyncMatch[1]);
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    recordEvent({
      event_id: `evt_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      device_id: req.headers["x-pollek-device-id"] || "unknown",
      event_type: "registry.sync.v1",
      severity: "info",
      payload: { item_count: items.length, sample: items.slice(0, 5) }
    });
    sendJson(res, 202, { accepted: true, tenant_id: tenantId, item_count: items.length });
    return true;
  }

  const latestBundleMatch = pathname.match(/^\/v1\/tenants\/([^/]+)\/bundles\/latest$/);
  if (req.method === "GET" && latestBundleMatch) {
    sendJson(res, 200, {
      schema_version: "bundle-envelope.v1",
      tenant_id: decodeURIComponent(latestBundleMatch[1]),
      bundle_id: "bnd_local_dev_baseline",
      revision: "2026.06.29.001",
      status: "available",
      manifest_url: `${publicUrl}/v1/policy-bundles/bnd_local_dev_baseline/manifest`,
      artifact_url: `${publicUrl}/v1/policy-bundles/bnd_local_dev_baseline/artifact`,
      hot_reload: true
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/policy-bundles/bnd_local_dev_baseline/manifest") {
    sendJson(res, 200, {
      manifest_version: "1.0",
      bundle_id: "bnd_local_dev_baseline",
      tenant_id: "local",
      revision: "2026.06.29.001",
      created_at: "2026-06-29T00:00:00Z",
      target: {
        control_level: "Observe",
        pep_capabilities: ["mcp-stdio", "http-proxy"],
        agent_selectors: [{ kind: "label", value: "managed=true" }]
      },
      policies: [],
      signatures: [{ key_id: "local-dev", alg: "Ed25519", sig: "dev-placeholder" }]
    });
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
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_server_error",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`Pollek Cloud dev console: ${publicUrl}`);
  console.log(`Contract Hub: ${publicUrl}/.well-known/pollek-contract`);
});
