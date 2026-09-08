# Personal-user pilot bootstrap. No admin, no firewall changes, no AV exclusions.
[CmdletBinding()]
param(
    [switch]$StartNow,
    [string]$AppRoot = (Join-Path $env:LOCALAPPDATA 'BiedBotEdgeApp'),
    [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'BiedBotEdge'),
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
    [string]$RuntimePath,
    [switch]$Offline
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Get-BiedBotHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$homeRoot = [IO.Path]::GetFullPath($AppRoot)
$dataRoot = [IO.Path]::GetFullPath($DataRoot)
$desktopRoot = [IO.Path]::GetFullPath($DesktopDirectory)
if ($homeRoot -eq [IO.Path]::GetPathRoot($homeRoot) -or $dataRoot -eq [IO.Path]::GetPathRoot($dataRoot)) { throw 'Een schijfhoofdmap is geen installatie- of gegevensmap.' }
if ($dataRoot.StartsWith($homeRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or $homeRoot.StartsWith($dataRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or $homeRoot -eq $dataRoot) { throw 'App- en gegevensmap moeten gescheiden zijn.' }
New-Item -ItemType Directory -Force -Path (Join-Path $homeRoot 'logs') | Out-Null
$logPath = Join-Path $homeRoot ('logs\install-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '.txt')
Start-Transcript -LiteralPath $logPath | Out-Null
$stagingRoot = $null
$installedNewVersion = $false
$priorFiles = @{}
try {
$packageRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$') { throw 'Ongeldige pakketversie.' }
$versionsRoot = [IO.Path]::GetFullPath((Join-Path $homeRoot 'versions'))
$versionRoot = Join-Path (Join-Path $homeRoot 'versions') $version
$runtimeRoot = Join-Path $homeRoot 'runtime'
$nodeExe = Join-Path $runtimeRoot 'node.exe'
Write-Host 'BiedBot Edge: demonstratie-installatie. Geen automatische afschrijving of echte verkopers.' -ForegroundColor Cyan
$lockFile = Join-Path $dataRoot 'app.lock'
if (Test-Path $lockFile) {
    $runningId = 0
    [void][int]::TryParse((Get-Content $lockFile -Raw), [ref]$runningId)
    if ($runningId -gt 0 -and (Get-Process -Id $runningId -ErrorAction SilentlyContinue)) {
        throw 'BiedBot draait nog. Sluit de agent af via Agent & controle voordat je installeert.'
    }
}
# SHA-256 detects corrupted/mismatched package files. This is NOT a publisher code signature.
$manifestFile = Join-Path $packageRoot 'MANIFEST.sha256.json'
if (-not (Test-Path $manifestFile)) { throw 'Integriteitsmanifest ontbreekt. Pak het volledige ZIP-bestand uit.' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne 1 -or @($manifest.files).Count -eq 0) { throw 'Ongeldig of leeg integriteitsmanifest.' }
$seenPaths = @{}
foreach ($entry in $manifest.files) {
    if ($entry.path -isnot [string] -or $entry.path -match '(^/|\\|:|\x00|(^|/)\.\.?(/|$))' -or $entry.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or $seenPaths.ContainsKey($entry.path)) { throw 'Ongeldig of dubbel manifestpad.' }
    $seenPaths[$entry.path] = $true
    $path = Join-Path $packageRoot $entry.path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Bestand ontbreekt: $($entry.path)" }
    $inspectPath = Get-Item -LiteralPath $path
    while ($inspectPath.FullName -ne $packageRoot) {
        if ($inspectPath.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Pakket bevat een niet-toegestane koppeling.' }
        $parentPath = Split-Path -Parent $inspectPath.FullName
        if (-not $parentPath) { throw 'Manifestpad ligt buiten de pakketmap.' }
        $inspectPath = Get-Item -LiteralPath $parentPath
    }
    if ((Get-BiedBotHash $path) -ne $entry.sha256) { throw "Controle mislukt: $($entry.path)" }
}
foreach ($required in @('src/server.mjs','scripts/Start-App.ps1','scripts/New-Shortcut.ps1','package.json')) { if (-not $seenPaths.ContainsKey($required)) { throw "Verplicht pakketbestand ontbreekt: $required" } }
New-Item -ItemType Directory -Force -Path $homeRoot | Out-Null
if ($RuntimePath -and -not (Test-Path -LiteralPath $nodeExe)) {
    $candidate = [IO.Path]::GetFullPath($RuntimePath)
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
    if ((Get-AuthenticodeSignature -LiteralPath $candidate).Status -ne 'Valid') { throw 'De digitale handtekening van de opgegeven runtime is niet geldig. Er wordt niets uitgevoerd.' }
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    Copy-Item -LiteralPath $candidate -Destination $nodeExe
}
if (-not (Test-Path $nodeExe)) {
    if ($Offline) { throw 'OFFLINE_RUNTIME_ONTBREEKT: geen lokale runtime. Verbind met internet en voer de installer opnieuw uit, of geef een officieel ondertekende node.exe via -RuntimePath.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Deze pilot vereist 64-bits Windows.' }
    $official = 'https://nodejs.org/dist/latest-v24.x/'
    $scratch = Join-Path ([IO.Path]::GetTempPath()) ('BiedBot-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $scratch | Out-Null
    try {
        Write-Host 'Officiele Node.js 24-runtime en controlesom ophalen...'
        $sums = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 45 -Uri ($official + 'SHASUMS256.txt')).Content
        $pattern = '(?m)^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-' + $arch + '\.zip)\s*$'
        $match = [regex]::Match([string]$sums, $pattern)
        if (-not $match.Success) { throw 'Officiele Windows-runtime niet gevonden in controlesommen.' }
        $file = $match.Groups[2].Value
        $download = Join-Path $scratch $file
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri ($official + $file) -OutFile $download
        if ((Get-BiedBotHash $download) -ne $match.Groups[1].Value.ToLowerInvariant()) { throw 'Runtimecontrolesom ongeldig. Er wordt niets uitgevoerd.' }
        Expand-Archive -LiteralPath $download -DestinationPath $scratch
        $extracted = Join-Path $scratch ($file -replace '\.zip$','')
        $candidateNode = Join-Path $extracted 'node.exe'
        if (-not (Test-Path $candidateNode)) { throw 'node.exe ontbreekt in het officiele pakket.' }
        Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
        $signature = Get-AuthenticodeSignature -FilePath $candidateNode
        if ($signature.Status -ne 'Valid') { throw 'De digitale handtekening van node.exe kon niet worden bevestigd. Controleer certificaatvalidatie en verbinding; niet negeren.' }
        New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
        Copy-Item -Path (Join-Path $extracted '*') -Destination $runtimeRoot -Recurse -Force
        Set-Content -LiteralPath (Join-Path $runtimeRoot 'BIEDBOT_RUNTIME_SOURCE.txt') -Value ($official + $file + "`r`nSHA256: " + $match.Groups[1].Value) -Encoding UTF8
    } catch { throw ('RUNTIME_DOWNLOAD_GESTOPT: controleer internet, proxybeleid en certificaatvalidatie. Er is geen beveiligingscontrole overgeslagen. ' + $_.Exception.Message) }
    finally {
        $scratchFull = [IO.Path]::GetFullPath($scratch)
        if (-not $scratchFull.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\BiedBot-', [StringComparison]::OrdinalIgnoreCase)) { throw 'Onveilig tijdelijk opruimpad.' }
        Remove-Item -LiteralPath $scratchFull -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
if ((Get-AuthenticodeSignature -LiteralPath $nodeExe).Status -ne 'Valid') { throw 'De runtimehandtekening kon niet worden bevestigd. Herstel certificaatvalidatie; beveiliging niet uitschakelen.' }
& $nodeExe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Runtime te oud. Verwijder alleen de runtime-map en probeer opnieuw, niet de gegevensmap.' }
if (Test-Path -LiteralPath $versionRoot) { throw 'Deze versie is al geinstalleerd. Verwijder eerst de app; de gegevens blijven daarbij standaard bewaard.' }
$stagingRoot = Join-Path $versionsRoot ($version + '.staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
foreach ($entry in $manifest.files) {
    $destination = Join-Path $stagingRoot $entry.path
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $packageRoot $entry.path) -Destination $destination
}
Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $stagingRoot 'MANIFEST.sha256.json')
# Publish a complete directory only. A failed subsequent activation restores the
# previous launcher, shortcut, version pointer and installation record.
if (-not ([IO.Path]::GetFullPath($stagingRoot).StartsWith($versionsRoot + '\',[StringComparison]::OrdinalIgnoreCase)) -or -not ([IO.Path]::GetFullPath($versionRoot).StartsWith($versionsRoot + '\',[StringComparison]::OrdinalIgnoreCase))) { throw 'Onveilig versiepad.' }
Move-Item -LiteralPath $stagingRoot -Destination $versionRoot
$stagingRoot = $null
$installedNewVersion = $true
foreach ($published in @((Join-Path $homeRoot 'BiedBot-Open.vbs'),(Join-Path $homeRoot 'current-version.txt'),(Join-Path $homeRoot 'installation.json'),(Join-Path $desktopRoot 'BiedBot Edge.lnk'))) {
    $priorFiles[$published] = if (Test-Path -LiteralPath $published -PathType Leaf) { [IO.File]::ReadAllBytes($published) } else { $null }
}
# No npm packages: the entire local app uses Node's built-in modules.
$starterPath = Join-Path $versionRoot 'scripts\Start-App.ps1'
$launcherPath = Join-Path $homeRoot 'BiedBot-Open.vbs'
$powershellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launchCode = @"
Set shell = CreateObject("WScript.Shell")
shell.Environment("PROCESS")("BIEDBOT_DATA_DIR") = "$dataRoot"
command = Chr(34) & "$powershellPath" & Chr(34) & " -NoLogo -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & "$starterPath" & Chr(34) & " -NodePath " & Chr(34) & "$nodeExe" & Chr(34)
If WScript.Arguments.Named.Exists("headless") Then command = command & " -NoBrowser"
shell.Run command, 0, False
"@
Set-Content -LiteralPath $launcherPath -Value $launchCode -Encoding Unicode
New-Item -ItemType Directory -Force -Path $desktopRoot | Out-Null
$shortcutPath = Join-Path $desktopRoot 'BiedBot Edge.lnk'
$iconPath = Join-Path $versionRoot 'assets\biedbot.ico'
. (Join-Path $PSScriptRoot 'New-Shortcut.ps1')
New-BiedBotShortcut -Path $shortcutPath -Target (Join-Path $env:WINDIR 'System32\wscript.exe') -Arguments ('"' + $launcherPath + '"') -WorkingDirectory $versionRoot -Icon $iconPath
Set-Content -LiteralPath (Join-Path $homeRoot 'current-version.txt') -Value $version -Encoding ASCII
@{format='biedbot-install-v1';appRoot=$homeRoot;dataRoot=$dataRoot;shortcut=$shortcutPath;version=$version} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $homeRoot 'installation.json') -Encoding UTF8
Write-Host "Geinstalleerd: $versionRoot" -ForegroundColor Green
Write-Host "Gegevens blijven apart bewaard: $dataRoot"
Write-Host 'Open de bureaubladsnelkoppeling en rond je inkoopprofiel af. Start de gratis demo.'
Write-Host 'Deze pilot is geen ondertekende productierelease. Livekoppeling en incasso staan uit.'
if ($StartNow) { Start-Process -FilePath $shortcutPath -WindowStyle Hidden }
} catch {
    $failure = $_
    foreach ($published in $priorFiles.Keys) {
        if ($null -ne $priorFiles[$published]) { [IO.File]::WriteAllBytes($published, [byte[]]$priorFiles[$published]) }
        elseif (Test-Path -LiteralPath $published -PathType Leaf) { Remove-Item -LiteralPath $published -Force }
    }
    foreach ($incomplete in @($stagingRoot, $(if ($installedNewVersion) { $versionRoot }))) {
        if ($incomplete -and (Test-Path -LiteralPath $incomplete)) {
            $full = [IO.Path]::GetFullPath($incomplete)
            if (-not $full.StartsWith($versionsRoot + '\',[StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Onveilig herstelpad; installatieherstel gestopt.' }
            Remove-Item -LiteralPath $full -Recurse -Force
        }
    }
    Write-Host ('INSTALLATIE_GESTOPT: ' + $failure.Exception.Message) -ForegroundColor Red
    Write-Host "Diagnoselog: $logPath"
    throw $failure
}
finally { Stop-Transcript | Out-Null }
