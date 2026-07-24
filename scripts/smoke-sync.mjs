// smoke-sync.mjs — real end-to-end sync smoke test against a running Pollek Cloud.
//
// Drives the same gated flow the DEK/LCP client must use and verifies the Cloud
// actually ingested and reports the data. Nothing is faked: every value read
// back must come from what this script pushed through the real endpoints.
//
// Usage:
//   node scripts/smoke-sync.mjs [baseUrl]
//   POLLEK_CLOUD_URL=https://pollek-cloud-production.up.railway.app node scripts/smoke-sync.mjs
//   POLLEK_TOKEN=<bearer> node scripts/smoke-sync.mjs   # if the deployment enforces auth
//
// Exit code 0 = all checks passed, 1 = a check failed.

const baseUrl = (
  process.argv[2] ||
  process.env.POLLEK_CLOUD_URL ||
  "http://127.0.0.1:8790"
).replace(/\/+$/, "");
const token = process.env.POLLEK_TOKEN || "";
const tenantId = process.env.POLLEK_TENANT_ID || "local";
const runId = `claude_smoke_${Date.now()}`;
const lcpId = `lcp_${runId}`;
const deviceId = `device_${runId}`;
const userSubject = `smoke\\${runId}`;

let passed = 0;
let failed = 0;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function check(name, condition, detail = "") {
  record(name, Boolean(condition), detail);
  return Boolean(condition);
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-pollek-tenant-id": tenantId,
      "x-pollek-device-id": deviceId,
      "x-pollek-lcp-id": lcpId,
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload, latency_ms: Date.now() - started };
}

async function main() {
  console.log(`Pollek Cloud sync smoke test`);
  console.log(`  target : ${baseUrl}`);
  console.log(`  tenant : ${tenantId}`);
  console.log(`  lcp    : ${lcpId}`);
  console.log(`  auth   : ${token ? "bearer token" : "none (dev / auth-disabled)"}`);
  console.log("");

  // 1. Reachability + contract
  const health = await api("/health");
  check("health 200", health.status === 200, `status=${health.status}`);
  const contract = await api("/.well-known/pollek-contract");
  check(
    "contract discovery 200",
    contract.status === 200,
    contract.payload?.contract_version
      ? `contract_version=${contract.payload.contract_version}`
      : `status=${contract.status}`
  );

  // 2. Baseline fleet (informational; a shared instance may already have data)
  const fleet0 = await api("/api/fleet");
  check(
    "fleet readable",
    fleet0.status === 200,
    `lcps=${fleet0.payload?.local_control_planes?.length ?? "?"} entities=${fleet0.payload?.local_entities?.length ?? "?"} usage=${fleet0.payload?.usage_records?.length ?? "?"}`
  );

  // 3. Gate check: usage ledger from an UNREGISTERED lcp must be rejected.
  const ledgerBeforeEnroll = await api(
    `/v1/tenants/${encodeURIComponent(tenantId)}/lcp/usage-ledgers`,
    {
      method: "POST",
      body: {
        schema_version: "pollek.lcp.usage-ledger.v1",
        tenant_id: tenantId,
        lcp_id: lcpId,
        usage_entries: [
          {
            agent_id: "a",
            device_id: deviceId,
            user_subject: userSubject,
            provider: "p",
            model: "m",
            total_tokens: 1
          }
        ]
      }
    }
  );
  check(
    "usage ledger rejected before enroll (gate enforced)",
    ledgerBeforeEnroll.status === 400,
    `status=${ledgerBeforeEnroll.status}`
  );

  // 4. Enroll the LCP (register into fleet)
  const enroll = await api("/enroll", {
    method: "POST",
    body: {
      hostname: deviceId,
      device_id: deviceId,
      lcp_id: lcpId,
      os: "linux",
      os_family: "linux",
      os_version: "smoke-test"
    }
  });
  check("enroll 200", enroll.status === 200, `device_id=${enroll.payload?.device_id ?? "?"}`);
  const fleetAfterEnroll = await api("/api/fleet");
  check(
    "LCP registered in fleet",
    (fleetAfterEnroll.payload?.local_control_planes || []).some((l) => l.id === lcpId)
  );
  check(
    "tree shows enrolled LCP",
    (fleetAfterEnroll.payload?.tree || []).some((n) => n.type === "lcp" && n.id === lcpId)
  );

  // 5. Ingest inventory (entity)
  const ingest = await api("/api/entities/ingest", {
    method: "POST",
    body: {
      device_id: deviceId,
      lcp_id: lcpId,
      user_subject: userSubject,
      snapshot: {
        agents: [
          { agent_id: `agent_${runId}`, name: `Smoke Agent ${runId}`, trust_level: "trusted" }
        ]
      }
    }
  });
  check("entity ingest accepted", ingest.status === 202 && ingest.payload?.accepted === true);

  // 6. Push telemetry ai_usage_event (bridges to cost/token)
  const telemetry = await api("/v1/telemetry/batches", {
    method: "POST",
    body: {
      schema_version: "telemetry-batch.v1",
      tenant_id: tenantId,
      device_id: deviceId,
      batch_id: `batch_${runId}`,
      events: [
        {
          schema_version: "telemetry-envelope.v1",
          event_id: `evt_${runId}_usage`,
          event_type: "ai_usage_event",
          timestamp: new Date().toISOString(),
          tenant_id: tenantId,
          device_id: deviceId,
          redaction_applied: true,
          payload: {
            agent_id: `agent_${runId}`,
            agent_name: `Smoke Agent ${runId}`,
            user_subject: userSubject,
            device_id: deviceId,
            lcp_id: lcpId,
            provider: "Anthropic",
            model: "claude-sonnet-4",
            tokens: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
            cost: { currency: "USD", total_cost: 1.23 }
          }
        }
      ]
    }
  });
  check(
    "telemetry batch accepted (stored=1)",
    telemetry.status === 202 && telemetry.payload?.stored === 1,
    `accepted=${telemetry.payload?.accepted} stored=${telemetry.payload?.stored} rejected=${telemetry.payload?.rejected}`
  );

  // 6b. Idempotency: resend same event_id -> must dedupe (stored=0, duplicates=1)
  const telemetryReplay = await api("/v1/telemetry/batches", {
    method: "POST",
    body: {
      schema_version: "telemetry-batch.v1",
      tenant_id: tenantId,
      device_id: deviceId,
      batch_id: `batch_${runId}_replay`,
      events: [
        {
          schema_version: "telemetry-envelope.v1",
          event_id: `evt_${runId}_usage`,
          event_type: "ai_usage_event",
          timestamp: new Date().toISOString(),
          tenant_id: tenantId,
          device_id: deviceId,
          redaction_applied: true,
          payload: {
            provider: "Anthropic",
            model: "claude-sonnet-4",
            tokens: { total_tokens: 1500 }
          }
        }
      ]
    }
  });
  check(
    "idempotent replay deduped (duplicates=1, stored=0)",
    telemetryReplay.payload?.duplicates === 1 && telemetryReplay.payload?.stored === 0,
    `duplicates=${telemetryReplay.payload?.duplicates} stored=${telemetryReplay.payload?.stored}`
  );

  // 7. Push a usage ledger now that the LCP is enrolled
  const ledger = await api(`/v1/tenants/${encodeURIComponent(tenantId)}/lcp/usage-ledgers`, {
    method: "POST",
    body: {
      schema_version: "pollek.lcp.usage-ledger.v1",
      ledger_id: `ledger_${runId}`,
      tenant_id: tenantId,
      lcp_id: lcpId,
      device_id: deviceId,
      os_family: "linux",
      os_version: "smoke-test",
      capture_method: "smoke",
      observed_at: new Date().toISOString(),
      usage_entries: [
        {
          id: `usage_${runId}`,
          agent_id: `agent_${runId}`,
          agent_name: `Smoke Agent ${runId}`,
          device_id: deviceId,
          user_subject: userSubject,
          provider: "OpenAI",
          model: "gpt-5-codex",
          pricing_model: "token_metered",
          allocation_method: "direct_token_meter",
          call_count: 3,
          input_tokens: 800,
          output_tokens: 200,
          total_tokens: 1000,
          estimated_cost_cents: 90,
          currency: "USD",
          confidence: "reported_by_lcp"
        }
      ]
    }
  });
  check(
    "usage ledger accepted after enroll",
    ledger.status === 202 && ledger.payload?.ledger?.accepted_count === 1,
    `status=${ledger.status} accepted_count=${ledger.payload?.ledger?.accepted_count}`
  );

  // 8. Verify it shows up in reports (the real proof of sync)
  const ingestStatus = await api("/api/telemetry/ingest-status");
  const totals = (ingestStatus.payload?.totals || []).find((t) => t.tenant_id === tenantId);
  check(
    "ingest-status reflects our batch",
    Boolean(totals && totals.accepted >= 1),
    `accepted=${totals?.accepted} duplicates=${totals?.duplicates} quarantined=${totals?.quarantined_secrets}`
  );

  const overview = await api(
    `/api/reports/cost-tokens/overview?tenant_id=${encodeURIComponent(tenantId)}`
  );
  const agentGroup = (overview.payload?.categories?.agent || []).find(
    (g) => g.key === `agent_${runId}`
  );
  check(
    "cost-token overview includes our agent usage",
    Boolean(agentGroup && agentGroup.total_tokens >= 1500),
    agentGroup
      ? `agent tokens=${agentGroup.total_tokens} cost_cents=${agentGroup.cost_cents}`
      : "agent group not found"
  );

  const byUser = await api(
    `/api/reports/cost-tokens?tenant_id=${encodeURIComponent(tenantId)}&group_by=user`
  );
  const userGroup = (byUser.payload?.groups || []).find((g) => g.key === userSubject);
  check(
    "cost-token report groups by our user",
    Boolean(userGroup && userGroup.total_tokens >= 1500),
    userGroup ? `user tokens=${userGroup.total_tokens}` : "user group not found"
  );

  console.log("");
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log(
    JSON.stringify({ ok: failed === 0, baseUrl, runId, passed, failed, results }, null, 2)
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSmoke test could not run against ${baseUrl}: ${error?.message || error}`);
  console.error(
    "If this is a connection error, confirm the URL is reachable from where you run this script."
  );
  process.exit(1);
});
