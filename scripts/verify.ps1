$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

$manifestPath = Join-Path $repoRoot 'extension\\manifest.json'
if (-not (Test-Path $manifestPath)) { throw \"Missing: $manifestPath\" }

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) { throw 'manifest_version must be 3' }
if (-not $manifest.side_panel) { throw 'manifest missing side_panel' }
if (-not $manifest.background.service_worker) { throw 'manifest missing background.service_worker' }

$requiredFiles = @(
  'extension\\background.js',
  'extension\\content_isolated.js',
  'extension\\main_bridge.js',
  'extension\\sidepanel.html',
  'extension\\sidepanel.js',
  'extension\\options.html',
  'extension\\options.js'
)

foreach ($rel in $requiredFiles) {
  $p = Join-Path $repoRoot $rel
  if (-not (Test-Path $p)) { throw \"Missing: $p\" }
}

Write-Host 'OK: Phase 0 file layout and manifest look valid.'
