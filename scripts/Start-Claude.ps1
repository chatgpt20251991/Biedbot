# Explicit, session-only Claude opt-in. Never write the API key to disk or logs.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path -Parent $PSScriptRoot
if (-not $env:BIEDBOT_DATA_DIR) { $env:BIEDBOT_DATA_DIR = Join-Path $env:LOCALAPPDATA 'BiedBotEdge' }
$lockFile = Join-Path $env:BIEDBOT_DATA_DIR 'app.lock'
if (Test-Path -LiteralPath $lockFile) {
    $other = 0
    [void][int]::TryParse((Get-Content -LiteralPath $lockFile -Raw).Trim(), [ref]$other)
    if ($other -gt 0 -and (Get-Process -Id $other -ErrorAction SilentlyContinue)) {
        throw 'Sluit de draaiende agent eerst af via Agent & controle > Agent afsluiten. Alleen het browservenster sluiten is niet voldoende.'
    }
}
$node = Join-Path $env:LOCALAPPDATA 'BiedBotEdgeApp\runtime\node.exe'
if (-not (Test-Path -LiteralPath $node)) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $node = $command.Source } else { throw 'Node.js ontbreekt. Voer eerst INSTALLER_BiedBot.cmd uit.' }
}
& $node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.16 of nieuwer nodig. Voer de installer uit.' }
Write-Host ''
Write-Host 'BiedBot met jouw Claude API' -ForegroundColor Cyan
Write-Host 'Dit activeert classificeren EN schrijven. Het activeert geen live Marktplaats-verzending.'
Write-Host 'Gesprekstekst gaat naar Anthropic. API-gebruik kan geld kosten op jouw account.'
Write-Host 'Gebruik geen onnodige persoonsgegevens. De sleutel blijft alleen in dit proces en de agent.'
Write-Host 'De app heeft een gezamenlijke daglimiet voor AI-verzoeken. Dit is geen geldbudget.'
if ((Read-Host 'Typ CLAUDE om dit voor deze sessie te activeren') -cne 'CLAUDE') { throw 'Niet geactiveerd.' }
$secure = Read-Host 'Jouw Anthropic API-sleutel (invoer is afgeschermd)' -AsSecureString
$pointer = [IntPtr]::Zero
$names = @('ANTHROPIC_API_KEY','BIEDBOT_WRITER_PROVIDER','BIEDBOT_AI_PROVIDER')
$prior = @{}
foreach ($name in $names) { $prior[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not $plain -or $plain.Length -gt 4096 -or $plain -match '\s') { throw 'Ongeldige sleutel. Er is niets gestart.' }
    $env:ANTHROPIC_API_KEY = $plain
    $plain = $null
    $env:BIEDBOT_WRITER_PROVIDER = 'anthropic'
    $env:BIEDBOT_AI_PROVIDER = 'anthropic'
    Write-Host 'Starten. Houd dit venster open. Sluit de agent via de app af als je klaar bent.'
    & $node (Join-Path $root 'src\server.mjs') --open
    if ($LASTEXITCODE -ne 0) { throw 'Agent gestopt met een fout. Controleer de melding hierboven.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$prior[$name],'Process') }
    $plain = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secure) { $secure.Dispose() }
}
