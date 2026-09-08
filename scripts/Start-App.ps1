[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NodePath, [switch]$NoBrowser, [switch]$NoErrorDialog)
$ErrorActionPreference = 'Stop'
$data = $env:BIEDBOT_DATA_DIR
if (-not $data) { throw 'BIEDBOT_DATA_DIR ontbreekt; gebruik de geinstalleerde snelkoppeling.' }
$logs = Join-Path $data 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
try {
    if (-not $NoBrowser) {
        $browsers = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
        )
        if (-not ($browsers | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) { throw 'BROWSER_ONTBREEKT: installeer Microsoft Edge of Google Chrome en open BiedBot opnieuw.' }
    }
    $server = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\server.mjs'
    $arguments = '"' + $server + '"'
    if (-not $NoBrowser) { $arguments += ' --open' }
    $process = Start-Process -FilePath $NodePath -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ($stamp + '-stdout.txt')) -RedirectStandardError (Join-Path $logs ($stamp + '-stderr.txt'))
    if ($process.ExitCode -ne 0) { throw 'START_MISLUKT: bekijk het stderr-bestand in de logmap en probeer opnieuw na herstel.' }
} catch {
    $message = $_.Exception.Message + "`r`nDiagnoselog: $logs"
    $message | Set-Content -LiteralPath (Join-Path $logs ($stamp + '-failure.txt')) -Encoding UTF8
    if (-not $NoBrowser -and -not $NoErrorDialog) { (New-Object -ComObject WScript.Shell).Popup($message, 30, 'BiedBot start gestopt', 16) | Out-Null }
    throw
}
