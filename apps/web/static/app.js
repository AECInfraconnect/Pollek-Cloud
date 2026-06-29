const refs = {
  cloudStatus: document.querySelector("#cloudStatus"),
  globalSearch: document.querySelector("#globalSearch"),
  refreshButton: document.querySelector("#refreshButton"),
  inventoryTree: document.querySelector("#inventoryTree"),
  breadcrumb: document.querySelector("#breadcrumb"),
  objectTitle: document.querySelector("#objectTitle"),
  objectStatus: document.querySelector("#objectStatus"),
  objectRisk: document.querySelector("#objectRisk"),
  metricLcpTotal: document.querySelector("#metricLcpTotal"),
  metricConnected: document.querySelector("#metricConnected"),
  metricDegraded: document.querySelector("#metricDegraded"),
  metricOffline: document.querySelector("#metricOffline"),
  metricAgents: document.querySelector("#metricAgents"),
  metricEntities: document.querySelector("#metricEntities"),
  metricCoverage: document.querySelector("#metricCoverage"),
  fleetRows: document.querySelector("#fleetRows"),
  statusFilter: document.querySelector("#statusFilter"),
  entitySyncButton: document.querySelector("#entitySyncButton"),
  entityTypeFilter: document.querySelector("#entityTypeFilter"),
  entityDeviceFilter: document.querySelector("#entityDeviceFilter"),
  entityUserFilter: document.querySelector("#entityUserFilter"),
  entitySearch: document.querySelector("#entitySearch"),
  entityList: document.querySelector("#entityList"),
  entityTracePanel: document.querySelector("#entityTracePanel"),
  connectionProfileList: document.querySelector("#connectionProfileList"),
  serviceEndpointList: document.querySelector("#serviceEndpointList"),
  relationshipMap: document.querySelector("#relationshipMap"),
  eventTable: document.querySelector("#eventTable"),
  probeButton: document.querySelector("#probeButton"),
  probeVisibleButton: document.querySelector("#probeVisibleButton"),
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

const app = {
  data: null,
  selectedObjectId: "tenant_local_lab",
  activeTab: "summary",
  query: "",
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

function setCloudStatus(ok, text) {
  refs.cloudStatus.className = `status-pill ${ok ? "ok" : "bad"}`;
  refs.cloudStatus.textContent = text;
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
    setCloudStatus(true, "Cloud API online");
    render();
  } catch (error) {
    setCloudStatus(false, "Cloud API offline");
    refs.probeResult.textContent = String(error);
  }
}

function render() {
  if (!app.data) return;
  renderSummary(app.data.summary);
  renderTree();
  renderObjectHeader();
  renderFleetRows();
  renderEntityFilters();
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

function childrenOf(parentId) {
  return app.data.tree.filter((item) => item.parent_id === parentId);
}

function renderTree() {
  refs.inventoryTree.innerHTML = "";
  const query = app.query.trim().toLowerCase();
  const shouldShow = (item) => {
    if (!query) return true;
    if (item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query)) return true;
    return app.data.tree.some((child) => child.parent_id === item.id && shouldShow(child));
  };

  const renderNode = (item, depth) => {
    if (!shouldShow(item)) return;
    const button = document.createElement("button");
    button.className = `tree-row ${app.selectedObjectId === item.id ? "active" : ""}`;
    button.style.setProperty("--depth", depth);
    button.innerHTML = `
      <span class="node-icon ${escapeHtml(item.type)}"></span>
      <span class="node-name">${escapeHtml(item.name)}</span>
      <span class="node-state ${statusClass(item.status)}"></span>
    `;
    button.addEventListener("click", () => {
      app.selectedObjectId = item.id;
      render();
    });
    refs.inventoryTree.append(button);
    for (const child of childrenOf(item.id)) renderNode(child, depth + 1);
  };

  for (const root of childrenOf(null)) renderNode(root, 0);
}

function selectedObject() {
  return app.data.objects[app.selectedObjectId] || app.data.objects.tenant_local_lab;
}

function pathToObject(id) {
  const map = new Map(app.data.tree.map((item) => [item.id, item]));
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
  refs.breadcrumb.textContent = pathToObject(object.id).join(" / ");
  refs.objectTitle.textContent = object.name || object.id;
  refs.objectStatus.className = `status-pill ${statusClass(object.status)}`;
  refs.objectStatus.textContent = object.status || "unknown";
  refs.objectRisk.className = `risk-pill ${object.risk === "high" ? "bad" : object.risk === "medium" ? "warn" : "ok"}`;
  refs.objectRisk.textContent = `${object.risk || "low"} risk`;

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
    const tr = document.createElement("tr");
    tr.className = app.selectedObjectId === lcp.id ? "selected" : "";
    tr.innerHTML = `
      <td><span class="status-dot ${statusClass(lcp.status)}"></span>${escapeHtml(lcp.status)}</td>
      <td><button class="link-button" data-object-id="${escapeHtml(lcp.id)}">${escapeHtml(lcp.name)}</button><small>${escapeHtml(lcp.device_name)}</small></td>
      <td>${escapeHtml(lcp.site)}<small>${escapeHtml(lcp.group)}</small></td>
      <td>${escapeHtml(lcp.version)}</td>
      <td>${escapeHtml(lcp.contract_version)}</td>
      <td>${escapeHtml(lcp.active_bundle)}</td>
      <td>${lcp.agents}</td>
      <td><div class="coverage"><span style="width:${Math.max(0, Math.min(100, lcp.policy_coverage))}%"></span></div>${lcp.policy_coverage}%</td>
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
  center.innerHTML = `<strong>${escapeHtml(object.name || object.id)}</strong><span>${escapeHtml(object.type || "object")}</span>`;
  container.append(center);

  const visible = (relations.length ? relations : relationships).slice(0, limit);
  for (const rel of visible) {
    const relatedId = rel.from === object.id ? rel.to : rel.from;
    const related = app.data.objects[relatedId] || { id: relatedId, name: relatedId, type: "object", status: "unknown" };
    const node = document.createElement("button");
    node.className = "relationship-node";
    node.innerHTML = `<strong>${escapeHtml(related.name || related.id)}</strong><span>${escapeHtml(rel.label)}</span>`;
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
      <strong>${escapeHtml(from.name)} -> ${escapeHtml(to.name)}</strong>
      <span>${escapeHtml(rel.label)} | ${escapeHtml(from.type)} to ${escapeHtml(to.type)}</span>
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

function selectedLocalEntity(entities) {
  const object = selectedObject();
  if (object?.id && (app.data.local_entities || []).some((entity) => entity.id === object.id)) return object;
  return entities[0] || null;
}

function renderEntities() {
  if (!refs.entityList) return;
  const entities = filteredEntities();
  const activeEntity = selectedLocalEntity(entities);
  refs.entityList.innerHTML = "";

  if (!entities.length) {
    refs.entityList.innerHTML = `<div class="detail-row"><strong>No entities match</strong><span>Adjust filters or sync from a running Local Pollek Control Plane.</span></div>`;
    renderEntityTrace(null);
    return;
  }

  for (const entity of entities.slice(0, 80)) {
    const row = document.createElement("button");
    row.className = `detail-row ${statusClass(entity.status)} ${activeEntity?.id === entity.id ? "selected" : ""}`;
    const streams = entity.observability?.telemetry_streams || [];
    row.innerHTML = `
      <strong>${escapeHtml(entity.name || entity.local_object_id || entity.id)}</strong>
      <span>${escapeHtml(entity.entity_type)} | ${escapeHtml(entity.status)} | ${escapeHtml(entity.device_name || entity.device_id)} | ${escapeHtml(entity.user_subject || "unknown user")}</span>
      <code>${escapeHtml(entity.trace?.spiffe_id || entity.identity?.spiffe_id || entity.source || "trace pending")} | ${escapeHtml(streams.join(", ") || "no telemetry stream")}</code>
    `;
    row.addEventListener("click", () => {
      app.selectedObjectId = entity.id;
      render();
    });
    refs.entityList.append(row);
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
    row.className = `detail-row ${item.status}`;
    row.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span>`;
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
    row.className = `detail-row ${statusClass(profile.status)}`;
    row.innerHTML = `
      <strong>${escapeHtml(profile.name)}</strong>
      <span>${escapeHtml(profile.status)} | contract ${escapeHtml(profile.contract_version)} | trust ${escapeHtml(profile.trust_scope_id)}</span>
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
    row.className = `detail-row ${statusClass(endpoint.status)}`;
    row.innerHTML = `
      <strong>${escapeHtml(endpoint.name)}</strong>
      <span>${escapeHtml(endpoint.type)} | ${escapeHtml(endpoint.status)} | ${escapeHtml(endpoint.scope)}</span>
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
    row.className = "event-row";
    row.innerHTML = `
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
    row.className = `detail-row ${statusClass(event.severity === "critical" ? "failed" : event.severity === "warning" ? "degraded" : "connected")}`;
    row.innerHTML = `
      <strong>${escapeHtml(event.event_type)}</strong>
      <span>${escapeHtml(fmtTime(event.received_at))} | ${escapeHtml(event.severity || "info")} | ${escapeHtml(event.device_id || "cloud")}</span>
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
      <strong>${escapeHtml(alarm.summary)}</strong>
      <span>${escapeHtml(alarm.object_name)} - ${escapeHtml(fmtTime(alarm.created_at))}${verbose ? ` - ${escapeHtml(alarm.state)}` : ""}</span>
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
    row.className = "task-row";
    row.innerHTML = `<strong>${escapeHtml(task.summary)}</strong><span>${escapeHtml(task.status)}${task.created_at ? ` - ${fmtTime(task.created_at)}` : ""}</span>`;
    refs.taskList.append(row);
  }
}

function renderPolicyPacks() {
  const packs = app.data.policy_packs || [];
  refs.policyPackCount.textContent = packs.length;
  refs.policyPackList.innerHTML = "";
  for (const pack of packs) {
    const row = document.createElement("div");
    row.className = "compact-row";
    row.innerHTML = `
      <strong>${escapeHtml(pack.name)}</strong>
      <span>${escapeHtml(pack.default_mode)} - ${escapeHtml(pack.engines.join(", "))}</span>
    `;
    refs.policyPackList.append(row);
  }
}

function renderIntegrations() {
  const integrations = app.data.integrations || [];
  refs.integrationList.innerHTML = "";
  for (const item of integrations) {
    const row = document.createElement("div");
    row.className = "compact-row";
    row.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.type)} - ${escapeHtml(item.status)}</span>
    `;
    refs.integrationList.append(row);
  }
}

function renderPolicyWorkspace() {
  refs.policyDraftList.innerHTML = "";
  refs.bundleStatusList.innerHTML = "";
  const drafts = app.data.policy_drafts || [];
  for (const draft of drafts.slice(0, 8)) {
    const row = document.createElement("button");
    row.className = `detail-row ${draft.status === "approved" ? "ok" : draft.status === "requires_human_review" ? "warn" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(draft.title)}</strong>
      <span>${escapeHtml(draft.status)} | ${escapeHtml(draft.recommended_engine)} | ${escapeHtml(fmtTime(draft.updated_at || draft.created_at))}</span>
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
    row.className = `detail-row ${bundle.status === "active" ? "ok" : bundle.status === "stale" ? "warn" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(bundle.name)}</strong>
      <span>${escapeHtml(bundle.status)} | revision ${escapeHtml(bundle.revision)} | coverage ${escapeHtml(bundle.coverage)}%</span>
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
    row.className = `detail-row ${rollout.status === "planned" ? "warn" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(rollout.bundle_id)}</strong>
      <span>${escapeHtml(rollout.status)} | stage ${escapeHtml((rollout.current_stage ?? -1) + 1)}/${escapeHtml(rollout.total_stages || 0)} | targets ${escapeHtml((rollout.target_ids || []).length)} | ${escapeHtml(fmtTime(rollout.created_at))}</span>
      <code>${escapeHtml(rollout.wave_strategy || "not scheduled")} | ${escapeHtml(rollout.local_pollek_compatibility?.lcp_manifest_path || "manifest pending")}</code>
    `;
    refs.rolloutTimeline.append(row);
  }

  for (const event of (app.data.hot_reload_events || []).slice(0, 5)) {
    const row = document.createElement("div");
    row.className = `detail-row ${statusClass(event.status)}`;
    row.innerHTML = `
      <strong>${escapeHtml(event.event_type)}</strong>
      <span>${escapeHtml(event.lcp_id)} | ${escapeHtml(event.status)} | stage ${escapeHtml(event.stage_index ?? 0)}</span>
      <code>${escapeHtml(event.local_pollek_paths?.sse_bundle_ready || "")}</code>
    `;
    refs.rolloutTimeline.append(row);
  }

  const enrollments = app.data.enrollment_sessions || [];
  for (const session of (enrollments.length ? enrollments : [{ user_code: "No enrollment", status: "idle", command: "Create an enrollment when a new LCP is ready.", created_at: "" }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row ${session.status === "waiting_for_lcp" ? "warn" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(session.user_code)}</strong>
      <span>${escapeHtml(session.status)} | ${escapeHtml(fmtTime(session.created_at))}</span>
      <code>${escapeHtml(session.command)}</code>
    `;
    refs.enrollmentList.append(row);
  }

  const exports = app.data.evidence_exports || [];
  for (const item of (exports.length ? exports : [{ id: "No evidence exports", status: "idle", scope: "none", requested_at: "" }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row ${item.status === "ready" ? "ok" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(item.id)}</strong>
      <span>${escapeHtml(item.status)} | ${escapeHtml(item.scope)} | ${escapeHtml(fmtTime(item.requested_at))}</span>
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
    row.className = `detail-row ${bundle.deployable ? "ok" : "warn"}`;
    row.innerHTML = `
      <strong>${escapeHtml(bundle.name)}</strong>
      <span>${escapeHtml((bundle.frameworks || []).join(", ") || "no framework")} | ${escapeHtml(bundle.edition || "enterprise")} | ${escapeHtml(bundle.default_mode || "n/a")}</span>
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
    row.className = `detail-row ${statusClass(status)}`;
    row.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}%</span>`;
    refs.complianceScoreList.append(row);
  }
  for (const gap of score.gaps || []) {
    const row = document.createElement("div");
    row.className = "detail-row warn";
    row.innerHTML = `<strong>Gap</strong><span>${escapeHtml(gap)}</span>`;
    refs.complianceScoreList.append(row);
  }

  const runs = app.data.policy_sandboxes || [];
  for (const run of (runs.length ? runs : [{ id: "No sandbox runs", status: "idle", mode: "Run simulation before rollout", blast_radius: {} }]).slice(0, 6)) {
    const blast = run.blast_radius || {};
    const row = document.createElement("div");
    row.className = `detail-row ${statusClass(run.status)}`;
    row.innerHTML = `
      <strong>${escapeHtml(run.id)}</strong>
      <span>${escapeHtml(run.mode)} | ${escapeHtml(run.status)}</span>
      <code>allow ${escapeHtml(blast.allow || 0)} | warn ${escapeHtml(blast.warn || 0)} | deny ${escapeHtml(blast.deny || 0)}</code>
    `;
    refs.sandboxRunList.append(row);
  }

  const requests = app.data.breakglass_requests || [];
  for (const request of (requests.length ? requests : [{ id: "No breakglass requests", status: "idle", target_id: "none", reason: "Request only for audited emergency access." }]).slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `detail-row ${statusClass(request.status)}`;
    row.innerHTML = `
      <strong>${escapeHtml(request.target_id || request.id)}</strong>
      <span>${escapeHtml(request.status)} | expires ${escapeHtml(fmtTime(request.expires_at))}</span>
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
    row.className = "detail-row";
    row.innerHTML = `
      <strong>${escapeHtml(event.action)}</strong>
      <span>${escapeHtml(event.target_type)} | ${escapeHtml(event.target_id)} | ${escapeHtml(fmtTime(event.occurred_at))}</span>
      <code>${escapeHtml(JSON.stringify(event.payload || {}, null, 2))}</code>
    `;
    refs.auditList.append(row);
  }

  for (const item of app.data.integrations) {
    const row = document.createElement("div");
    row.className = `detail-row ${item.status === "configured" ? "ok" : item.status === "needs_secret" ? "warn" : ""}`;
    row.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.type)} | ${escapeHtml(item.direction)} | ${escapeHtml(item.status)}</span>
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
await refresh();
setInterval(refresh, 5000);
