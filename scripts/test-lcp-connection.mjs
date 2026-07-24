const cloudUrl = process.env.POLLEK_CLOUD_URL || "http://127.0.0.1:8790";
const lcpUrl = process.env.POLLEK_LCP_URL || "http://127.0.0.1:43891";
const token = process.env.POLLEK_LCP_TOKEN || "";

async function request(name, url, options = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
    const result = {
      name,
      ok: response.ok,
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
      url,
      body
    };
    console.log(`${result.ok ? "PASS" : "FAIL"} ${name} ${result.status} ${result.latency_ms}ms`);
    return result;
  } catch (error) {
    const result = {
      name,
      ok: false,
      status: 0,
      latency_ms: Math.round(performance.now() - started),
      url,
      error: String(error)
    };
    console.log(`FAIL ${name} ${result.error}`);
    return result;
  }
}

const results = [];

results.push(await request("cloud_health", `${cloudUrl}/health`));
results.push(await request("cloud_contract", `${cloudUrl}/.well-known/pollek-contract`));
results.push(await request("lcp_contract", `${lcpUrl}/.well-known/pollek-contract`));

results.push(
  await request("lcp_configure_cloud_profile", `${lcpUrl}/v1/tenants/local/pdp/cloud`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_id: "local",
      device_id: "local",
      pdp_endpoint: cloudUrl,
      contract_version: "2026.06.29",
      auth_method: "spiffe-oauth-mtls-dev",
      status: "configured",
      manual_override_enabled: false,
      health: {
        status: "configured",
        detail: "Configured by scripts/test-lcp-connection.mjs"
      }
    })
  })
);

results.push(
  await request("lcp_probe_cloud_contract", `${lcpUrl}/v1/tenants/local/pdp/cloud/probe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  })
);

results.push(
  await request(
    "lcp_capability_snapshot_v2",
    `${lcpUrl}/v1/tenants/local/devices/local/capability-snapshot-v2`
  )
);

results.push(
  await request("cloud_telemetry_batch", `${cloudUrl}/v1/telemetry/batches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pollek-tenant-id": "local",
      "x-pollek-device-id": "local"
    },
    body: JSON.stringify({
      schema_version: "telemetry-batch.v1",
      tenant_id: "local",
      device_id: "local",
      batch_id: `batch_${Date.now()}`,
      events: [
        {
          event_id: `evt_${Date.now()}`,
          schema_version: "1.0",
          event_type: "policy.decision.v1",
          severity: "info",
          payload: {
            source: "local-protocol-test",
            cloud_url: cloudUrl,
            lcp_url: lcpUrl
          }
        }
      ]
    })
  })
);

const failed = results.filter((result) => !result.ok);
console.log("");
console.log(
  JSON.stringify(
    { ok: failed.length === 0, failed: failed.map((item) => item.name), results },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exitCode = 1;
}
