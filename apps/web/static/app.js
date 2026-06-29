const refs = {
  appShell: document.querySelector("#appShell"),
  cloudStatus: document.querySelector("#cloudStatus"),
  globalSearch: document.querySelector("#globalSearch"),
  navCollapseButton: document.querySelector("#navCollapseButton"),
  opsRail: document.querySelector("#opsRail"),
  opsCollapseButton: document.querySelector("#opsCollapseButton"),
  refreshButton: document.querySelector("#refreshButton"),
  inventoryTree: document.querySelector("#inventoryTree"),
  breadcrumb: document.querySelector("#breadcrumb"),
  objectTitle: document.querySelector("#objectTitle"),
  objectStatus: document.querySelector("#objectStatus"),
  objectRisk: document.querySelector("#objectRisk"),
  objectContext: document.querySelector("#objectContext"),
  metricLcpTotal: document.querySelector("#metricLcpTotal"),
  metricConnected: document.querySelector("#metricConnected"),
  metricDegraded: document.querySelector("#metricDegraded"),
  metricOffline: document.querySelector("#metricOffline"),
  metricAgents: document.querySelector("#metricAgents"),
  metricEntities: document.querySelector("#metricEntities"),
  metricCoverage: document.querySelector("#metricCoverage"),
  fleetRows: document.querySelector("#fleetRows"),
  operationsFocus: document.querySelector("#operationsFocus"),
  statusFilter: document.querySelector("#statusFilter"),
  entitySyncButton: document.querySelector("#entitySyncButton"),
  entityTypeFilter: document.querySelector("#entityTypeFilter"),
  entityDeviceFilter: document.querySelector("#entityDeviceFilter"),
  entityUserFilter: document.querySelector("#entityUserFilter"),
  entitySearch: document.querySelector("#entitySearch"),
  entityInsightStrip: document.querySelector("#entityInsightStrip"),
  entityList: document.querySelector("#entityList"),
  entityTracePanel: document.querySelector("#entityTracePanel"),
  connectionProfileList: document.querySelector("#connectionProfileList"),
  serviceEndpointList: document.querySelector("#serviceEndpointList"),
  relationshipMap: document.querySelector("#relationshipMap"),
  eventTable: document.querySelector("#eventTable"),
  probeButton: document.querySelector("#probeButton"),
  probeVisibleButton: document.querySelector("#probeVisibleButton"),
  liveRefreshButton: document.querySelector("#liveRefreshButton"),
  pushConfigButton: document.querySelector("#pushConfigButton"),
  hotReloadButton: document.querySelector("#hotReloadButton"),
  liveSyncStatus: document.querySelector("#liveSyncStatus"),
  rolloutButton: document.querySelector("#rolloutButton"),
  evidenceButton: document.querySelector("#evidenceButton"),
  lcpUrl: document.querySelector("#lcpUrl"),
  lcpToken: document.querySelector("#lcpToken"),
  probeResult: document.querySelector("#probeResult"),
  alarmCount: document.querySelector("#alarmCount"),
  alarmList: document.querySelector("#alarmList"),
  taskList: document.querySelector("#taskList"),
  policyPackCount: document.querySelector("#policyPackCount"),
  policyPackList: document.querySelector("#policyPackList"),
  integrationList: document.querySelector("#integrationList"),
  relationshipMapFull: document.querySelector("#relationshipMapFull"),
  relationshipDetailList: document.querySelector("#relationshipDetailList"),
  policyDraftList: document.querySelector("#policyDraftList"),
  bundleStatusList: document.querySelector("#bundleStatusList"),
  policyIntent: document.querySelector("#policyIntent"),
  policyEngineHint: document.querySelector("#policyEngineHint"),
  aiPolicyButton: document.querySelector("#aiPolicyButton"),
  simulatePolicyButton: document.querySelector("#simulatePolicyButton"),
  approvePolicyButton: document.querySelector("#approvePolicyButton"),
  policyAssistantResult: document.querySelector("#policyAssistantResult"),
  telemetrySeverity: document.querySelector("#telemetrySeverity"),
  telemetryType: document.querySelector("#telemetryType"),
  telemetrySearch: document.querySelector("#telemetrySearch"),
  telemetryQueryButton: document.querySelector("#telemetryQueryButton"),
  telemetrySampleButton: document.querySelector("#telemetrySampleButton"),
  telemetryExplorer: document.querySelector("#telemetryExplorer"),
  alarmTabList: document.querySelector("#alarmTabList"),
  enrollmentButton: document.querySelector("#enrollmentButton"),
  enrollmentList: document.querySelector("#enrollmentList"),
  evidenceExportList: document.querySelector("#evidenceExportList"),
  rolloutTimeline: document.querySelector("#rolloutTimeline"),
  complianceBundleList: document.querySelector("#complianceBundleList"),
  complianceScoreList: document.querySelector("#complianceScoreList"),
  sandboxRunList: document.querySelector("#sandboxRunList"),
  breakglassList: document.querySelector("#breakglassList"),
  sandboxButton: document.querySelector("#sandboxButton"),
  breakglassButton: document.querySelector("#breakglassButton"),
  complianceDeployButton: document.querySelector("#complianceDeployButton"),
  auditList: document.querySelector("#auditList"),
  integrationHealthList: document.querySelector("#integrationHealthList")
};

function readStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

const app = {
  data: null,
  selectedObjectId: "tenant_local_lab",
  activeTab: "summary",
  query: "",
  streamConnected: false,
  streamRefreshPending: false,
  navCollapsed: localStorage.getItem("pollek.cloud.nav.collapsed") === "true",
  opsCollapsed: localStorage.getItem("pollek.cloud.ops.collapsed") === "true",
  collapsedNavNodes: readStoredSet("pollek.cloud.nav.nodes.collapsed"),
  expandedNavNodes: readStoredSet("pollek.cloud.nav.nodes.expanded"),
  collapsedOpsSections: readStoredSet("pollek.cloud.ops.sections.collapsed"),
  collapsedEntityGroups: readStoredSet("pollek.cloud.entities.groups.collapsed"),
  expandedEntityGroups: readStoredSet("pollek.cloud.entities.groups.expanded"),
  statusFilter: "all",
  entityTypeFilter: "all",
  entityDeviceFilter: "all",
  entityUserFilter: "all",
  entityQuery: "",
  telemetryResults: [],
  latestPolicyDraftId: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  if (["connected", "active", "available", "registered", "published", "enforcing", "observed", "configured", "ready", "completed", "healthy"].includes(status)) return "ok";
  if (["offline", "critical", "failed", "untrusted", "denied", "deny"].includes(status)) return "bad";
  if (["degraded", "unknown", "stale", "found_unregistered", "needs_secret", "planned", "designed", "waiting_for_lcp", "warning", "pending_approval", "warn"].includes(status)) return "warn";
  return "neutral";
}

const kindLabels = {
  tenant: "Tenant",
  site: "Site",
  device_group: "Group",
  device: "Device",
  lcp: "LCP",
  agent: "Agent",
  registered_agent: "Registered agent",
  found_agent: "Found agent",
  policy: "Policy",
  enforcement: "Enforcement",
  observability: "Observe",
  resource: "Resource",
  policy_bundle: "Bundle",
  alarm: "Alarm",
  task: "Task",
  integration: "Integration",
  identity: "Identity",
  telemetry: "Telemetry",
  rollout: "Rollout",
  compliance: "Compliance",
  sandbox: "Sandbox",
  breakglass: "Breakglass",
  entity_group: "Entity group",
  object: "Object"
};

function normalizeKind(kind) {
  return String(kind || "object").replaceAll("_", "-").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "object";
}

const iconSvgs = {
  tenant: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-6h6v6"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M16 12h.01"/>',
  site: '<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  device_group: '<path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M3 21v-2a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v2"/><path d="M13 14h3a5 5 0 0 1 5 5v2"/>',
  device: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  lcp: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.01M8 17h.01M12 10v4"/>',
  agent: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4M9 4h6M8.5 13h.01M15.5 13h.01M9 18l-2 3M15 18l2 3"/>',
  registered_agent: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4M9 4h6M9 13h.01M15 13h.01M9.5 16.2l1.7 1.6 3.6-3.9"/>',
  found_agent: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4M9 4h6M9 13h.01M15 13h.01"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="m19.4 8.4 1.8 1.8"/>',
  policy: '<path d="M12 3 5 6v5c0 4.8 3 8.4 7 10 4-1.6 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
  policy_bundle: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
  enforcement: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="m9.5 15 2 2 3.5-4"/>',
  observability: '<path d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="3"/>',
  resource: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  telemetry: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  identity: '<circle cx="8" cy="8" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h2"/><path d="M14 15l2 2 5-5"/><path d="M16 17v4h4"/>',
  spiffe: '<path d="M12 3 5 6v5c0 4.8 3 8.4 7 10 4-1.6 7-5.2 7-10V6l-7-3Z"/><path d="M9 12h6M12 9v6"/>',
  oidc: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 3"/>',
  rollout: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M20 9A8 8 0 0 0 6.3 5.3L4 10"/><path d="M4 15a8 8 0 0 0 13.7 3.7L20 14"/>',
  wasm: '<path d="M5 5h14v14H5V5Z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  alarm: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  task: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
  integration: '<path d="M8 8V4M16 8V4"/><path d="M7 8h10v5a5 5 0 0 1-10 0V8Z"/><path d="M12 18v3M9 21h6"/>',
  otlp: '<path d="M4 16V8l8-4 8 4v8l-8 4-8-4Z"/><path d="M8 10h8M8 14h5"/>',
  siem: '<path d="M4 5h16v14H4V5Z"/><path d="M8 9h8M8 13h5M8 17h3"/>',
  compliance: '<path d="M12 3 5 6v5c0 4.8 3 8.4 7 10 4-1.6 7-5.2 7-10V6l-7-3Z"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  sandbox: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 12 4.4 7.7M12 12l7.6-4.3M12 12v8.5"/>',
  breakglass: '<path d="M7 11V8a5 5 0 0 1 9.5-2.2"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="m9 17 6-3M9 14l6 3"/>',
  entity_group: '<path d="M4 5h6l2 2h8v12H4V5Z"/><path d="M8 11h8M8 15h5"/>',
  object: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="M4 7l8 4 8-4M12 11v10"/>'
};

function kindLabel(kind) {
  return kindLabels[kind] || kindLabels[String(kind || "").replaceAll("-", "_")] || String(kind || "Object").replaceAll("_", " ");
}

function iconSvg(kind) {
  const key = String(kind || "object").replaceAll("-", "_").replace(/[^a-z0-9_]/gi, "").toLowerCase() || "object";
  const normalizedKey = normalizeKind(kind).replaceAll("-", "_");
  return iconSvgs[key] || iconSvgs[normalizedKey] || iconSvgs.object;
}

function iconHtml(kind, status = "neutral", extraClass = "") {
  return `<span class="object-icon icon-${normalizeKind(kind)} ${statusClass(status)} ${escapeHtml(extraClass)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${iconSvg(kind)}</svg></span>`;
}

function chipHtml(label, status = "neutral", title = "") {
  return `<span class="mini-chip ${statusClass(status)}" title="${escapeHtml(title || label)}">${escapeHtml(label)}</span>`;
}

function riskStatus(risk) {
  if (risk === "high" || risk === "critical") return "bad";
  if (risk === "medium" || risk === "warning") return "warn";
  return "ok";
}

function objectKind(object) {
  return object?.entity_type || object?.type || object?.class || "object";
}

function entitiesForLcp(lcp) {
  return (app.data.local_entities || []).filter((entity) => (
    entity.lcp_id === lcp.id || entity.device_id === lcp.device_id || entity.device_name === lcp.device_name
  ));
}

function alarmsForObject(id) {
  return (app.data.alarms || []).filter((alarm) => alarm.state === "open" && (alarm.object_id === id || alarm.payload?.object_id === id));
}

function entityReadiness(entity) {
  const trace = entity.trace || {};
  const identity = entity.identity || {};
  const token = Array.isArray(identity.token_bindings) ? identity.token_bindings[0] : null;
  const identityReady = Boolean(trace.spiffe_id || identity.spiffe_id || trace.oidc_subject || token?.subject);
  const telemetryReady = Boolean(entity.observability?.telemetry_streams?.length);
  const policyReady = Boolean(entity.enforcement?.mode === "Enforce" || entity.policy_ids?.length || entity.status === "published");
  const wasmReady = Boolean(entity.wasm?.hot_reload);
  return { identityReady, telemetryReady, policyReady, wasmReady };
}

function entityHealthStatus(entity) {
  if (entity.risk === "high" || entity.status === "offline" || entity.status === "failed") return "bad";
  if (entity.status === "found_unregistered" || entity.risk === "medium" || !entityReadiness(entity).identityReady) return "warn";
  return "ok";
}

function entityChips(entity) {
  const ready = entityReadiness(entity);
  return [
    chipHtml(ready.identityReady ? "Identity ready" : "Identity gap", ready.identityReady ? "ok" : "warn"),
    chipHtml(ready.policyReady ? "Policy bound" : "Policy gap", ready.policyReady ? "ok" : "warn"),
    chipHtml(ready.telemetryReady ? "Telemetry" : "No stream", ready.telemetryReady ? "ok" : "warn"),
    chipHtml(ready.wasmReady ? "WASM hot reload" : "WASM pending", ready.wasmReady ? "ok" : "warn")
  ].join("");
}

function countByKind(entities) {
  return entities.reduce((acc, entity) => {
    const key = entity.entity_type || entity.class || "object";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function lcpNarrative(lcp) {
  const entities = entitiesForLcp(lcp);
  const counts = countByKind(entities);
  const openAlarms = alarmsForObject(lcp.id).length;
  const found = counts.found_agent || 0;
  const policies = counts.policy || 0;
  const observe = counts.observability || 0;
  return `${entities.length} entities, ${found} found, ${policies} policies, ${observe} observe, ${openAlarms} alarms`;
}

function setCloudStatus(ok, text) {
  refs.cloudStatus.className = `status-pill ${ok ? "ok" : "bad"}`;
  refs.cloudStatus.textContent = text;
}

function applyShellState() {
  refs.appShell.classList.toggle("nav-collapsed", app.navCollapsed);
  refs.appShell.classList.toggle("ops-collapsed", app.opsCollapsed);
  refs.navCollapseButton?.setAttribute("aria-expanded", String(!app.navCollapsed));
  refs.opsCollapseButton?.setAttribute("aria-expanded", String(!app.opsCollapsed));
}

function setNavCollapsed(collapsed) {
  app.navCollapsed = collapsed;
  localStorage.setItem("pollek.cloud.nav.collapsed", String(collapsed));
  applyShellState();
}

function setOpsCollapsed(collapsed) {
  app.opsCollapsed = collapsed;
  localStorage.setItem("pollek.cloud.ops.collapsed", String(collapsed));
  applyShellState();
}

function persistOpsSectionState() {
  localStorage.setItem("pollek.cloud.ops.sections.collapsed", JSON.stringify([...app.collapsedOpsSections]));
}

function applyOpsSectionState() {
  document.querySelectorAll("[data-ops-section]").forEach((panel) => {
    const section = panel.dataset.opsSection;
    const collapsed = app.collapsedOpsSections.has(section);
    panel.classList.toggle("collapsed", collapsed);
    const button = panel.querySelector("[data-ops-section-toggle]");
    const glyph = panel.querySelector(".ops-toggle-glyph");
    button?.setAttribute("aria-expanded", String(!collapsed));
    if (glyph) glyph.textContent = collapsed ? "+" : "-";
  });
}

function toggleOpsSection(section) {
  if (app.collapsedOpsSections.has(section)) {
    app.collapsedOpsSections.delete(section);
  } else {
    app.collapsedOpsSections.add(section);
  }
  persistOpsSectionState();
  applyOpsSectionState();
}

function tabFromHash() {
  const match = location.hash.match(/tab=([a-z_]+)/);
  return match ? match[1] : "summary";
}

function setActiveTab(tabName, options = {}) {
  const panel = document.querySelector(`[data-tab-panel="${tabName}"]`);
  const nextTab = panel ? tabName : "summary";
  app.activeTab = nextTab;

  document.querySelectorAll(".tab").forEach((button) => {
    const active = button.dataset.tab === nextTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-tab-panel]").forEach((item) => {
    item.hidden = item.dataset.tabPanel !== nextTab;
    item.classList.toggle("active", item.dataset.tabPanel === nextTab);
  });
  document.querySelectorAll(".view-button").forEach((button) => {
    const target = button.dataset.targetTab || "summary";
    button.classList.toggle("active", target === nextTab);
  });

  if (options.updateHash !== false) {
    history.replaceState(null, "", `#tab=${nextTab}`);
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/fleet");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    app.data = await response.json();
    if (!app.latestPolicyDraftId && app.data.policy_drafts?.length) {
      app.latestPolicyDraftId = app.data.policy_drafts[0].id;
    }
    setCloudStatus(true, app.streamConnected ? "Cloud API streaming" : "Cloud API online");
    render();
  } catch (error) {
    setCloudStatus(false, "Cloud API offline");
    refs.probeResult.textContent = String(error);
  }
}

function scheduleStreamRefresh() {
  if (app.streamRefreshPending) return;
  app.streamRefreshPending = true;
  window.setTimeout(async () => {
    app.streamRefreshPending = false;
    await refresh();
  }, 250);
}

function connectEventStream() {
  if (!("EventSource" in window)) return;
  const stream = new EventSource("/api/events");
  stream.addEventListener("connected", () => {
    app.streamConnected = true;
    setCloudStatus(true, "Cloud API streaming");
  });
  stream.addEventListener("task.updated", scheduleStreamRefresh);
  stream.addEventListener("telemetry.event", scheduleStreamRefresh);
  stream.addEventListener("hot_reload.event", scheduleStreamRefresh);
  stream.addEventListener("local_entities.updated", scheduleStreamRefresh);
  stream.addEventListener("cloud_to_local.dispatched", scheduleStreamRefresh);
  stream.onerror = () => {
    app.streamConnected = false;
    setCloudStatus(Boolean(app.data), app.data ? "Cloud API polling" : "Cloud API reconnecting");
  };
}

function render() {
  if (!app.data) return;
  renderSummary(app.data.summary);
  renderTree();
  renderObjectHeader();
  renderOperationsFocus();
  renderFleetRows();
  renderEntityFilters();
  renderEntityInsights();
  renderEntities();
  renderConnectionProfiles();
  renderServiceEndpoints();
  renderRelationships(refs.relationshipMap, 6);
  renderRelationships(refs.relationshipMapFull, 24);
  renderRelationshipDetails();
  renderEvents();
  renderAlarms();
  renderTasks();
  renderPolicyPacks();
  renderIntegrations();
  renderLiveSyncStatus();
  renderPolicyWorkspace();
  renderTelemetryExplorer();
  renderTimeline();
  renderComplianceWorkspace();
  renderAudit();
  setActiveTab(app.activeTab, { updateHash: false });
}

function renderSummary(summary) {
  refs.metricLcpTotal.textContent = summary.local_control_planes;
  refs.metricConnected.textContent = summary.connected;
  refs.metricDegraded.textContent = summary.degraded;
  refs.metricOffline.textContent = summary.offline;
  refs.metricAgents.textContent = summary.agents;
  refs.metricEntities.textContent = summary.local_entities || 0;
  refs.metricCoverage.textContent = `${summary.policy_coverage}%`;
}

function renderOperationsFocus() {
  if (!refs.operationsFocus) return;
  const lcps = app.data.local_control_planes || [];
  const entities = app.data.local_entities || [];
  const alarms = (app.data.alarms || []).filter((alarm) => alarm.state === "open");
  const foundAgents = entities.filter((entity) => entity.entity_type === "found_agent" || entity.status === "found_unregistered");
  const traceReady = entities.filter((entity) => entityReadiness(entity).identityReady).length;
  const policyReady = entities.filter((entity) => entityReadiness(entity).policyReady).length;
  const wasmReady = entities.filter((entity) => entityReadiness(entity).wasmReady).length;
  const worstLcp = [...lcps].sort((a, b) => {
    const score = (item) => (
      (item.status === "offline" ? 100 : item.status === "degraded" || item.status === "unknown" ? 60 : 0)
      + (100 - Number(item.policy_coverage || 0))
      + alarmsForObject(item.id).length * 30
    );
    return score(b) - score(a);
  })[0];
  const traceCoverage = entities.length ? Math.round((traceReady / entities.length) * 100) : 0;
  const policyCoverage = entities.length ? Math.round((policyReady / entities.length) * 100) : 0;
  const wasmCoverage = entities.length ? Math.round((wasmReady / entities.length) * 100) : 0;
  const cards = [
    {
      kind: "alarm",
      status: alarms.length ? "bad" : "ok",
      title: `${alarms.length} open alarms`,
      detail: alarms[0]?.summary || "No active incident queue",
      objectId: alarms[0]?.object_id
    },
    {
      kind: "lcp",
      status: worstLcp?.status || "neutral",
      title: worstLcp ? worstLcp.name : "No LCP inventory",
      detail: worstLcp ? lcpNarrative(worstLcp) : "Register a Local Control Plane",
      objectId: worstLcp?.id
    },
    {
      kind: "found_agent",
      status: foundAgents.length ? "warn" : "ok",
      title: `${foundAgents.length} found agents`,
      detail: foundAgents[0] ? `${foundAgents[0].name} on ${foundAgents[0].device_name || foundAgents[0].device_id}` : "No unregistered agents detected",
      objectId: foundAgents[0]?.id
    },
    {
      kind: "identity",
      status: traceCoverage >= 80 ? "ok" : traceCoverage >= 50 ? "warn" : "bad",
      title: `${traceCoverage}% identity trace`,
      detail: "OAuth, OIDC, SPIFFE and mTLS continuity across entities",
      objectId: null
    },
    {
      kind: "policy",
      status: policyCoverage >= 80 ? "ok" : policyCoverage >= 50 ? "warn" : "bad",
      title: `${policyCoverage}% policy bound`,
      detail: "Agents, resources and enforcement points with active policy context",
      objectId: null
    },
    {
      kind: "rollout",
      status: wasmCoverage >= 80 ? "ok" : wasmCoverage >= 50 ? "warn" : "bad",
      title: `${wasmCoverage}% WASM ready`,
      detail: "Hot reload coverage for fast policy bundle updates",
      objectId: null
    }
  ];

  refs.operationsFocus.innerHTML = cards.map((card) => `
    <button class="focus-card ${statusClass(card.status)}" ${card.objectId ? `data-object-id="${escapeHtml(card.objectId)}"` : ""}>
      ${iconHtml(card.kind, card.status)}
      <span>
        <strong>${escapeHtml(card.title)}</strong>
        <small>${escapeHtml(card.detail)}</small>
      </span>
    </button>
  `).join("");
  refs.operationsFocus.querySelectorAll("[data-object-id]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedObjectId = button.dataset.objectId;
      render();
    });
  });
}

const entityNavigationGroups = [
  { kind: "registered_agent", label: "Registered Agents" },
  { kind: "found_agent", label: "Found Agents" },
  { kind: "policy", label: "Policies" },
  { kind: "enforcement", label: "Enforcement" },
  { kind: "observability", label: "Observability" }
];

function navigationEntityGroup(entity) {
  const kind = entity.entity_type || entity.class || "object";
  if (kind === "resource" || kind === "telemetry") return "observability";
  return entityNavigationGroups.some((group) => group.kind === kind) ? kind : "observability";
}

function lcpForEntity(entity) {
  const lcps = app.data.local_control_planes || [];
  return lcps.find((lcp) => entity.lcp_id === lcp.id)
    || lcps.find((lcp) => entity.device_id === lcp.device_id || entity.device_name === lcp.device_name)
    || lcps[0]
    || null;
}

function aggregateStatus(items) {
  const statuses = items.map((item) => statusClass(item.status || item.risk));
  if (statuses.includes("bad")) return "offline";
  if (statuses.includes("warn")) return "degraded";
  if (statuses.includes("ok")) return "connected";
  return "unknown";
}

function buildNavigationTree() {
  const items = [];
  const baseItems = app.data.tree || [];
  const localEntities = app.data.local_entities || [];
  const seedAgentIds = new Set(baseItems.filter((item) => item.type === "agent").map((item) => item.id));
  const groupOrder = new Map(entityNavigationGroups.map((group, index) => [group.kind, index]));
  const lcpOrder = new Map((app.data.local_control_planes || []).map((lcp, index) => [lcp.id, index]));

  for (const item of baseItems) {
    if (seedAgentIds.has(item.id)) continue;
    items.push({ ...item, object_id: item.id });
  }

  const grouped = new Map();
  for (const entity of localEntities) {
    const lcp = lcpForEntity(entity);
    if (!lcp) continue;
    const groupKind = navigationEntityGroup(entity);
    const groupId = `entity_group_${lcp.id}_${groupKind}`;
    if (!grouped.has(groupId)) {
      grouped.set(groupId, {
        id: groupId,
        parent_id: lcp.id,
        type: "entity_group",
        entity_kind: groupKind,
        name: entityNavigationGroups.find((group) => group.kind === groupKind)?.label || kindLabel(groupKind),
        status: "unknown",
        risk: "medium",
        nav_only: true,
        count: 0,
        entities: []
      });
    }
    grouped.get(groupId).entities.push(entity);
  }

  const sortedGroups = [...grouped.values()].sort((a, b) => {
    const leftLcp = lcpOrder.get(a.parent_id) ?? 999;
    const rightLcp = lcpOrder.get(b.parent_id) ?? 999;
    if (leftLcp !== rightLcp) return leftLcp - rightLcp;
    return (groupOrder.get(a.entity_kind) ?? 999) - (groupOrder.get(b.entity_kind) ?? 999);
  });

  for (const group of sortedGroups) {
    group.count = group.entities.length;
    group.status = aggregateStatus(group.entities);
    items.push(group);
    const sortedEntities = [...group.entities].sort((a, b) => {
      const leftStatus = statusClass(a.status || a.risk);
      const rightStatus = statusClass(b.status || b.risk);
      const statusWeight = { bad: 0, warn: 1, neutral: 2, ok: 3 };
      const statusDelta = (statusWeight[leftStatus] ?? 2) - (statusWeight[rightStatus] ?? 2);
      if (statusDelta) return statusDelta;
      return String(a.name || a.local_object_id || a.id).localeCompare(String(b.name || b.local_object_id || b.id));
    });
    for (const entity of sortedEntities) {
      items.push({
        id: entity.id,
        parent_id: group.id,
        object_id: entity.id,
        type: entity.entity_type || entity.class || "object",
        name: entity.name || entity.local_object_id || entity.id,
        status: entity.status,
        risk: entity.risk,
        detail: [
          entity.device_name || entity.device_id,
          entity.user_subject,
          entity.source
        ].filter(Boolean).join(" | ")
      });
    }
  }

  return items;
}

function navChildMap(items) {
  const childMap = new Map();
  for (const item of items) {
    const key = item.parent_id || "__root__";
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key).push(item);
  }
  return childMap;
}

function navPathIds(id, items) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const path = [];
  let current = itemMap.get(id);
  while (current) {
    path.unshift(current.id);
    current = current.parent_id ? itemMap.get(current.parent_id) : null;
  }
  return new Set(path);
}

function persistNavNodeState() {
  localStorage.setItem("pollek.cloud.nav.nodes.collapsed", JSON.stringify([...app.collapsedNavNodes]));
  localStorage.setItem("pollek.cloud.nav.nodes.expanded", JSON.stringify([...app.expandedNavNodes]));
}

function toggleNavNode(nodeId, defaultCollapsed = false) {
  const targetSet = defaultCollapsed ? app.expandedNavNodes : app.collapsedNavNodes;
  if (targetSet.has(nodeId)) {
    targetSet.delete(nodeId);
  } else {
    targetSet.add(nodeId);
  }
  persistNavNodeState();
  renderTree();
}

function renderTree() {
  refs.inventoryTree.innerHTML = "";
  const navItems = buildNavigationTree();
  app.navItems = navItems;
  const childMap = navChildMap(navItems);
  const selectedPath = navPathIds(app.selectedObjectId, navItems);
  const query = app.query.trim().toLowerCase();
  const itemText = (item) => [
    item.name,
    item.type,
    item.entity_kind,
    item.detail,
    kindLabel(item.entity_kind || item.type)
  ].filter(Boolean).join(" ").toLowerCase();
  const shouldShow = (item) => {
    if (!query) return true;
    if (itemText(item).includes(query)) return true;
    return (childMap.get(item.id) || []).some((child) => shouldShow(child));
  };

  const renderNode = (item, depth) => {
    if (!shouldShow(item)) return;
    const children = childMap.get(item.id) || [];
    const hasChildren = children.some((child) => shouldShow(child));
    const lockedOpen = query || selectedPath.has(item.id);
    const defaultCollapsed = item.nav_only && Number(item.count || 0) > 20;
    const collapsed = hasChildren && !lockedOpen && (defaultCollapsed ? !app.expandedNavNodes.has(item.id) : app.collapsedNavNodes.has(item.id));
    const button = document.createElement("button");
    const isActive = app.selectedObjectId === (item.object_id || item.id);
    button.className = `tree-row ${isActive ? "active" : ""} ${hasChildren ? "has-children" : "leaf"} ${collapsed ? "collapsed" : "expanded"}`;
    button.dataset.depth = String(depth);
    button.title = `${"  ".repeat(depth)}${item.name}`;
    button.setAttribute("aria-label", `${item.name} ${kindLabel(item.entity_kind || item.type)}`);
    if (hasChildren) button.setAttribute("aria-expanded", String(!collapsed));
    button.style.setProperty("--depth", depth);
    button.style.paddingLeft = `${7 + depth * 14}px`;
    const iconKind = item.entity_kind || item.type;
    const detail = item.detail || (item.count ? `${item.count} ${kindLabel(item.entity_kind)} entities` : kindLabel(item.type));
    button.innerHTML = `
      <span class="tree-expander" aria-hidden="true">${hasChildren ? ">" : ""}</span>
      ${iconHtml(iconKind, item.status, "node-icon")}
      <span class="node-name">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(detail)}</small>
      </span>
      ${item.count ? `<span class="node-badge">${escapeHtml(item.count)}</span>` : `<span class="node-state ${statusClass(item.status)}"></span>`}
    `;
    button.addEventListener("click", (event) => {
      if (event.target.closest(".tree-expander")) {
        toggleNavNode(item.id, defaultCollapsed);
        return;
      }
      if (item.nav_only) {
        if (hasChildren) toggleNavNode(item.id, defaultCollapsed);
        return;
      }
      app.selectedObjectId = item.object_id || item.id;
      render();
    });
    refs.inventoryTree.append(button);
    if (!collapsed) {
      for (const child of children) renderNode(child, depth + 1);
    }
  };

  for (const root of childMap.get("__root__") || []) renderNode(root, 0);
}

function selectedObject() {
  return app.data.objects[app.selectedObjectId] || app.data.objects.tenant_local_lab;
}

function pathToObject(id) {
  const navItems = app.navItems || buildNavigationTree();
  const map = new Map(navItems.map((item) => [item.id, item]));
  const path = [];
  let current = map.get(id);
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : null;
  }
  return path.length ? path : ["Pollek Cloud"];
}

function renderObjectHeader() {
  const object = selectedObject();
  const kind = objectKind(object);
  const contextParts = [
    kindLabel(kind),
    object.device_name || object.site || object.group || object.tenant_id,
    object.user_subject,
    object.spiffe_id || object.trace?.spiffe_id || object.identity?.spiffe_id,
    object.endpoint
  ].filter(Boolean);
  refs.breadcrumb.textContent = pathToObject(object.id).join(" / ");
  refs.objectTitle.innerHTML = `${iconHtml(kind, object.status)}<span>${escapeHtml(object.name || object.id)}</span>`;
  refs.objectStatus.className = `status-pill ${statusClass(object.status)}`;
  refs.objectStatus.textContent = object.status || "unknown";
  refs.objectRisk.className = `risk-pill ${object.risk === "high" ? "bad" : object.risk === "medium" ? "warn" : "ok"}`;
  refs.objectRisk.textContent = `${object.risk || "low"} risk`;
  if (refs.objectContext) {
    refs.objectContext.innerHTML = contextParts.slice(0, 5).map((part) => `<span>${escapeHtml(part)}</span>`).join("");
  }

  if (object.type === "lcp" && object.endpoint) {
    refs.lcpUrl.value = object.endpoint;
  }
}

function renderFleetRows() {
  const filter = app.statusFilter;
  const rows = app.data.local_control_planes
    .filter((lcp) => filter === "all" || lcp.status === filter)
    .filter((lcp) => {
      const query = app.query.trim().toLowerCase();
      if (!query) return true;
      return [lcp.name, lcp.site, lcp.group, lcp.device_name, lcp.active_bundle, lcp.status]
        .some((value) => String(value).toLowerCase().includes(query));
    });

  refs.fleetRows.innerHTML = "";
  if (!rows.length) {
    refs.fleetRows.innerHTML = `<tr><td colspan="9" class="empty-cell">No Local Control Planes match the current filters.</td></tr>`;
    return;
  }

  for (const lcp of rows) {
    const entities = entitiesForLcp(lcp);
    const counts = countByKind(entities);
    const openAlarms = alarmsForObject(lcp.id).length;
    const traceReady = entities.filter((entity) => entityReadiness(entity).identityReady).length;
    const traceCoverage = entities.length ? Math.round((traceReady / entities.length) * 100) : 0;
    const tr = document.createElement("tr");
    tr.className = app.selectedObjectId === lcp.id ? "selected" : "";
    tr.innerHTML = `
      <td><span class="status-dot ${statusClass(lcp.status)}"></span><strong>${escapeHtml(lcp.status)}</strong>${openAlarms ? `<small>${openAlarms} open alarm${openAlarms > 1 ? "s" : ""}</small>` : ""}</td>
      <td>
        <div class="object-cell">${iconHtml("lcp", lcp.status)}<span><button class="link-button" data-object-id="${escapeHtml(lcp.id)}">${escapeHtml(lcp.name)}</button><small>${escapeHtml(lcp.device_name)}</small></span></div>
      </td>
      <td>${escapeHtml(lcp.site)}<small>${escapeHtml(lcp.group)}</small></td>
      <td>${escapeHtml(lcp.version)}</td>
      <td>${escapeHtml(lcp.contract_version)}</td>
      <td>${escapeHtml(lcp.active_bundle)}</td>
      <td>${lcp.agents}<small>${escapeHtml(counts.found_agent || 0)} found / ${escapeHtml(counts.policy || 0)} policies</small></td>
      <td><div class="coverage"><span style="width:${Math.max(0, Math.min(100, lcp.policy_coverage))}%"></span></div>${lcp.policy_coverage}%<small>${traceCoverage}% trace</small></td>
      <td>${escapeHtml(fmtTime(lcp.last_seen_at))}</td>
    `;
    tr.addEventListener("click", () => {
      app.selectedObjectId = lcp.id;
      render();
    });
    refs.fleetRows.append(tr);
  }
}

function allRelationships() {
  return [
    ...(app.data.relationships || []),
    ...(app.data.local_entity_relationships || [])
  ];
}

function renderRelationships(container = refs.relationshipMap, limit = 6) {
  if (!container) return;
  const object = selectedObject();
  const relationships = allRelationships();
  const relations = relationships.filter((rel) => rel.from === object.id || rel.to === object.id);
  container.innerHTML = "";
  const center = document.createElement("div");
  center.className = "relationship-node center";
  center.innerHTML = `
    ${iconHtml(objectKind(object), object.status)}
    <span>
      <strong>${escapeHtml(object.name || object.id)}</strong>
      <small>${escapeHtml(kindLabel(objectKind(object)))} | ${escapeHtml(object.status || "unknown")}</small>
    </span>
  `;
  container.append(center);

  const visible = (relations.length ? relations : relationships).slice(0, limit);
  for (const rel of visible) {
    const relatedId = rel.from === object.id ? rel.to : rel.from;
    const related = app.data.objects[relatedId] || { id: relatedId, name: relatedId, type: "object", status: "unknown" };
    const node = document.createElement("button");
    node.className = "relationship-node";
    node.innerHTML = `
      ${iconHtml(objectKind(related), related.status)}
      <span>
        <strong>${escapeHtml(related.name || related.id)}</strong>
        <small>${escapeHtml(rel.label)} | ${escapeHtml(kindLabel(objectKind(related)))}</small>
      </span>
    `;
    node.addEventListener("click", () => {
      if (app.data.objects[relatedId]) {
        app.selectedObjectId = relatedId;
        render();
      }
    });
    container.append(node);
  }
}

function renderRelationshipDetails() {
  refs.relationshipDetailList.innerHTML = "";
  const object = selectedObject();
  const relationships = allRelationships();
  const relations = relationships.filter((rel) => rel.from === object.id || rel.to === object.id);
  const rows = relations.length ? relations : relationships.slice(0, 8);
  for (const rel of rows) {
    const from = app.data.objects[rel.from] || { name: rel.from, type: "object" };
    const to = app.data.objects[rel.to] || { name: rel.to, type: "object" };
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `
      <div class="relationship-line">
        ${iconHtml(objectKind(from), from.status)}
        <span><strong>${escapeHtml(from.name)}</strong><small>${escapeHtml(kindLabel(objectKind(from)))}</small></span>
        <b>${escapeHtml(rel.label)}</b>
        ${iconHtml(objectKind(to), to.status)}
        <span><strong>${escapeHtml(to.name)}</strong><small>${escapeHtml(kindLabel(objectKind(to)))}</small></span>
      </div>
    `;
    refs.relationshipDetailList.append(row);
  }
}

function populateSelect(select, allLabel, rows, selectedValue) {
  if (!select) return;
  const options = [`<option value="all">${escapeHtml(allLabel)}</option>`]
    .concat(rows.map((row) => `<option value="${escapeHtml(row.value)}">${escapeHtml(row.label)}</option>`))
    .join("");
  if (select.dataset.options !== options) {
    select.innerHTML = options;
    select.dataset.options = options;
  }
  const hasSelected = [...select.options].some((option) => option.value === selectedValue);
  select.value = hasSelected ? selectedValue : "all";
}

function uniqueEntityOptions(entities, valueKey, labelKey = valueKey) {
  const seen = new Map();
  for (const entity of entities) {
    const value = entity[valueKey];
    if (!value || seen.has(value)) continue;
    seen.set(value, {
      value,
      label: entity[labelKey] || value
    });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderEntityFilters() {
  const entities = app.data.local_entities || [];
  populateSelect(
    refs.entityDeviceFilter,
    "All devices",
    uniqueEntityOptions(entities, "device_id", "device_name"),
    app.entityDeviceFilter
  );
  populateSelect(
    refs.entityUserFilter,
    "All users",
    uniqueEntityOptions(entities, "user_id", "user_subject"),
    app.entityUserFilter
  );
}

function renderEntityInsights() {
  if (!refs.entityInsightStrip) return;
  const entities = filteredEntities();
  const counts = countByKind(entities);
  const found = counts.found_agent || 0;
  const registered = counts.registered_agent || 0;
  const policies = counts.policy || 0;
  const enforcement = counts.enforcement || 0;
  const observe = counts.observability || 0;
  const identityReady = entities.filter((entity) => entityReadiness(entity).identityReady).length;
  const telemetryReady = entities.filter((entity) => entityReadiness(entity).telemetryReady).length;
  const wasmReady = entities.filter((entity) => entityReadiness(entity).wasmReady).length;
  const total = Math.max(1, entities.length);
  const items = [
    { kind: "registered_agent", label: "Registered", value: registered, status: registered ? "ok" : "warn" },
    { kind: "found_agent", label: "Found", value: found, status: found ? "warn" : "ok" },
    { kind: "policy", label: "Policies", value: policies, status: policies ? "ok" : "warn" },
    { kind: "enforcement", label: "Enforcement", value: enforcement, status: enforcement ? "ok" : "warn" },
    { kind: "observability", label: "Observe", value: observe, status: observe ? "ok" : "warn" },
    { kind: "identity", label: "Identity trace", value: `${Math.round((identityReady / total) * 100)}%`, status: identityReady === entities.length ? "ok" : "warn" },
    { kind: "telemetry", label: "Telemetry", value: `${Math.round((telemetryReady / total) * 100)}%`, status: telemetryReady === entities.length ? "ok" : "warn" },
    { kind: "rollout", label: "WASM", value: `${Math.round((wasmReady / total) * 100)}%`, status: wasmReady === entities.length ? "ok" : "warn" }
  ];
  refs.entityInsightStrip.innerHTML = items.map((item) => `
    <div class="insight-card ${statusClass(item.status)}">
      ${iconHtml(item.kind, item.status)}
      <span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.label)}</small></span>
    </div>
  `).join("");
}

function filteredEntities() {
  const query = app.entityQuery.trim().toLowerCase();
  return (app.data.local_entities || []).filter((entity) => {
    if (app.entityTypeFilter !== "all" && entity.entity_type !== app.entityTypeFilter && entity.class !== app.entityTypeFilter) return false;
    if (app.entityDeviceFilter !== "all" && entity.device_id !== app.entityDeviceFilter && entity.device_name !== app.entityDeviceFilter) return false;
    if (app.entityUserFilter !== "all" && entity.user_id !== app.entityUserFilter && entity.user_subject !== app.entityUserFilter) return false;
    if (query && !JSON.stringify(entity).toLowerCase().includes(query)) return false;
    return true;
  });
}

function sortedEntitiesForDisplay(entities) {
  const kindPriority = {
    found_agent: 0,
    registered_agent: 1,
    policy: 2,
    enforcement: 3,
    observability: 4,
    resource: 4
  };
  const score = (entity) => {
    const kind = entity.entity_type || entity.class || "object";
    const readiness = entityReadiness(entity);
    return [
      kindPriority[kind] ?? 9,
      entity.status === "found_unregistered" ? -3 : 0,
      entity.risk === "high" ? -2 : entity.risk === "medium" ? -1 : 0,
      readiness.identityReady ? 1 : -1,
      String(entity.device_name || entity.device_id || ""),
      String(entity.user_subject || ""),
      String(entity.name || entity.local_object_id || entity.id || "")
    ];
  };
  return [...entities].sort((a, b) => {
    const left = score(a);
    const right = score(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  });
}

function selectedLocalEntity(entities) {
  const object = selectedObject();
  if (object?.id && (app.data.local_entities || []).some((entity) => entity.id === object.id)) return object;
  return entities[0] || null;
}

function entityGroupStatus(entities) {
  return aggregateStatus(entities);
}

function entityScopeKey(entity) {
  return [
    entity.tenant_id || "local",
    entity.lcp_id || "unknown-lcp",
    entity.device_id || entity.device_name || "unknown-device",
    entity.user_id || entity.user_subject || "unknown-user"
  ].join("::");
}

function scopeGroupForEntity(entity) {
  const lcp = lcpForEntity(entity);
  const deviceName = entity.device_name || entity.device_id || lcp?.device_name || "Unknown device";
  const userName = entity.user_subject || entity.user_id || "unknown user";
  const lcpName = lcp?.name || entity.lcp_id || "Unknown LCP";
  return {
    key: entityScopeKey(entity),
    title: `${deviceName}`,
    subtitle: `${userName} | ${lcpName}`,
    tenant_id: entity.tenant_id || "local",
    lcp_id: entity.lcp_id || lcp?.id || "unknown-lcp",
    device_name: deviceName,
    user_subject: userName,
    entities: []
  };
}

function groupedEntitiesByScope(entities) {
  const groups = new Map();
  for (const entity of entities) {
    const key = entityScopeKey(entity);
    if (!groups.has(key)) groups.set(key, scopeGroupForEntity(entity));
    groups.get(key).entities.push(entity);
  }
  return [...groups.values()].sort((a, b) => {
    const riskRank = { offline: 0, degraded: 1, unknown: 2, connected: 3 };
    const aRank = riskRank[entityGroupStatus(a.entities)] ?? 2;
    const bRank = riskRank[entityGroupStatus(b.entities)] ?? 2;
    if (aRank !== bRank) return aRank - bRank;
    return `${a.device_name} ${a.user_subject}`.localeCompare(`${b.device_name} ${b.user_subject}`);
  });
}

function persistEntityGroupState() {
  localStorage.setItem("pollek.cloud.entities.groups.collapsed", JSON.stringify([...app.collapsedEntityGroups]));
  localStorage.setItem("pollek.cloud.entities.groups.expanded", JSON.stringify([...app.expandedEntityGroups]));
}

function entityGroupCollapsed(key, defaultCollapsed, hasActiveEntity) {
  if (hasActiveEntity) return false;
  return defaultCollapsed ? !app.expandedEntityGroups.has(key) : app.collapsedEntityGroups.has(key);
}

function toggleEntityGroup(key, defaultCollapsed = false) {
  const targetSet = defaultCollapsed ? app.expandedEntityGroups : app.collapsedEntityGroups;
  if (targetSet.has(key)) {
    targetSet.delete(key);
  } else {
    targetSet.add(key);
  }
  persistEntityGroupState();
  renderEntities();
}

function categoryGroupsForScope(scopeGroup) {
  const groups = new Map(entityNavigationGroups.map((group) => [
    group.kind,
    {
      key: group.kind,
      label: group.label,
      kind: group.kind,
      entities: []
    }
  ]));
  for (const entity of scopeGroup.entities) {
    const key = navigationEntityGroup(entity);
    if (!groups.has(key)) {
      groups.set(key, { key, label: kindLabel(key), kind: key, entities: [] });
    }
    groups.get(key).entities.push(entity);
  }
  return [...groups.values()].filter((group) => group.entities.length);
}

function entitySummaryChips(entities) {
  const counts = categoryGroupsForScope({ entities }).map((group) => ({
    label: group.label.replace(" Agents", ""),
    count: group.entities.length,
    status: entityGroupStatus(group.entities)
  }));
  return counts.map((item) => chipHtml(`${item.count} ${item.label}`, item.status)).join("");
}

function renderEntities() {
  if (!refs.entityList) return;
  const entities = sortedEntitiesForDisplay(filteredEntities());
  const activeEntity = selectedLocalEntity(entities);
  refs.entityList.innerHTML = "";

  if (!entities.length) {
    refs.entityList.innerHTML = `<div class="detail-row"><strong>No entities match</strong><span>Adjust filters or sync from a running Local Pollek Control Plane.</span></div>`;
    renderEntityTrace(null);
    return;
  }

  const scopeGroups = groupedEntitiesByScope(entities);
  for (const scopeGroup of scopeGroups) {
    const scopeHasActive = scopeGroup.entities.some((entity) => entity.id === activeEntity?.id);
    const scopeDefaultCollapsed = scopeGroup.entities.length > 80;
    const scopeCollapsed = entityGroupCollapsed(scopeGroup.key, scopeDefaultCollapsed, scopeHasActive);
    const scopeStatus = entityGroupStatus(scopeGroup.entities);
    const section = document.createElement("section");
    section.className = `entity-scope-group ${statusClass(scopeStatus)} ${scopeCollapsed ? "collapsed" : "expanded"}`;
    section.innerHTML = `
      <button class="entity-scope-toggle" type="button" aria-expanded="${escapeHtml(!scopeCollapsed)}">
        <span class="entity-group-chevron" aria-hidden="true">&gt;</span>
        ${iconHtml("device", scopeStatus)}
        <span class="entity-group-title">
          <strong>${escapeHtml(scopeGroup.title)}</strong>
          <small>${escapeHtml(scopeGroup.subtitle)}</small>
        </span>
        <span class="entity-group-count">${escapeHtml(scopeGroup.entities.length)}</span>
      </button>
      <div class="chip-row entity-scope-chips">${entitySummaryChips(scopeGroup.entities)}</div>
      <div class="entity-scope-body"></div>
    `;
    section.querySelector(".entity-scope-toggle").addEventListener("click", () => {
      toggleEntityGroup(scopeGroup.key, scopeDefaultCollapsed);
    });
    refs.entityList.append(section);
    if (scopeCollapsed) continue;

    const body = section.querySelector(".entity-scope-body");
    for (const category of categoryGroupsForScope(scopeGroup)) {
      const categoryKey = `${scopeGroup.key}::${category.kind}`;
      const categoryHasActive = category.entities.some((entity) => entity.id === activeEntity?.id);
      const categoryDefaultCollapsed = category.entities.length > 12 || category.kind === "observability";
      const categoryCollapsed = entityGroupCollapsed(categoryKey, categoryDefaultCollapsed, categoryHasActive);
      const categoryStatus = entityGroupStatus(category.entities);
      const categorySection = document.createElement("section");
      categorySection.className = `entity-kind-group ${statusClass(categoryStatus)} ${categoryCollapsed ? "collapsed" : "expanded"}`;
      categorySection.innerHTML = `
        <button class="entity-kind-toggle" type="button" aria-expanded="${escapeHtml(!categoryCollapsed)}">
          <span class="entity-group-chevron" aria-hidden="true">&gt;</span>
          ${iconHtml(category.kind, categoryStatus, "node-icon")}
          <span class="entity-group-title">
            <strong>${escapeHtml(category.label)}</strong>
            <small>${escapeHtml(scopeGroup.device_name)} | ${escapeHtml(scopeGroup.user_subject)}</small>
          </span>
          <span class="entity-group-count">${escapeHtml(category.entities.length)}</span>
        </button>
        <div class="entity-kind-body ${category.entities.length > 20 ? "large" : ""}"></div>
      `;
      categorySection.querySelector(".entity-kind-toggle").addEventListener("click", () => {
        toggleEntityGroup(categoryKey, categoryDefaultCollapsed);
      });
      body.append(categorySection);
      if (categoryCollapsed) continue;

      const categoryBody = categorySection.querySelector(".entity-kind-body");
      for (const entity of sortedEntitiesForDisplay(category.entities)) {
        const row = document.createElement("button");
        const health = entityHealthStatus(entity);
        row.className = `detail-row entity-row ${health} ${activeEntity?.id === entity.id ? "selected" : ""}`;
        const streams = entity.observability?.telemetry_streams || [];
        const subtitle = [
          kindLabel(entity.entity_type || entity.class),
          entity.status,
          entity.device_name || entity.device_id,
          entity.user_subject || "unknown user"
        ].filter(Boolean).join(" | ");
        row.innerHTML = `
          <div class="entity-main">
            ${iconHtml(entity.entity_type || entity.class, entity.status)}
            <span>
              <strong>${escapeHtml(entity.name || entity.local_object_id || entity.id)}</strong>
              <small>${escapeHtml(subtitle)}</small>
            </span>
          </div>
          <div class="chip-row">${entityChips(entity)}</div>
          <code>${escapeHtml(entity.trace?.spiffe_id || entity.identity?.spiffe_id || entity.source || "trace pending")} | ${escapeHtml(streams.join(", ") || "no telemetry stream")}</code>
        `;
        row.addEventListener("click", () => {
          app.selectedObjectId = entity.id;
          render();
        });
        categoryBody.append(row);
      }
    }
  }
  renderEntityTrace(activeEntity);
}

function renderEntityTrace(entity) {
  refs.entityTracePanel.innerHTML = "";
  if (!entity) {
    refs.entityTracePanel.innerHTML = `<div class="detail-row"><strong>No selected entity</strong><span>Select a Local Pollek entity to inspect trace readiness.</span></div>`;
    return;
  }

  const token = Array.isArray(entity.identity?.token_bindings) ? entity.identity.token_bindings[0] : null;
  const trace = entity.trace || {};
  const rows = [
    {
      title: "Tenant and user scope",
      status: "ok",
      detail: `${entity.tenant_id || "local"} / ${entity.lcp_id || "unknown-lcp"} / ${entity.device_name || entity.device_id || "unknown-device"} / ${entity.user_subject || "unknown-user"}`
    },
    {
      title: "OAuth and OIDC",
      status: trace.oidc_subject || token?.subject ? "ok" : "warn",
      detail: `${trace.oauth_client_id || token?.audience?.join(", ") || "client pending"} | ${trace.oidc_issuer || token?.issuer || "issuer pending"} | ${trace.oidc_subject || token?.subject || "subject pending"}`
    },
    {
      title: "SPIFFE and mTLS",
      status: trace.spiffe_id ? "ok" : "warn",
      detail: `${trace.spiffe_id || "spiffe id pending"} | ${trace.mtls_subject || "mTLS subject pending"} | ${trace.confirmation || "unconfirmed"}`
    },
    {
      title: "Policy and enforcement",
      status: entity.enforcement?.mode === "Enforce" || entity.status === "published" ? "ok" : "warn",
      detail: `${(entity.policy_ids || []).join(", ") || "no policy binding"} | ${entity.enforcement?.mode || "observe"} | ${entity.enforcement?.pdp_engine || "pdp pending"}`
    },
    {
      title: "Observability",
      status: entity.observability?.telemetry_streams?.length ? "ok" : "warn",
      detail: `${(entity.observability?.telemetry_streams || []).join(", ") || "no stream"} | ${fmtTime(entity.observability?.last_event_at || entity.last_seen_at)}`
    },
    {
      title: "WASM hot reload",
      status: entity.wasm?.hot_reload ? "ok" : "warn",
      detail: `${entity.wasm?.hot_reload ? "enabled" : "not ready"} | ${entity.wasm?.active_bundle_id || "bundle pending"} | generation ${entity.wasm?.generation || 0}`
    }
  ];

  for (const item of rows) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${item.status}`;
    row.innerHTML = `${iconHtml(item.title.toLowerCase().includes("oauth") || item.title.toLowerCase().includes("spiffe") ? "identity" : item.title.toLowerCase().includes("policy") ? "policy" : item.title.toLowerCase().includes("observability") ? "telemetry" : item.title.toLowerCase().includes("wasm") ? "rollout" : "device", item.status)}<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>`;
    refs.entityTracePanel.append(row);
  }
}

function renderConnectionProfiles() {
  if (!refs.connectionProfileList) return;
  refs.connectionProfileList.innerHTML = "";
  const profiles = app.data.connection_profiles || [];
  for (const profile of profiles) {
    const endpoints = Object.keys(profile.endpoints || {});
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(profile.status)}`;
    row.innerHTML = `
      ${iconHtml("integration", profile.status)}
      <span>
        <strong>${escapeHtml(profile.name)}</strong>
        <small>${escapeHtml(profile.status)} | contract ${escapeHtml(profile.contract_version)} | trust ${escapeHtml(profile.trust_scope_id)}</small>
      </span>
      <code>${escapeHtml(profile.endpoints?.contract_hub || "/.well-known/pollek-contract")} | ${escapeHtml(endpoints.join(", "))}</code>
    `;
    refs.connectionProfileList.append(row);
  }
  if (!profiles.length) {
    refs.connectionProfileList.innerHTML = `<div class="detail-row"><strong>No profiles</strong><span>Contract Hub has not published a connection update profile.</span></div>`;
  }
}

function renderServiceEndpoints() {
  if (!refs.serviceEndpointList) return;
  refs.serviceEndpointList.innerHTML = "";
  const endpoints = app.data.service_endpoints || [];
  for (const endpoint of endpoints) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(endpoint.status)}`;
    row.innerHTML = `
      ${iconHtml(endpoint.type || "integration", endpoint.status)}
      <span>
        <strong>${escapeHtml(endpoint.name)}</strong>
        <small>${escapeHtml(endpoint.type)} | ${escapeHtml(endpoint.status)} | ${escapeHtml(endpoint.scope)}</small>
      </span>
      <code>${escapeHtml(endpoint.endpoint)}</code>
    `;
    refs.serviceEndpointList.append(row);
  }
}

function renderEvents() {
  refs.eventTable.innerHTML = "";
  const events = app.data.events.length ? app.data.events : [{
    received_at: new Date().toISOString(),
    event_type: "waiting",
    severity: "info",
    payload: { detail: "No telemetry events received yet." }
  }];
  for (const event of events.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = `event-row ${statusClass(event.severity === "warning" ? "warn" : event.severity === "critical" ? "bad" : "ok")}`;
    row.innerHTML = `
      ${iconHtml("telemetry", event.severity)}
      <span>${escapeHtml(fmtTime(event.received_at))}</span>
      <code>${escapeHtml(event.event_type)}</code>
      <span>${escapeHtml(event.severity || "info")}</span>
    `;
    refs.eventTable.append(row);
  }
}

function eventMatchesObject(event, object) {
  if (!object?.id || object.id === "tenant_local_lab") return true;
  return event.device_id === object.id || event.payload?.lcp_id === object.id || event.payload?.object_id === object.id;
}

function renderTelemetryExplorer() {
  refs.telemetryExplorer.innerHTML = "";
  const object = selectedObject();
  const source = app.telemetryResults.length ? app.telemetryResults : app.data.events;
  const events = source.filter((event) => eventMatchesObject(event, object));
  const visible = events.length ? events : [{
    received_at: new Date().toISOString(),
    event_type: "waiting",
    severity: "info",
    payload: { detail: "No telemetry matches this object. Use Send Sample while LCP is still building." }
  }];
  for (const event of visible.slice(0, 30)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(event.severity === "critical" ? "failed" : event.severity === "warning" ? "degraded" : "connected")}`;
    row.innerHTML = `
      ${iconHtml("telemetry", event.severity)}
      <span>
        <strong>${escapeHtml(event.event_type)}</strong>
        <small>${escapeHtml(fmtTime(event.received_at))} | ${escapeHtml(event.severity || "info")} | ${escapeHtml(event.device_id || "cloud")}</small>
      </span>
      <code>${escapeHtml(JSON.stringify(event.payload || {}, null, 2))}</code>
    `;
    refs.telemetryExplorer.append(row);
  }
}

function renderAlarms() {
  const alarms = app.data.alarms.filter((alarm) => alarm.state === "open");
  refs.alarmCount.textContent = alarms.length;
  refs.alarmList.innerHTML = "";
  refs.alarmTabList.innerHTML = "";
  for (const alarm of alarms) {
    refs.alarmList.append(createAlarmRow(alarm));
    refs.alarmTabList.append(createAlarmRow(alarm, true));
  }
  if (!alarms.length) {
    const row = document.createElement("div");
    row.className = "detail-row ok";
    row.innerHTML = "<strong>No open alarms</strong><span>The incident queue is clear.</span>";
    refs.alarmList.append(row);
    refs.alarmTabList.append(row.cloneNode(true));
  }
}

function createAlarmRow(alarm, verbose = false) {
  const row = document.createElement("div");
  row.className = `alarm-row ${alarm.severity}`;
  row.innerHTML = `
    <button class="alarm-target" data-object-id="${escapeHtml(alarm.object_id)}">
      ${iconHtml("alarm", alarm.severity)}
      <span>
        <strong>${escapeHtml(alarm.summary)}</strong>
        <small>${escapeHtml(alarm.object_name)} - ${escapeHtml(fmtTime(alarm.created_at))}${verbose ? ` - ${escapeHtml(alarm.state)}` : ""}</small>
      </span>
    </button>
    <button class="mini-button" data-alarm-id="${escapeHtml(alarm.id)}">Ack</button>
  `;
  row.querySelector(".alarm-target").addEventListener("click", () => {
    app.selectedObjectId = alarm.object_id;
    render();
  });
  row.querySelector(".mini-button").addEventListener("click", async () => {
    await acknowledgeAlarm(alarm.id);
  });
  return row;
}

function renderTasks() {
  refs.taskList.innerHTML = "";
  const tasks = app.data.tasks.length ? app.data.tasks : [{ summary: "No recent tasks", status: "idle", created_at: "" }];
  for (const task of tasks.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = `task-row ${statusClass(task.status)}`;
    row.innerHTML = `${iconHtml("task", task.status)}<span><strong>${escapeHtml(task.summary)}</strong><small>${escapeHtml(task.status)}${task.created_at ? ` - ${fmtTime(task.created_at)}` : ""}</small></span>`;
    refs.taskList.append(row);
  }
}

function renderPolicyPacks() {
  const packs = app.data.policy_packs || [];
  refs.policyPackCount.textContent = packs.length;
  refs.policyPackList.innerHTML = "";
  for (const pack of packs) {
    const row = document.createElement("div");
    row.className = `compact-row ${statusClass(pack.status)}`;
    row.innerHTML = `
      ${iconHtml("policy", pack.status)}
      <span>
        <strong>${escapeHtml(pack.name)}</strong>
        <small>${escapeHtml(pack.default_mode)} - ${escapeHtml(pack.engines.join(", "))}</small>
      </span>
    `;
    refs.policyPackList.append(row);
  }
}

function renderIntegrations() {
  const integrations = app.data.integrations || [];
  refs.integrationList.innerHTML = "";
  for (const item of integrations) {
    const row = document.createElement("div");
    row.className = `compact-row ${statusClass(item.status)}`;
    row.innerHTML = `
      ${iconHtml(item.type || "integration", item.status)}
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.type)} - ${escapeHtml(item.status)}</small>
      </span>
    `;
    refs.integrationList.append(row);
  }
}

function renderLiveSyncStatus() {
  if (!refs.liveSyncStatus) return;
  const watch = app.data.lcp_watch || {};
  const security = app.data.security_posture || watch.security || {};
  const latestRun = app.data.local_entity_sync_runs?.[0];
  const latestConfig = app.data.local_configuration_snapshots?.[0];
  const latestDispatch = app.data.cloud_to_local_dispatches?.[0];
  refs.liveSyncStatus.className = `probe-result ${statusClass(watch.status === "watching" ? "connected" : watch.status === "degraded" ? "degraded" : "unknown")}`;
  refs.liveSyncStatus.innerHTML = `
    <strong>${escapeHtml(watch.enabled === false ? "Live watch disabled" : `Live watch ${watch.status || "starting"}`)}</strong>
    <span>${escapeHtml(watch.lcp_url || refs.lcpUrl?.value || "no LCP URL")} | interval ${escapeHtml(Math.round((watch.interval_ms || 0) / 1000))}s | changes ${escapeHtml(watch.change_count || 0)}</span>
    <span>${escapeHtml(latestRun ? `${latestRun.mode}: ${latestRun.entity_count} records at ${fmtTime(latestRun.created_at)}` : "No live entity run yet.")}</span>
    <span>${escapeHtml(latestConfig ? `Local config hash ${String(latestConfig.snapshot_hash || "").slice(0, 12)}` : "No local config snapshot yet.")}</span>
    <span>${escapeHtml(latestDispatch ? `Last dispatch ${latestDispatch.action}: ${latestDispatch.status}` : "No Cloud-to-Local dispatch yet.")}</span>
    <code>${escapeHtml((security.production_requirements || []).slice(0, 4).join(" | ") || "Security posture pending")}</code>
  `;
}

function renderPolicyWorkspace() {
  refs.policyDraftList.innerHTML = "";
  refs.bundleStatusList.innerHTML = "";
  const drafts = app.data.policy_drafts || [];
  for (const draft of drafts.slice(0, 8)) {
    const row = document.createElement("button");
    row.className = `detail-row trace-row ${draft.status === "approved" ? "ok" : draft.status === "requires_human_review" ? "warn" : ""}`;
    row.innerHTML = `
      ${iconHtml("policy", draft.status)}
      <span>
        <strong>${escapeHtml(draft.title)}</strong>
        <small>${escapeHtml(draft.status)} | ${escapeHtml(draft.recommended_engine)} | ${escapeHtml(fmtTime(draft.updated_at || draft.created_at))}</small>
      </span>
      <code>${escapeHtml(draft.intent)}</code>
    `;
    row.addEventListener("click", () => {
      app.latestPolicyDraftId = draft.id;
      refs.policyIntent.value = draft.intent;
      refs.policyEngineHint.value = draft.recommended_engine || "rego";
      refs.policyAssistantResult.innerHTML = `
        <strong>${escapeHtml(draft.title)}</strong>
        <span>${escapeHtml(draft.status)} - human approval required before deployment</span>
        <code>${escapeHtml(JSON.stringify(draft.policy_ir, null, 2))}</code>
      `;
    });
    refs.policyDraftList.append(row);
  }
  if (!drafts.length) {
    refs.policyDraftList.innerHTML = `<div class="detail-row"><strong>No policy drafts</strong><span>Generate a draft from policy intent.</span></div>`;
  }

  for (const bundle of app.data.policy_bundles.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${bundle.status === "active" ? "ok" : bundle.status === "stale" ? "warn" : ""}`;
    row.innerHTML = `
      ${iconHtml("policy_bundle", bundle.status)}
      <span>
        <strong>${escapeHtml(bundle.name)}</strong>
        <small>${escapeHtml(bundle.status)} | revision ${escapeHtml(bundle.revision)} | coverage ${escapeHtml(bundle.coverage)}%</small>
      </span>
      <code>${escapeHtml(bundle.id)}${bundle.signed ? " | signed | hot reload" : ""}</code>
    `;
    refs.bundleStatusList.append(row);
  }
}

function renderTimeline() {
  refs.rolloutTimeline.innerHTML = "";
  refs.enrollmentList.innerHTML = "";
  refs.evidenceExportList.innerHTML = "";

  const rollouts = app.data.rollout_plans || [];
  for (const rollout of (rollouts.length ? rollouts : [{ bundle_id: "No rollout planned", status: "idle", target_ids: [], created_at: "" }]).slice(0, 8)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${rollout.status === "planned" ? "warn" : statusClass(rollout.status)}`;
    row.innerHTML = `
      ${iconHtml("rollout", rollout.status)}
      <span>
        <strong>${escapeHtml(rollout.bundle_id)}</strong>
        <small>${escapeHtml(rollout.status)} | stage ${escapeHtml((rollout.current_stage ?? -1) + 1)}/${escapeHtml(rollout.total_stages || 0)} | targets ${escapeHtml((rollout.target_ids || []).length)} | ${escapeHtml(fmtTime(rollout.created_at))}</small>
      </span>
      <code>${escapeHtml(rollout.wave_strategy || "not scheduled")} | ${escapeHtml(rollout.local_pollek_compatibility?.lcp_manifest_path || "manifest pending")}</code>
    `;
    refs.rolloutTimeline.append(row);
  }

  for (const event of (app.data.hot_reload_events || []).slice(0, 5)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(event.status)}`;
    row.innerHTML = `
      ${iconHtml("rollout", event.status)}
      <span>
        <strong>${escapeHtml(event.event_type)}</strong>
        <small>${escapeHtml(event.lcp_id)} | ${escapeHtml(event.status)} | stage ${escapeHtml(event.stage_index ?? 0)}</small>
      </span>
      <code>${escapeHtml(event.local_pollek_paths?.sse_bundle_ready || "")}</code>
    `;
    refs.rolloutTimeline.append(row);
  }

  const enrollments = app.data.enrollment_sessions || [];
  for (const session of (enrollments.length ? enrollments : [{ user_code: "No enrollment", status: "idle", command: "Create an enrollment when a new LCP is ready.", created_at: "" }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${session.status === "waiting_for_lcp" ? "warn" : statusClass(session.status)}`;
    row.innerHTML = `
      ${iconHtml("identity", session.status)}
      <span>
        <strong>${escapeHtml(session.user_code)}</strong>
        <small>${escapeHtml(session.status)} | ${escapeHtml(fmtTime(session.created_at))}</small>
      </span>
      <code>${escapeHtml(session.command)}</code>
    `;
    refs.enrollmentList.append(row);
  }

  const exports = app.data.evidence_exports || [];
  for (const item of (exports.length ? exports : [{ id: "No evidence exports", status: "idle", scope: "none", requested_at: "" }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${item.status === "ready" ? "ok" : ""}`;
    row.innerHTML = `
      ${iconHtml("compliance", item.status)}
      <span>
        <strong>${escapeHtml(item.id)}</strong>
        <small>${escapeHtml(item.status)} | ${escapeHtml(item.scope)} | ${escapeHtml(fmtTime(item.requested_at))}</small>
      </span>
    `;
    refs.evidenceExportList.append(row);
  }
}

function renderComplianceWorkspace() {
  if (!refs.complianceBundleList) return;
  refs.complianceBundleList.innerHTML = "";
  refs.complianceScoreList.innerHTML = "";
  refs.sandboxRunList.innerHTML = "";
  refs.breakglassList.innerHTML = "";

  const bundles = app.data.compliance_policy_bundles || [];
  for (const bundle of (bundles.length ? bundles : [{ name: "No compliance bundles", frameworks: [], controls: [], status: "enterprise_required" }]).slice(0, 8)) {
    const row = document.createElement("button");
    row.className = `detail-row trace-row ${bundle.deployable ? "ok" : "warn"}`;
    row.innerHTML = `
      ${iconHtml("compliance", bundle.deployable ? "ready" : "planned")}
      <span>
        <strong>${escapeHtml(bundle.name)}</strong>
        <small>${escapeHtml((bundle.frameworks || []).join(", ") || "no framework")} | ${escapeHtml(bundle.edition || "enterprise")} | ${escapeHtml(bundle.default_mode || "n/a")}</small>
      </span>
      <code>${escapeHtml((bundle.controls || []).join(", ") || "no controls")}</code>
    `;
    row.addEventListener("click", () => {
      app.selectedComplianceBundleId = bundle.id;
      renderComplianceWorkspace();
    });
    refs.complianceBundleList.append(row);
  }

  const score = app.data.compliance_score || {};
  const factors = score.factors || {};
  const scoreRows = [
    ["Overall score", score.score ?? 0, score.score >= 80 ? "healthy" : score.score >= 60 ? "warning" : "critical"],
    ["Entity health", factors.entity_health ?? 0, factors.entity_health >= 80 ? "healthy" : "warning"],
    ["Evidence coverage", factors.evidence_coverage ?? 0, factors.evidence_coverage >= 70 ? "healthy" : "warning"],
    ["Signed bundle coverage", factors.signed_bundle_coverage ?? 0, factors.signed_bundle_coverage >= 80 ? "healthy" : "warning"],
    ["Identity trace coverage", factors.identity_trace_coverage ?? 0, factors.identity_trace_coverage >= 80 ? "healthy" : "warning"]
  ];
  for (const [label, value, status] of scoreRows) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(status)}`;
    row.innerHTML = `${iconHtml("compliance", status)}<span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}%</small></span>`;
    refs.complianceScoreList.append(row);
  }
  for (const gap of score.gaps || []) {
    const row = document.createElement("div");
    row.className = "detail-row trace-row warn";
    row.innerHTML = `${iconHtml("alarm", "warning")}<span><strong>Gap</strong><small>${escapeHtml(gap)}</small></span>`;
    refs.complianceScoreList.append(row);
  }

  const runs = app.data.policy_sandboxes || [];
  for (const run of (runs.length ? runs : [{ id: "No sandbox runs", status: "idle", mode: "Run simulation before rollout", blast_radius: {} }]).slice(0, 6)) {
    const blast = run.blast_radius || {};
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(run.status)}`;
    row.innerHTML = `
      ${iconHtml("sandbox", run.status)}
      <span>
        <strong>${escapeHtml(run.id)}</strong>
        <small>${escapeHtml(run.mode)} | ${escapeHtml(run.status)}</small>
      </span>
      <code>allow ${escapeHtml(blast.allow || 0)} | warn ${escapeHtml(blast.warn || 0)} | deny ${escapeHtml(blast.deny || 0)}</code>
    `;
    refs.sandboxRunList.append(row);
  }

  const requests = app.data.breakglass_requests || [];
  for (const request of (requests.length ? requests : [{ id: "No breakglass requests", status: "idle", target_id: "none", reason: "Request only for audited emergency access." }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${statusClass(request.status)}`;
    row.innerHTML = `
      ${iconHtml("breakglass", request.status)}
      <span>
        <strong>${escapeHtml(request.target_id || request.id)}</strong>
        <small>${escapeHtml(request.status)} | expires ${escapeHtml(fmtTime(request.expires_at))}</small>
      </span>
      <code>${escapeHtml(request.reason || "")}</code>
    `;
    refs.breakglassList.append(row);
  }
}

function renderAudit() {
  refs.auditList.innerHTML = "";
  refs.integrationHealthList.innerHTML = "";
  const auditRows = app.data.audit_events?.length ? app.data.audit_events : app.data.tasks.map((task) => ({
    action: task.type,
    target_type: "task",
    target_id: task.id,
    occurred_at: task.created_at,
    payload: task.details || {}
  }));
  for (const event of (auditRows.length ? auditRows : [{ action: "No audit events", target_type: "audit", target_id: "none", occurred_at: "", payload: {} }]).slice(0, 12)) {
    const row = document.createElement("div");
    row.className = "detail-row trace-row";
    row.innerHTML = `
      ${iconHtml("task", "neutral")}
      <span>
        <strong>${escapeHtml(event.action)}</strong>
        <small>${escapeHtml(event.target_type)} | ${escapeHtml(event.target_id)} | ${escapeHtml(fmtTime(event.occurred_at))}</small>
      </span>
      <code>${escapeHtml(JSON.stringify(event.payload || {}, null, 2))}</code>
    `;
    refs.auditList.append(row);
  }

  for (const item of app.data.integrations) {
    const row = document.createElement("div");
    row.className = `detail-row trace-row ${item.status === "configured" ? "ok" : item.status === "needs_secret" ? "warn" : ""}`;
    row.innerHTML = `
      ${iconHtml(item.type || "integration", item.status)}
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.type)} | ${escapeHtml(item.direction)} | ${escapeHtml(item.status)}</small>
      </span>
      <button class="mini-button" data-integration-id="${escapeHtml(item.id)}">Test</button>
    `;
    row.querySelector(".mini-button").addEventListener("click", async () => {
      await testIntegration(item.id);
    });
    refs.integrationHealthList.append(row);
  }
}

async function runProbe(lcpUrl) {
  refs.probeButton.disabled = true;
  refs.probeButton.textContent = "Running";
  refs.probeResult.textContent = "Probing Local Control Plane through Cloud protocol paths...";
  try {
    const response = await fetch("/api/lcp/probe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lcpUrl,
        token: refs.lcpToken.value || undefined
      })
    });
    const result = await response.json();
    refs.probeResult.innerHTML = `
      <strong>${result.ok ? "Probe succeeded" : "Probe failed"}</strong>
      <span>${escapeHtml(result.lcp_url)} -> ${escapeHtml(result.cloud_url)}</span>
      <code>${escapeHtml(JSON.stringify(result.results.map((item) => ({ name: item.name, ok: item.ok, status: item.status, latency_ms: item.latency_ms })), null, 2))}</code>
    `;
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.probeButton.disabled = false;
    refs.probeButton.textContent = "Run";
  }
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function createRollout() {
  refs.rolloutButton.disabled = true;
  refs.rolloutButton.textContent = "Creating";
  try {
    const connectedTargets = app.data.local_control_planes
      .filter((lcp) => lcp.status !== "offline")
      .map((lcp) => lcp.id);
    const payload = await postJson("/api/rollouts", {
      bundle_id: "bnd_ai_data_protection",
      target_ids: connectedTargets,
      wave_strategy: "canary-then-batch"
    });
    refs.probeResult.innerHTML = `
      <strong>Rollout planned</strong>
      <span>${escapeHtml(payload.rollout.bundle_id)} for ${payload.rollout.target_ids.length} LCPs</span>
    `;
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.rolloutButton.disabled = false;
    refs.rolloutButton.textContent = "Create Rollout";
  }
}

async function exportEvidence() {
  refs.evidenceButton.disabled = true;
  refs.evidenceButton.textContent = "Exporting";
  try {
    const payload = await postJson("/api/evidence/exports", {
      scope: selectedObject().type || "tenant",
      format: "json"
    });
    refs.probeResult.innerHTML = `
      <strong>Evidence export ready</strong>
      <span>${escapeHtml(payload.export.id)} - ${escapeHtml(payload.export.download_url)}</span>
    `;
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.evidenceButton.disabled = false;
    refs.evidenceButton.textContent = "Export Evidence";
  }
}

async function acknowledgeAlarm(alarmId) {
  try {
    await postJson(`/api/alarms/${encodeURIComponent(alarmId)}/ack`, {});
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  }
}

async function generatePolicyDraft() {
  refs.aiPolicyButton.disabled = true;
  refs.aiPolicyButton.textContent = "Generating";
  try {
    const payload = await postJson("/api/policy/assist", {
      intent: refs.policyIntent.value,
      engine_hint: refs.policyEngineHint.value
    });
    app.latestPolicyDraftId = payload.draft.id;
    refs.policyAssistantResult.innerHTML = `
      <strong>${escapeHtml(payload.draft.title)}</strong>
      <span>${escapeHtml(payload.draft.status)} - human approval required</span>
      <code>${escapeHtml(JSON.stringify(payload.draft.policy_ir, null, 2))}</code>
    `;
    await refresh();
    setActiveTab("policies");
  } catch (error) {
    refs.policyAssistantResult.textContent = String(error);
  } finally {
    refs.aiPolicyButton.disabled = false;
    refs.aiPolicyButton.textContent = "Generate Draft";
  }
}

async function simulateLatestPolicy() {
  const draftId = app.latestPolicyDraftId || app.data.policy_drafts?.[0]?.id;
  if (!draftId) {
    refs.policyAssistantResult.textContent = "No policy draft to simulate.";
    return;
  }
  refs.simulatePolicyButton.disabled = true;
  refs.simulatePolicyButton.textContent = "Simulating";
  try {
    const payload = await postJson(`/api/policy/drafts/${encodeURIComponent(draftId)}/simulate`, {});
    refs.policyAssistantResult.innerHTML = `
      <strong>${escapeHtml(payload.simulation.status)}</strong>
      <span>${escapeHtml(payload.simulation.summary)}</span>
      <code>${escapeHtml(JSON.stringify(payload.simulation.decisions, null, 2))}</code>
    `;
    await refresh();
  } catch (error) {
    refs.policyAssistantResult.textContent = String(error);
  } finally {
    refs.simulatePolicyButton.disabled = false;
    refs.simulatePolicyButton.textContent = "Simulate Latest";
  }
}

async function approveLatestPolicy() {
  const draftId = app.latestPolicyDraftId || app.data.policy_drafts?.[0]?.id;
  if (!draftId) {
    refs.policyAssistantResult.textContent = "No policy draft to approve.";
    return;
  }
  refs.approvePolicyButton.disabled = true;
  refs.approvePolicyButton.textContent = "Approving";
  try {
    const payload = await postJson(`/api/policy/drafts/${encodeURIComponent(draftId)}/approve`, {});
    refs.policyAssistantResult.innerHTML = `
      <strong>Approved, not deployed</strong>
      <span>${escapeHtml(payload.bundle.id)} is signed and ready for rollout.</span>
      <code>${escapeHtml(JSON.stringify({ rollout_required: payload.rollout_required, bundle: payload.bundle }, null, 2))}</code>
    `;
    await refresh();
  } catch (error) {
    refs.policyAssistantResult.textContent = String(error);
  } finally {
    refs.approvePolicyButton.disabled = false;
    refs.approvePolicyButton.textContent = "Approve Latest";
  }
}

async function queryTelemetry() {
  const params = new URLSearchParams();
  params.set("severity", refs.telemetrySeverity.value);
  if (refs.telemetryType.value) params.set("type", refs.telemetryType.value);
  if (refs.telemetrySearch.value) params.set("q", refs.telemetrySearch.value);
  const response = await fetch(`/api/telemetry/query?${params}`);
  const payload = await response.json();
  app.telemetryResults = payload.events || [];
  renderTelemetryExplorer();
  setActiveTab("telemetry");
}

async function sendSampleTelemetry() {
  refs.telemetrySampleButton.disabled = true;
  refs.telemetrySampleButton.textContent = "Sending";
  try {
    await postJson("/api/telemetry/sample", {
      lcp_id: selectedObject().type === "lcp" ? selectedObject().id : "lcp_local",
      severity: "warning"
    });
    app.telemetryResults = [];
    await refresh();
    setActiveTab("telemetry");
  } finally {
    refs.telemetrySampleButton.disabled = false;
    refs.telemetrySampleButton.textContent = "Send Sample";
  }
}

async function createEnrollment() {
  refs.enrollmentButton.disabled = true;
  refs.enrollmentButton.textContent = "Creating";
  try {
    const payload = await postJson("/api/enrollments", {
      device_name: "New Local Control Plane"
    });
    refs.probeResult.innerHTML = `
      <strong>Enrollment created</strong>
      <span>${escapeHtml(payload.session.user_code)}</span>
      <code>${escapeHtml(payload.session.command)}</code>
    `;
    await refresh();
    setActiveTab("timeline");
  } finally {
    refs.enrollmentButton.disabled = false;
    refs.enrollmentButton.textContent = "Create Enrollment";
  }
}

async function syncEntities() {
  refs.entitySyncButton.disabled = true;
  refs.entitySyncButton.textContent = "Syncing";
  try {
    const payload = await postJson("/api/entities/sync", {
      lcpUrl: refs.lcpUrl.value,
      token: refs.lcpToken.value || undefined,
      user_subject: "DELL\\LocalAdmin"
    });
    refs.probeResult.innerHTML = `
      <strong>${payload.ok ? "Entity sync completed" : "Entity sync failed"}</strong>
      <span>${escapeHtml(payload.run.lcp_id)} | ${escapeHtml(payload.run.entity_count)} entities | ${escapeHtml(payload.run.status)}</span>
      <code>${escapeHtml(JSON.stringify((payload.run.results || []).map((item) => ({ key: item.key, ok: item.ok, status: item.status })), null, 2))}</code>
    `;
    await refresh();
    setActiveTab("entities");
  } catch (error) {
    refs.probeResult.textContent = String(error);
    setActiveTab("entities");
  } finally {
    refs.entitySyncButton.disabled = false;
    refs.entitySyncButton.textContent = "Sync From LCP";
  }
}

async function refreshLiveWatch() {
  refs.liveRefreshButton.disabled = true;
  refs.liveRefreshButton.textContent = "Refreshing";
  try {
    const payload = await postJson("/api/entities/watch", {});
    refs.probeResult.innerHTML = `
      <strong>Live watch refreshed</strong>
      <span>${escapeHtml(payload.watch.status)} | entities ${escapeHtml(payload.summary.local_entities)} | changes ${escapeHtml(payload.watch.change_count)}</span>
      <code>${escapeHtml(payload.watch.lcp_url || "")}</code>
    `;
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.liveRefreshButton.disabled = false;
    refs.liveRefreshButton.textContent = "Refresh";
  }
}

async function dispatchConfigUpdate() {
  refs.pushConfigButton.disabled = true;
  refs.pushConfigButton.textContent = "Pushing";
  try {
    const payload = await postJson("/api/lcp/config/dispatch", {
      lcp_id: selectedObject().type === "lcp" ? selectedObject().id : "lcp_local",
      requested_by: "local-dev-admin"
    });
    refs.probeResult.innerHTML = `
      <strong>Config dispatch ${escapeHtml(payload.dispatch.status)}</strong>
      <span>${escapeHtml(payload.dispatch.lcp_id)} | ${escapeHtml(payload.dispatch.action)} | ${escapeHtml(payload.dispatch.id)}</span>
      <code>${escapeHtml(JSON.stringify(payload.dispatch.results.map((item) => ({ path: item.path, ok: item.ok, status: item.status })), null, 2))}</code>
    `;
    await refresh();
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.pushConfigButton.disabled = false;
    refs.pushConfigButton.textContent = "Push Config";
  }
}

async function dispatchHotReload() {
  refs.hotReloadButton.disabled = true;
  refs.hotReloadButton.textContent = "Dispatching";
  try {
    const payload = await postJson("/api/lcp/hot-reload/dispatch", {
      lcp_id: selectedObject().type === "lcp" ? selectedObject().id : "lcp_local",
      bundle_id: app.data.policy_bundles?.[0]?.id || "bnd_ai_data_protection",
      requested_by: "local-dev-admin"
    });
    refs.probeResult.innerHTML = `
      <strong>Hot reload dispatch ${escapeHtml(payload.dispatch.status)}</strong>
      <span>${escapeHtml(payload.dispatch.bundle_id || "bundle pending")} | unsupported ${escapeHtml((payload.dispatch.unsupported_paths || []).length)}</span>
      <code>${escapeHtml(JSON.stringify(payload.dispatch.results.map((item) => ({ path: item.path, ok: item.ok, status: item.status })), null, 2))}</code>
    `;
    await refresh();
    setActiveTab("timeline");
  } catch (error) {
    refs.probeResult.textContent = String(error);
  } finally {
    refs.hotReloadButton.disabled = false;
    refs.hotReloadButton.textContent = "Hot Reload";
  }
}

async function testIntegration(integrationId) {
  const payload = await postJson(`/api/integrations/${encodeURIComponent(integrationId)}/test`, {});
  refs.probeResult.innerHTML = `
    <strong>Integration test: ${escapeHtml(payload.result)}</strong>
    <span>${escapeHtml(payload.integration.name)} - ${escapeHtml(payload.integration.status)}</span>
  `;
  await refresh();
  setActiveTab("audit");
}

async function runComplianceSandbox() {
  refs.sandboxButton.disabled = true;
  refs.sandboxButton.textContent = "Running";
  try {
    const bundleId = app.selectedComplianceBundleId || app.data.compliance_policy_bundles?.[0]?.id;
    const payload = await postJson("/api/compliance/policy-bundles/simulate", {
      bundle_id: bundleId
    });
    refs.probeResult.innerHTML = `
      <strong>Compliance sandbox completed</strong>
      <span>${escapeHtml(payload.bundle.name)} | deploy allowed: ${escapeHtml(payload.deploy_allowed)}</span>
      <code>${escapeHtml(JSON.stringify(payload.run.blast_radius, null, 2))}</code>
    `;
    await refresh();
    setActiveTab("compliance");
  } finally {
    refs.sandboxButton.disabled = false;
    refs.sandboxButton.textContent = "Run Sandbox";
  }
}

async function requestBreakglass() {
  refs.breakglassButton.disabled = true;
  refs.breakglassButton.textContent = "Requesting";
  try {
    const payload = await postJson("/api/breakglass", {
      target_id: selectedObject().type === "lcp" ? selectedObject().id : "lcp_local",
      reason: "Local enterprise breakglass drill for audited emergency policy operations.",
      duration_minutes: 60
    });
    const approved = await postJson(`/api/breakglass/${encodeURIComponent(payload.request.id)}/approve`, {
      approver: "local-dev-security-admin"
    });
    refs.probeResult.innerHTML = `
      <strong>Breakglass active</strong>
      <span>${escapeHtml(approved.request.target_id)} | ${escapeHtml(approved.request.status)}</span>
      <code>${escapeHtml(JSON.stringify(approved.request.local_pollek_semantics, null, 2))}</code>
    `;
    await refresh();
    setActiveTab("compliance");
  } finally {
    refs.breakglassButton.disabled = false;
    refs.breakglassButton.textContent = "Request Breakglass";
  }
}

async function deployComplianceBundle() {
  refs.complianceDeployButton.disabled = true;
  refs.complianceDeployButton.textContent = "Deploying";
  try {
    const bundleId = app.selectedComplianceBundleId || app.data.compliance_policy_bundles?.[0]?.id;
    const targets = (app.data.local_control_planes || []).filter((lcp) => lcp.status !== "offline").map((lcp) => lcp.id);
    const payload = await postJson("/api/compliance/policy-bundles/deploy", {
      bundle_id: bundleId,
      target_ids: targets
    });
    const advanced = await postJson(`/api/rollouts/${encodeURIComponent(payload.rollout.id)}/advance`, {});
    refs.probeResult.innerHTML = `
      <strong>Compliance bundle staged</strong>
      <span>${escapeHtml(payload.policy_bundle.id)} | rollout ${escapeHtml(advanced.rollout.status)}</span>
      <code>${escapeHtml(JSON.stringify({ events: advanced.events?.length || 0, local_delivery: payload.compliance_bundle.contract_hub_distribution.local_delivery }, null, 2))}</code>
    `;
    await refresh();
    setActiveTab("compliance");
  } finally {
    refs.complianceDeployButton.disabled = false;
    refs.complianceDeployButton.textContent = "Deploy Bundle";
  }
}

refs.globalSearch.addEventListener("input", (event) => {
  app.query = event.target.value;
  render();
});

refs.statusFilter.addEventListener("change", (event) => {
  app.statusFilter = event.target.value;
  renderFleetRows();
});

refs.entityTypeFilter.addEventListener("change", (event) => {
  app.entityTypeFilter = event.target.value;
  renderEntities();
});

refs.entityDeviceFilter.addEventListener("change", (event) => {
  app.entityDeviceFilter = event.target.value;
  renderEntities();
});

refs.entityUserFilter.addEventListener("change", (event) => {
  app.entityUserFilter = event.target.value;
  renderEntities();
});

refs.entitySearch.addEventListener("input", (event) => {
  app.entityQuery = event.target.value;
  renderEntities();
});

refs.navCollapseButton?.addEventListener("click", () => setNavCollapsed(!app.navCollapsed));
refs.opsCollapseButton?.addEventListener("click", () => setOpsCollapsed(!app.opsCollapsed));
document.querySelectorAll("[data-ops-section-toggle]").forEach((button) => {
  button.addEventListener("click", () => toggleOpsSection(button.dataset.opsSectionToggle));
});

refs.refreshButton.addEventListener("click", refresh);
refs.probeButton.addEventListener("click", () => runProbe(refs.lcpUrl.value));
refs.rolloutButton.addEventListener("click", createRollout);
refs.evidenceButton.addEventListener("click", exportEvidence);
refs.aiPolicyButton.addEventListener("click", generatePolicyDraft);
refs.simulatePolicyButton.addEventListener("click", simulateLatestPolicy);
refs.approvePolicyButton.addEventListener("click", approveLatestPolicy);
refs.telemetryQueryButton.addEventListener("click", queryTelemetry);
refs.telemetrySampleButton.addEventListener("click", sendSampleTelemetry);
refs.enrollmentButton.addEventListener("click", createEnrollment);
refs.entitySyncButton.addEventListener("click", syncEntities);
refs.liveRefreshButton.addEventListener("click", refreshLiveWatch);
refs.pushConfigButton.addEventListener("click", dispatchConfigUpdate);
refs.hotReloadButton.addEventListener("click", dispatchHotReload);
refs.sandboxButton.addEventListener("click", runComplianceSandbox);
refs.breakglassButton.addEventListener("click", requestBreakglass);
refs.complianceDeployButton.addEventListener("click", deployComplianceBundle);
refs.probeVisibleButton.addEventListener("click", async () => {
  const response = await fetch("/api/fleet/probe-visible", { method: "POST" });
  const payload = await response.json();
  const lcpUrl = payload.next_action?.body?.lcpUrl || refs.lcpUrl.value;
  refs.lcpUrl.value = lcpUrl;
  await runProbe(lcpUrl);
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
});

document.querySelectorAll(".view-button").forEach((button) => {
  if (!button.dataset.targetTab) {
    const label = button.textContent.trim();
    button.dataset.targetTab = {
      Inventory: "summary",
      Entities: "entities",
      "Policy Center": "policies",
      "Observe Center": "telemetry",
      Compliance: "compliance"
    }[label] || "summary";
  }
  button.addEventListener("click", () => setActiveTab(button.dataset.targetTab));
});

window.addEventListener("hashchange", () => {
  setActiveTab(tabFromHash(), { updateHash: false });
});

setActiveTab(tabFromHash(), { updateHash: false });
applyShellState();
applyOpsSectionState();
connectEventStream();
await refresh();
setInterval(refresh, 5000);
