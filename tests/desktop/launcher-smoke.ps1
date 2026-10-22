param([int]$WebPort = 56226, [int]$ApiPort = 56227)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$launcher = Join-Path $project 'scripts\desktop-start.ps1'
$stateDirectory = Join-Path $project 'artifacts\continuous-improvement\launcher-snapshot'
$stateFile = Join-Path $stateDirectory 'service.json'
$indexFile = Join-Path $project 'apps\web\dist\index.html'
$original = [IO.File]::ReadAllBytes($indexFile)
$oldAssetName = 'codex-release-probe-' + [Guid]::NewGuid().ToString('N') + '.js'
$oldAsset = Join-Path $project ('apps\web\dist\assets\' + $oldAssetName)
$probe = Join-Path $project ('apps\api\src\codex-launcher-probe-' + [Guid]::NewGuid().ToString('N') + '.ts')
$checks = New-Object 'System.Collections.Generic.List[string]'
function Start-TestSite {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $launcher + '"'),'-NoBrowser','-NoPause','-PreferredWebPort',$WebPort,'-PreferredApiPort',$ApiPort,'-StateDirectory',('"' + $stateDirectory + '"'))
    # Waiting for the process handle avoids waiting for pipes inherited by the persistent Node service.
    $invocation = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDirectory 'invocation.stdout.log') -RedirectStandardError (Join-Path $stateDirectory 'invocation.stderr.log')
    $null = $invocation.Handle
    if (-not $invocation.WaitForExit(30000)) { Stop-Process -Id $invocation.Id; throw 'Test launcher timed out' }
    if ($invocation.ExitCode -ne 0) { throw 'Test launcher failed; inspect invocation logs' }
    return Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
}
try {
    'export const archivedProbe = "old-release";' | Set-Content -LiteralPath $oldAsset -Encoding ASCII
    $first = Start-TestSite
    Write-Host '[CHECK] initial snapshot ready'
    if (-not (Test-Path -LiteralPath (Join-Path $first.siteDirectory 'index.html'))) { throw 'Published snapshot is missing' }
    $second = Start-TestSite
    Write-Host '[CHECK] reuse ready'
    if ($first.processId -ne $second.processId) { throw 'Healthy service was not reused' }
    $checks.Add('healthy-process-reused')
    $changed = [Text.Encoding]::UTF8.GetString($original) + '<!-- unpublished-build-marker -->'
    Remove-Item -LiteralPath $oldAsset
    [IO.File]::WriteAllText($indexFile, $changed, (New-Object Text.UTF8Encoding($false)))
    $page = Invoke-WebRequest -UseBasicParsing -Uri $first.url -TimeoutSec 5
    if ($page.Content.Contains('unpublished-build-marker')) { throw 'An unpromoted build leaked into the running site' }
    $checks.Add('unpublished-build-kept-out-of-running-site')
    $published = Start-TestSite
    Write-Host '[CHECK] explicit publication ready'
    $page = Invoke-WebRequest -UseBasicParsing -Uri $published.url -TimeoutSec 5
    if (-not $page.Content.Contains('unpublished-build-marker') -or $published.processId -eq $first.processId -or $published.url -ne $first.url) { throw 'Explicit publication did not update on the same address' }
    $checks.Add('explicit-publication-restarts-on-same-origin')
    $oldScript = Invoke-WebRequest -UseBasicParsing -Uri ($published.url + 'assets/' + $oldAssetName) -TimeoutSec 5
    if ($oldScript.StatusCode -ne 200 -or -not $oldScript.Content.Contains('old-release') -or $oldScript.Headers['Content-Type'] -notlike '*javascript*') { throw 'Previously published lazy chunk was lost' }
    if (Test-Path -LiteralPath (Join-Path $published.siteDirectory ('assets\' + $oldAssetName))) { throw 'Old asset test did not exercise the archive fallback' }
    $checks.Add('old-tab-hashed-asset-survives-publication')
    '// Temporary fingerprint probe, not imported by the application.' | Set-Content -LiteralPath $probe -Encoding ASCII
    $backend = Start-TestSite
    if ($backend.processId -eq $published.processId -or $backend.fingerprint -eq $published.fingerprint) { throw 'Backend-only change did not restart the service' }
    $checks.Add('backend-only-change-invalidates-running-service')
    $snapshotHtml = [IO.File]::ReadAllText((Join-Path $backend.siteDirectory 'index.html'))
    $asset = [regex]::Match($snapshotHtml, 'src="(/assets/[^" ]+\.js)"').Groups[1].Value
    $assetFile = Join-Path $backend.siteDirectory $asset.TrimStart('/')
    if (-not ([IO.Path]::GetFullPath($assetFile)).StartsWith($stateDirectory + [IO.Path]::DirectorySeparatorChar)) { throw 'Test asset outside generated test state' }
    '/* corrupt-generated-test-asset */' | Set-Content -LiteralPath $assetFile -Encoding ASCII
    $repaired = Start-TestSite
    if ([IO.File]::ReadAllText($assetFile).Contains('corrupt-generated-test-asset') -or $repaired.processId -eq $backend.processId) { throw 'Corrupt published snapshot was not repaired' }
    $checks.Add('corrupt-snapshot-rebuilt-before-restart')
    @{checks=$checks;status='pass';realModelCalls=0} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stateDirectory 'results.json') -Encoding UTF8
    $checks | ForEach-Object { Write-Host "[PASS] $_" }
} finally {
    [IO.File]::WriteAllBytes($indexFile, $original)
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe }
    if (Test-Path -LiteralPath $oldAsset) { Remove-Item -LiteralPath $oldAsset }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Stop -NoPause -PreferredWebPort $WebPort -StateDirectory $stateDirectory
}
