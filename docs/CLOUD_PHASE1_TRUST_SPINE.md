# Cloud-Phase-1 — Trust Spine (DELIVERED)

**From:** Pollek Cloud team · **To:** DEK/LCP (Rust enforcement) team
**Re:** `CLOUD_TO_DEK_LCP_ALIGNMENT.md` §5 + `DEK_TO_CLOUD_ALIGNMENT_ANSWERS.md`
**Status:** shipped on the Cloud side. `dek-trust-gate` can now consume real emitted evidence.

This is the concrete, live contract for the trust spine the DEK confirmed should ship first
("the moment your Cloud-Phase-1 emits provenance/SBOM/attestation + signer-allowlist +
revocation + `trust-policy.yaml`, the gate consumes them unchanged"). Everything below is
generated from `packages/contracts/pollek-contract.json` (contract version `2026.07.23`) and
covered by `test/foundation.test.mjs` (27 tests, incl. the SRS §26 red-team vectors).

Nothing here weakened a gate or added a fallback: the Cloud boots empty, bundles are created
only through the real gated compliance-deploy flow, and every trust document is signed.

---

## 1. What the signed bundle manifest now carries

`GET /v1/policy-bundles/{bundle_id}/manifest` → the signed manifest. The **signature covers
`policy.wasm` AND `data.json`** plus the trust evidence, so tampering with any of them breaks
verification (DEK §3, confirmed).

New signed fields (all inside the signed bytes):

| Field | Meaning |
|---|---|
| `signed_fields` | `["policy.wasm","data.json"]` |
| `generation` | monotonic `u64`, assigned once per bundle, enforce monotonicity |
| `data` + `data_sha256` | the `data.json` shipped inside the bundle |
| `provenance` | SLSA-style, `slsa_level: 2`, builder id ≠ signer, materials incl. `.../data.json` |
| `sbom` + `sbom_sha256` | CycloneDX 1.5 JSON, non-empty `components[]`, embedded SHA-256 hash |
| `attestation` | in-toto-style test-pass predicate (`result: "passed"`, `failures: 0`) |
| `source_hashes` | per-part SHA-256 (policies, artifacts, data, sbom, provenance, attestation) |

Signatures use **TUF-style detached `signatures[]`** with `{ keyid, alg: "ed25519", sig }`
(`sig` is base64url). `keyid` is `pollek-cloud-ed25519-<fingerprint16>` = the fingerprint of
the raw 32-byte public key, matching your `verify_strict` over the raw key. The legacy
`key_id`/`public_key_pem` fields are retained for the Cloud console only.

**Signed bytes = canonical JSON of the manifest with `signatures`, `verification`,
`payload_hash`, `signing_action` removed.** Canonicalization is recursive key-sort, arrays in
order, scalars via `JSON.stringify` (see `stableJson`). Verification recipe (also in the test
suite, so it is executable, not prose):

```
unsigned = manifest \ { signatures, verification, payload_hash, signing_action }
bytes    = stableJson(unsigned)              # recursive key-sort
ok       = ed25519_verify(bytes, sig, raw_pubkey_from_allowlist[keyid])
```

## 2. Trust-material endpoints (pull every sync cycle)

| Method + path | Returns |
|---|---|
| `GET /v1/trust/policy` | signed `trust-policy.v1` — `require_*` flags, revocation refresh/staleness, kill-switch shape |
| `GET /v1/trust/signer-allowlist` | signed `signer-allowlist.v1` — `signers[]` with `keyid`, `status`, `public_key.raw_base64url` (+ pem) |
| `GET /v1/trust/revocations` | signed `revocation-list.v1` — monotonic `revocation_epoch`, `revoked_key_ids/bundle_digests/revisions` |
| `POST /v1/trust/revocations` | Cloud-admin: append revocations, bump epoch, returns freshly signed list (empty target → `400`) |
| `GET /api/trust/provenance` | Cloud console read view aggregating the above + per-bundle evidence |

Trust-policy defaults (max-strictness; local may only tighten, never weaken):
`require_signature`, `require_signed_data`, `require_provenance`, `require_slsa_level: 2`,
`require_sbom` (`cyclonedx`), `require_test_attestation`, `require_signer_in_allowlist`,
`require_tenant_match`, `require_generation_monotonic`, `signature_algorithms: ["ed25519"]`.
Revocation: `refresh_interval_seconds: 300`, `max_staleness_seconds: 3600`,
`semantics: "deny_list"`. Trust domain: `spiffe://pollek.io` (one per deployment, DEK §1).

The trust documents sign the same way as the manifest: signed bytes = the document with
`signatures` removed, canonical JSON, ed25519.

## 3. Schemas (machine-readable, served + drift-gated)

- `/contracts/bundle-provenance.schema.json`
- `/contracts/trust-policy.schema.json`
- `/contracts/revocation-list.schema.json`
- `/contracts/signer-allowlist.schema.json`

Plus the enriched manifest via the existing `/contracts/openapi.json`. All four are declared
in `pollek-contract.json`, present in the OpenAPI + SDK, and enforced by `npm run
contracts:check`.

## 4. Red-team vectors already asserted on the Cloud side

`test/foundation.test.mjs` proves, using real ed25519 verification against the published
allowlist key, that these all break the signature: **poisoned `data.json`**, **wrong tenant**,
**generation downgrade**, **weakened trust-policy**, **shrunk (replayed) revocation list**.
Unsigned/absent-signature documents report `status: "unsigned"`. This mirrors the shared SRS
§26 acceptance criteria; we're ready for the DEK↔Cloud integration test that mirrors
`smoke-sync.mjs`.

## 5. Not in this phase (next up)

Per the agreed ordering, **mTLS/SVID acceptance + JWT-SVID `private_key_jwt` + SPIFFE trust
bundle** are Cloud-Phase-2 (the explicit DEK blocker after this). `spiffe-bundle`,
desired-state candidate lists, and the kill-switch control envelope endpoints follow in
Phase-2/3 as laid out in `CLOUD_TO_DEK_LCP_ALIGNMENT.md`.
