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
- **Phase 0 (next, enabler):** replace the ~130 source-string `assert.match(server, …)`
  assertions with behavioral tests (hit the endpoint / call the behavior) so later moves don't
  break tests for cosmetic reasons. This is the unblocker for everything below.
- **Phase 2:** `apps/api/config.mjs` — env-derived constants (ports, limits, `publicUrl`,
  `trustDomain`, enforcement modes, `contractDocument`, `cloudVersion`) as named exports.
  Then move config-coupled pure-ish helpers (`parsePath`, `boundedInt`, `pageSlice`).
- **Phase 3:** `apps/api/state.mjs` — the `state` object, `createFleetState`,
  `persistedFleetKeys`, and small state accessors, as an importable singleton.
- **Phase 4:** feature modules that import `state`/`config`/`util`, one cohesive slice per PR:
  `trust.mjs` (signing, trust-policy/allowlist/revocation, provenance/SBOM/attestation),
  `persistence.mjs` (snapshot + Postgres write-through wiring), `telemetry.mjs` (ingest +
  read views), `reports.mjs` (cost/token), `entities.mjs` (registry/discovery/entities),
  `policy.mjs` (drafts/sandbox/compliance/bundles), `identity.mjs` (signup/session/SCIM/IdP),
  `billing.mjs` (subscriptions/usage/invoices/licenses).
- **Phase 5:** split the `handleApi` router into per-domain route registrars
  (`routes/*.mjs`) that `server.mjs` composes; keep a thin dispatch in `server.mjs`.
- **Phase 6 (front-end):** split `app.js` into ES modules under `apps/web/static/js/`
  (`state.js`, `api.js` incl. `authFetch`, and per-tab render modules), loaded via the existing
  `<script type="module">`. Keep it build-step-free (native ESM), preserving the console's
  dependency-light stance.

## Status

Phase 1 complete. Phase 0 is the recommended next step because it unblocks Phases 2–5 without
fighting the source-string assertions. Each subsequent phase ships as an independent PR behind
a green gate.
