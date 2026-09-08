@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo BiedBot Edge - lokale DEMO / pilotinstallatie
 echo Dit is geen vrijgegeven live Marktplaats-bot.
echo Geen beheerdersrechten nodig. Eerste installatie downloadt Node.js van nodejs.org.
echo De PowerShell-uitvoeringsinstelling geldt alleen voor dit installatieproces.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install.ps1"
if errorlevel 1 (
  echo.
  echo Installatie gestopt. Lees de fout hierboven. Beveiligingssoftware niet uitschakelen.
  pause
  exit /b 1
)
echo.
echo Installatie gereed. Open BiedBot Edge via je bureaublad.
pause
