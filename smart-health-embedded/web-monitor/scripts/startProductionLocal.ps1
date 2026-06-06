param(
  [string]$ServiceAccountPath = "D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json",
  [string]$DatabaseUrl = "postgresql://smart_health:smart_health_dev@localhost:5432/smart_health",
  [string]$CorsOrigin = "http://127.0.0.1:5174",
  [switch]$SkipDocker,
  [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name chưa có trong PATH. $InstallHint"
  }
}

if (-not (Test-Path -LiteralPath $ServiceAccountPath)) {
  throw "Không tìm thấy Firebase service account: $ServiceAccountPath"
}

if (-not $SkipDocker) {
  Assert-Command "docker" "Cài Docker Desktop hoặc chạy script với -SkipDocker nếu bạn đã có PostgreSQL local."
  docker compose up -d postgres redis minio
}

$env:DATABASE_URL = $DatabaseUrl
$env:DATA_BACKEND = "postgres"
$env:AUTH_MODE = "production"
$env:ALLOW_DEMO_AUTH = "false"
$env:FIREBASE_AUTH_ENABLED = "true"
$env:FIREBASE_PROJECT_ID = "smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS = $ServiceAccountPath
$env:CORS_ORIGIN = $CorsOrigin

npm run migrate
if (-not $SkipSeed) {
  npm run seed
}

npm start
