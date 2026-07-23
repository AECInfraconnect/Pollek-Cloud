// Signing abstraction for Pollek Cloud.
//
// Today the concrete signer is the in-process ed25519 key (`local` backend). This module adds
// the pieces the KMS/rotation runbook needs and that are testable without a live KMS:
//   * a stable keyid derived from the raw ed25519 public key (matches the DEK verifier);
//   * key-version OVERLAP: verification and the signer allowlist accept previous, not-yet-
//     retired public keys during a rotation window (env POLLEK_TRUST_RETIRED_PUBKEYS);
//   * approval-record enforcement for any production signing path;
//   * an honest backend gate: selecting a backend we have not actually wired (e.g. `cosmian`)
//     fails loudly instead of silently signing with the local key and pretending it is KMS.
//
// The Cosmian KMS transport (KMIP JSON-TTLV detached sign/verify) is intentionally NOT
// implemented here yet: its wire contract must be validated against the live Cosmian service
// before we can claim production bundles are KMS-signed. See
// docs/HANDOFF_TO_DEK_AND_CODEX_2026-07-24.md.

import crypto from "node:crypto";

export function signerBackend() {
  return process.env.POLLEK_SIGNER_BACKEND || "local";
}

// Fail loudly if someone selects a backend we have not wired, rather than silently falling
// back to the local key and misrepresenting where signatures come from.
export function assertBackendSupported() {
  const backend = signerBackend();
  if (backend !== "local") {
    throw new Error(
      `POLLEK_SIGNER_BACKEND="${backend}" is not wired yet. Only "local" is operational. `
      + "The Cosmian KMS backend awaits live TTLV sign/verify contract validation; refusing to "
      + "start rather than sign with the in-process key and mislabel it as KMS-backed."
    );
  }
  return backend;
}

// Stable keyid for a raw 32-byte ed25519 public key (base64url), matching the Cloud's
// bundleSigningKeyId formula and the DEK relying-party expectation.
export function keyIdForRawB64(rawB64) {
  const fingerprint = crypto.createHash("sha256").update(Buffer.from(rawB64, "base64url")).digest("hex").slice(0, 16);
  return `pollek-cloud-ed25519-${fingerprint}`;
}

function publicKeyFromRawB64(rawB64) {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: rawB64 }, format: "jwk" });
}

// Previous signing keys still inside their overlap window. Comma/space separated raw ed25519
// public keys (base64url). During overlap the allowlist keeps publishing them and verification
// still accepts signatures made with them, so a bundle signed just before rotation stays valid.
export function retiredVerificationKeys(env = process.env.POLLEK_TRUST_RETIRED_PUBKEYS || "") {
  const out = [];
  for (const raw of String(env).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
    try {
      out.push({ keyid: keyIdForRawB64(raw), raw_base64url: raw, key: publicKeyFromRawB64(raw) });
    } catch {
      // skip malformed entries rather than crash the trust spine
    }
  }
  return out;
}

// Verify a base64url ed25519 signature over `payload` (Buffer/string) against any key in the
// set. Returns the keyid that verified, or null.
export function verifyAgainstKeys(payload, sigB64Url, keyEntries) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const sig = Buffer.from(sigB64Url || "", "base64url");
  if (!sig.length) return null;
  for (const entry of keyEntries) {
    try {
      if (crypto.verify(null, data, entry.key, sig)) return entry.keyid || null;
    } catch {
      // try next key
    }
  }
  return null;
}

// A production signing path must carry an approved approval record (AGENTS.md rule 6).
export function enforceApprovalRecord(record) {
  if (!record || typeof record !== "object") throw new Error("approval_record_required");
  if (record.status !== "approved") throw new Error("approved_record_required");
  if (!record.approved_by) throw new Error("approval_record_missing_approver");
  return record;
}
