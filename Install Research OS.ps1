$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root "scripts\install-labmate.ps1") @args
exit $LASTEXITCODE
