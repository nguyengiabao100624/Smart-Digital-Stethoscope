# Smart Health Operations Notes

## Local Production Checks

```powershell
cd web-monitor
npm run check
npm test
npm run smoke:storage
npm run smoke:mqtt
npm run smoke:api-production
```

PostgreSQL local:

```powershell
$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
npm run migrate
npm run migrate:json
npm run smoke:postgres
```

## Backup And Restore

PostgreSQL backup:

```powershell
pg_dump $env:DATABASE_URL -Fc -f smart_health.backup
```

PostgreSQL restore:

```powershell
pg_restore --clean --if-exists --dbname $env:DATABASE_URL smart_health.backup
```

Local object storage backup:

```powershell
Compress-Archive -Path .\data\objects -DestinationPath smart_health_objects.zip
```

## Metrics

Prometheus-compatible endpoint:

```http
GET /metrics
```

Current metrics include request totals, error totals, active recording flag and online device count.

## Optional Services

- `REDIS_URL`: enables BullMQ audio queue and `npm run worker`.
- `OBJECT_STORAGE_PROVIDER=s3`: enables S3-compatible object storage and presigned URLs.
- `MQTT_URL`: enables MQTT control plane for device telemetry/events/OTA command publish.
- `PHI_ENCRYPTION_KEY`: enables AES-256-GCM envelopes for protected export metadata.
- `PASSWORD_IDEMPOTENCY_HMAC_KEY`: optional dedicated 32-byte secret for password-change replay fingerprints; when absent, the backend derives a domain-separated key from `PHI_ENCRYPTION_KEY`.
