const cloudStatus = document.querySelector("#cloudStatus");
const cloudUrl = document.querySelector("#cloudUrl");
const contractVersion = document.querySelector("#contractVersion");
const transports = document.querySelector("#transports");
const deviceCount = document.querySelector("#deviceCount");
const eventCount = document.querySelector("#eventCount");
const probeCount = document.querySelector("#probeCount");
const taskList = document.querySelector("#taskList");
const eventTable = document.querySelector("#eventTable");
const probeButton = document.querySelector("#probeButton");
const probeResult = document.querySelector("#probeResult");
const lcpUrl = document.querySelector("#lcpUrl");
const lcpToken = document.querySelector("#lcpToken");

function setStatus(ok, text) {
  cloudStatus.className = `status-pill ${ok ? "ok" : "bad"}`;
  cloudStatus.textContent = text;
}

function renderStatus(data) {
  cloudUrl.textContent = data.cloud_url;
  contractVersion.textContent = data.contract.contract_version;
  transports.textContent = data.contract.supported_transports.join(", ");
  deviceCount.textContent = data.devices.length;
  eventCount.textContent = data.events.length;
  probeCount.textContent = data.probes.length;

  taskList.innerHTML = "";
  const tasks = data.tasks.length ? data.tasks : [{ summary: "No tasks yet", status: "idle", created_at: "" }];
  for (const task of tasks.slice(0, 6)) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${task.summary}</strong><span>${task.status}${task.created_at ? ` · ${new Date(task.created_at).toLocaleTimeString()}` : ""}</span>`;
    taskList.append(li);
  }

  eventTable.innerHTML = "";
  const events = data.events.length ? data.events : [{
    received_at: new Date().toISOString(),
    event_type: "waiting",
    tenant_id: "local",
    payload: { detail: "No protocol events received yet." }
  }];
  for (const event of events.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <div>${new Date(event.received_at).toLocaleString()}</div>
      <code>${event.event_type}</code>
      <div>${escapeHtml(JSON.stringify(event.payload || {}, null, 0))}</div>
    `;
    eventTable.append(row);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function refresh() {
  try {
    const response = await fetch("/api/cloud/status");
    const data = await response.json();
    setStatus(true, "Cloud API online");
    renderStatus(data);
  } catch (error) {
    setStatus(false, "Cloud API offline");
    probeResult.textContent = String(error);
  }
}

probeButton.addEventListener("click", async () => {
  probeButton.disabled = true;
  probeButton.textContent = "Probing";
  probeResult.innerHTML = "Running real protocol probe against Local Control Plane...";
  try {
    const response = await fetch("/api/lcp/probe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lcpUrl: lcpUrl.value,
        token: lcpToken.value || undefined
      })
    });
    const data = await response.json();
    probeResult.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    await refresh();
  } catch (error) {
    probeResult.textContent = String(error);
  } finally {
    probeButton.disabled = false;
    probeButton.textContent = "Run Probe";
  }
});

await refresh();
setInterval(refresh, 5000);
