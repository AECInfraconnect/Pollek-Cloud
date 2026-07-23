// Keycloak / OIDC bearer-token verification for Pollek Cloud.
//
// Active only when POLLEK_KEYCLOAK_JWT_MODE is "monitor" or "enforce" AND a JWKS URL is
// resolvable. Default "off" keeps the current behavior (the app does not verify Keycloak
// bearers yet), so enabling verification is a deliberate Railway change, mirroring the mTLS
// off -> monitor -> enforce rollout. Verifies RS256 signatures against the realm JWKS and
// checks issuer / audience / expiry, then exposes the tenant claim for tenant-context
// enforcement. Never logs token contents.

import crypto from "node:crypto";

const JWKS_TTL_MS = Math.max(30_000, Number(process.env.POLLEK_KEYCLOAK_JWKS_TTL_MS || 300_000));
let jwksCache = { url: null, fetchedAt: 0, keys: new Map() };

export function config() {
  const issuer = process.env.KEYCLOAK_ISSUER_URL || process.env.OIDC_ISSUER || null;
  const jwksUrl = process.env.KEYCLOAK_JWKS_URL
    || (issuer ? `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/certs` : null);
  const mode = ["off", "monitor", "enforce"].includes(process.env.POLLEK_KEYCLOAK_JWT_MODE || "")
    ? process.env.POLLEK_KEYCLOAK_JWT_MODE
    : "off";
  return {
    mode,
    issuer,
    jwksUrl,
    audience: process.env.KEYCLOAK_EXPECTED_AUDIENCE || null,
    tenantClaim: process.env.KEYCLOAK_TENANT_CLAIM || "tenant_id"
  };
}

export function isEnabled(cfg = config()) {
  return cfg.mode !== "off" && Boolean(cfg.jwksUrl);
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

async function loadJwks(url, force = false) {
  const now = Date.now();
  if (!force && jwksCache.url === url && jwksCache.keys.size && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`jwks_http_${response.status}`);
  const doc = await response.json();
  const keys = new Map();
  for (const jwk of doc.keys || []) {
    if (jwk.kty !== "RSA" || (jwk.use && jwk.use !== "sig")) continue;
    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
    } catch {
      // skip malformed keys
    }
  }
  jwksCache = { url, fetchedAt: now, keys };
  return keys;
}

// Verify a bearer token. Returns { valid, reason?, claims?, tenant_id?, subject? }.
// Tokens that are not JWT-shaped return { valid:false, reason:"not_a_jwt" } so the caller can
// leave opaque/dev tokens to their existing handling.
export async function verifyToken(token, cfg = config()) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return { valid: false, reason: "not_a_jwt" };
  }
  if (!cfg.jwksUrl) return { valid: false, reason: "jwks_not_configured" };
  const [headerSeg, payloadSeg, signatureSeg] = token.split(".");
  let header;
  let payload;
  try {
    header = decodeSegment(headerSeg);
    payload = decodeSegment(payloadSeg);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (header.alg !== "RS256") return { valid: false, reason: "unsupported_alg" };

  let keys;
  try {
    keys = await loadJwks(cfg.jwksUrl);
  } catch (error) {
    return { valid: false, reason: `jwks_unavailable:${error instanceof Error ? error.message : "error"}` };
  }
  let key = keys.get(header.kid);
  if (!key) {
    // Unknown kid: refresh once (handles key rotation / overlap).
    try {
      keys = await loadJwks(cfg.jwksUrl, true);
      key = keys.get(header.kid);
    } catch {
      // fall through to unknown_kid
    }
  }
  if (!key) return { valid: false, reason: "unknown_kid" };

  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerSeg}.${payloadSeg}`),
    key,
    Buffer.from(signatureSeg, "base64url")
  );
  if (!verified) return { valid: false, reason: "bad_signature" };

  const now = Math.floor(Date.now() / 1000);
  // Fail closed on a missing or non-numeric expiry: a token without a valid numeric `exp`
  // has no enforceable lifetime and must never be accepted before production enforcement.
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return { valid: false, reason: "missing_exp" };
  if (payload.exp < now) return { valid: false, reason: "expired" };
  if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now + 60)) return { valid: false, reason: "not_yet_valid" };
  if (cfg.issuer && payload.iss !== cfg.issuer) return { valid: false, reason: "issuer_mismatch" };
  if (cfg.audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(cfg.audience)) return { valid: false, reason: "audience_mismatch" };
  }
  const tenantId = typeof payload[cfg.tenantClaim] === "string" ? payload[cfg.tenantClaim] : null;
  return { valid: true, claims: payload, tenant_id: tenantId, subject: payload.sub || null };
}

// Non-secret status for operators (no token material).
export function status(cfg = config()) {
  return {
    schema_version: "pollek.cloud.iam-jwt-status.v1",
    mode: cfg.mode,
    jwks_configured: Boolean(cfg.jwksUrl),
    issuer: cfg.issuer,
    audience: cfg.audience,
    tenant_claim: cfg.tenantClaim
  };
}

export const _internals = { loadJwks, decodeSegment, resetCache: () => { jwksCache = { url: null, fetchedAt: 0, keys: new Map() }; } };
