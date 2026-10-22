param(
    [switch]$NoBrowser,
    [switch]$NoPause,
    [switch]$Stop,
    [int]$PreferredWebPort = 56106,
    [int]$PreferredApiPort = 56107,
    [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'PoetryChecker')
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$StateDirectory = [IO.Path]::GetFullPath($StateDirectory)
$buildDirectory = Join-Path $project 'apps\web\dist'
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$node = Join-Path $runtime 'node\bin\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$statePath = Join-Path $StateDirectory 'service.json'
$stdout = Join-Path $StateDirectory 'service.stdout.log'
$stderr = Join-Path $StateDirectory 'service.stderr.log'
$mutex = New-Object System.Threading.Mutex($false, "Local\PoetryCheckerDesktop$PreferredWebPort")
$locked = $false
$exitCode = 0
$started = $false
$service = $null
function Get-FreePort([int]$preferred) {
    $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $preferred)
    try { $listener.Start(); return $listener.LocalEndpoint.Port }
    catch {
        $listener.Stop()
        $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        return $listener.LocalEndpoint.Port
    } finally { $listener.Stop() }
}
function Test-Service([string]$url, [string]$asset) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
        $ready = Invoke-RestMethod -Uri ($url + 'readyz') -TimeoutSec 3
        $model = Invoke-RestMethod -Uri ($url + 'api/v1/reading-suggestions/status') -TimeoutSec 3
        $scriptResponse = Invoke-WebRequest -UseBasicParsing -Uri ($url + $asset.TrimStart('/')) -TimeoutSec 3
        return ($page.StatusCode -eq 200 -and $page.Content.Contains($asset) -and $scriptResponse.StatusCode -eq 200 -and $scriptResponse.Headers['Content-Type'] -like '*javascript*' -and $ready.status -eq 'ready' -and $null -ne $model.configured)
    } catch { return $false }
}
function Stop-OwnedService($owned) {
    # PID and creation time were checked before reaching this function. Only its direct API child is stopped.
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($owned.Id)" | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -match 'apps[/\\]api[/\\]src[/\\]server\.ts'
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    Stop-Process -Id $owned.Id -ErrorAction SilentlyContinue
    $owned.WaitForExit(5000) | Out-Null
}
function Get-ContentHash([string]$file) {
    $stream = [IO.File]::OpenRead($file)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function Get-SourceFingerprint {
    # Only the aggregate hash is persisted. Environment values are never printed or copied into the site.
    $directories = @('apps\api\src','apps\web\dist','rules','data','fixtures\contracts') | ForEach-Object { Join-Path $project $_ }
    $directories += Get-ChildItem -LiteralPath (Join-Path $project 'packages') -Directory | ForEach-Object { Join-Path $_.FullName 'dist' }
    $records = New-Object 'System.Collections.Generic.List[string]'
    foreach ($directory in $directories) {
        if ($StateDirectory -eq $directory -or $StateDirectory.StartsWith($directory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a state folder outside application, build, rule and data directories.' }
        if (Test-Path -LiteralPath $directory) {
            Get-ChildItem -LiteralPath $directory -File -Recurse | Sort-Object FullName | ForEach-Object {
                $records.Add($_.FullName.Substring($project.Length) + ':' + (Get-ContentHash $_.FullName))
            }
        }
    }
    foreach ($relative in @('scripts\dev.mjs','scripts\desktop-start.ps1','apps\web\vite.config.ts','pnpm-lock.yaml','package.json','.env.local')) {
        $file = Join-Path $project $relative
        if (Test-Path -LiteralPath $file) { $records.Add($relative + ':' + (Get-ContentHash $file)) }
    }
    $runtimeFile = Get-Item -LiteralPath $node
    $records.Add($node + ':' + $runtimeFile.LastWriteTimeUtc.Ticks + ':' + $runtimeFile.Length)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($records -join "`n"))))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Test-SiteSnapshot([string]$site) {
    if (-not $site -or -not (Test-Path -LiteralPath $site)) { return $false }
    foreach ($file in (Get-ChildItem -LiteralPath $buildDirectory -File -Recurse)) {
        $relative = $file.FullName.Substring($buildDirectory.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
        $copy = Join-Path $site $relative
        if (-not (Test-Path -LiteralPath $copy) -or (Get-ContentHash $file.FullName) -ne (Get-ContentHash $copy)) { return $false }
    }
    return $true
}
function Prepare-Site([string]$fingerprint) {
    $site = Join-Path $StateDirectory "sites\$fingerprint"
    $stamp = "$site.ready"
    if (-not (Test-Path -LiteralPath $stamp) -or -not (Test-SiteSnapshot $site)) {
        New-Item -ItemType Directory -Path $site -Force | Out-Null
        Get-ChildItem -LiteralPath $buildDirectory -Force | Copy-Item -Destination $site -Recurse -Force
        if ((Get-SourceFingerprint) -ne $fingerprint) { throw 'Source changed while preparing the website. Finish the build and launch again.' }
        $fingerprint | Set-Content -LiteralPath $stamp -Encoding ASCII
    }
    return $site
}
try {
    try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Startup is already in progress. Try again in a moment.' }
    $state = $null
    if (Test-Path -LiteralPath $statePath) {
        try {
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            $candidate = Get-Process -Id $state.processId -ErrorAction Stop
            if ($state.project -eq $project -and $candidate.Path -eq $node -and $candidate.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.startTicks) { $service = $candidate }
        } catch { $service = $null }
    }
    if ($Stop) {
        if ($service) { Stop-OwnedService $service; Write-Host 'Website stopped.' }
        else { Write-Host 'No matching launcher service is running.' }
    } else {
        foreach ($file in @("$project\scripts\dev.mjs", "$project\node_modules\tsx\package.json", "$project\apps\web\dist\index.html")) {
            if (-not (Test-Path -LiteralPath $file)) { throw "Required file missing: $file. Run pnpm install and pnpm build in the project first." }
        }
        $html = Get-Content -LiteralPath "$project\apps\web\dist\index.html" -Raw
        $asset = [regex]::Match($html, 'src="(/assets/[^" ]+\.js)"').Groups[1].Value
        if (-not $asset) { throw 'Frontend build is incomplete. Run pnpm build first.' }
        $fingerprint = Get-SourceFingerprint
        if ($service -and $state.fingerprint -eq $fingerprint -and (Test-SiteSnapshot $state.siteDirectory) -and (Test-Service $state.url $asset)) {
            $url = $state.url
            Write-Host 'Reusing the running website.'
        } else {
            # Copy and verify the new static site before stopping the currently running version.
            $siteDirectory = Prepare-Site $fingerprint
            $targetWebPort = $PreferredWebPort
            $targetApiPort = $PreferredApiPort
            if ($service -and $state.requestedWebPort -eq $PreferredWebPort) { $targetWebPort = ([Uri]$state.url).Port }
            if ($service -and $state.requestedApiPort -eq $PreferredApiPort) { $targetApiPort = $state.apiPort }
            if ($service) { Stop-OwnedService $service }
            $webPort = Get-FreePort $targetWebPort
            $apiPort = Get-FreePort $targetApiPort
            while ($apiPort -eq $webPort) { $apiPort = Get-FreePort 0 }
            $url = "http://127.0.0.1:$webPort/"
            $env:PORT = [string]$apiPort
            $env:WEB_PORT = [string]$webPort
            $env:POETRY_DEV_MOCK = '0'
            $env:NODE_USE_SYSTEM_CA = '1'
            $env:POETRY_PREVIEW_DIST = $siteDirectory
            if ($webPort -ne $PreferredWebPort) { Write-Host "Preferred web port is busy. Using $webPort; browser data remains at the original address." }
            $service = Start-Process -FilePath $node -ArgumentList @('scripts/dev.mjs','--preview') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
            $started = $true
            @{processId=$service.Id;startTicks=$service.StartTime.ToUniversalTime().Ticks.ToString();project=$project;url=$url;apiPort=$apiPort;fingerprint=$fingerprint;siteDirectory=$siteDirectory;requestedWebPort=$PreferredWebPort;requestedApiPort=$PreferredApiPort} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
            $deadline = (Get-Date).AddSeconds(60)
            $ready = $false
            do {
                $service.Refresh()
                if ($service.HasExited) { throw "Service exited. See $stderr" }
                if (Test-Service $url $asset) { $ready = $true; break }
                Start-Sleep -Milliseconds 500
            } while ((Get-Date) -lt $deadline)
            if (-not $ready) { throw "Page and API did not become ready. See $stderr" }
        }
        Write-Host "Ready: $url"
        if (-not $NoBrowser) { Start-Process $url }
    }
} catch {
    Write-Host ('Startup failed: ' + $_.Exception.Message) -ForegroundColor Red
    if ($started -and $service -and -not $service.HasExited) { Stop-OwnedService $service }
    $exitCode = 1
    if (-not $NoPause) { [void](Read-Host 'Press Enter to close') }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
exit $exitCode
