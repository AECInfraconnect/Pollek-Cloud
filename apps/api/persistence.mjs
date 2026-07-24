// Runtime persistence: snapshot the in-memory state to a file (dev) or Postgres (prod) and
// hydrate it back on boot. This is the only module that reads/writes the durable snapshot;
// callers mutate `state` (state.mjs) and then call scheduleRuntimePersist to debounce a save.
// See docs/MODULARIZATION_PLAN.md.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as db from "./db.mjs";
import { stateFilePath, cloudVersion, eventStreamReplayWindow } from "./config.mjs";
import { state, persistedFleetKeys } from "./state.mjs";
import { mapToEntries, entriesToMap } from "./lib/util.mjs";

export const persistence = {
  schema_version: "pollek.cloud.runtime-persistence.v1",
  mode: process.env.POLLEK_CLOUD_PERSISTENCE || "file-snapshot-dev",
  enabled: process.env.POLLEK_CLOUD_PERSISTENCE !== "disabled",
  file_path: stateFilePath,
  loaded: false,
  load_status: "seeded",
  last_loaded_at: null,
  last_saved_at: null,
  last_reason: null,
  save_count: 0,
  last_error: null
};

let persistTimer = null;

export function runtimePersistenceStatus() {
  return {
    ...persistence,
    postgres_migration: "packages/db/migrations/0001_foundation.sql",
    identity_billing_migration: "packages/db/migrations/0002_identity_billing.sql",
    production_target: "postgresql",
    persisted_collections: {
      fleet: persistedFleetKeys,
      root: [
        "tenant",
        "devices",
        "events",
        "eventJournal",
        "auditEvents",
        "tasks",
        "probes",
        "enrollmentCodes"
      ]
    },
    record_counts: {
      devices: state.devices.size,
      telemetry_events: state.events.length,
      telemetry_envelopes: state.fleet.telemetryEnvelopes?.length || 0,
      telemetry_batch_receipts: state.fleet.telemetryBatchReceipts?.length || 0,
      telemetry_rejections: state.fleet.telemetryRejections?.length || 0,
      event_journal: state.eventJournal.length,
      audit_events: state.auditEvents.length,
      tasks: state.tasks.length,
      probes: state.probes.length,
      policy_drafts: state.fleet.policyDrafts.length,
      ai_provider_runs: state.fleet.aiProviderRuns?.length || 0,
      policy_test_fixtures: state.fleet.policyTestFixtures?.length || 0,
      policy_bundles: state.fleet.policyBundles.length,
      policy_bundle_signatures: state.fleet.policyBundleSignatures?.length || 0,
      policy_bundle_artifacts: state.fleet.policyBundleArtifacts?.length || 0,
      authorization_tuples: state.fleet.authorizationTuples?.length || 0,
      authorization_decisions: state.fleet.authorizationDecisions?.length || 0,
      rollouts: state.fleet.rolloutPlans.length,
      hot_reload_events: state.fleet.hotReloadEvents.length,
      breakglass_requests: state.fleet.breakglassRequests.length,
      local_entities: state.fleet.localEntities.length,
      entity_sync_runs: state.fleet.localEntitySyncRuns.length,
      local_change_cursors: state.fleet.localChangeCursors?.length || 0,
      local_change_batches: state.fleet.localChangeBatches?.length || 0,
      evidence_exports: state.fleet.evidenceExports.length,
      enrollment_sessions: state.fleet.enrollmentSessions.length,
      accounts: state.fleet.accounts?.length || 0,
      tenant_members: state.fleet.tenantMembers?.length || 0,
      invitations: state.fleet.invitations?.length || 0,
      auth_sessions: state.fleet.authSessions?.length || 0,
      identity_providers: state.fleet.identityProviders?.length || 0,
      scim_users: state.fleet.scimUsers?.length || 0,
      billing_accounts: state.fleet.billingAccounts?.length || 0,
      subscriptions: state.fleet.subscriptions?.length || 0,
      usage_records: state.fleet.usageRecords?.length || 0,
      invoices: state.fleet.invoices?.length || 0,
      payment_methods: state.fleet.paymentMethods?.length || 0,
      licenses: state.fleet.licenses?.length || 0,
      billing_events: state.fleet.billingEvents?.length || 0,
      kms_keys: state.fleet.kmsKeys?.length || 0
    }
  };
}

function runtimeStateSnapshot() {
  const fleet = {};
  for (const key of persistedFleetKeys) {
    fleet[key] = state.fleet[key];
  }
  return {
    schema_version: "pollek.cloud.runtime-state-snapshot.v1",
    saved_at: new Date().toISOString(),
    cloud_version: cloudVersion,
    tenant: state.tenant,
    devices: mapToEntries(state.devices),
    events: state.events,
    eventJournal: state.eventJournal,
    auditEvents: state.auditEvents,
    tasks: state.tasks,
    probes: state.probes,
    enrollmentCodes: mapToEntries(state.enrollmentCodes),
    fleet
  };
}

function applyRuntimeStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.tenant && typeof snapshot.tenant === "object") {
    state.tenant = { ...state.tenant, ...snapshot.tenant };
  }
  if (Array.isArray(snapshot.devices)) state.devices = entriesToMap(snapshot.devices);
  if (Array.isArray(snapshot.enrollmentCodes))
    state.enrollmentCodes = entriesToMap(snapshot.enrollmentCodes);
  if (Array.isArray(snapshot.events)) state.events = snapshot.events.slice(0, 100);
  if (Array.isArray(snapshot.eventJournal))
    state.eventJournal = snapshot.eventJournal.slice(-eventStreamReplayWindow);
  if (Array.isArray(snapshot.auditEvents)) state.auditEvents = snapshot.auditEvents.slice(0, 100);
  if (Array.isArray(snapshot.tasks)) state.tasks = snapshot.tasks.slice(0, 25);
  if (Array.isArray(snapshot.probes)) state.probes = snapshot.probes.slice(0, 20);
  if (snapshot.fleet && typeof snapshot.fleet === "object") {
    for (const key of persistedFleetKeys) {
      if (Array.isArray(snapshot.fleet[key])) state.fleet[key] = snapshot.fleet[key];
    }
    if (Number.isFinite(snapshot.fleet.bundleGeneration)) {
      state.fleet.bundleGeneration = Math.max(0, Math.floor(snapshot.fleet.bundleGeneration));
    }
    if (snapshot.fleet.trustRevocations && typeof snapshot.fleet.trustRevocations === "object") {
      const stored = snapshot.fleet.trustRevocations;
      state.fleet.trustRevocations = {
        revocation_epoch: Number.isFinite(stored.revocation_epoch)
          ? Math.max(0, Math.floor(stored.revocation_epoch))
          : 0,
        revoked_key_ids: Array.isArray(stored.revoked_key_ids) ? stored.revoked_key_ids : [],
        revoked_bundle_digests: Array.isArray(stored.revoked_bundle_digests)
          ? stored.revoked_bundle_digests
          : [],
        revoked_revisions: Array.isArray(stored.revoked_revisions) ? stored.revoked_revisions : [],
        history: Array.isArray(stored.history) ? stored.history : []
      };
    }
  }
}

export async function loadRuntimeState() {
  if (!persistence.enabled) {
    persistence.load_status = "disabled";
    return;
  }
  if (db.isEnabled()) {
    persistence.mode = "postgres";
    persistence.file_path = null;
    try {
      const migration = await db.migrate();
      persistence.migrations_applied = migration.ran;
      const snapshot = await db.loadSnapshot();
      if (snapshot) {
        applyRuntimeStateSnapshot(snapshot);
        persistence.loaded = true;
        persistence.load_status = "loaded";
        persistence.last_loaded_at = new Date().toISOString();
      } else {
        persistence.load_status = "seeded";
      }
      persistence.last_error = null;
    } catch (error) {
      persistence.load_status = "load_failed";
      persistence.last_error = error instanceof Error ? error.message : String(error);
    }
    return;
  }
  try {
    const snapshot = JSON.parse(await readFile(stateFilePath, "utf8"));
    applyRuntimeStateSnapshot(snapshot);
    persistence.loaded = true;
    persistence.load_status = "loaded";
    persistence.last_loaded_at = new Date().toISOString();
    persistence.last_saved_at = snapshot.saved_at || null;
    persistence.last_error = null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      persistence.load_status = "seeded";
      persistence.last_error = null;
      return;
    }
    persistence.load_status = "load_failed";
    persistence.last_error = error instanceof Error ? error.message : String(error);
  }
}

export async function persistRuntimeState(reason = "manual") {
  if (!persistence.enabled) return runtimePersistenceStatus();
  if (db.isEnabled()) {
    try {
      const snapshot = runtimeStateSnapshot();
      await db.persistSnapshot(snapshot, persistedFleetKeys);
      persistence.last_saved_at = snapshot.saved_at;
      persistence.last_reason = reason;
      persistence.save_count += 1;
      persistence.last_error = null;
    } catch (error) {
      persistence.last_error = error instanceof Error ? error.message : String(error);
    }
    return runtimePersistenceStatus();
  }
  try {
    const snapshot = runtimeStateSnapshot();
    const payload = JSON.stringify(snapshot, null, 2);
    const tmpPath = `${stateFilePath}.tmp`;
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(tmpPath, `${payload}\n`, "utf8");
    await rename(tmpPath, stateFilePath);
    persistence.last_saved_at = snapshot.saved_at;
    persistence.last_reason = reason;
    persistence.save_count += 1;
    persistence.last_error = null;
  } catch (error) {
    persistence.last_error = error instanceof Error ? error.message : String(error);
  }
  return runtimePersistenceStatus();
}

export function scheduleRuntimePersist(reason = "mutation") {
  if (!persistence.enabled) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistRuntimeState(reason);
  }, 40);
}
