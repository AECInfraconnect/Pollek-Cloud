// Unit tests for the signing abstraction (apps/api/signer.mjs) using real ed25519 crypto.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as signer from "../apps/api/signer.mjs";

function rawEd25519PubB64() {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  return { publicKey, rawB64: publicKey.export({ format: "jwk" }).x };
}

test("keyIdForRawB64 is stable and matches the pollek-cloud-ed25519 fingerprint form", () => {
  const { rawB64 } = rawEd25519PubB64();
  const id = signer.keyIdForRawB64(rawB64);
  assert.match(id, /^pollek-cloud-ed25519-[a-f0-9]{16}$/);
  assert.equal(signer.keyIdForRawB64(rawB64), id, "deterministic");
});

test("rotation overlap: a signature made by a retired key verifies while it is in the set, and stops when removed", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const rawB64 = publicKey.export({ format: "jwk" }).x;
  const payload = Buffer.from("bundle-manifest-bytes");
  const sig = crypto.sign(null, payload, privateKey).toString("base64url");

  const withKey = signer.retiredVerificationKeys(rawB64);
  assert.equal(withKey.length, 1);
  const verifiedBy = signer.verifyAgainstKeys(payload, sig, withKey);
  assert.equal(verifiedBy, signer.keyIdForRawB64(rawB64), "retired key in the overlap set verifies");

  // Dropped from the overlap set -> no longer trusted.
  const withoutKey = signer.retiredVerificationKeys("");
  assert.equal(signer.verifyAgainstKeys(payload, sig, withoutKey), null);
});

test("verifyAgainstKeys rejects a tampered payload and an empty signature", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const rawB64 = publicKey.export({ format: "jwk" }).x;
  const keys = signer.retiredVerificationKeys(rawB64);
  const sig = crypto.sign(null, Buffer.from("original"), privateKey).toString("base64url");
  assert.equal(signer.verifyAgainstKeys(Buffer.from("tampered"), sig, keys), null);
  assert.equal(signer.verifyAgainstKeys(Buffer.from("original"), "", keys), null);
});

test("retiredVerificationKeys parses comma/space lists and skips malformed entries", () => {
  const a = rawEd25519PubB64().rawB64;
  const b = rawEd25519PubB64().rawB64;
  const parsed = signer.retiredVerificationKeys(`${a}, ${b} , not-a-key`);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((k) => k.raw_base64url).sort(), [a, b].sort());
});

test("enforceApprovalRecord requires an approved record with an approver", () => {
  assert.throws(() => signer.enforceApprovalRecord(null), /approval_record_required/);
  assert.throws(() => signer.enforceApprovalRecord({ status: "pending", approved_by: "x" }), /approved_record_required/);
  assert.throws(() => signer.enforceApprovalRecord({ status: "approved" }), /approval_record_missing_approver/);
  assert.equal(signer.enforceApprovalRecord({ status: "approved", approved_by: "sec-admin" }).status, "approved");
});

test("assertBackendSupported fails loud for an unwired backend and passes for local", () => {
  const prev = process.env.POLLEK_SIGNER_BACKEND;
  try {
    process.env.POLLEK_SIGNER_BACKEND = "cosmian";
    assert.throws(() => signer.assertBackendSupported(), /not wired yet/);
    process.env.POLLEK_SIGNER_BACKEND = "local";
    assert.equal(signer.assertBackendSupported(), "local");
    delete process.env.POLLEK_SIGNER_BACKEND;
    assert.equal(signer.assertBackendSupported(), "local");
  } finally {
    if (prev === undefined) delete process.env.POLLEK_SIGNER_BACKEND;
    else process.env.POLLEK_SIGNER_BACKEND = prev;
  }
});
