# Pollek Cloud IAM and Billing Architecture

## Scope

Pollek Cloud owns the commercial console identity, organization administration, tenant billing, and private-cloud licensing plane. Local Pollek continues to own local observation, local enforcement, Local Dashboard behavior, and device-user telemetry. Cloud accounts are not the same entity as `device_users` observed from Local Pollek.

## Research Inputs

- Keycloak is a fit for embedded and on-prem deployments because it provides SSO, OIDC, OAuth 2.0, SAML, identity brokering, user federation, sessions, roles, groups, organizations, and admin/audit surfaces.
- OAuth 2.0 Security Best Current Practice favors authorization code flow with PKCE, exact redirect URI validation, sender-constrained tokens where possible, and strict issuer/audience validation.
- SCIM 2.0 provides the enterprise provisioning protocol shape for Users and Groups, including list responses and tenant-scoped create/update flows.
- Usage-based billing systems should separate subscription state from metered usage records, invoice line items, webhook idempotency, and payment-method references.

References:

- https://www.keycloak.org/docs/latest/server_admin/
- https://www.rfc-editor.org/rfc/rfc9700
- https://www.rfc-editor.org/rfc/rfc7644
- https://docs.stripe.com/billing/subscriptions/usage-based

## Design Decisions

- Keep `accounts` global and `tenant_members` tenant scoped. This supports one console identity joining multiple organizations without mixing it with Local Pollek `device_users`.
- Store session, invitation, and payment references as hashes or sealed references. The local MVP returns tokens once for testing but never persists plaintext secrets.
- Expose Keycloak-compatible OIDC login endpoints now, with BYO OIDC and SCIM configuration as tenant-scoped records. Production should redirect to Keycloak or an external IdP, validate issuer/audience, and bind tokens to the tenant.
- Keep billing provider neutral. The API stores plans, subscriptions, usage counters, usage records, invoices, payment-method references, offline licenses, and webhook events so Stripe, Paddle, Metronome, Lago, or manual enterprise billing can plug in later.
- Use `offline_license` for private-cloud or air-gapped deployments. Production signing must use the KMS abstraction; local dev uses an ephemeral Ed25519 key only for protocol tests.
- Every write endpoint receives tenant context from the route, body, or explicit SCIM tenant header and emits audit/task evidence for security-sensitive or long-running operations.
- The local console includes a tenant switcher and visible admin workflows for signup, login/session, role test user seeding, invitation accept, member role update/remove, IDP config, SCIM User/Group provisioning, subscription update, payment reference, invoice preview, billing webhook idempotency, and offline license issuance.
- Smoke tests run these workflows against the local API and assert tenant isolation, cross-tenant denial, hashed/sealed payment and IDP references, and absence of raw secrets in fleet snapshots.

## Production Hardening Backlog

- Replace local-dev session issuance with Keycloak Authorization Code + PKCE callback validation.
- Add JWKS caching, issuer pinning, audience validation, nonce validation, and refresh-token rotation.
- Add webhook signature verification per billing provider before accepting provider events.
- Move KMS signing to OpenBao/Cosmian/cloud KMS with key rotation and signing attestations.
- Add SCIM PATCH/DELETE, group membership mapping, and Just-in-Time provisioning policies.
- Add Thai/English i18n keys when the app framework moves from static assets to the production frontend stack.
