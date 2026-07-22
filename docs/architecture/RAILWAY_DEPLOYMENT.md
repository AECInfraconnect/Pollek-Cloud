# Railway Deployment Runbook

This repo is deployed as the Pollek Cloud commercial central control plane. Local Control Plane and Local Dashboard responsibilities remain outside this Railway project; this deployment only hosts the Cloud/API/UI and Cloud-side dependencies.

## Target Railway Services

Create a fresh Railway project with these services:

- `pollek-cloud`: GitHub service from `AECInfraconnect/Pollek-Cloud`, branch `main`.
- `pollek-cloud-postgres`: primary PostgreSQL service for Cloud tenant, IAM, billing, audit, telemetry metadata, and Contract Hub persistence.
- `pollek-keycloak`: Keycloak IAM service.
- `pollek-keycloak-postgres`: dedicated PostgreSQL service for Keycloak. Keep this separate from the app database.
- `pollek-cosmian-kms`: Cosmian KMS service from `ghcr.io/cosmian/kms:latest`.

## Runtime Contract

Railway injects `PORT`; `apps/api/server.mjs` listens on `PORT` and binds `0.0.0.0` when `PORT` is present. `railway.json` sets:

- `startCommand`: `npm start`
- `healthcheckPath`: `/health`
- `healthcheckTimeout`: `300`
- restart policy: `ON_FAILURE`

## Required Cloud Variables

Set these on `pollek-cloud`:

```text
NODE_ENV=production
DATABASE_URL=${{pollek-cloud-postgres.DATABASE_URL}}
POLLEK_CLOUD_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
KEYCLOAK_BASE_URL=https://${{pollek-keycloak.RAILWAY_PUBLIC_DOMAIN}}
KEYCLOAK_REALM=pollek
KEYCLOAK_CLIENT_ID=pollek-cloud-console
OIDC_ISSUER=https://${{pollek-keycloak.RAILWAY_PUBLIC_DOMAIN}}/realms/pollek
COSMIAN_KMS_URL=https://${{pollek-cosmian-kms.RAILWAY_PUBLIC_DOMAIN}}
POLLEK_CLOUD_MAX_JSON_BODY_BYTES=1048576
POLLEK_CLOUD_RATE_WINDOW_MS=60000
POLLEK_CLOUD_RATE_MAX=900
POLLEK_CLOUD_DEFAULT_API_PAGE_LIMIT=1000
POLLEK_CLOUD_MAX_API_PAGE_LIMIT=5000
POLLEK_CLOUD_MAX_AUDIT_PAYLOAD_BYTES=32768
```

Do not set production secrets in git. Set Keycloak admin credentials, client secret, and KMS API/JWT/mTLS credentials only as Railway variables or sealed variables.

## Railway CLI Provisioning

After `railway login`, create the project and services:

```powershell
$env:npm_config_cache=(Join-Path (Get-Location) '.npm-cache')
npx -y @railway/cli init --name "Pollek Cloud" --json
npx -y @railway/cli add --repo AECInfraconnect/Pollek-Cloud --branch main --service pollek-cloud --json
npx -y @railway/cli add --database postgres --json
npx -y @railway/cli deploy -t keycloak-1
npx -y @railway/cli add --image ghcr.io/cosmian/kms:latest --service pollek-cosmian-kms --json
```

Then create public domains for HTTP services:

```powershell
npx -y @railway/cli domain --service pollek-cloud --json
npx -y @railway/cli domain --service pollek-keycloak --json
npx -y @railway/cli domain --service pollek-cosmian-kms --port 9998 --json
```

Keycloak may be deployed through Railway's `keycloak-1` template because it includes Keycloak 26.x plus a sibling PostgreSQL database using Railway private networking.

## Cosmian KMS Notes

Use `ghcr.io/cosmian/kms:latest`; the old Docker Hub `cosmian/kms` image is deprecated. Cosmian exposes REST/UI on port `9998` and persists local SQLite data under `/root/cosmian-kms/sqlite-data` unless configured for PostgreSQL. For production, attach a Railway volume or move Cosmian to PostgreSQL and enable JWT/OIDC or mTLS authentication before storing production signing keys.

## Verification

After deployment:

```powershell
npx -y @railway/cli service status --json
npx -y @railway/cli domain list --service pollek-cloud --json
curl.exe --ssl-no-revoke -sS https://<pollek-cloud-domain>/health
curl.exe --ssl-no-revoke -sS https://<pollek-cloud-domain>/.well-known/pollek-contract
curl.exe --ssl-no-revoke -sS https://<pollek-cloud-domain>/api/cloud/status
```

Expected `/health` output includes `ok: true`, contract discovery remains available, and the UI loads from the root path.
