[CmdletBinding()]
param(
    [switch]$RemoveLocalData,
    [string]$AppRoot = (Join-Path $env:LOCALAPPDATA 'BiedBotEdgeApp'),
    [string]$ConfirmAppRemoval,
    [string]$ConfirmDataRemoval
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = [IO.Path]::GetFullPath($AppRoot).TrimEnd('\')
$recordPath = Join-Path $root 'installation.json'
if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { throw 'Installatiebewijs ontbreekt; automatische verwijdering is gestopt.' }
$record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($record.format -ne 'biedbot-install-v1' -or [IO.Path]::GetFullPath($record.appRoot).TrimEnd('\') -ne $root) { throw 'Installatiemap komt niet overeen met het installatiebewijs.' }
$data = [IO.Path]::GetFullPath($record.dataRoot).TrimEnd('\')
$shortcut = [IO.Path]::GetFullPath($record.shortcut)
foreach ($target in @($root,$data)) {
    if ($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\') -or $target -eq [Environment]::GetFolderPath('UserProfile') -or $target -eq $env:LOCALAPPDATA) { throw 'Onveilig verwijderpad.' }
    $inspect = $target
    while ($inspect) {
        if ((Test-Path -LiteralPath $inspect) -and ((Get-Item -LiteralPath $inspect -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Verwijderen via een directorykoppeling is niet toegestaan.' }
        $inspect = Split-Path -Parent $inspect
    }
}
if ($data -eq $root -or $data.StartsWith($root + '\',[StringComparison]::OrdinalIgnoreCase) -or $root.StartsWith($data + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'App- en gegevensmap zijn niet gescheiden.' }
if ((Split-Path -Leaf $shortcut) -ne 'BiedBot Edge.lnk') { throw 'Onverwacht snelkoppelingspad.' }
if (Test-Path (Join-Path $data 'app.lock')) {
    $pidValue = 0; [void][int]::TryParse((Get-Content (Join-Path $data 'app.lock') -Raw), [ref]$pidValue)
    if ($pidValue -gt 0 -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) { throw 'Sluit BiedBot eerst af via Agent & controle.' }
}
if (-not $ConfirmAppRemoval) { $ConfirmAppRemoval = Read-Host 'Typ VERWIJDER APP om de app te verwijderen; gegevens blijven standaard staan' }
if ($ConfirmAppRemoval -ne 'VERWIJDER APP') { return }
# Absolute, marker-matched targets and their ancestors were checked above.
if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
if ($RemoveLocalData) {
    if (-not $ConfirmDataRemoval) { $ConfirmDataRemoval = Read-Host 'Typ OOK MIJN GEGEVENS om gesprekken, browserprofielen en exports definitief te verwijderen' }
    if ($ConfirmDataRemoval -eq 'OOK MIJN GEGEVENS' -and (Test-Path -LiteralPath $data)) { Remove-Item -LiteralPath $data -Recurse -Force }
}
Write-Host 'App verwijderd. Zonder de tweede expliciete bevestiging blijven de lokale gegevens bewaard.'
