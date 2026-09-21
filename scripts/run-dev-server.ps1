param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 65535)]
    [int]$Port
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if ($null -ne $nodeCommand) {
    $node = $nodeCommand.Source
} else {
    $node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path -LiteralPath $node)) {
    [Console]::Error.WriteLine("Research OS requires Node.js 22.13 or newer. Install Node.js or open the project in Codex once so its bundled runtime is available.")
    exit 127
}

$nodeVersion = [version](& $node -p "process.versions.node")
if ($nodeVersion -lt [version]"22.13.0") {
    [Console]::Error.WriteLine("Research OS requires Node.js 22.13 or newer; found $nodeVersion.")
    exit 127
}

$env:WRANGLER_LOG_PATH = Join-Path $projectRoot ".wrangler\wrangler.log"

& $node (Join-Path $scriptRoot "check-private-build.mjs") public
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $node (Join-Path $scriptRoot "build-ai-index.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $node (Join-Path $projectRoot "node_modules\vinext\dist\cli.js") dev --hostname 127.0.0.1 --port $Port
exit $LASTEXITCODE
