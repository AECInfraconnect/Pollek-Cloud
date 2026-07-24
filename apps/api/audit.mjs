// Audit trail: sensitive-value redaction plus the append-only, in-memory audit event log.
// recordAudit is called across the domain after every meaningful action; it redacts and
// size-bounds the payload, appends to state.auditEvents, and debounces a persist.
// See docs/MODULARIZATION_PLAN.md.

import crypto from "node:crypto";
import { stableJson, sha256 } from "./lib/util.mjs";
import { maxAuditPayloadBytes } from "./config.mjs";
import { state } from "./state.mjs";
import { scheduleRuntimePersist } from "./persistence.mjs";

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitive(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (/token|secret|password|private|credential|authorization|apikey|cookie/.test(normalized))
        return [key, "[redacted]"];
      if (["reference", "paymentreference", "providerreference"].includes(normalized))
        return [key, "[redacted]"];
      return [key, redactSensitive(item)];
    })
  );
}

function safeAuditPayload(payload = {}) {
  const redacted = redactSensitive(payload);
  const encoded = stableJson(redacted);
  if (Buffer.byteLength(encoded, "utf8") <= maxAuditPayloadBytes) return redacted;
  return {
    truncated: true,
    payload_hash: sha256(encoded),
    byte_length: Buffer.byteLength(encoded, "utf8"),
    keys:
      redacted && typeof redacted === "object" && !Array.isArray(redacted)
        ? Object.keys(redacted).sort()
        : [],
    preview: typeof redacted === "string" ? redacted.slice(0, 1024) : undefined
  };
}

export function recordAudit(action, targetType, targetId, payload = {}) {
  const safePayload = safeAuditPayload(payload);
  const event = {
    id: `audit_${crypto.randomUUID()}`,
    tenant_id: safePayload.tenant_id || payload.tenant_id || "local",
    actor_id: safePayload.actor_id || payload.actor_id || "local-dev-admin",
    action,
    target_type: targetType,
    target_id: targetId,
    payload: safePayload,
    occurred_at: new Date().toISOString()
  };
  state.auditEvents.unshift(event);
  state.auditEvents = state.auditEvents.slice(0, 100);
  scheduleRuntimePersist(`audit.${action}`);
  return event;
}
