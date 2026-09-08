param([switch]$RemoveLocalData)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'BiedBotEdgeApp'
$data = Join-Path $env:LOCALAPPDATA 'BiedBotEdge'
if (Test-Path (Join-Path $data 'app.lock')) {
    $pidValue = 0; [void][int]::TryParse((Get-Content (Join-Path $data 'app.lock') -Raw), [ref]$pidValue)
    if ($pidValue -gt 0 -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) { throw 'Sluit BiedBot eerst af via Agent & controle.' }
}
if ((Read-Host 'Typ VERWIJDER APP om de app te verwijderen; gegevens blijven standaard staan') -ne 'VERWIJDER APP') { return }
if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BiedBot Edge.lnk'
if (Test-Path $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
if ($RemoveLocalData -and (Read-Host 'Typ OOK MIJN GEGEVENS om gesprekken, browserprofielen en exports definitief te verwijderen') -eq 'OOK MIJN GEGEVENS') {
    if (Test-Path $data) { Remove-Item -LiteralPath $data -Recurse -Force }
}
Write-Host 'App verwijderd. Zonder de tweede expliciete bevestiging blijven de lokale gegevens bewaard.'
