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

model TenantSignupRequest {
  organization_name: string;
  admin_email: string;
  admin_name?: string;
  deployment_mode?: "saas" | "private_cloud" | "air_gapped";
  plan_id?: string;
}

model InvitationRequest {
  email: string;
  roles?: string[];
}

model MemberRoleRequest {
  roles: string[];
  status?: string;
}

model IdentityProviderRequest {
  provider_type: string;
  display_name?: string;
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  scopes?: string[];
}

model BillingSubscriptionRequest {
  plan_id: string;
  status?: string;
}

model PaymentMethodRequest {
  provider?: string;
  type?: string;
  reference?: string;
  provider_token?: string;
  billing_email?: string;
}

model BillingWebhookRequest {
  id?: string;
  tenant_id: string;
  type: string;
  data?: Record<unknown>;
}

model OfflineLicenseRequest {
  deployment_mode?: "private_cloud" | "air_gapped";
  max_seats?: int32;
  max_lcps?: int32;
  max_devices?: int32;
  expires_at?: string;
}

@route("/.well-known/pollek-contract")
@get op getContract(): ContractDiscovery;

@route("/contracts/openapi.json")
@get op getOpenApi(): unknown;

@route("/contracts/events.schema.json")
@get op getEventSchema(): unknown;

@route("/contracts/bundle-manifest.schema.json")
@get op getBundleManifestSchema(): unknown;

@route("/contracts/telemetry-envelope.schema.json")
@get op getTelemetryEnvelopeSchema(): unknown;

@route("/api/events/replay")
@get op replayEvents(@query since?: string, @query channel?: string, @query limit?: int32): EventReplayResponse;

@route("/api/authz/check")
@post op checkAuthorization(@body request: AuthorizationCheckRequest): { decision: AuthorizationDecision };

@route("/v1/authz/check")
@post op checkAuthorizationV1(@body request: AuthorizationCheckRequest): { decision: AuthorizationDecision };

@route("/v1/signup/tenant")
@post op signupTenant(@body request: TenantSignupRequest): unknown;

@route("/v1/auth/session")
@get op getSession(@query tenant_id?: string): unknown;

@route("/v1/tenants/{tenant_id}/invitations")
@post op inviteMember(@path tenant_id: string, @body request: InvitationRequest): unknown;

@route("/v1/tenants/{tenant_id}/members")
@get op listMembers(@path tenant_id: string): unknown;

@route("/v1/tenants/{tenant_id}/members/{account_id}/roles")
@post op updateMemberRoles(@path tenant_id: string, @path account_id: string, @body request: MemberRoleRequest): unknown;

@route("/v1/tenants/{tenant_id}/members/{account_id}")
@delete op removeMember(@path tenant_id: string, @path account_id: string): unknown;

@route("/v1/tenants/{tenant_id}/identity-providers")
@put op configureIdentityProvider(@path tenant_id: string, @body request: IdentityProviderRequest): unknown;

@route("/scim/v2/Users")
@post op createScimUser(@header("x-pollek-tenant-id") tenant_id: string, @body request: Record<unknown>): unknown;

@route("/scim/v2/Groups")
@post op createScimGroup(@header("x-pollek-tenant-id") tenant_id: string, @body request: Record<unknown>): unknown;

@route("/v1/tenants/{tenant_id}/billing/subscription")
@post op updateSubscription(@path tenant_id: string, @body request: BillingSubscriptionRequest): unknown;

@route("/v1/tenants/{tenant_id}/billing/usage")
@get op getBillingUsage(@path tenant_id: string): unknown;

@route("/v1/tenants/{tenant_id}/billing/invoices")
@get op listInvoices(@path tenant_id: string): unknown;

@route("/v1/tenants/{tenant_id}/billing/payment-methods")
@post op addPaymentMethod(@path tenant_id: string, @body request: PaymentMethodRequest): unknown;

@route("/v1/tenants/{tenant_id}/billing/license/issue")
@post op issueOfflineLicense(@path tenant_id: string, @body request: OfflineLicenseRequest): unknown;

@route("/v1/billing/webhooks/{provider}")
@post op sendBillingWebhook(@path provider: string, @body request: BillingWebhookRequest): unknown;

@route("/v1/kms/health")
@get op getKmsHealth(): unknown;

@route("/api/policy-bundles/{bundle_id}/sign")
@post op signPolicyBundle(@path bundle_id: string, @body request: PolicyBundleSignatureRequest): unknown;

@route("/v1/tenants/{tenant_id}/bundles/latest")
@get op getLatestBundle(@path tenant_id: string): unknown;

@route("/v1/policy-bundles/{bundle_id}/manifest")
@get op getBundleManifest(@path bundle_id: string): unknown;

@route("/v1/policy-bundles/{bundle_id}/artifact")
@get op getBundleArtifact(@path bundle_id: string): unknown;
