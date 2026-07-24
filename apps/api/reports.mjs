// Cost & token usage reporting: aggregate usage records into per-dimension (device / user /
// agent / tenant / model / provider) cost and token rollups, with range filtering and CSV
// export. Reads usage records from state; pure aggregation otherwise. See
// docs/MODULARIZATION_PLAN.md.

import { nowIso, normalizeOsFamily } from "./lib/util.mjs";
import { state } from "./state.mjs";

export const COST_TOKEN_DIMENSIONS = ["device", "user", "agent", "tenant", "model", "provider"];

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
  return (
    metric === "ai_model_usage" ||
    metric.includes("token") ||
    metric.includes("cost") ||
    usageFieldNumber(record, ["total_tokens", "tokens", "input_tokens", "output_tokens"]) > 0 ||
    usageFieldNumber(record, [
      "allocated_cost_cents",
      "estimated_cost_cents",
      "cost_cents",
      "amount_cents",
      "billed_credits",
      "credits"
    ]) > 0
  );
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw))
    iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
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
  if (range && (range.from !== null || range.to !== null))
    records = records.filter((record) => recordWithinRange(record, range));
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
        key: usageFieldString(
          record,
          ["agent_id", "entity_id", "object_id"],
          usageFieldString(record, ["agent_name", "name"], "unknown-agent")
        ),
        label: usageFieldString(
          record,
          ["agent_name", "name", "agent_id", "entity_id"],
          "Unknown agent"
        ),
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
      return {
        key: `${provider}::${model}`,
        label: `${provider} ${model}`.trim(),
        meta: { provider, model }
      };
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
  const totalTokens =
    usageFieldNumber(record, ["total_tokens", "tokens"]) || inputTokens + outputTokens;
  const costCents = usageFieldNumber(record, [
    "allocated_cost_cents",
    "estimated_cost_cents",
    "cost_cents",
    "amount_cents"
  ]);
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
  bucket.agents.add(
    usageFieldString(
      record,
      ["agent_id", "entity_id"],
      usageFieldString(record, ["agent_name"], "unknown-agent")
    )
  );
  bucket.tenants.add(usageFieldString(record, ["tenant_id"], "unknown-tenant"));
  bucket.providers.add(usageFieldString(record, ["provider"], "unknown"));
  bucket.models.add(usageFieldString(record, ["model"], "unknown"));
  const activityAt = usageFieldString(record, ["observed_at", "recorded_at"], "");
  if (activityAt && (!bucket.last_activity_at || activityAt > bucket.last_activity_at))
    bucket.last_activity_at = activityAt;
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
    .sort(
      (a, b) => b.cost_cents - a.cost_cents || b.total_tokens - a.total_tokens || b.calls - a.calls
    );
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
    avg_cost_per_device_cents: final.device_count
      ? Math.round(final.cost_cents / final.device_count)
      : 0,
    avg_cost_per_user_cents: final.user_count ? Math.round(final.cost_cents / final.user_count) : 0
  };
}

function costTokenRangeMeta(range) {
  return {
    from: range.from_iso,
    to: range.to_iso,
    applied: range.from !== null || range.to !== null
  };
}

export function costTokenReport(tenantId, dimension, rangeInput = {}) {
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

export function costTokenOverview(tenantId, rangeInput = {}) {
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
    lcp_usage_ledger: records.filter(
      (record) => record.source === "lcp_usage_ledger" || record.confidence === "reported_by_lcp"
    ).length,
    telemetry_bridge: records.filter((record) => record.source === "lcp_model_usage_telemetry")
      .length,
    estimated: records.filter((record) =>
      String(record.confidence || record.source || "").includes("estimate")
    ).length,
    total: records.length
  };
  return overview;
}

export function costTokenReportCsv(report) {
  const header =
    "group_by,key,label,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_cents,credits,calls,records,reported_records,estimated_records,device_count,user_count,agent_count,tenant_count,last_activity_at";
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = report.groups.map((group) =>
    [
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
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
