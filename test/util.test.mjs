// Unit tests for the pure helpers extracted to apps/api/lib/util.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import {
  httpError,
  mapToEntries,
  entriesToMap,
  stableJson,
  sha256,
  slugify,
  nowIso,
  daysFromNow,
  tenantRecordId,
  issueOpaqueToken,
  normalizeOsFamily
} from "../apps/api/lib/util.mjs";

test("httpError carries statusCode and code", () => {
  const err = httpError(404, "not_found");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "not_found");
  assert.equal(err.statusCode, 404);
  assert.equal(err.code, "not_found");
  assert.equal(httpError(400, "bad", "custom_code").code, "custom_code");
});

test("mapToEntries / entriesToMap round-trip a Map", () => {
  const map = new Map([
    ["a", 1],
    ["b", { nested: true }]
  ]);
  const entries = mapToEntries(map);
  assert.deepEqual(entries, [
    { key: "a", value: 1 },
    { key: "b", value: { nested: true } }
  ]);
  const back = entriesToMap(entries);
  assert.equal(back.get("a"), 1);
  assert.deepEqual(back.get("b"), { nested: true });
  assert.equal(entriesToMap().size, 0);
  assert.equal(entriesToMap([null, { noKey: true }]).size, 0);
});

test("stableJson is deterministic under key order and recurses", () => {
  assert.equal(stableJson({ b: 1, a: 2 }), stableJson({ a: 2, b: 1 }));
  assert.equal(stableJson({ a: 2, b: 1 }), '{"a":2,"b":1}');
  assert.equal(stableJson([3, { y: 1, x: 2 }]), '[3,{"x":2,"y":1}]');
  assert.equal(stableJson(null), "null");
  assert.equal(stableJson("s"), '"s"');
  // Arrays keep order; only object keys are sorted.
  assert.equal(stableJson([2, 1]), "[2,1]");
});

test("sha256 is stable hex of the string form", () => {
  const h = sha256("pollek");
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(sha256("pollek"), h);
  assert.notEqual(sha256("pollek"), sha256("pollek2"));
});

test("slugify normalizes and falls back for empty input", () => {
  assert.equal(slugify("Acme Co., Ltd."), "acme-co-ltd");
  assert.equal(slugify("  Trailing--dashes  "), "trailing-dashes");
  assert.match(slugify(""), /^tenant-[a-f0-9]{6}$/);
  assert.match(slugify("!!!", "org"), /^org-[a-f0-9]{6}$/);
  assert.equal(slugify("x".repeat(80)).length, 48);
});

test("nowIso and daysFromNow return ISO timestamps with correct offset", () => {
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  const delta = new Date(daysFromNow(2)).getTime() - Date.now();
  assert.ok(Math.abs(delta - 2 * 86400000) < 5000, "about two days out");
  assert.ok(new Date(daysFromNow(0)).getTime() <= Date.now() + 1000);
});

test("tenantRecordId derives a stable underscored id from a slug", () => {
  assert.equal(tenantRecordId("acme-co"), "tenant_acme_co");
  assert.equal(tenantRecordId("Acme Co"), "tenant_acme_co");
});

test("issueOpaqueToken is high-entropy and prefixed", () => {
  const a = issueOpaqueToken("pollek_session");
  assert.match(a, /^pollek_session_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, issueOpaqueToken("pollek_session"));
});

test("normalizeOsFamily maps common OS strings and falls back to unknown", () => {
  assert.equal(normalizeOsFamily("Windows 11"), "windows");
  assert.equal(normalizeOsFamily("win32"), "windows");
  assert.equal(normalizeOsFamily("darwin"), "macos");
  assert.equal(normalizeOsFamily("macOS 14"), "macos");
  assert.equal(normalizeOsFamily("Ubuntu 22.04"), "linux");
  assert.equal(normalizeOsFamily("linux"), "linux");
  assert.equal(normalizeOsFamily("solaris"), "unknown");
  assert.equal(normalizeOsFamily(), "unknown");
});
