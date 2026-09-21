$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $scriptRoot "research-mcp.mjs"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if ($null -ne $nodeCommand) {
    $node = $nodeCommand.Source
} else {
    $node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path -LiteralPath $node)) {
    [Console]::Error.WriteLine("Research OS MCP requires Node.js 22.13 or newer. Install Node.js or open the project in Codex once so its bundled runtime is available.")
    exit 127
}

$nodeVersion = [version](& $node -p "process.versions.node")
if ($nodeVersion -lt [version]"22.13.0") {
    [Console]::Error.WriteLine("Research OS MCP requires Node.js 22.13 or newer; found $nodeVersion.")
    exit 127
}

& $node $server
exit $LASTEXITCODE
