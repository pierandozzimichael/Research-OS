param(
    [string]$OutputDirectory = "dist\releases",
    [string]$Version = "",
    [switch]$KeepStaging
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $root "package.json") | ConvertFrom-Json
if (-not $Version) { $Version = [string]$package.version }
$safeVersion = $Version -replace '[^0-9A-Za-z._-]', '-'
$outputRoot = Join-Path $root $OutputDirectory
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("research-os-release-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $outputRoot "research-os-lab-$safeVersion.zip"
$excluded = @(".git", ".codex", ".codex_tmp", ".research-os", ".wrangler", "node_modules", "dist", "build", "out", ".next", ".vinext", "vault", "projects", "tmp", "temp", "outputs", "work", ".pnpm-store")

function Copy-Tree([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($excluded -contains $item.Name) { continue }
        $target = Join-Path $Destination $item.Name
        if ($item.PSIsContainer) { Copy-Tree $item.FullName $target }
        else { Copy-Item -LiteralPath $item.FullName -Destination $target -Force }
    }
}

try {
    Copy-Tree $root $staging
    Copy-Item -LiteralPath (Join-Path $root "examples\demo-projects.json") -Destination (Join-Path $staging "projects.json") -Force
    Copy-Item -LiteralPath (Join-Path $root "examples\demo-vault") -Destination (Join-Path $staging "vault") -Recurse -Force
    foreach ($name in @("START_HERE.md", "CLAUDE.md", "CURRENT_STATE.md", "NEXT_ACTIONS.md", "ROADMAP.md", "TRAPS.md")) {
        Copy-Item -LiteralPath (Join-Path $root "examples\demo-root\$name") -Destination (Join-Path $staging $name) -Force
    }
    $staleManifest = Join-Path $staging "AI_MANIFEST.json"
    if (Test-Path -LiteralPath $staleManifest) { Remove-Item -LiteralPath $staleManifest -Force }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand) {
        Push-Location $staging
        try {
            & $nodeCommand.Source (Join-Path $root "scripts\build-ai-index.mjs")
            if ($LASTEXITCODE -ne 0) { throw "Could not build demo AI navigation." }
            & $nodeCommand.Source (Join-Path $root "scripts\ai-readiness.mjs") --write-manifest
            if ($LASTEXITCODE -ne 0) { throw "Could not build the demo AI manifest." }
        } finally {
            Pop-Location
        }
    }
    $manifest = [ordered]@{
        package = "apoe-research-os"
        version = $Version
        profile = "demo"
        generated_at = [DateTime]::UtcNow.ToString("o")
        private_data_included = $false
        notes = @(
            "This archive contains synthetic demo records only.",
            "Connect a separately managed lab vault after installation; never upload unpublished vault data to a public repository."
        )
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $staging "RELEASE_MANIFEST.json") -Encoding UTF8
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $archive -CompressionLevel Optimal
    Write-Host "Created $archive" -ForegroundColor Green
    Write-Host "Profile: demo (private vault excluded)"
} finally {
    if (-not $KeepStaging -and (Test-Path -LiteralPath $staging)) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    } elseif ($KeepStaging) {
        Write-Host "Staging kept at $staging"
    }
}
