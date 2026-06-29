import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_RUNTIME_PATHS,
  buildOpenApi,
  collectContractPaths,
  loadContract
} from "./generate-openapi.mjs";
import { sdkSource } from "./generate-sdk.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const openApiPath = path.join(rootDir, "packages/contracts/openapi.json");
const sdkPath = path.join(rootDir, "packages/sdk/pollek-cloud-client.mjs");

function diffContractPaths(contract, openApi) {
  const contractPaths = new Set(collectContractPaths(contract));
  const openApiPaths = new Set(Object.keys(openApi.paths || {}));
  const missing = [...contractPaths].filter((apiPath) => !openApiPaths.has(apiPath)).sort();
  const extra = [...openApiPaths]
    .filter((apiPath) => !contractPaths.has(apiPath) && !ALLOWED_RUNTIME_PATHS.has(apiPath))
    .sort();
  return { missing, extra };
}

const contract = await loadContract();
const openApi = JSON.parse(await readFile(openApiPath, "utf8"));
const sdkText = await readFile(sdkPath, "utf8");
const expected = buildOpenApi(contract);
const { missing, extra } = diffContractPaths(contract, openApi);
const currentText = `${JSON.stringify(openApi, null, 2)}\n`;
const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
const expectedSdkText = sdkSource(contract);

if (missing.length || extra.length || currentText !== expectedText || sdkText !== expectedSdkText) {
  console.error("Contract drift detected.");
  if (missing.length) console.error(`Missing OpenAPI paths: ${missing.join(", ")}`);
  if (extra.length) console.error(`OpenAPI paths not declared by Contract Hub: ${extra.join(", ")}`);
  if (currentText !== expectedText) {
    console.error("OpenAPI artifact is not generated from packages/contracts/pollek-contract.json.");
    console.error("Run: npm run contracts:openapi");
  }
  if (sdkText !== expectedSdkText) {
    console.error("SDK artifact is not generated from packages/contracts/pollek-contract.json.");
    console.error("Run: npm run contracts:sdk");
  }
  process.exit(1);
}

console.log("Contract Hub OpenAPI and SDK artifacts are in sync.");
