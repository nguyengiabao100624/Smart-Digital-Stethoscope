param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceAccountPath,

  [string]$OrganizationId = "org_default_clinic"
)

$ErrorActionPreference = "Stop"

$resolvedPath = Resolve-Path -LiteralPath $ServiceAccountPath
$env:FIREBASE_AUTH_ENABLED = "true"
$env:GOOGLE_APPLICATION_CREDENTIALS = $resolvedPath.Path

Write-Host "Using Firebase service account: $($resolvedPath.Path)"
Write-Host "Setting doctor claims..."
npm run firebase:claims -- sx6V0vpXCzdFEnn5MrTSiPIngyw2 doctor $OrganizationId

Write-Host "Setting patient claims..."
npm run firebase:claims -- k5v6vTvpAuQUgXxzdX6cL58FokA3 patient $OrganizationId

Write-Host "Firebase custom claims configured for Smart Health demo users."
