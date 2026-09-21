param(
    [switch]$SkipInstall,
    [switch]$NoShortcut,
    [int]$CommandTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Resolve-CommandPath([string[]]$Names) {
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) { return $command.Source }
    }
    return $null
}

function Invoke-BoundedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    $info = [System.Diagnostics.ProcessStartInfo]::new()
    if ($FilePath -match '\.(cmd|bat)$') {
        $info.FileName = $env:ComSpec
        $info.Arguments = '/d /c "' + $FilePath + '" ' + $Arguments
    } else {
        $info.FileName = $FilePath
        $info.Arguments = $Arguments
    }
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "Could not start $FilePath." }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        try { $process.Kill($true) } catch { }
        throw "Command timed out after $TimeoutSeconds seconds: $FilePath $Arguments"
    }
    $process.WaitForExit()
    $outText = $stdout.GetAwaiter().GetResult()
    $errText = $stderr.GetAwaiter().GetResult()
    if ($outText.Trim()) { Write-Host $outText.TrimEnd() }
    if ($errText.Trim()) { Write-Host $errText.TrimEnd() -ForegroundColor DarkGray }
    if ($process.ExitCode -ne 0) {
        throw "Command failed with exit code $($process.ExitCode): $FilePath $Arguments"
    }
}

function Quote-Arg([string]$Value) {
    return '"' + ($Value -replace '"', '\"') + '"'
}

$node = Resolve-CommandPath @("node.exe", "node")
if ($null -eq $node) {
    $bundled = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    if (Test-Path -LiteralPath $bundled) { $node = $bundled }
}
if ($null -eq $node) {
    throw "Node.js 22.13 or newer is required. Install it from https://nodejs.org/ and run this installer again."
}
$nodeVersion = [version](& $node -p "process.versions.node")
if ($nodeVersion -lt [version]"22.13.0") {
    throw "Research OS requires Node.js 22.13 or newer; found $nodeVersion."
}

$pnpm = Resolve-CommandPath @("pnpm.cmd", "pnpm.exe", "pnpm")
$pnpmArgsPrefix = ""
if ($null -eq $pnpm) {
    $corepack = Resolve-CommandPath @("corepack.cmd", "corepack.exe", "corepack")
    if ($null -ne $corepack) {
        $pnpm = $corepack
        $pnpmArgsPrefix = "pnpm "
    }
}
if ($null -eq $pnpm) {
    throw "pnpm was not found. Install Node.js 22.13+ (which includes Corepack), then run this installer again."
}

Write-Host "Research OS lab setup" -ForegroundColor Cyan
Write-Host "  Node.js $nodeVersion"
Write-Host "  Project $root"

if (-not $SkipInstall) {
    Write-Host "Installing locked dependencies (bounded to $CommandTimeoutSeconds seconds)..." -ForegroundColor Cyan
    Invoke-BoundedCommand -FilePath $pnpm -Arguments ($pnpmArgsPrefix + "install --frozen-lockfile") -TimeoutSeconds $CommandTimeoutSeconds -WorkingDirectory $root
}

Write-Host "Refreshing AI navigation and checking the project..." -ForegroundColor Cyan
Invoke-BoundedCommand -FilePath $pnpm -Arguments ($pnpmArgsPrefix + "ai:sync") -TimeoutSeconds 90 -WorkingDirectory $root
Invoke-BoundedCommand -FilePath $pnpm -Arguments ($pnpmArgsPrefix + "ai:manifest") -TimeoutSeconds 90 -WorkingDirectory $root
Invoke-BoundedCommand -FilePath $pnpm -Arguments ($pnpmArgsPrefix + "schema:validate") -TimeoutSeconds 90 -WorkingDirectory $root
Invoke-BoundedCommand -FilePath $pnpm -Arguments ($pnpmArgsPrefix + "ai:doctor") -TimeoutSeconds 90 -WorkingDirectory $root

if (-not $NoShortcut) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if ($desktop) {
        $shortcutPath = Join-Path $desktop "APOE Research OS.lnk"
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
        $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $root "Start APOE Research OS.ps1") + '"'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = "Start the local-first APOE Research OS"
        $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,21"
        $shortcut.Save()
        Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green
    }
}

Write-Host "Lab setup complete. Double-click 'APOE Research OS.lnk' or run 'Start APOE Research OS.ps1'." -ForegroundColor Green
