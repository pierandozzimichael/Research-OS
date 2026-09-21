$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $root "scripts\run-dev-server.cmd"
$pidFile = Join-Path $root ".apoe-research-os.pid"
$portFile = Join-Path $root ".apoe-research-os.port"
$logFile = Join-Path $root ".apoe-research-os.log"

function Open-ResearchSite([string]$Url) {
    $openInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $openInfo.FileName = $Url
    $openInfo.UseShellExecute = $true
    [void][System.Diagnostics.Process]::Start($openInfo)
}

function Test-PortOpen([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(200)) {
            return $false
        }
        $client.EndConnect($async)
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-ResearchApi([int]$Port) {
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create(
            "http://127.0.0.1:$Port/api/local-session"
        )
        $request.Method = "GET"
        $request.Timeout = 700
        $request.ReadWriteTimeout = 700
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) {
            return $false
        }
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        try {
            return $reader.ReadToEnd() -match '"writeToken"\s*:'
        } finally {
            $reader.Dispose()
        }
    } catch {
        return $false
    } finally {
        if ($null -ne $response) {
            $response.Dispose()
        }
    }
}

function Test-ResearchSite([int]$Port) {
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/")
        $request.Method = "GET"
        $request.Timeout = 1500
        $request.ReadWriteTimeout = 1500
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) {
            return $false
        }
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        try {
            $html = $reader.ReadToEnd()
            return $html -match 'Research OS'
        } finally {
            $reader.Dispose()
        }
    } catch {
        return $false
    } finally {
        if ($null -ne $response) {
            $response.Dispose()
        }
    }
}

# Reuse a healthy server started by an earlier click.
if ((Test-Path -LiteralPath $pidFile) -and (Test-Path -LiteralPath $portFile)) {
    $savedPid = [int](Get-Content -Raw -LiteralPath $pidFile)
    $savedPort = [int](Get-Content -Raw -LiteralPath $portFile)
    $savedUrl = "http://127.0.0.1:$savedPort/"
    if (
        (Get-Process -Id $savedPid -ErrorAction SilentlyContinue) -and
        (Test-ResearchApi $savedPort) -and
        (Test-ResearchSite $savedPort)
    ) {
        Open-ResearchSite $savedUrl
        exit 0
    }
}

# PID values can be reused after a restart, so stale state is discarded unless
# the Research OS API itself answered above.
Remove-Item -LiteralPath $pidFile, $portFile -ErrorAction SilentlyContinue

# Select a port before launch so the browser always opens the exact URL.
$port = $null
foreach ($candidate in 3000..3020) {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $candidate
    )
    try {
        $listener.Start()
        $port = $candidate
        break
    } catch {
        continue
    } finally {
        $listener.Stop()
    }
}
if ($null -eq $port) {
    throw "No free local port was found between 3000 and 3020."
}

$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $env:ComSpec
$processInfo.Arguments = "/d /c `"`"$runner`" $port 1> `"$logFile`" 2>&1`""
$processInfo.WorkingDirectory = $root
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::Start($processInfo)

Set-Content -LiteralPath $pidFile -Value $process.Id
Set-Content -LiteralPath $portFile -Value $port

$url = "http://127.0.0.1:$port/"
$ready = $false
$deadline = [System.Diagnostics.Stopwatch]::StartNew()
while ($deadline.Elapsed.TotalSeconds -lt 58) {
    if ($process.HasExited) {
        break
    }
    if ((Test-PortOpen $port) -and (Test-ResearchApi $port) -and (Test-ResearchSite $port)) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 250
}

if (-not $ready) {
    if (-not $process.HasExited) {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
    }
    Remove-Item -LiteralPath $pidFile, $portFile -ErrorAction SilentlyContinue
    $logHint = if (Test-Path -LiteralPath $logFile) { " Startup details were saved to $logFile." } else { "" }
    throw "The APOE Research OS did not become ready within 58 seconds.$logHint"
}

Open-ResearchSite $url
