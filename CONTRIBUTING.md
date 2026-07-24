# Contributing to Pollek Cloud

Thanks for working on Pollek Cloud. This guide captures the conventions the codebase
already follows so changes stay consistent and reviewable.

## Prerequisites

- Node.js `>=20` (the repo pins `22` in `.nvmrc`; run `nvm use`).
- npm (the repo uses `package-lock.json`; install with `npm ci`).
- PostgreSQL is optional for local dev — the server runs on a file snapshot when
  `DATABASE_URL` is unset, and on Postgres when it is set.

## Getting started

```bash
nvm use            # Node 22
npm ci             # install exactly from the lockfile
npm run dev        # start the server at http://127.0.0.1:8790
```

## The gate: run this before every push

```bash
npm run audit:foundation
```

It syntax-checks the server modules and the web bundle, verifies the Contract Hub
artifacts are in sync, and runs the full test suite. CI runs the same command, so a green
local gate means a green CI. PostgreSQL integration tests are skipped unless `PG_TEST_URL`
(and, for the row-level-security assertions, a non-superuser `PG_TEST_APP_URL`) are set.

## Core principles (please preserve them)

1. **Contract-first.** Any change to a wire format goes through
   `packages/contracts/pollek-contract.json`, then regenerate and keep the drift gate green:
   ```bash
   npm run contracts:generate   # openapi + sdk
   npm run contracts:check      # must pass
   ```
   `packages/contracts/typespec/main.tsp` is the authoring mirror; keep it aligned.
2. **Boots empty, no fabricated data.** The Cloud never synthesizes operational/fleet data.
   State is populated only through the real, gated ingest flows. Do not add seed data or
   client-side fabrication (see the README "Starts Empty" section).
3. **Identity enforcement is boundary-class and staged.** Machine (DEK-facing) boundaries use
   the Keycloak JWT gate (`POLLEK_KEYCLOAK_JWT_MODE`), human/console boundaries use the session
   gate (`POLLEK_SESSION_MODE`), transport uses the mTLS/SVID gate (`POLLEK_MTLS_MODE`). All
   default `off`; roll out `off -> monitor -> enforce`, and only after the documented
   prerequisite is in place.
4. **Signing is real.** Bundle/trust-document signatures use ed25519 and are covered by tests.
   Do not weaken a gate or add a fallback to make an unverified path "work"; selecting an
   unwired signer backend fails loudly on purpose.
5. **No hardcoded secrets, tenant IDs, keys, or URLs.** Use env / the single-source contract
   values. See `AGENTS.md` for the full rule list.

## Commit and PR conventions

- Branch off `main`; do not commit directly to `main`.
- Keep commits focused with an imperative subject line and a body explaining the *why*.
- Every PR must pass `audit:foundation` (CI enforces it). Update tests and docs with the code.
- Fill in `.github/pull_request_template.md`.

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/api` | Control-plane API server (`server.mjs`) + modules (`db`, `keycloak`, `signer`) |
| `apps/web/static` | Enterprise console (vanilla HTML/CSS/JS) |
| `packages/contracts` | Contract Hub: contract JSON, TypeSpec, generated OpenAPI, JSON schemas, fixtures |
| `packages/sdk` | Generated dependency-light client SDK |
| `packages/db` | PostgreSQL migrations |
| `scripts` | Contract generators, drift check, smoke/connection tests |
| `test` | Node test-runner suites (`foundation`, `signer`, `postgres`) |
| `docs` | Architecture, ADRs, SRS, research, UX, hand-offs (see `docs/README.md`) |

## Security

Report vulnerabilities per `SECURITY.md`. Do not open a public issue for a security problem.
