# Pollek Cloud Database

Production database: PostgreSQL.

Development database: PostgreSQL through `deploy/docker-compose/docker-compose.yml`.

Using PostgreSQL in development keeps tenant isolation, JSONB, indexes, and Row Level Security behavior close to production. The local dev API can run without a database for quick protocol tests, but durable product features should use this schema and migrations.

## Apply Migration

```powershell
docker compose -f deploy/docker-compose/docker-compose.yml up -d postgres
$env:PGPASSWORD="pollek"
psql -h 127.0.0.1 -p 5432 -U pollek -d pollek_cloud -f packages/db/migrations/0001_foundation.sql
```

Before querying tenant-owned tables directly, set tenant context:

```sql
SET app.tenant_id = 'tnt_local_lab';
```
