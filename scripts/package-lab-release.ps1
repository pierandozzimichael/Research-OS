param(
    [string]$OutputDirectory = "dist\releases",
    [string]$Version = "",
    [ValidateSet("zip", "tar.gz", "all")]
    [string]$ArchiveFormat = "all",
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
$zipArchive = Join-Path $outputRoot "research-os-lab-$safeVersion.zip"
$tarArchive = Join-Path $outputRoot "research-os-lab-$safeVersion.tar.gz"
$excluded = @(
    ".git", ".codex", ".codex_tmp", ".agents", ".openai", ".research-os",
    ".wrangler", "node_modules", "dist", "build", "out", ".next", ".vinext",
    "vault", "projects", "tmp", "temp", "outputs", "work", ".pnpm-store",
    ".mcp.json", ".apoe-research-os.log", ".apoe-research-os.pid",
    ".apoe-research-os.port", "tsconfig.tsbuildinfo"
)

function Copy-Tree([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($excluded -contains $item.Name -or $item.Name -like ".research-os-*.log") { continue }
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
    if ($null -eq $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
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
    if ($ArchiveFormat -in @("zip", "all")) {
        if (Test-Path -LiteralPath $zipArchive) { Remove-Item -LiteralPath $zipArchive -Force }
        Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipArchive -CompressionLevel Optimal
        $stableZip = Join-Path $outputRoot "research-os-lab-latest-windows.zip"
        Copy-Item -LiteralPath $zipArchive -Destination $stableZip -Force
        Write-Host "Created $zipArchive" -ForegroundColor Green
        Write-Host "Created $stableZip" -ForegroundColor Green
    }
    if ($ArchiveFormat -in @("tar.gz", "all")) {
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if ($null -eq $tar) { $tar = Get-Command tar -ErrorAction SilentlyContinue }
        if ($null -eq $tar) { throw "tar.exe is required to create the macOS/Linux archive." }
        if (Test-Path -LiteralPath $tarArchive) { Remove-Item -LiteralPath $tarArchive -Force }
        if ($IsLinux -or $IsMacOS) {
            $unixFiles = @(
                Get-ChildItem -LiteralPath $staging -Filter "*.command" -File
                Get-ChildItem -LiteralPath (Join-Path $staging "scripts") -Filter "*.sh" -File
            )
            if ($unixFiles.Count -gt 0) {
                & chmod +x $unixFiles.FullName
                if ($LASTEXITCODE -ne 0) { throw "Could not mark Unix launchers executable." }
            }
        }
        Push-Location $staging
        try {
            & $tar.Source -czf $tarArchive -C $staging .
            if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE." }
        } finally {
            Pop-Location
        }
        $stableTar = Join-Path $outputRoot "research-os-lab-latest-macos.tar.gz"
        Copy-Item -LiteralPath $tarArchive -Destination $stableTar -Force
        Write-Host "Created $tarArchive" -ForegroundColor Green
        Write-Host "Created $stableTar" -ForegroundColor Green
    }
    Write-Host "Profile: demo (private vault excluded)"
} finally {
    if (-not $KeepStaging -and (Test-Path -LiteralPath $staging)) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    } elseif ($KeepStaging) {
        Write-Host "Staging kept at $staging"
    }
}
