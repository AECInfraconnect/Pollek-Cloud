import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

@service({
  title: "Pollek Cloud Contract Hub",
})
@server("https://{cloudHost}", "Pollek Cloud", {
  cloudHost: string,
})
namespace Pollek.Cloud;

model TenantContext {
  tenant_id: string;
}

model ContractDiscovery {
  schema_version: "pollek-cloud-contract-discovery.v1";
  contract_version: string;
  cloud_version: string;
  supported_transports: string[];
  interfaces: Record<unknown>;
  features: Record<unknown>;
}

model EventReplayResponse {
  schema_version: "pollek.cloud.event-stream-replay.v1";
  channel: string;
  last_event_id?: string;
  latest_event_id?: string;
  replay_window_events: int32;
  count: int32;
  events: unknown[];
}

model AuthorizationCheckRequest extends TenantContext {
  principal: string;
  action: string;
  object: string;
  context?: Record<unknown>;
}

model AuthorizationDecision {
  schema_version: "pollek.cloud.authorization-decision.v1";
  tenant_id: string;
  principal: string;
  action: string;
  object: string;
  decision: "allow" | "deny";
  reason: string;
  engines: Record<unknown>;
}

model PolicyBundleSignatureRequest extends TenantContext {
  approved_by?: string;
  approval_id?: string;
  reason?: string;
  risk?: "low" | "medium" | "high";
  breakglass?: "inactive" | "active";
}

@route("/.well-known/pollek-contract")
@get op getContract(): ContractDiscovery;

@route("/contracts/openapi.json")
@get op getOpenApi(): unknown;

@route("/api/events/replay")
@get op replayEvents(@query since?: string, @query channel?: string, @query limit?: int32): EventReplayResponse;

@route("/api/authz/check")
@post op checkAuthorization(@body request: AuthorizationCheckRequest): { decision: AuthorizationDecision };

@route("/api/policy-bundles/{bundle_id}/sign")
@post op signPolicyBundle(@path bundle_id: string, @body request: PolicyBundleSignatureRequest): unknown;

@route("/v1/tenants/{tenant_id}/bundles/latest")
@get op getLatestBundle(@path tenant_id: string): unknown;

@route("/v1/policy-bundles/{bundle_id}/manifest")
@get op getBundleManifest(@path bundle_id: string): unknown;

@route("/v1/policy-bundles/{bundle_id}/artifact")
@get op getBundleArtifact(@path bundle_id: string): unknown;
