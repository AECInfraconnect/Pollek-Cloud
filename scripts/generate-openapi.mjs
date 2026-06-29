import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const contractPath = path.join(rootDir, "packages/contracts/pollek-contract.json");
const openApiPath = path.join(rootDir, "packages/contracts/openapi.json");

const RUNTIME_PATHS = ["/health", "/api/cloud/status", "/api/contract-hub/drift", "/api/persistence/status", "/api/persistence/flush", "/api/entities/watch"];

const PATH_METHODS = {
  "/health": ["get"],
  "/api/cloud/status": ["get"],
  "/api/contract-hub/drift": ["get"],
  "/api/persistence/status": ["get"],
  "/api/persistence/flush": ["post"],
  "/api/entities/watch": ["get", "post"],
  "/api/lcp/change-batches": ["post"],
  "/.well-known/pollek-contract": ["get"],
  "/contracts/openapi.json": ["get"],
  "/api/events": ["get"],
  "/api/hot-reload/stream": ["get"],
  "/oauth/device_authorization": ["post"],
  "/oauth/token": ["post"],
  "/enroll": ["post"],
  "/v1/telemetry/batches": ["post"],
  "/v1/telemetry/envelopes": ["post"],
  "/api/entities": ["get"],
  "/api/entities/health": ["get"],
  "/api/entities/dedupe": ["get"],
  "/api/entities/ingest": ["post"],
  "/api/entities/sync": ["post"],
  "/v1/tenants/{tenant_id}/lcp/change-batches": ["post"],
  "/api/lcp/config/dispatch": ["post"],
  "/api/lcp/hot-reload/dispatch": ["post"],
  "/api/contract-hub/connection-updates": ["get"],
  "/v1/tenants/{tenant_id}/registry/sync": ["post"],
  "/v1/tenants/{tenant_id}/bundles/latest": ["get"],
  "/v1/policy-bundles/{bundle_id}/manifest": ["get"],
  "/api/policy-bundles/{bundle_id}/sign": ["post"],
  "/api/policy-bundles/{bundle_id}/verify": ["get"],
  "/api/policy/assist": ["post"],
  "/api/policy/drafts": ["get"],
  "/api/policy/drafts/{draft_id}/simulate": ["post"],
  "/api/policy/drafts/{draft_id}/approve": ["post"],
  "/api/policy/sandbox": ["get", "post"],
  "/api/compliance/policy-bundles": ["get"],
  "/api/compliance/policy-bundles/simulate": ["post"],
  "/api/compliance/policy-bundles/deploy": ["post"],
  "/api/compliance/score": ["get"],
  "/api/breakglass": ["get", "post"],
  "/api/breakglass/{request_id}/approve": ["post"],
  "/api/breakglass/{request_id}/reject": ["post"],
  "/api/breakglass/{request_id}/close": ["post"],
  "/api/adapters/catalog": ["get"],
  "/api/integrations/summary": ["get"],
  "/api/integrations/{integration_id}/test": ["post"],
  "/api/evidence/exports": ["post"],
  "/api/trust/scopes": ["get"],
  "/api/services/endpoints": ["get"],
  "/api/hot-reload/events": ["get"]
};

export const ALLOWED_RUNTIME_PATHS = new Set(RUNTIME_PATHS);

export async function loadContract() {
  return JSON.parse(await readFile(contractPath, "utf8"));
}

export function collectContractPaths(contract) {
  const paths = new Set();
  for (const spec of Object.values(contract.interfaces || {})) {
    for (const apiPath of spec.paths || []) {
      paths.add(apiPath);
    }
  }
  return [...paths].sort();
}

function pathParameters(apiPath) {
  return [...apiPath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" }
  }));
}

function operationId(method, apiPath) {
  const tokens = apiPath
    .replace(/[{}]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return [method, ...tokens.map((token) => token[0].toUpperCase() + token.slice(1))].join("");
}

function interfacesForPath(contract, apiPath) {
  return Object.entries(contract.interfaces || {})
    .filter(([, spec]) => (spec.paths || []).includes(apiPath))
    .map(([id, spec]) => ({ id, spec }));
}

function operationFor(contract, method, apiPath) {
  const related = interfacesForPath(contract, apiPath);
  const interfaceIds = related.map((item) => item.id);
  const requiresOAuth = related.some((item) => item.spec.requires_oauth);
  const requiresSpiffe = related.some((item) => item.spec.requires_spiffe);
  const direction = [...new Set(related.map((item) => item.spec.direction).filter(Boolean))];
  const parameters = pathParameters(apiPath);
  const isEventStream = apiPath === "/api/events" || apiPath === "/api/hot-reload/stream";

  return {
    tags: interfaceIds.length ? interfaceIds : ["pollek.cloud.runtime"],
    summary: `Pollek Cloud ${method.toUpperCase()} ${apiPath}`,
    operationId: operationId(method, apiPath),
    parameters: parameters.length ? parameters : undefined,
    security: requiresOAuth || requiresSpiffe
      ? [
          {
            ...(requiresOAuth ? { bearerAuth: [] } : {}),
            ...(requiresSpiffe ? { spiffeMtls: [] } : {})
          }
        ]
      : undefined,
    requestBody: method === "get"
      ? undefined
      : {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true }
            }
          }
        },
    responses: isEventStream
      ? {
          "200": {
            description: "Server-Sent Events stream for Contract Hub and hot-reload updates",
            content: {
              "text/event-stream": {
                schema: { type: "string" }
              }
            }
          }
        }
      : {
          "200": {
            description: "Successful local development response",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true }
              }
            }
          },
          "202": { description: "Accepted for asynchronous processing" },
          "400": { description: "Invalid request" },
          "401": { description: "Authentication required" },
          "403": { description: "Tenant entitlement or authorization denied" },
          "404": { description: "Resource not found" }
        },
    "x-pollek-interfaces": interfaceIds,
    "x-pollek-direction": direction,
    "x-pollek-enterprise-only": related.some((item) => item.spec.enterprise_only),
    "x-pollek-tenant-scoped": related.some((item) => item.spec.tenant_scoped)
  };
}

export function buildOpenApi(contract) {
  const declaredPaths = collectContractPaths(contract);
  const paths = {};
  for (const apiPath of [...new Set([...RUNTIME_PATHS, ...declaredPaths])].sort()) {
    const methods = PATH_METHODS[apiPath] || ["get"];
    paths[apiPath] = {};
    for (const method of methods) {
      paths[apiPath][method] = operationFor(contract, method, apiPath);
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Pollek Cloud Contract Hub API",
      version: contract.contract_version,
      description: "Local development OpenAPI artifact generated from the Contract Hub discovery contract."
    },
    servers: [{ url: "http://127.0.0.1:8790", description: "Local Pollek Cloud development server" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "OAuth2 access token" },
        spiffeMtls: {
          type: "mutualTLS",
          description: "Future SPIFFE/SPIRE-backed mTLS identity channel."
        }
      }
    },
    "x-pollek-contract-version": contract.contract_version,
    "x-pollek-schema-version": contract.schema_version,
    "x-pollek-generated-from": "packages/contracts/pollek-contract.json"
  };
}

export async function writeOpenApi() {
  const contract = await loadContract();
  const openApi = buildOpenApi(contract);
  await writeFile(openApiPath, `${JSON.stringify(openApi, null, 2)}\n`);
  return openApi;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeOpenApi();
  console.log(`Generated ${path.relative(rootDir, openApiPath)}`);
}
