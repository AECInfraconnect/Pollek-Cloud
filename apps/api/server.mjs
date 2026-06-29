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
  probes: []
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

function recordEvent(event) {
  const normalized = {
    received_at: new Date().toISOString(),
    ...event
  };
  state.events.unshift(normalized);
  state.events = state.events.slice(0, 100);
  return normalized;
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
    addTask("lcp_protocol_probe", ok ? "completed" : "failed", ok ? "Local Control Plane cloud protocol probe succeeded" : "Local Control Plane cloud protocol probe needs attention", { lcp_url: lcpUrl });
    sendJson(res, ok ? 200 : 502, probe);
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
