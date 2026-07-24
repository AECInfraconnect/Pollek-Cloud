// Pure, dependency-free helpers shared across the Pollek Cloud API.
//
// Everything here is side-effect-free and independent of runtime state, so it is safe to
// import anywhere and is unit-tested directly in test/util.test.mjs. Modules that need runtime
// state stay in server.mjs (for now) — see docs/MODULARIZATION_PLAN.md.

import crypto from "node:crypto";

/** Build an Error carrying an HTTP status code and a machine-readable code. */
export function httpError(statusCode, message, code = message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/** Serialize a Map to an array of { key, value } entries (JSON-snapshot friendly). */
export function mapToEntries(map) {
  return [...map.entries()].map(([key, value]) => ({ key, value }));
}

/** Rehydrate a Map from { key, value } entries produced by mapToEntries. */
export function entriesToMap(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    if (entry && Object.hasOwn(entry, "key")) map.set(entry.key, entry.value);
  }
  return map;
}

/**
 * Deterministic JSON: object keys are sorted recursively and arrays keep their order, so the
 * output is byte-stable for hashing and detached signatures.
 */
export function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

/** Hex SHA-256 of the string form of the input. */
export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/** URL/id-safe slug; falls back to `${fallback}-<random>` when the input has no usable chars. */
export function slugify(value, fallback = "tenant") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `${fallback}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Current time as an ISO-8601 string. */
export function nowIso() {
  return new Date().toISOString();
}

/** ISO-8601 timestamp `days` days from now. */
export function daysFromNow(days) {
  return new Date(Date.now() + Number(days || 0) * 86400000).toISOString();
}

/** Stable tenant record id derived from a slug (e.g. "acme-co" -> "tenant_acme_co"). */
export function tenantRecordId(slug) {
  return `tenant_${slugify(slug).replace(/-/g, "_")}`;
}

/** Opaque, high-entropy token with a readable prefix. */
export function issueOpaqueToken(prefix = "tok") {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}
