# Sets Fly secrets from backend/.env without printing values.
# Usage (from repo root): powershell -File backend/scripts/set-fly-secrets.ps1
# Requires: flyctl authenticated, app treksafe-api created, billing enabled.

$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envPath)) {
  throw "Missing backend/.env - copy from .env.example and fill values."
}

$map = @{}
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  $map[$key] = $val
}

$required = @(
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "MEDICAL_ENCRYPTION_KEY"
)
foreach ($k in $required) {
  if (-not $map.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($map[$k])) {
    throw "backend/.env missing required key: $k"
  }
}

$cors = if ($env:TREKSAFE_CORS_ORIGIN) { $env:TREKSAFE_CORS_ORIGIN } else { "https://treksafe-app.vercel.app" }

$jwtExpires = if ($map.ContainsKey('JWT_EXPIRES_IN') -and $map['JWT_EXPIRES_IN']) { $map['JWT_EXPIRES_IN'] } else { '24h' }
$cronMs = if ($map.ContainsKey('CRON_INTERVAL_MS') -and $map['CRON_INTERVAL_MS']) { $map['CRON_INTERVAL_MS'] } else { '60000' }

$argsList = @(
  "secrets", "set",
  "-a", "treksafe-api",
  "NODE_ENV=production",
  "PORT=3000",
  "API_PREFIX=/api",
  "SUPABASE_URL=$($map['SUPABASE_URL'])",
  "SUPABASE_SERVICE_ROLE_KEY=$($map['SUPABASE_SERVICE_ROLE_KEY'])",
  "JWT_SECRET=$($map['JWT_SECRET'])",
  "JWT_EXPIRES_IN=$jwtExpires",
  "MEDICAL_ENCRYPTION_KEY=$($map['MEDICAL_ENCRYPTION_KEY'])",
  "MAIL_DEV_FALLBACK=false",
  "CRON_INTERVAL_MS=$cronMs",
  "CORS_ORIGIN=$cors"
)

if ($map.ContainsKey("DATABASE_URL") -and $map["DATABASE_URL"]) {
  $argsList += "DATABASE_URL=$($map['DATABASE_URL'])"
}
if ($map.ContainsKey("BREVO_API_KEY") -and $map["BREVO_API_KEY"]) {
  $argsList += "BREVO_API_KEY=$($map['BREVO_API_KEY'])"
}
foreach ($smtpKey in @("SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM")) {
  if ($map.ContainsKey($smtpKey) -and $map[$smtpKey]) {
    $argsList += "$smtpKey=$($map[$smtpKey])"
  }
}

Write-Host "Setting Fly secrets for treksafe-api (values hidden)..."
& fly @argsList
if ($LASTEXITCODE -ne 0) { throw "fly secrets set failed with exit $LASTEXITCODE" }
Write-Host "Secrets applied. Deploy with: cd backend; fly deploy"
