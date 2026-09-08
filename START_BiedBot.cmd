@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js ontbreekt. Gebruik INSTALLER_BiedBot.cmd voor installatie zonder voorkennis.
 pause
 exit /b 1
)
node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if errorlevel 1 (
 echo Node.js 22.16 of nieuwer nodig. Gebruik de installer.
 pause
 exit /b 1
)
node.exe src\server.mjs --open
if errorlevel 1 pause
