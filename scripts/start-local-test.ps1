$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cloudUrl = if ($env:POLLEK_CLOUD_URL) { $env:POLLEK_CLOUD_URL } else { "http://127.0.0.1:8790" }
$lcpExe = "C:\Users\DELL\Documents\Codex\2026-06-26\chat-github-aecinfraconnect-antig-pollen-dek\repo\target\debug\local-control-plane.exe"

Write-Host "Starting Pollek Cloud dev server at $cloudUrl"
Start-Process -FilePath "node" -ArgumentList "apps/api/server.mjs" -WorkingDirectory $repoRoot -WindowStyle Hidden

if (Test-Path -LiteralPath $lcpExe) {
  Write-Host "Starting Local Control Plane at http://127.0.0.1:43891"
  $env:DEK_LCP_AUTH_DISABLE = "1"
  $env:DEK_CLOUD_URL = $cloudUrl
  $env:DEK_CLOUD_API_KEY = "local-dev-cloud-key"
  Start-Process -FilePath $lcpExe -WorkingDirectory (Split-Path -Parent (Split-Path -Parent $lcpExe)) -WindowStyle Hidden
} else {
  Write-Warning "Local Control Plane executable not found: $lcpExe"
}

Start-Sleep -Seconds 3
npm run test:lcp
