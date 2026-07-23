# Railway Security Gate Addendum - Signer Update

Read this immediately after
`docs/HANDOFF_CODEX_RAILWAY_SECURITY_GATES_2026-07-24.md`.

While that audit was being prepared, `origin/main` advanced from `a830acc` to
`94ec624` with the Cloud signer work from pull request 18. The security-gate
document was rebased onto and re-verified against that newer base.

## Updated verification

`npm run audit:foundation` now reports:

```text
Contract Hub artifacts in sync
51 tests total
47 passed
0 failed
4 PostgreSQL integration tests skipped without a local test database
```

## Signer work that is now delivered

The new `apps/api/signer.mjs` and its server wiring provide:

- approval-record enforcement on the production bundle-signing path;
- stable Ed25519 key identifiers;
- verification against current and overlap public keys;
- allowlist publication for active or revoked overlap keys;
- a fail-loud startup gate if an unwired backend such as `cosmian` is selected;
- unit and HTTP tests for overlap, revocation, tampering, malformed keys,
  approval records, and unsupported backends.

This is real application-path and integration-test progress. It should not be
reimplemented.

## Remaining KMS rotation gate

Production still uses the local in-process signer. The following work remains:

1. Implement and live-validate Cosmian JSON-TTLV detached sign/verify.
2. Map each signing role to a stable KMS keyset alias and record the immutable
   generation-specific key ID in every signature.
3. Drive the existing overlap allowlist from KMS generation metadata instead
   of manually supplied retired public keys.
4. Canary manual re-key, new signatures, old-signature verification,
   rollback, backup restore, and retirement before automatic rotation.
5. Keep two-person approval for kill-switch rotation and recovery.

Therefore the more precise status is:

```text
signer abstraction and overlap verification=implemented and tested
Cosmian transport=not implemented
production KMS signing=not enforced
KMS versioned rotation=not configured
```

The LCP `client_credentials` tenant-binding failure, JWT rollout gate, proposed
SPIRE ADR, mTLS `off` state, KMS native-TLS plan, and secret-handling record in
the primary security-gate document are unchanged.
