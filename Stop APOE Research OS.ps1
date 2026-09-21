$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".apoe-research-os.pid"
$portFile = Join-Path $root ".apoe-research-os.port"

if (Test-Path -LiteralPath $pidFile) {
    $savedPid = [int](Get-Content -Raw -LiteralPath $pidFile)
    $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
    if ($process) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $savedPid /T /F | Out-Null
    }
}

Remove-Item -LiteralPath $pidFile, $portFile -ErrorAction SilentlyContinue
