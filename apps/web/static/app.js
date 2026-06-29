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
  metricCoverage: document.querySelector("#metricCoverage"),
  fleetRows: document.querySelector("#fleetRows"),
  statusFilter: document.querySelector("#statusFilter"),
  relationshipMap: document.querySelector("#relationshipMap"),
  eventTable: document.querySelector("#eventTable"),
  probeButton: document.querySelector("#probeButton"),
  probeVisibleButton: document.querySelector("#probeVisibleButton"),
  lcpUrl: document.querySelector("#lcpUrl"),
  lcpToken: document.querySelector("#lcpToken"),
  probeResult: document.querySelector("#probeResult"),
  alarmCount: document.querySelector("#alarmCount"),
  alarmList: document.querySelector("#alarmList"),
  taskList: document.querySelector("#taskList")
};

const app = {
  data: null,
  selectedObjectId: "tenant_local_lab",
  query: "",
  statusFilter: "all"
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
  if (status === "connected" || status === "active" || status === "available") return "ok";
  if (status === "offline" || status === "critical" || status === "failed") return "bad";
  if (status === "degraded" || status === "unknown" || status === "stale") return "warn";
  return "neutral";
}

function setCloudStatus(ok, text) {
  refs.cloudStatus.className = `status-pill ${ok ? "ok" : "bad"}`;
  refs.cloudStatus.textContent = text;
}

async function refresh() {
  try {
    const response = await fetch("/api/fleet");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    app.data = await response.json();
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
  renderRelationships();
  renderEvents();
  renderAlarms();
  renderTasks();
}

function renderSummary(summary) {
  refs.metricLcpTotal.textContent = summary.local_control_planes;
  refs.metricConnected.textContent = summary.connected;
  refs.metricDegraded.textContent = summary.degraded;
  refs.metricOffline.textContent = summary.offline;
  refs.metricAgents.textContent = summary.agents;
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

function renderRelationships() {
  const object = selectedObject();
  const relations = app.data.relationships.filter((rel) => rel.from === object.id || rel.to === object.id);
  refs.relationshipMap.innerHTML = "";
  const center = document.createElement("div");
  center.className = "relationship-node center";
  center.innerHTML = `<strong>${escapeHtml(object.name || object.id)}</strong><span>${escapeHtml(object.type || "object")}</span>`;
  refs.relationshipMap.append(center);

  const visible = relations.length ? relations : app.data.relationships.slice(0, 6);
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
    refs.relationshipMap.append(node);
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

function renderAlarms() {
  const alarms = app.data.alarms.filter((alarm) => alarm.state === "open");
  refs.alarmCount.textContent = alarms.length;
  refs.alarmList.innerHTML = "";
  for (const alarm of alarms) {
    const row = document.createElement("button");
    row.className = `alarm-row ${alarm.severity}`;
    row.innerHTML = `<strong>${escapeHtml(alarm.summary)}</strong><span>${escapeHtml(alarm.object_name)} - ${escapeHtml(fmtTime(alarm.created_at))}</span>`;
    row.addEventListener("click", () => {
      app.selectedObjectId = alarm.object_id;
      render();
    });
    refs.alarmList.append(row);
  }
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

refs.globalSearch.addEventListener("input", (event) => {
  app.query = event.target.value;
  render();
});

refs.statusFilter.addEventListener("change", (event) => {
  app.statusFilter = event.target.value;
  renderFleetRows();
});

refs.refreshButton.addEventListener("click", refresh);
refs.probeButton.addEventListener("click", () => runProbe(refs.lcpUrl.value));
refs.probeVisibleButton.addEventListener("click", async () => {
  const response = await fetch("/api/fleet/probe-visible", { method: "POST" });
  const payload = await response.json();
  const lcpUrl = payload.next_action?.body?.lcpUrl || refs.lcpUrl.value;
  refs.lcpUrl.value = lcpUrl;
  await runProbe(lcpUrl);
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
  });
});

await refresh();
setInterval(refresh, 5000);
