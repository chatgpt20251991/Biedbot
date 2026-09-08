# Personal-user pilot bootstrap. No admin, no firewall changes, no AV exclusions.
# Not executed on Windows in this build environment; see docs/RELEASE_STATUS.md.
param([switch]$StartNow)
$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Ongeldige pakketversie.' }
$homeRoot = Join-Path $env:LOCALAPPDATA 'BiedBotEdgeApp'
$dataRoot = Join-Path $env:LOCALAPPDATA 'BiedBotEdge'
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
$manifest = Get-Content $manifestFile -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    if ($entry.path -match '(^/|\\|\.\.)') { throw 'Ongeldig manifestpad.' }
    $path = Join-Path $packageRoot $entry.path
    if (-not (Test-Path -LiteralPath $path)) { throw "Bestand ontbreekt: $($entry.path)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Controle mislukt: $($entry.path)" }
}
New-Item -ItemType Directory -Force -Path $homeRoot,$versionRoot | Out-Null
if (-not (Test-Path $nodeExe)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Deze pilot vereist 64-bits Windows.' }
    $official = 'https://nodejs.org/dist/latest-v24.x/'
    $scratch = Join-Path ([IO.Path]::GetTempPath()) ('BiedBot-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $scratch | Out-Null
    try {
        Write-Host 'Officiele Node.js 24-runtime en controlesom ophalen...'
        $sums = (Invoke-WebRequest -UseBasicParsing -Uri ($official + 'SHASUMS256.txt')).Content
        $pattern = '(?m)^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-' + $arch + '\.zip)\s*$'
        $match = [regex]::Match([string]$sums, $pattern)
        if (-not $match.Success) { throw 'Officiele Windows-runtime niet gevonden in controlesommen.' }
        $file = $match.Groups[2].Value
        $download = Join-Path $scratch $file
        Invoke-WebRequest -UseBasicParsing -Uri ($official + $file) -OutFile $download
        if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value.ToLowerInvariant()) { throw 'Runtimecontrolesom ongeldig. Er wordt niets uitgevoerd.' }
        Expand-Archive -LiteralPath $download -DestinationPath $scratch
        $extracted = Join-Path $scratch ($file -replace '\.zip$','')
        $candidateNode = Join-Path $extracted 'node.exe'
        if (-not (Test-Path $candidateNode)) { throw 'node.exe ontbreekt in het officiele pakket.' }
        $signature = Get-AuthenticodeSignature -FilePath $candidateNode
        if ($signature.Status -ne 'Valid') { throw 'De digitale handtekening van node.exe kon niet worden bevestigd. Controleer certificaatvalidatie en verbinding; niet negeren.' }
        New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
        Copy-Item -Path (Join-Path $extracted '*') -Destination $runtimeRoot -Recurse -Force
        Set-Content -LiteralPath (Join-Path $runtimeRoot 'BIEDBOT_RUNTIME_SOURCE.txt') -Value ($official + $file + "`r`nSHA256: " + $match.Groups[1].Value) -Encoding UTF8
    } finally { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
}
& $nodeExe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Runtime te oud. Verwijder alleen de runtime-map en probeer opnieuw, niet de gegevensmap.' }
foreach ($name in @('src','assets','docs','scripts','package.json','README.md','START_HIER.html')) {
    $source = Join-Path $packageRoot $name
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $versionRoot -Recurse -Force }
}
# No npm packages: the entire local app uses Node's built-in modules.
$serverPath = Join-Path $versionRoot 'src\server.mjs'
$launcherPath = Join-Path $homeRoot 'BiedBot-Open.vbs'
$launchCode = @"
Set shell = CreateObject("WScript.Shell")
shell.Run Chr(34) & "$nodeExe" & Chr(34) & " " & Chr(34) & "$serverPath" & Chr(34) & " --open", 0, False
"@
Set-Content -LiteralPath $launcherPath -Value $launchCode -Encoding ASCII
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'BiedBot Edge.lnk'))
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcherPath + '"'
$shortcut.WorkingDirectory = $versionRoot
$iconPath = Join-Path $versionRoot 'assets\biedbot.ico'
if (Test-Path $iconPath) { $shortcut.IconLocation = $iconPath }
$shortcut.Description = 'BiedBot Edge - lokale demo, geen live Marktplaats-verzending'
$shortcut.Save()
Set-Content -LiteralPath (Join-Path $homeRoot 'current-version.txt') -Value $version -Encoding ASCII
Write-Host "Geinstalleerd: $versionRoot" -ForegroundColor Green
Write-Host "Gegevens blijven apart bewaard: $dataRoot"
Write-Host 'Open de bureaubladsnelkoppeling en rond je inkoopprofiel af. Start de gratis demo.'
Write-Host 'Deze pilot is geen ondertekende productierelease. Livekoppeling en incasso staan uit.'
if ($StartNow) { Start-Process -FilePath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'BiedBot Edge.lnk') }
