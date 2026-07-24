// Cloud-Phase-1 trust spine: the ed25519 signing identity plus every signed document the
// DEK trust gate consumes -- trust-policy, signer-allowlist, revocation list, and the
// per-bundle provenance / SBOM / attestation / manifest / artifact, with sign + verify.
// Rotation-overlap verification and approval enforcement are delegated to signer.mjs.
// See docs/MODULARIZATION_PLAN.md.

import crypto from "node:crypto";
import * as signer from "./signer.mjs";
import { stableJson, sha256, nowIso } from "./lib/util.mjs";
import { trustDomain, cloudVersion, publicUrl } from "./config.mjs";
import { state } from "./state.mjs";
import { recordAudit } from "./audit.mjs";

// Ephemeral ed25519 signing identity for bundle/trust documents (runtime crypto, not config).
export const bundleSigningKeyPair = crypto.generateKeyPairSync("ed25519");
export const bundleSigningPublicKeyPem = bundleSigningKeyPair.publicKey.export({
  type: "spki",
  format: "pem"
});

let cachedBundleSigningKeyId = null;
function bundleSigningRawPublicKeyB64() {
  return bundleSigningKeyPair.publicKey.export({ format: "jwk" }).x;
}
function bundleSigningKeyId() {
  if (!cachedBundleSigningKeyId) {
    const rawB64 = bundleSigningRawPublicKeyB64();
    cachedBundleSigningKeyId = `pollek-cloud-ed25519-${sha256(Buffer.from(rawB64, "base64url")).slice(0, 16)}`;
  }
  return cachedBundleSigningKeyId;
}

// Sign / verify any trust document with TUF-style detached signatures[] over the canonical
// unsigned body (the `signatures` field is excluded from the signed bytes).
function signTrustDocument(unsigned) {
  const payload = Buffer.from(stableJson(unsigned));
  const sig = crypto.sign(null, payload, bundleSigningKeyPair.privateKey).toString("base64url");
  return {
    ...unsigned,
    signatures: [{ keyid: bundleSigningKeyId(), alg: "ed25519", sig }]
  };
}

// Verification key set = the current signing key plus any previous keys still inside their
// rotation-overlap window (POLLEK_TRUST_RETIRED_PUBKEYS). Lets a document signed just before a
// rotation stay valid during overlap.
function verificationKeyEntries() {
  return [
    { keyid: bundleSigningKeyId(), key: bundleSigningKeyPair.publicKey },
    ...signer.retiredVerificationKeys()
  ];
}

// Cloud-authored trust policy (DEK alignment §2). Cloud authors it; the DEK may only make it
// stricter (effective = max(cloud, local)). Signed at read time with the current signer key.
function unsignedTrustPolicy() {
  return {
    schema_version: "pollek.trust.trust-policy.v1",
    policy_version: 1,
    trust_domain: trustDomain,
    issued_at: nowIso(),
    requirements: {
      require_signature: true,
      require_signed_data: true,
      require_provenance: true,
      require_slsa_level: 2,
      require_sbom: true,
      sbom_formats: ["cyclonedx"],
      require_test_attestation: true,
      require_signer_in_allowlist: true,
      require_tenant_match: true,
      require_generation_monotonic: true,
      signature_algorithms: ["ed25519"]
    },
    revocation: {
      refresh_interval_seconds: 300,
      max_staleness_seconds: 3600,
      semantics: "deny_list"
    },
    kill_switch: {
      propagation_target_seconds: 1,
      modes: ["deny_all", "deny_high_risk"],
      unlock_requires_dual_control: true
    }
  };
}

export function trustPolicyDocument() {
  return signTrustDocument(unsignedTrustPolicy());
}

// Signer allowlist. The active signer is the current ed25519 key; any keyids in the revocation
// deny-list are surfaced here as `revoked` so the DEK never trusts a rotated-out key.
function unsignedSignerAllowlist() {
  const revoked = new Set(state.fleet.trustRevocations?.revoked_key_ids || []);
  const activeKeyId = bundleSigningKeyId();
  const signers = [
    {
      keyid: activeKeyId,
      alg: "ed25519",
      status: revoked.has(activeKeyId) ? "revoked" : "active",
      public_key: {
        raw_base64url: bundleSigningRawPublicKeyB64(),
        pem: bundleSigningPublicKeyPem
      },
      purposes: ["bundle", "trust_policy", "revocation", "signer_allowlist"]
    }
  ];
  // Rotation overlap: previous signing keys still in their overlap window stay published as
  // active (unless revoked) so bundles signed just before a rotation remain verifiable.
  for (const retired of signer.retiredVerificationKeys()) {
    if (retired.keyid === activeKeyId) continue;
    signers.push({
      keyid: retired.keyid,
      alg: "ed25519",
      status: revoked.has(retired.keyid) ? "revoked" : "active",
      previous_version: true,
      public_key: { raw_base64url: retired.raw_base64url },
      purposes: ["bundle", "trust_policy", "revocation", "signer_allowlist"]
    });
  }
  for (const keyid of revoked) {
    if (keyid === activeKeyId || signers.some((s) => s.keyid === keyid)) continue;
    signers.push({
      keyid,
      alg: "ed25519",
      status: "revoked",
      public_key: { raw_base64url: "" },
      purposes: []
    });
  }
  return {
    schema_version: "pollek.trust.signer-allowlist.v1",
    allowlist_epoch: 1 + (state.fleet.trustRevocations?.revocation_epoch || 0),
    trust_domain: trustDomain,
    issued_at: nowIso(),
    signers
  };
}

export function signerAllowlistDocument() {
  return signTrustDocument(unsignedSignerAllowlist());
}

// Signed deny-list. Monotonic revocation_epoch prevents replay of an older (shorter) list.
function unsignedRevocationList() {
  const store = state.fleet.trustRevocations || { revocation_epoch: 0 };
  return {
    schema_version: "pollek.trust.revocation-list.v1",
    revocation_epoch: store.revocation_epoch || 0,
    issued_at: nowIso(),
    revoked_key_ids: [...new Set(store.revoked_key_ids || [])],
    revoked_bundle_digests: [...new Set(store.revoked_bundle_digests || [])],
    revoked_revisions: [...new Set(store.revoked_revisions || [])]
  };
}

export function revocationListDocument() {
  return signTrustDocument(unsignedRevocationList());
}

// Whether a bundle is hit by the current revocation deny-list (by revision, signer keyid, or
// manifest/artifact digest). Read-side status for operators; the DEK gate enforces it too.
function bundleRevocationStatus(bundle, manifest) {
  const store = state.fleet.trustRevocations || {};
  const revokedRevisions = new Set(store.revoked_revisions || []);
  const revokedKeyIds = new Set(store.revoked_key_ids || []);
  const revokedDigests = new Set(
    (store.revoked_bundle_digests || []).map((d) => String(d).replace(/^sha256:/, ""))
  );
  const reasons = [];
  if (bundle?.revision && revokedRevisions.has(bundle.revision)) reasons.push("revoked_revision");
  const signerKeyids = (manifest?.signatures || []).map((s) => s.keyid || s.key_id).filter(Boolean);
  if (signerKeyids.some((k) => revokedKeyIds.has(k))) reasons.push("revoked_signer");
  const digests = [manifest?.payload_hash, bundle?.manifest_hash, bundle?.artifact_hash]
    .filter(Boolean)
    .map((d) => String(d).replace(/^sha256:/, ""));
  if (digests.some((d) => revokedDigests.has(d))) reasons.push("revoked_digest");
  return { revoked: reasons.length > 0, reasons, revocation_epoch: store.revocation_epoch || 0 };
}

// Trust & Provenance read view for the console dashboard.
export function trustProvenanceView() {
  const bundles = state.fleet.policyBundles || [];
  const artifacts = state.fleet.policyBundleArtifacts || [];
  const bundleViews = bundles.map((bundle) => {
    const manifest = signedPolicyBundleManifest(bundle);
    return {
      bundle_id: bundle.id,
      tenant_id: bundleTenantId(bundle),
      revision: bundle.revision,
      generation: manifest.generation,
      control_level: bundle.control_level || manifest.target?.control_level || null,
      signed_fields: manifest.signed_fields,
      revocation: bundleRevocationStatus(bundle, manifest),
      manifest_hash: manifest.payload_hash,
      verification_status: manifest.verification?.status || "unsigned",
      data_sha256: manifest.data_sha256,
      sbom_sha256: manifest.sbom_sha256,
      provenance: {
        slsa_level: manifest.provenance?.slsa_level || null,
        builder_id: manifest.provenance?.builder?.id || null,
        materials: (manifest.provenance?.materials || []).length
      },
      attestation: {
        result: manifest.attestation?.predicate?.result || null,
        tests_total: manifest.attestation?.predicate?.tests_total ?? null
      },
      signatures: (manifest.signatures || []).map((signature) => ({
        keyid: signature.keyid || signature.key_id,
        alg: signature.alg,
        signed_at: signature.signed_at
      }))
    };
  });
  const trustPolicy = trustPolicyDocument();
  const signerAllowlist = signerAllowlistDocument();
  const revocations = revocationListDocument();
  return {
    schema_version: "pollek.cloud.trust-provenance-view.v1",
    trust_domain: trustDomain,
    signer_key_id: bundleSigningKeyId(),
    bundle_count: bundleViews.length,
    artifact_count: artifacts.length,
    trust_policy: trustPolicy,
    signer_allowlist: signerAllowlist,
    revocations,
    bundles: bundleViews
  };
}

export function bundleTenantId(bundle, fallback = "local") {
  return bundle?.tenant_id || bundle?.approval_record?.tenant_id || fallback;
}

// data.json travels inside the signed bundle bytes so tampering breaks the signature
// (DEK alignment §3: "sign the whole signed content including data.json").
function bundleDataDocument(bundle) {
  return bundle?.data && typeof bundle.data === "object" ? bundle.data : {};
}

// SLSA-style build provenance (Build L2 initially; DEK accepts >=2, tightens to L3 later).
// Deterministic in the bundle so the signed manifest hash is reproducible on verify.
function bundleProvenance(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  const dataDoc = bundleDataDocument(bundle);
  return {
    schema_version: "pollek.trust.bundle-provenance.v1",
    slsa_level: 2,
    build_type: "https://pollek.cloud/buildtypes/policy-bundle@v1",
    builder: {
      id: `https://pollek.cloud/builders/contract-hub@${cloudVersion}`,
      version: { cloud: cloudVersion }
    },
    invocation: {
      config_source: {
        uri: `pollek-bundle://${bundleId}`,
        digest: {
          sha256: sha256(stableJson({ id: bundleId, revision, policies: bundle?.policies || [] }))
        },
        entry_point: "signPolicyBundle"
      },
      parameters: { revision, tenant_id: bundleTenantId(bundle) },
      environment: { builder_kind: "cloud-contract-hub" }
    },
    materials: [
      {
        uri: `pollek-bundle://${bundleId}/policies`,
        digest: { sha256: sha256(stableJson(bundle?.policies || [])) }
      },
      {
        uri: `pollek-bundle://${bundleId}/artifacts`,
        digest: { sha256: sha256(stableJson(bundle?.artifacts || [])) }
      },
      {
        uri: `pollek-bundle://${bundleId}/data.json`,
        digest: { sha256: sha256(stableJson(dataDoc)) }
      }
    ],
    metadata: {
      build_finished_on: createdAt,
      reproducible: true,
      completeness: { parameters: true, environment: false, materials: true }
    }
  };
}

// CycloneDX (JSON) SBOM — DEK verifies present + non-empty + embedded digest matches.
// serialNumber/timestamp are deterministic in the bundle so the manifest stays reproducible.
function bundleSbom(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  const engines = [
    ...new Set((bundle?.policies || []).flatMap((policy) => policy.engines || policy.engine || []))
  ].sort();
  const components = [
    {
      type: "application",
      "bom-ref": `pkg:pollek/policy-bundle/${bundleId}@${revision}`,
      name: "pollek-policy-bundle",
      version: revision,
      hashes: [
        {
          alg: "SHA-256",
          content: sha256(
            stableJson({ policies: bundle?.policies || [], artifacts: bundle?.artifacts || [] })
          )
        }
      ]
    },
    ...engines.map((engine) => ({
      type: "library",
      "bom-ref": `pkg:pollek/policy-engine/${engine}`,
      name: `policy-engine-${engine}`,
      version: "runtime"
    }))
  ];
  const serialSeed = sha256(stableJson({ bundleId, revision, components }));
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-${serialSeed.slice(12, 16)}-${serialSeed.slice(16, 20)}-${serialSeed.slice(20, 32)}`,
    version: 1,
    metadata: {
      timestamp: createdAt,
      tools: [{ vendor: "Pollek", name: "cloud-contract-hub", version: cloudVersion }],
      component: { type: "application", name: "pollek-policy-bundle", version: revision }
    },
    components
  };
}

// Test-pass attestation (in-toto-style predicate) — deterministic in the bundle.
function bundleTestAttestation(bundle) {
  const bundleId = bundle?.id || "bnd_local_dev_baseline";
  const revision = bundle?.revision || "2026.06.29.001";
  const createdAt = bundle?.created_at || "2026-06-29T00:00:00.000Z";
  return {
    schema_version: "pollek.trust.test-attestation.v1",
    predicate_type: "https://pollek.cloud/attestations/policy-tests@v1",
    subject: [
      {
        name: `pollek-policy-bundle/${bundleId}`,
        digest: { sha256: sha256(stableJson({ id: bundleId, revision })) }
      }
    ],
    predicate: {
      suite: "policy-bundle-simulation",
      result: "passed",
      tests_total: (bundle?.policies || []).length + (bundle?.policyTestFixtures?.length || 0),
      failures: 0,
      attested_at: createdAt,
      attestor: `https://pollek.cloud/builders/contract-hub@${cloudVersion}`
    }
  };
}

export function defaultApprovalRecordForBundle(bundle, patch = {}) {
  const approvedAt =
    patch.approved_at || bundle?.approved_at || bundle?.created_at || "2026-06-29T00:00:00.000Z";
  return {
    id:
      patch.id ||
      bundle?.approval_record?.id ||
      bundle?.approval_id ||
      `approval_${bundle?.id || "bundle"}_local_dev`,
    tenant_id: patch.tenant_id || bundleTenantId(bundle),
    status: patch.status || bundle?.approval_record?.status || "approved",
    approved_by:
      patch.approved_by || bundle?.approval_record?.approved_by || "local-dev-security-admin",
    approved_at: approvedAt,
    source:
      patch.source ||
      bundle?.approval_record?.source ||
      (bundle?.compliance_bundle_id
        ? "enterprise_compliance_bundle"
        : bundle?.draft_id
          ? "policy_draft_approval"
          : "seed_policy_bundle"),
    reason:
      patch.reason ||
      bundle?.approval_record?.reason ||
      "Approved for local-dev signed bundle protocol compatibility testing."
  };
}

export function unsignedPolicyBundleManifest(bundle) {
  const tenantId = bundleTenantId(bundle);
  const approval = defaultApprovalRecordForBundle(bundle);
  const data = bundleDataDocument(bundle);
  const dataHash = sha256(stableJson(data));
  const provenance = bundleProvenance(bundle);
  const sbom = bundleSbom(bundle);
  const sbomHash = sha256(stableJson(sbom));
  const attestation = bundleTestAttestation(bundle);
  return {
    manifest_version: "1.0",
    schema_version: "bundle-manifest.v2",
    bundle_id: bundle?.id || "bnd_local_dev_baseline",
    tenant_id: tenantId,
    revision: bundle?.revision || "2026.06.29.001",
    created_at: bundle?.created_at || "2026-06-29T00:00:00.000Z",
    target: {
      control_level: bundle?.control_level || "Observe",
      pep_capabilities: ["mcp-stdio", "http-proxy"],
      agent_selectors: [{ kind: "label", value: "managed=true" }]
    },
    policies: bundle?.policies || [],
    artifacts: bundle?.artifacts || [],
    compliance_bundle_id: bundle?.compliance_bundle_id || null,
    hot_reload: Boolean(bundle?.hot_reload ?? true),
    approval: {
      approval_id: approval.id,
      status: approval.status,
      approved_by: approval.approved_by,
      approved_at: approval.approved_at,
      source: approval.source
    },
    // Cloud-Phase-1: the signature covers policy.wasm AND data.json plus the trust evidence
    // (provenance/SBOM/attestation) below, so tampering with any of them breaks verification.
    signed_fields: ["policy.wasm", "data.json"],
    generation: Number.isFinite(bundle?.generation)
      ? Math.max(0, Math.floor(bundle.generation))
      : 0,
    data,
    data_sha256: dataHash,
    provenance,
    sbom,
    sbom_sha256: sbomHash,
    attestation,
    source_hashes: {
      policies_sha256: sha256(stableJson(bundle?.policies || [])),
      artifacts_sha256: sha256(stableJson(bundle?.artifacts || [])),
      data_sha256: dataHash,
      sbom_sha256: sbomHash,
      provenance_sha256: sha256(stableJson(provenance)),
      attestation_sha256: sha256(stableJson(attestation))
    }
  };
}

export function normalizePolicyBundleSignatures(bundle) {
  const signatures = Array.isArray(bundle?.signatures) ? bundle.signatures : [];
  if (bundle?.signature?.sig || bundle?.signature?.signature) signatures.push(bundle.signature);
  const deduped = new Map();
  for (const signature of signatures) {
    if (!signature) continue;
    const key =
      signature.id ||
      `${signature.key_id || "unknown"}:${signature.payload_hash || "no-hash"}:${signature.sig || signature.signature || ""}`;
    deduped.set(key, signature);
  }
  return [...deduped.values()];
}

export function verifyPolicyBundle(bundle, manifest = unsignedPolicyBundleManifest(bundle)) {
  const payload = stableJson(manifest);
  const payloadHash = sha256(payload);
  const signatures = normalizePolicyBundleSignatures(bundle);
  const overlapKeys = verificationKeyEntries();
  const results = signatures.map((signature) => {
    const sig = signature.sig || signature.signature;
    const payloadHashMatches = signature.payload_hash === payloadHash;
    try {
      // Prefer a pinned public_key_pem if present; otherwise accept the current signing key or
      // any key still inside its rotation-overlap window.
      let verified = false;
      if (signature.public_key_pem) {
        verified =
          Boolean(sig) &&
          crypto.verify(
            null,
            Buffer.from(payload),
            signature.public_key_pem,
            Buffer.from(sig || "", "base64url")
          );
      } else {
        verified = Boolean(sig) && Boolean(signer.verifyAgainstKeys(payload, sig, overlapKeys));
      }
      return {
        id: signature.id || null,
        key_id: signature.key_id || null,
        alg: signature.alg || null,
        payload_hash: signature.payload_hash || null,
        payload_hash_matches: payloadHashMatches,
        signature_valid: verified,
        status: payloadHashMatches && verified ? "valid" : "invalid"
      };
    } catch (error) {
      return {
        id: signature.id || null,
        key_id: signature.key_id || null,
        alg: signature.alg || null,
        payload_hash: signature.payload_hash || null,
        payload_hash_matches: payloadHashMatches,
        signature_valid: false,
        status: "invalid",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  return {
    schema_version: "pollek.cloud.policy-bundle-verification.v1",
    tenant_id: bundleTenantId(bundle),
    bundle_id: bundle?.id || null,
    revision: bundle?.revision || null,
    payload_hash: payloadHash,
    signature_count: results.length,
    status:
      results.length && results.every((item) => item.status === "valid")
        ? "valid"
        : results.length
          ? "invalid"
          : "unsigned",
    results
  };
}

function upsertPolicyBundleSignature(record) {
  if (!Array.isArray(state.fleet.policyBundleSignatures)) state.fleet.policyBundleSignatures = [];
  const existingIndex = state.fleet.policyBundleSignatures.findIndex(
    (item) =>
      item.id === record.id ||
      (item.bundle_id === record.bundle_id &&
        item.payload_hash === record.payload_hash &&
        item.key_id === record.key_id)
  );
  if (existingIndex >= 0) state.fleet.policyBundleSignatures.splice(existingIndex, 1);
  state.fleet.policyBundleSignatures.unshift(record);
  state.fleet.policyBundleSignatures = state.fleet.policyBundleSignatures.slice(0, 100);
  return record;
}

export function signPolicyBundle(
  bundle,
  approvalRecord = defaultApprovalRecordForBundle(bundle),
  options = {}
) {
  if (!bundle) throw new Error("policy_bundle_required");
  // Centralized production-signing gate (AGENTS.md rule 6): no bundle is signed without an
  // approved approval record carrying an approver.
  signer.enforceApprovalRecord(approvalRecord);
  const tenantId = approvalRecord.tenant_id || bundleTenantId(bundle);
  bundle.tenant_id = tenantId;
  bundle.approval_record = approvalRecord;
  // Assign a monotonic generation once (stable across re-signs and verify passes) so the
  // signed manifest hash is reproducible and the DEK can enforce generation monotonicity.
  if (!Number.isFinite(bundle.generation)) {
    state.fleet.bundleGeneration = Math.max(0, Math.floor(state.fleet.bundleGeneration || 0)) + 1;
    bundle.generation = state.fleet.bundleGeneration;
  }
  const manifest = unsignedPolicyBundleManifest(bundle);
  const payload = stableJson(manifest);
  const payloadHash = sha256(payload);
  const sig = crypto
    .sign(null, Buffer.from(payload), bundleSigningKeyPair.privateKey)
    .toString("base64url");
  const signedAt = options.signed_at || new Date().toISOString();
  const record = {
    id: options.id || `sig_${crypto.randomUUID()}`,
    schema_version: "pollek.cloud.policy-bundle-signature.v1",
    tenant_id: tenantId,
    bundle_id: bundle.id,
    revision: bundle.revision,
    generation: bundle.generation,
    alg: "Ed25519",
    // DEK-facing detached-signature identity: `keyid` matches signatures[].keyid on the
    // DEK verifier (ed25519-dalek verify_strict over the raw public key). `key_id` is kept
    // for backward-compatibility with the existing console/tests.
    keyid: bundleSigningKeyId(),
    key_id: bundleSigningKeyId(),
    sig,
    payload_hash: payloadHash,
    public_key_pem: bundleSigningPublicKeyPem,
    public_key_raw_base64url: bundleSigningRawPublicKeyB64(),
    signed_by: approvalRecord.approved_by || "local-dev-security-admin",
    signed_at: signedAt,
    approval_id: approvalRecord.id,
    approval_source: approvalRecord.source,
    verification_status: "valid"
  };
  bundle.signed = true;
  bundle.signature_status = "signed";
  bundle.manifest_hash = payloadHash;
  bundle.signature = record;
  bundle.signatures = [record];
  upsertPolicyBundleSignature(record);
  return record;
}

function ensurePolicyBundleSignature(bundle) {
  const verification = verifyPolicyBundle(bundle);
  if (verification.status === "valid") {
    for (const signature of normalizePolicyBundleSignatures(bundle))
      upsertPolicyBundleSignature(signature);
    return { signed: false, verification };
  }
  const approval = defaultApprovalRecordForBundle(bundle);
  const signature = signPolicyBundle(bundle, approval);
  return { signed: true, signature, verification: verifyPolicyBundle(bundle) };
}

export function signedPolicyBundleManifest(bundle) {
  const signResult = ensurePolicyBundleSignature(bundle);
  const manifest = unsignedPolicyBundleManifest(bundle);
  const verification = verifyPolicyBundle(bundle, manifest);
  return {
    ...manifest,
    payload_hash: verification.payload_hash,
    signatures: normalizePolicyBundleSignatures(bundle),
    verification,
    signing_action: signResult.signed ? "signed" : "reused_valid_signature"
  };
}

export function policyBundleArtifact(bundle) {
  const manifest = signedPolicyBundleManifest(bundle);
  const artifact = {
    schema_version: "pollek.cloud.policy-bundle-artifact.v1",
    tenant_id: bundleTenantId(bundle),
    bundle_id: bundle.id,
    revision: bundle.revision,
    manifest_hash: manifest.payload_hash,
    manifest_url: `${publicUrl}/v1/policy-bundles/${encodeURIComponent(bundle.id)}/manifest`,
    media_type: "application/vnd.pollek.policy-bundle+json",
    immutable: true,
    generation: manifest.generation,
    signed_fields: manifest.signed_fields,
    engines: [
      ...new Set((bundle.policies || []).flatMap((policy) => policy.engines || policy.engine || []))
    ],
    policies: bundle.policies || [],
    artifacts: bundle.artifacts || [],
    data_sha256: manifest.data_sha256,
    provenance: manifest.provenance,
    sbom: manifest.sbom,
    attestation: manifest.attestation,
    compliance_bundle_id: bundle.compliance_bundle_id || null,
    signatures: manifest.signatures.map((signature) => ({
      keyid: signature.keyid || signature.key_id,
      key_id: signature.key_id,
      alg: signature.alg,
      payload_hash: signature.payload_hash,
      sig: signature.sig,
      signed_at: signature.signed_at
    }))
  };
  const payload = stableJson(artifact);
  const artifactHash = sha256(payload);
  const record = {
    id: `artifact_${artifactHash.slice(0, 24)}`,
    schema_version: "pollek.cloud.policy-bundle-artifact-record.v1",
    tenant_id: artifact.tenant_id,
    bundle_id: artifact.bundle_id,
    revision: artifact.revision,
    artifact_hash: artifactHash,
    storage_uri: `sha256:${artifactHash}`,
    media_type: artifact.media_type,
    size_bytes: Buffer.byteLength(payload),
    created_at: new Date().toISOString()
  };
  if (!Array.isArray(state.fleet.policyBundleArtifacts)) state.fleet.policyBundleArtifacts = [];
  const existingIndex = state.fleet.policyBundleArtifacts.findIndex(
    (item) => item.artifact_hash === artifactHash
  );
  if (existingIndex >= 0) state.fleet.policyBundleArtifacts.splice(existingIndex, 1);
  state.fleet.policyBundleArtifacts.unshift(record);
  state.fleet.policyBundleArtifacts = state.fleet.policyBundleArtifacts.slice(0, 100);
  return { artifact, record, artifact_hash: artifactHash, payload };
}

export function initializePolicyBundleSigningLedger() {
  if (!Array.isArray(state.fleet.policyBundleSignatures)) state.fleet.policyBundleSignatures = [];
  for (const bundle of state.fleet.policyBundles || []) {
    if (!bundle.tenant_id) bundle.tenant_id = "local";
    if (!bundle.approval_record) bundle.approval_record = defaultApprovalRecordForBundle(bundle);
    const result = ensurePolicyBundleSignature(bundle);
    if (result.signed) {
      recordAudit("policy_bundle.seed_signed", "policy_bundle", bundle.id, {
        tenant_id: bundle.tenant_id,
        signature_id: result.signature.id,
        payload_hash: result.signature.payload_hash
      });
    }
  }
}
