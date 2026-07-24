# Modularization plan — `apps/api/server.mjs` and `apps/web/static/app.js`

## Why

Two files carry most of the codebase:

| File | Lines | Shape |
| --- | --- | --- |
| `apps/api/server.mjs` | ~10k | ~7k of domain helpers + a ~2.8k `handleApi` router |
| `apps/web/static/app.js` | ~5.5k | one console controller (state, render, fetch, handlers) |

They work and are well-tested (52 tests), but their size hurts readability and review. This
plan breaks them up **incrementally and behavior-preservingly** — never a big-bang rewrite of
a deployed, tested file.

## Guardrails for every phase

1. `npm run audit:foundation` stays green after each step (lint, format, contract drift, tests).
2. No behavior change — extraction only. Public routes and response shapes are unchanged.
3. Each phase is its own reviewable PR.
4. Watch the source-string assertions in `test/foundation.test.mjs`: ~130 `assert.match(server, …)`
   pin function names and route strings to `server.mjs`. Moving a pinned symbol requires
   updating (preferably upgrading) that assertion. **Phase 0** below migrates these brittle
   source assertions to behavioral tests so later phases are unblocked.

## Constraint that shapes the design

Almost every helper reads the module-scoped `state` object and shared config constants. Clean
feature extraction therefore depends on first exposing those as importable singletons.

## Phases

- **Phase 1 (done):** extract pure, state-free helpers to `apps/api/lib/util.mjs`
  (`stableJson`, `sha256`, `slugify`, time helpers, map/entry helpers, id helpers, `httpError`)
  with direct unit tests in `test/util.test.mjs`. Establishes the `apps/api/lib/` pattern.
- **Phase 0 (done, enabler):** replaced the ~130 source-string `assert.match(server, …)`
  assertions with behavioral tests. The two big route-pin tests became a single data-driven
  `API_ROUTE_MANIFEST` test that boots the server and proves each of ~79 routes is dispatched by
  the API layer (JSON/SSE response) rather than falling through to the static handler; the
  Railway `PORT`/`RAILWAY_PUBLIC_DOMAIN` pins became a boot-with-env test asserting the injected
  port binds and the public domain drives advertised URLs. Function-name pins were dropped where
  a dedicated behavioral test already covers the behavior. One cheap source guard is kept on
  purpose: `assert.doesNotMatch(server, /dev-placeholder/)` (signing hygiene). Server-side moves
  (Phases 2–5) no longer break tests for cosmetic reasons. The front-end `assert.match(app, …)`
  pins in `app.js` are untouched — they belong to **Phase 6** and don't block server work; they
  need a browser-driven (Playwright) test to convert.
- **Phase 2 (done):** `apps/api/config.mjs` — all env- and contract-derived constants (paths,
  `port`/`host`/`publicUrl`, request/telemetry limits, flags, `contractDocument`/`cloudVersion`/
  `contractVersion`, `contractArtifactPaths`, `trustDomain`, SPIRE/mTLS/session enforcement
  modes) as named exports, imported by `server.mjs`. Runtime crypto (the ephemeral bundle
  signing keypair) and state-shape/policy constants stay with their owners. No behavior change.
- **Phase 3 (done):** `apps/api/state.mjs` — the `state` singleton, `createFleetState`,
  `persistedFleetKeys`, and the static product catalogs that seed it (`ROLE_TEST_USER_TEMPLATES`,
  `ADAPTER_CATALOG`, `SANDBOX_PROFILES`, `COMPLIANCE_POLICY_BUNDLES`), as an importable module.
  `state` is mutated in place and never reassigned, so every module shares one object graph; the
  behavioral suite's ingest→read-back tests prove the cross-module mutation works. No behavior
  change.
- **Phase 4 (in progress):** feature modules that import `state`/`config`/`util`/`db`, one
  cohesive slice per PR. Order runs lowest-coupling first:
  - `persistence.mjs` **(done)** — the runtime snapshot + Postgres write-through (`persistence`
    object, `runtimeStateSnapshot`/`applyRuntimeStateSnapshot`, `loadRuntimeState`,
    `persistRuntimeState`, `scheduleRuntimePersist`, `runtimePersistenceStatus`). This is now the
    only module that touches `db` and the durable snapshot; `server.mjs` no longer imports `db`.
    Verified against real Postgres (migrations, snapshot round-trip, RLS isolation) plus the
    file-snapshot path.
  - `audit.mjs` **(done)** — sensitive-value redaction (`redactSensitive`) and the append-only
    audit log (`recordAudit`, internal `safeAuditPayload`). Extracted before the bigger domain
    slices because nearly all of them call `recordAudit`; giving audit its own module keeps the
    dependency direction one-way (`trust`/`identity`/`billing` → `audit`) and avoids cycles.
  - Remaining slices: `trust.mjs` (signing, trust-policy/allowlist/revocation,
    provenance/SBOM/attestation), `telemetry.mjs` (ingest + read views), `reports.mjs`
    (cost/token), `entities.mjs` (registry/discovery/entities), `policy.mjs`
    (drafts/sandbox/compliance/bundles), `identity.mjs` (signup/session/SCIM/IdP), `billing.mjs`
    (subscriptions/usage/invoices/licenses).
- **Phase 5:** split the `handleApi` router into per-domain route registrars
  (`routes/*.mjs`) that `server.mjs` composes; keep a thin dispatch in `server.mjs`.
- **Phase 6 (front-end):** split `app.js` into ES modules under `apps/web/static/js/`
  (`state.js`, `api.js` incl. `authFetch`, and per-tab render modules), loaded via the existing
  `<script type="module">`. Keep it build-step-free (native ESM), preserving the console's
  dependency-light stance.

## Status

Phases 1, 0, 2, 3 complete; Phase 4 underway (`persistence.mjs`, `audit.mjs` done). Next Phase-4
slice: `trust.mjs`. Each slice ships as an independent PR behind a green gate.
