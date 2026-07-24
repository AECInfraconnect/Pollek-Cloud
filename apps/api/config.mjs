// Environment- and contract-derived configuration for the Pollek Cloud API.
//
// Everything here is resolved once at process start from env vars and the contract document.
// Keeping it in one module makes the configuration surface reviewable in a single place and
// lets server.mjs (and, as modularization proceeds, the feature modules) import named values
// instead of re-reading process.env. Runtime state and generated crypto keys stay in the
// modules that own them — this file is pure configuration. See docs/MODULARIZATION_PLAN.md.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, "../..");
export const webDir = path.join(rootDir, "apps/web/static");
export const contractPath = path.join(rootDir, "packages/contracts/pollek-contract.json");
export const openApiPath = path.join(rootDir, "packages/contracts/openapi.json");

// Single source of truth for contract-derived constants (version, etc.). The contract JSON
// is the authority; nothing else hardcodes the version.
export const contractDocument = JSON.parse(readFileSync(contractPath, "utf8"));
export const cloudVersion = contractDocument.cloud_version;
export const contractVersion = contractDocument.contract_version;

export const contractArtifactPaths = new Map([
  ["/contracts/events.schema.json", path.join(rootDir, "packages/contracts/events.schema.json")],
  [
    "/contracts/bundle-manifest.schema.json",
    path.join(rootDir, "packages/contracts/bundle-manifest.schema.json")
  ],
  [
    "/contracts/telemetry-envelope.schema.json",
    path.join(rootDir, "packages/contracts/telemetry-envelope.schema.json")
  ],
  [
    "/contracts/lcp-usage-ledger.schema.json",
    path.join(rootDir, "packages/contracts/lcp-usage-ledger.schema.json")
  ],
  [
    "/contracts/bundle-provenance.schema.json",
    path.join(rootDir, "packages/contracts/bundle-provenance.schema.json")
  ],
  [
    "/contracts/trust-policy.schema.json",
    path.join(rootDir, "packages/contracts/trust-policy.schema.json")
  ],
  [
    "/contracts/revocation-list.schema.json",
    path.join(rootDir, "packages/contracts/revocation-list.schema.json")
  ],
  [
    "/contracts/signer-allowlist.schema.json",
    path.join(rootDir, "packages/contracts/signer-allowlist.schema.json")
  ],
  [
    "/contracts/fixtures/lcp-usage-ledger/windows.json",
    path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/windows.json")
  ],
  [
    "/contracts/fixtures/lcp-usage-ledger/macos.json",
    path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/macos.json")
  ],
  [
    "/contracts/fixtures/lcp-usage-ledger/linux.json",
    path.join(rootDir, "packages/contracts/fixtures/lcp-usage-ledger/linux.json")
  ]
]);

export const stateFilePath =
  process.env.POLLEK_CLOUD_STATE_FILE || path.join(rootDir, "pollek-cloud-dev-state.json");

export const port = Number(process.env.PORT || process.env.POLLEK_CLOUD_DEV_PORT || 8790);
export const host =
  process.env.POLLEK_CLOUD_DEV_HOST ||
  process.env.HOST ||
  (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
export const publicUrl =
  process.env.POLLEK_CLOUD_PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
  `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
export const defaultLcpUrl = process.env.POLLEK_LCP_URL || "http://127.0.0.1:43891";

export const maxJsonBodyBytes = Number(process.env.POLLEK_CLOUD_MAX_JSON_BODY_BYTES || 1024 * 1024);
export const maxAuditPayloadBytes = Number(
  process.env.POLLEK_CLOUD_MAX_AUDIT_PAYLOAD_BYTES || 32 * 1024
);
export const defaultApiPageLimit = Number(process.env.POLLEK_CLOUD_DEFAULT_API_PAGE_LIMIT || 1000);
export const maxApiPageLimit = Number(process.env.POLLEK_CLOUD_MAX_API_PAGE_LIMIT || 5000);
export const requestBudgetWindowMs = Number(process.env.POLLEK_CLOUD_RATE_WINDOW_MS || 60000);
export const requestBudgetMax = Number(process.env.POLLEK_CLOUD_RATE_MAX || 900);
export const compactJsonResponses = process.env.POLLEK_CLOUD_PRETTY_JSON !== "1";
export const exposeInternalErrors =
  process.env.NODE_ENV !== "production" || process.env.POLLEK_CLOUD_EXPOSE_ERRORS === "1";
export const lcpReconcileIntervalMs = Math.max(
  30000,
  Number(
    process.env.POLLEK_LCP_RECONCILE_INTERVAL_MS ||
      process.env.POLLEK_LCP_WATCH_INTERVAL_MS ||
      300000
  )
);
export const maxTelemetryEnvelopes = Math.max(
  100,
  Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_EVENTS || 5000)
);
export const maxTelemetryBatchReceipts = Math.max(
  20,
  Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_BATCHES || 200)
);
export const maxTelemetryRejections = Math.max(
  20,
  Number(process.env.POLLEK_CLOUD_MAX_TELEMETRY_REJECTIONS || 200)
);
export const eventStreamReplayWindow = Math.max(
  200,
  Number(process.env.POLLEK_EVENT_STREAM_REPLAY_WINDOW || 500)
);

// --- Cloud-Phase-1 trust-spine identity/transport configuration ---
// One SPIFFE trust domain per Cloud deployment (DEK alignment §1). Tenant lives in the SVID
// path, not the trust domain. `trustDomain` is the deployment identifier (default
// spiffe://pollek.io) and is NOT a URL.
export const trustDomain = process.env.POLLEK_TRUST_DOMAIN || "spiffe://pollek.io";

export const spireServerAddress = process.env.SPIRE_SERVER_ADDRESS || null;
export const spireServerPort = Number(process.env.SPIRE_SERVER_PORT || 8081);

// mTLS enforcement stance for DEK-facing endpoints: off (dev, bearer only) -> monitor
// (observe + record mismatches, still allow) -> enforce (fail-closed at the identity layer).
export const mtlsMode = ["off", "monitor", "enforce"].includes(process.env.POLLEK_MTLS_MODE || "")
  ? process.env.POLLEK_MTLS_MODE
  : "off";
// Header carrying the SPIFFE ID verified by a trusted mTLS-terminating ingress. The ingress
// MUST overwrite/strip this from untrusted client input (documented in the Phase-B hand-off).
export const mtlsIdentityHeader = (
  process.env.POLLEK_MTLS_IDENTITY_HEADER || "x-pollek-spiffe-id"
).toLowerCase();
// Boundary-class identity enforcement for console/admin (human) boundaries. Machine
// (DEK-facing) boundaries are governed by the Keycloak JWT gate; public boundaries are open.
// Default off keeps current behavior; enabling requires the console to send its session token
// on every call (see docs/CLOUD_APP_PROGRESS).
export const sessionMode = ["off", "monitor", "enforce"].includes(
  process.env.POLLEK_SESSION_MODE || ""
)
  ? process.env.POLLEK_SESSION_MODE
  : "off";
